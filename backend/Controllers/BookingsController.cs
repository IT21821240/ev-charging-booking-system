// -----------------------------------------------------------------
// File: BookingsController.cs
// Purpose: Manage booking creation, update, cancel, approval + QR
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
        _schedules = db.GetCollection<StationSchedule>("schedules");
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
                .Ascending(b => b.QrUsedAt)
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
        public DateTime StartUtc { get; set; }
        public DateTime EndUtc { get; set; }
    }

    // POST /api/bookings
    [Authorize(Roles = "EVOwner")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBookingRequest req)
    {
        // 1) Identity from JWT (do NOT accept from client)
        var nic = User.FindFirst("nic")?.Value;
        if (string.IsNullOrWhiteSpace(nic)) return Forbid();

        // 2) Basic validations
        if (req.EndUtc <= req.StartUtc) return BadRequest("Invalid slot.");

        // 3) Enforce “within 7 days” at create (and not in the past)
        var now = DateTime.UtcNow;
        if (req.StartUtc.Date > now.Date.AddDays(7))
            return BadRequest("Bookings must be within 7 days.");
        if (req.StartUtc < now)
            return BadRequest("Cannot book past or started slots.");

        // 4) Check schedule exists and slot is inside open/close for that day
        var sched = await _schedules.Find(s =>
                s.StationId == req.StationId &&
                s.Date == req.StartUtc.Date)
            .FirstOrDefaultAsync();
        if (sched == null) return BadRequest("No schedule for selected date.");

        var day = sched.Date.Date;
        var open = day.AddMinutes(sched.OpenMinutes);
        var close = day.AddMinutes(sched.CloseMinutes);
        if (req.StartUtc < open || req.EndUtc > close)
            return BadRequest("Slot is outside station schedule.");

        // 5) Capacity: count overlapping bookings (Pending + Approved consume capacity)
        var overlapCount = await _bookings.CountDocumentsAsync(b =>
            b.StationId == req.StationId &&
            (b.Status == "Pending" || b.Status == "Approved") &&
            b.StartTime < req.EndUtc && b.EndTime > req.StartUtc);

        if (overlapCount >= sched.MaxConcurrent)
            return Conflict("Slot is full. Choose another slot.");

        // 6) Prevent owner overlap
        var ownerOverlap = await _bookings.Find(b =>
            b.Nic == nic &&
            b.Status != "Cancelled" &&
            b.StartTime < req.EndUtc && b.EndTime > req.StartUtc)
            .AnyAsync();

        if (ownerOverlap)
            return Conflict("You already have a booking that overlaps this slot.");

        // 7) Create booking (Pending; approval will issue QR)
        var booking = new Booking
        {
            StationId = req.StationId,
            Nic = nic,
            StartTime = req.StartUtc,
            EndTime = req.EndUtc,
            Status = "Pending",
            CreatedAt = now
        };

        await _bookings.InsertOneAsync(booking);
        return Ok(booking);
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
            Builders<Booking>.Update.Set(x => x.Status, "Cancelled"));
        return NoContent();
    }

    // -------------------- Approve + QR --------------------
    // POST /api/bookings/{id}/approve
    // Generates a URL-safe random token, sets expiry and keeps single-use fields
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/approve")]
    public async Task<IActionResult> Approve(string id)
    {
        var b = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (b == null) return NotFound();
        if (b.Status != "Pending") return Conflict("Only pending bookings can be approved.");

        // Short, URL-safe token for QR (base64url of 24 random bytes)
        var bytes = RandomNumberGenerator.GetBytes(24); // 192-bit
        var token = Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');

        var now = DateTime.UtcNow;
        var expiresAt = b.EndTime.AddMinutes(30); // valid 30m after session ends

        var res = await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update
                .Set(x => x.Status, "Approved")
                .Set(x => x.QrToken, token)
                .Set(x => x.QrIssuedAt, now)
                .Set(x => x.QrExpiresAt, expiresAt)
                .Set(x => x.QrUsedAt, null));

        if (res.MatchedCount == 0) return NotFound();
        return Ok(new { message = "Approved", qrToken = token, expiresAt });
    }

    public class ValidateQrRequest { public string Token { get; set; } = default!; }

    // POST /api/bookings/scan/validate
    // Validates QR token and marks it single-use
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("scan/validate")]
    public async Task<IActionResult> ValidateQr([FromBody] ValidateQrRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Token))
            return BadRequest("Missing token.");

        var now = DateTime.UtcNow;

        // Find the booking with matching token that isn't used and not expired
        var b = await _bookings.Find(x =>
                x.QrToken == body.Token &&
                x.Status == "Approved" &&
                x.QrUsedAt == null &&
                x.QrExpiresAt > now)
            .FirstOrDefaultAsync();

        if (b is null) return Unauthorized("Invalid or expired QR token.");

        // Single-use: mark used atomically (filter includes QrUsedAt==null to prevent races)
        var updateResult = await _bookings.UpdateOneAsync(x =>
                x.Id == b.Id && x.QrUsedAt == null,
            Builders<Booking>.Update.Set(x => x.QrUsedAt, now));

        if (updateResult.ModifiedCount == 0)
            return Conflict("QR already used.");

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
            Builders<Booking>.Update.Set(x => x.Status, "Completed"));
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

}
