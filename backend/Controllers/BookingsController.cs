// -----------------------------------------------------------------
// File: BookingsController.cs
// Purpose: Manage EV charging bookings: create (≤7 days ahead), update/cancel
//          (≥12h before start), approve/QR, finalize, and operator/owner queries.
// -----------------------------------------------------------------
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using System.Security.Cryptography;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BookingsController : ControllerBase
{
    private readonly IMongoCollection<Booking> _bookings;
    private readonly IMongoCollection<StationSchedule> _schedules;
    private readonly BookingRules _rules;

    public BookingsController(IMongoDatabase db, BookingRules rules)
    {
        _bookings = db.GetCollection<Booking>("bookings");
        _schedules = db.GetCollection<StationSchedule>("stationSchedules");
        _rules = rules;

        // Helpful indexes (idempotent)
        _bookings.Indexes.CreateMany(new[]
        {
            new CreateIndexModel<Booking>(Builders<Booking>.IndexKeys
                .Ascending(b => b.Nic).Ascending(b => b.StartTime)),
            new CreateIndexModel<Booking>(Builders<Booking>.IndexKeys
                .Ascending(b => b.StationId).Ascending(b => b.StartTime)),
            new CreateIndexModel<Booking>(Builders<Booking>.IndexKeys
                .Ascending(b => b.Status).Ascending(b => b.StartTime)),
            // For QR validation and single-use marking
            new CreateIndexModel<Booking>(Builders<Booking>.IndexKeys
                .Ascending(b => b.QrToken)
                .Ascending(b => b.QrExpiresAt))
        });
    }

    // GET /api/bookings?nic=200012345678
    [Authorize]
    [HttpGet]
    public async Task<IActionResult> ForOwner([FromQuery] string nic)
    {
        // If caller is an owner, ensure they can only view their own NIC
        if (User.IsInRole("EVOwner"))
        {
            var nicClaim = User.FindFirst("nic")?.Value;
            if (!string.Equals(nicClaim, nic, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        var list = await _bookings.Find(b => b.Nic == nic)
                                  .SortByDescending(b => b.StartTime)
                                  .ToListAsync();
        return Ok(list);
    }

    // ----------------------- Create -----------------------
    public class CreateBookingRequest
    {
        public string StationId { get; set; } = default!;
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
    }

    // POST /api/bookings
    [Authorize(Roles = "EVOwner")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBookingRequest req)
    {
        var nic = User.FindFirst("nic")?.Value;
        if (string.IsNullOrWhiteSpace(nic)) return Forbid();

        if (req.EndTime <= req.StartTime) return BadRequest("Invalid slot.");

        var now = DateTime.UtcNow;
        if (req.StartTime.Date > now.Date.AddDays(7))
            return BadRequest("Bookings must be within 7 days.");
        if (req.StartTime < now)
            return BadRequest("Cannot book past or started slots.");

        var sched = await _schedules.Find(s =>
                s.StationId == req.StationId &&
                s.Date == req.StartTime.Date)
            .FirstOrDefaultAsync();
        if (sched == null) return BadRequest("No schedule for selected date.");

        var day = sched.Date.Date;
        var open = day.AddMinutes(sched.OpenMinutes);
        var close = day.AddMinutes(sched.CloseMinutes);
        if (req.StartTime < open || req.EndTime > close)
            return BadRequest("Slot is outside station schedule.");

        var overlapCount = await _bookings.CountDocumentsAsync(b =>
            b.StationId == req.StationId &&
            (b.Status == "Pending" || b.Status == "Approved") &&
            b.StartTime < req.EndTime && b.EndTime > req.StartTime);
        if (overlapCount >= sched.MaxConcurrent)
            return Conflict("Slot is full. Choose another slot.");

        var ownerOverlap = await _bookings.Find(b =>
            b.Nic == nic &&
            b.Status != "Cancelled" &&
            b.StartTime < req.EndTime && b.EndTime > req.StartTime)
            .AnyAsync();
        if (ownerOverlap)
            return Conflict("You already have a booking that overlaps this slot.");

        var booking = new Booking
        {
            StationId = req.StationId,
            Nic = nic,
            StartTime = req.StartTime,
            EndTime = req.EndTime,
            Status = "Pending",
            CreatedAt = now,
            IsQrActive = false
        };

        var qrSvc = HttpContext.RequestServices.GetRequiredService<IQrTokenService>();
        var (jwt, jti, expUtc) = qrSvc.GenerateFor(booking);

        booking.QrToken = jwt;
        booking.QrJti = jti;
        booking.QrIssuedAtUtc = DateTime.UtcNow;
        booking.QrExpiresAt = expUtc;

        await _bookings.InsertOneAsync(booking);

        return Ok(new
        {
            booking.Id,
            booking.StationId,
            booking.StartTime,
            booking.EndTime,
            booking.Status,
            booking.IsQrActive,
            booking.QrToken,
            booking.QrExpiresAt
        });
    }

    // -------------------- Update / Cancel --------------------
    // PUT /api/bookings/{id}
    [Authorize(Roles = "EVOwner")]
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateBookingDto dto)
    {
        var current = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (current is null) return NotFound();

        // Owner NIC must match the booking's NIC
        var nicClaim = User.FindFirst("nic")?.Value;
        if (!string.Equals(nicClaim, current.Nic, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        try
        {
            _rules.EnsureUpdateOrCancelAllowed(current.StartTime, DateTime.UtcNow);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        var upd = Builders<Booking>.Update
            .Set(x => x.StartTime, dto.StartTime)
            .Set(x => x.EndTime, dto.EndTime);

        await _bookings.UpdateOneAsync(x => x.Id == id, upd);
        return NoContent();
    }

    // DELETE /api/bookings/{id}
    [Authorize(Roles = "EVOwner")]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Cancel(string id)
    {
        var current = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (current is null) return NotFound();

        // Owner NIC must match the booking's NIC
        var nicClaim = User.FindFirst("nic")?.Value;
        if (!string.Equals(nicClaim, current.Nic, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        try
        {
            _rules.EnsureUpdateOrCancelAllowed(current.StartTime, DateTime.UtcNow);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update
        .Set(x => x.Status, "Cancelled")
        .Set(x => x.IsQrActive, false));
        return NoContent();
    }

    // -------------------- Approve + QR --------------------
    // POST /api/bookings/{id}/approve
    // Generates a URL-safe random token, sets expiry and keeps single-use fields
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/approve")]
    [Authorize(Roles = "Backoffice,StationOperator")]
    public async Task<IActionResult> Approve(string id)
    {
        var b = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (b == null) return NotFound();
        if (b.Status != "Pending") return Conflict("Only pending bookings can be approved.");

        await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update
            .Set(x => x.Status, "Approved")
            .Set(x => x.IsQrActive, true));

        return Ok(new { message = "Approved" });
    }

    // POST /api/bookings/scan/validate
    // Validates QR token and marks it single-use
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("scan/validate")]
    public async Task<IActionResult> ValidateQr(
    [FromBody] ValidateQrRequest body,
    [FromServices] IQrValidator validator)
    {
        if (string.IsNullOrWhiteSpace(body.Token))
            return BadRequest("Missing token.");

        var (ok, error, b) = await validator.ValidateAsync(body.Token);
        if (!ok) return Unauthorized(error);

        return Ok(new
        {
            ok = true,
            bookingId = b.Id,
            nic = b.Nic,
            stationId = b.StationId,
            start = b.StartTime,
            end = b.EndTime
        });
    }

    // -------------------- Finalize + Lookup --------------------
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/finalize")]
    public async Task<IActionResult> Finalize(string id)
    {
        var res = await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update
        .Set(x => x.Status, "Completed")
        .Set(x => x.IsQrActive, false));
        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Session completed" });
    }

    // Allow operators to fetch a booking by id
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var booking = await _bookings.Find(b => b.Id == id).FirstOrDefaultAsync();
        if (booking == null) return NotFound();
        return Ok(booking);
    }

    // -------------------- Pending queues --------------------
    // GET /api/bookings/pending?stationId=...&fromUtc=...&toUtc=...
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpGet("pending")]
    public async Task<IActionResult> GetPending([FromQuery] string? stationId,
        [FromQuery] DateTime? fromUtc, [FromQuery] DateTime? toUtc)
    {
        var f = Builders<Booking>.Filter.Eq(b => b.Status, "Pending");
        if (!string.IsNullOrWhiteSpace(stationId))
            f &= Builders<Booking>.Filter.Eq(b => b.StationId, stationId);
        if (fromUtc.HasValue) f &= Builders<Booking>.Filter.Gte(b => b.StartTime, fromUtc.Value);
        if (toUtc.HasValue) f &= Builders<Booking>.Filter.Lte(b => b.StartTime, toUtc.Value);

        var list = await _bookings.Find(f).SortBy(b => b.StartTime).ToListAsync();
        return Ok(list);
    }

    // GET /api/bookings/my/pending
    [Authorize(Roles = "EVOwner")]
    [HttpGet("my/pending")]
    public async Task<IActionResult> GetMyPending()
    {
        var nic = User.FindFirst("nic")?.Value;
        if (string.IsNullOrWhiteSpace(nic)) return Forbid();

        var list = await _bookings.Find(b => b.Nic == nic && b.Status == "Pending")
                                  .SortBy(b => b.StartTime).ToListAsync();
        return Ok(list);
    }

    // GET /api/bookings/my/counts
    [Authorize(Roles = "EVOwner")]
    [HttpGet("my/counts")]
    public async Task<IActionResult> GetMyCounts()
    {
        var nic = User.FindFirst("nic")?.Value;
        if (string.IsNullOrWhiteSpace(nic)) return Forbid();

        var now = DateTime.UtcNow;

        var pending = await _bookings.CountDocumentsAsync(b =>
            b.Nic == nic && b.Status == "Pending");

        var approvedFuture = await _bookings.CountDocumentsAsync(b =>
            b.Nic == nic && b.Status == "Approved" && b.StartTime >= now);

        return Ok(new { pending, approvedFuture });
    }

    // Global counts (no station/operator mapping)
    // GET /api/bookings/op/summary
    // Response: { pending: <int>, approved: <int> }
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpGet("op/summary")]
    public async Task<IActionResult> GetOperatorSummary()
    {
        var pending = await _bookings.CountDocumentsAsync(b => b.Status == "Pending");
        var approved = await _bookings.CountDocumentsAsync(b => b.Status == "Approved");

        return Ok(new { pending, approved });
    }

    // GET /api/bookings/approved
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpGet("approved")]
    public async Task<IActionResult> GetApproved()
    {
        // Return all bookings with Status = "Approved"
        var filter = Builders<Booking>.Filter.Eq(b => b.Status, "Approved");

        var list = await _bookings.Find(filter)
                                  .SortByDescending(b => b.StartTime)
                                  .ToListAsync();

        return Ok(list);
    }

    // GET /api/bookings/completed
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpGet("completed")]
    public async Task<IActionResult> GetCompleted()
    {
        // Return ALL completed bookings (no time filter)
        var filter = Builders<Booking>.Filter.Eq(b => b.Status, "Completed");

        var list = await _bookings.Find(filter)
                                  .SortByDescending(b => b.StartTime) // newest first
                                  .ToListAsync();

        return Ok(list);
    }
}
