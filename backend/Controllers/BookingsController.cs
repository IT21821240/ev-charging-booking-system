// -----------------------------------------------------------------
// File: BookingsController.cs
// Purpose: Manage EV charging bookings: create (≤7 days ahead), update/cancel
//          (≥12h before start), approve/QR, finalize, and operator/owner queries.
// -----------------------------------------------------------------
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using Backend.Services;
using Backend.Helpers;
using Microsoft.AspNetCore.Authorization;
using System.Security.Cryptography;
using static Backend.Services.BookingMapping;     
using static Backend.Services.TimezoneHelper;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BookingsController : ControllerBase
{
    private readonly IMongoDatabase _db;
    private readonly IMongoCollection<Booking> _bookings;
    private readonly IMongoCollection<StationSchedule> _schedules;
    private readonly BookingRules _rules;

    public BookingsController(IMongoDatabase db, BookingRules rules)
    {
        _db = db;
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
        // Determine if the caller is the actual owner for this NIC
        var isOwner = User.IsInRole("EVOwner");
        if (isOwner)
        {
            var nicClaim = User.FindFirst("nic")?.Value;
            if (!string.Equals(nicClaim, nic, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        var tz = HttpContext.Request.Query["tz"].ToString();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Asia/Colombo";

        var list = await _bookings.Find(b => b.Nic == nic)
                                  .SortByDescending(b => b.StartTime)
                                  .ToListAsync();

        if (isOwner)
        {
            // Owner sees QR fields
            var now = DateTime.UtcNow;
            var result = list.Select(b => {
                var dto = ToDto(b, tz);
                var isUsable = b.IsQrActive
                               && b.Status == "Approved"
                               && b.QrExpiresAt.HasValue
                               && now < b.QrExpiresAt.Value;
                return new
                {
                    dto,
                    qrToken = b.QrToken,
                };
            });
            return Ok(result);
        }
        else
        {
            // Operators/Backoffice: no QR leakage
            return Ok(list.Select(b => ToDto(b, tz)));
        }
    }


    // ----------------------- Create -----------------------
    public class CreateBookingRequest
    {
        public string StationId { get; set; } = default!;
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        // NEW: local inputs (preferred for Sri Lanka)
        public DateTime? StartTimeLocal { get; set; } // unspecified wall time
        public DateTime? EndTimeLocal { get; set; }
        public string? TimeZoneId { get; set; } // default "Asia/Colombo"
    }

    // POST /api/bookings
    [Authorize(Roles = "EVOwner")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBookingRequest req)
    {
        var nic = User.FindFirst("nic")?.Value;
        if (string.IsNullOrWhiteSpace(nic)) return Forbid();

        var tz = req.TimeZoneId ?? "Asia/Colombo";

        // Decide input mode
        DateTime startUtc, endUtc, startLocal, endLocal;
        if (req.StartTimeLocal.HasValue && req.EndTimeLocal.HasValue)
        {
            // Client sent local wall times (preferred for Sri Lanka)
            startLocal = DateTime.SpecifyKind(req.StartTimeLocal.Value, DateTimeKind.Unspecified);
            endLocal = DateTime.SpecifyKind(req.EndTimeLocal.Value, DateTimeKind.Unspecified);
            startUtc = ToUtcFromLocal(startLocal, tz);
            endUtc = ToUtcFromLocal(endLocal, tz);
        }
        else
        {
            // Client sent UTC
            startUtc = DateTime.SpecifyKind(req.StartTime, DateTimeKind.Utc);
            endUtc = DateTime.SpecifyKind(req.EndTime, DateTimeKind.Utc);
            // derive local for schedule validation
            startLocal = ToLocal(startUtc, tz);
            endLocal = ToLocal(endUtc, tz);
        }

        if (endUtc <= startUtc) return BadRequest("Invalid slot.");

        var now = DateTime.UtcNow;
        if (startUtc.Date > now.Date.AddDays(7))
            return BadRequest("Bookings must be within 7 days.");
        if (startUtc < now)
            return BadRequest("Cannot book past or started slots.");

        // -------- Schedule validation in LOCAL day ----------
        var dayLocal = DateTime.SpecifyKind(startLocal.Date, DateTimeKind.Unspecified);
        var next = dayLocal.AddDays(1);

        // Find schedule by range (robust against Kind/Date translation)
        var sched = await _schedules.Find(s =>
            s.StationId == req.StationId &&
            s.Date >= dayLocal && s.Date < next
        ).FirstOrDefaultAsync();

        if (sched == null) return BadRequest("No schedule for selected date.");

        var openLocal = dayLocal.AddMinutes(sched.OpenMinutes);
        var closeLocal = dayLocal.AddMinutes(sched.CloseMinutes);

        if (startLocal < openLocal || endLocal > closeLocal)
            return BadRequest("Slot is outside station schedule.");

        // -------- Overlap checks in UTC (DB stored UTC) ----------
        var overlapCount = await _bookings.CountDocumentsAsync(b =>
            b.StationId == req.StationId &&
            (b.Status == "Pending" || b.Status == "Approved") &&
            b.StartTime < endUtc && b.EndTime > startUtc);
        if (overlapCount >= sched.MaxConcurrent)
            return Conflict("Slot is full. Choose another slot.");

        var ownerOverlap = await _bookings.Find(b =>
            b.Nic == nic &&
            b.Status != "Cancelled" &&
            b.StartTime < endUtc && b.EndTime > startUtc).AnyAsync();
        if (ownerOverlap)
            return Conflict("You already have a booking that overlaps this slot.");

        // -------- Persist UTC ----------
        var booking = new Booking
        {
            StationId = req.StationId,
            Nic = nic,
            StartTime = startUtc,
            EndTime = endUtc,
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

        // Return both UTC + Local (default Asia/Colombo)
        var dto = BookingMapping.ToDto(booking, tz);
        return Ok(new
        {
            // existing shape your frontend already uses
            booking = dto,
            qrToken = booking.QrToken,

        });
    }

    // -------------------- Update (same procedure as Create) --------------------
    // PUT /api/bookings/{id}
    [Authorize(Roles = "EVOwner")]
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateBookingDto dto)
    {
        // Load current booking
        var current = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (current is null) return NotFound();

        // Ownership
        var nicClaim = User.FindFirst("nic")?.Value;
        if (string.IsNullOrWhiteSpace(nicClaim) ||
            !string.Equals(nicClaim, current.Nic, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        // Respect modification rules (e.g., cutoff before start)
        try
        {
            _rules.EnsureUpdateOrCancelAllowed(current.StartTime, DateTime.UtcNow);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        var tz = dto.TimeZoneId ?? "Asia/Colombo";

        // -------- Decide input mode (same as Create) ----------
        DateTime startUtc, endUtc, startLocal, endLocal;
        if (dto.StartTimeLocal.HasValue && dto.EndTimeLocal.HasValue)
        {
            // Client sent local wall times
            startLocal = DateTime.SpecifyKind(dto.StartTimeLocal.Value, DateTimeKind.Unspecified);
            endLocal = DateTime.SpecifyKind(dto.EndTimeLocal.Value, DateTimeKind.Unspecified);
            startUtc = ToUtcFromLocal(startLocal, tz);
            endUtc = ToUtcFromLocal(endLocal, tz);
        }
        else
        {
            // Client sent UTC
            startUtc = DateTime.SpecifyKind(dto.StartTime, DateTimeKind.Utc);
            endUtc = DateTime.SpecifyKind(dto.EndTime, DateTimeKind.Utc);
            // derive local for schedule validation
            startLocal = ToLocal(startUtc, tz);
            endLocal = ToLocal(endUtc, tz);
        }

        if (endUtc <= startUtc) return BadRequest("Invalid slot.");

        var now = DateTime.UtcNow;
        // Same temporal constraints as Create
        if (startUtc.Date > now.Date.AddDays(7))
            return BadRequest("Bookings must be within 7 days.");
        if (startUtc < now)
            return BadRequest("Cannot book past or started slots.");

        // -------- Schedule validation in LOCAL day (same as Create) ----------
        var dayLocal = DateTime.SpecifyKind(startLocal.Date, DateTimeKind.Unspecified);
        var next = dayLocal.AddDays(1);

        // Find schedule by range (robust against Kind/Date translation)
        var sched = await _schedules.Find(s =>
            s.StationId == current.StationId &&
            s.Date >= dayLocal && s.Date < next
        ).FirstOrDefaultAsync();

        if (sched == null) return BadRequest("No schedule for selected date.");

        var openLocal = dayLocal.AddMinutes(sched.OpenMinutes);
        var closeLocal = dayLocal.AddMinutes(sched.CloseMinutes);

        if (startLocal < openLocal || endLocal > closeLocal)
            return BadRequest("Slot is outside station schedule.");

        // -------- Overlap checks in UTC (same as Create) ----------
        var overlapCount = await _bookings.CountDocumentsAsync(b =>
            b.Id != id &&
            b.StationId == current.StationId &&
            (b.Status == "Pending" || b.Status == "Approved") &&
            b.StartTime < endUtc && b.EndTime > startUtc);
        if (overlapCount >= sched.MaxConcurrent)
            return Conflict("Slot is full. Choose another slot.");

        var ownerOverlap = await _bookings.Find(b =>
            b.Id != id &&
            b.Nic == current.Nic &&
            b.Status != "Cancelled" &&
            b.StartTime < endUtc && b.EndTime > startUtc
        ).AnyAsync();
        if (ownerOverlap)
            return Conflict("You already have a booking that overlaps this slot.");

        // -------- Persist (UTC) + regenerate QR to reflect new time window ----------
        // Prepare an updated instance just for QR generation
        var updatedForQr = new Booking
        {
            Id = current.Id,
            StationId = current.StationId,
            Nic = current.Nic,
            StartTime = startUtc,
            EndTime = endUtc,
            Status = current.Status,
            CreatedAt = current.CreatedAt,
            IsQrActive = current.IsQrActive
        };

        var qrSvc = HttpContext.RequestServices.GetRequiredService<IQrTokenService>();
        var (jwt, jti, expUtc) = qrSvc.GenerateFor(updatedForQr);

        var upd = Builders<Booking>.Update
            .Set(x => x.StartTime, startUtc)
            .Set(x => x.EndTime, endUtc)
            .Set(x => x.QrToken, jwt)
            .Set(x => x.QrJti, jti)
            .Set(x => x.QrIssuedAtUtc, DateTime.UtcNow)
            .Set(x => x.QrExpiresAt, expUtc);

        await _bookings.UpdateOneAsync(x => x.Id == id, upd);

        // Reload minimal fields needed for DTO (or manually compose)
        var updated = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();

        // Return same shape as Create (booking DTO + qrToken)
        var dtoOut = BookingMapping.ToDto(updated, tz);
        return Ok(new
        {
            booking = dtoOut,
            qrToken = updated.QrToken
        });
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
    [HttpPost("{id}/approve")]
    [Authorize(Roles = "Backoffice,StationOperator")]
    public async Task<IActionResult> Approve(string id)
    {
        var b = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (b == null) return NotFound();
        if (b.Status != "Pending") return Conflict("Only pending bookings can be approved.");

        if (User.IsInRole("StationOperator"))
        {
            var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
            if (me is null || !me.IsActive) return Forbid();
            if (!AuthHelpers.OperatorHasStation(me, b.StationId)) return Forbid();
        }

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

        if (User.IsInRole("StationOperator"))
        {
            var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
            if (me is null || !me.IsActive) return Forbid();
            if (!AuthHelpers.OperatorHasStation(me, b.StationId)) return Forbid();
        }

        var tz = "Asia/Colombo";
        return Ok(new
        {
            ok = true,
            bookingId = b.Id,
            nic = b.Nic,
            stationId = b.StationId,
            startUtc = b.StartTime,
            endUtc = b.EndTime,
            startLocal = ToLocal(b.StartTime, tz),
            endLocal = ToLocal(b.EndTime, tz),
            timeZoneId = tz
        });
    }

    // -------------------- Finalize + Lookup --------------------
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/finalize")]
    public async Task<IActionResult> Finalize(string id)
    {
        // Load booking so we know which station it belongs to
        var b = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (b is null) return NotFound();
            if (User.IsInRole("StationOperator"))
                {
            var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
                    if (me is null || !me.IsActive) return Forbid();
                    if (!AuthHelpers.OperatorHasStation(me, b.StationId)) return Forbid();
               }

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
        var tz = HttpContext.Request.Query["tz"].ToString();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Asia/Colombo";

        var booking = await _bookings.Find(b => b.Id == id).FirstOrDefaultAsync();
        if (booking == null) return NotFound();

        if (User.IsInRole("StationOperator"))
               {
            var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
                   if (me is null || !me.IsActive) return Forbid();
                  if (!AuthHelpers.OperatorHasStation(me, booking.StationId)) return Forbid();
               }

        return Ok(ToDto(booking, tz));
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

        var tz = HttpContext.Request.Query["tz"].ToString();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Asia/Colombo";

        var list = await _bookings.Find(f).SortBy(b => b.StartTime).ToListAsync();
        return Ok(list.Select(b => ToDto(b, tz)));
    }

    // GET /api/bookings/my/pending
    [Authorize(Roles = "EVOwner")]
    [HttpGet("my/pending")]
    public async Task<IActionResult> GetMyPending()
    {
        var nic = User.FindFirst("nic")?.Value;
        if (string.IsNullOrWhiteSpace(nic)) return Forbid();

        var tz = HttpContext.Request.Query["tz"].ToString();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Asia/Colombo";

        var list = await _bookings.Find(b => b.Nic == nic && b.Status == "Pending")
                                  .SortBy(b => b.StartTime).ToListAsync();
        return Ok(list.Select(b => ToDto(b, tz)));
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
        return Ok(list.Select(b => ToDto(b, HttpContext.Request.Query["tz"].ToString() ?? "Asia/Colombo")));
    }

    // GET /api/bookings/completed
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpGet("completed")]
    public async Task<IActionResult> GetCompleted()
    {
        // Return ALL completed bookings (no time filter)
        var filter = Builders<Booking>.Filter.Eq(b => b.Status, "Completed");

        var tz = HttpContext.Request.Query["tz"].ToString();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Asia/Colombo";

        var list = await _bookings.Find(filter)
                                  .SortByDescending(b => b.StartTime)
                                  .ToListAsync();

        return Ok(list.Select(b => ToDto(b, tz)));

    }

    //operators pending booking
    [Authorize(Roles = "StationOperator")]
    [HttpGet("operator/pending")]
    public async Task<IActionResult> GetPendingForMyStations()
    {
        var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
        if (me is null || !me.IsActive) return Forbid();
        if (me.AssignedStationIds is null || me.AssignedStationIds.Count == 0)
            return Ok(Array.Empty<object>());

        var tz = HttpContext.Request.Query["tz"].ToString();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Asia/Colombo";

        var list = await _bookings.Find(b =>
                me.AssignedStationIds.Contains(b.StationId) &&
                b.Status == "Pending")
            .SortBy(b => b.StartTime)
            .ToListAsync();

        return Ok(list.Select(b => ToDto(b, tz)));
    }

    // GET /api/bookings/operator/completed
    [Authorize(Roles = "StationOperator")]
    [HttpGet("operator/completed")]
    public async Task<IActionResult> GetCompletedForMyStationsSimple()
    {
        var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
        if (me is null || !me.IsActive) return Forbid();
        if (me.AssignedStationIds is null || me.AssignedStationIds.Count == 0)
            return Ok(Array.Empty<object>());

        var tz = HttpContext.Request.Query["tz"].ToString();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Asia/Colombo";

        var list = await _bookings.Find(b =>
                me.AssignedStationIds.Contains(b.StationId) &&
                b.Status == "Completed")
            .SortByDescending(b => b.StartTime)
            .ToListAsync();

        return Ok(list.Select(b => ToDto(b, tz)));
    }

    //operators count
    [Authorize(Roles = "StationOperator")]
    [HttpGet("operator/counts")]
    public async Task<IActionResult> GetOperatorCounts()
    {
        var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
        if (me is null || !me.IsActive) return Forbid();
        if (me.AssignedStationIds is null || me.AssignedStationIds.Count == 0)
            return Ok(new { pending = 0, approved = 0 });

        var baseFilter = Builders<Booking>.Filter.In(b => b.StationId, me.AssignedStationIds);

        var pendingCountTask = _bookings.CountDocumentsAsync(baseFilter & Builders<Booking>.Filter.Eq(b => b.Status, "Pending"));
        var approvedCountTask = _bookings.CountDocumentsAsync(baseFilter & Builders<Booking>.Filter.Eq(b => b.Status, "Approved"));

        await Task.WhenAll(pendingCountTask, approvedCountTask);

        return Ok(new { pending = pendingCountTask.Result, approved = approvedCountTask.Result });
    }

    //approved list
    [Authorize(Roles = "StationOperator")]
    [HttpGet("operator/approved")]
    public async Task<IActionResult> GetApprovedForMyStations()
    {
        var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
        if (me is null || !me.IsActive) return Forbid();
        if (me.AssignedStationIds is null || me.AssignedStationIds.Count == 0)
            return Ok(Array.Empty<object>());

        var tz = HttpContext.Request.Query["tz"].ToString();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Asia/Colombo";

        var list = await _bookings.Find(b =>
                me.AssignedStationIds.Contains(b.StationId) &&
                b.Status == "Approved")
            .SortBy(b => b.StartTime)
            .ToListAsync();

        return Ok(list.Select(b => ToDto(b, tz)));
    }

    //reject a booking
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/reject")]
    public async Task<IActionResult> Reject(string id, [FromBody] string? reason = null)
    {
        var b = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (b is null) return NotFound();
        if (b.Status != "Pending") return Conflict("Only pending bookings can be rejected.");

        if (User.IsInRole("StationOperator"))
        {
            var me = await AuthHelpers.GetCurrentUserAsync(User, _db);
            if (me is null || !me.IsActive) return Forbid();
            if (!AuthHelpers.OperatorHasStation(me, b.StationId)) return Forbid();
        }

        var upd = Builders<Booking>.Update
            .Set(x => x.Status, "Rejected")
            .Set(x => x.IsQrActive, false);
        if (!string.IsNullOrWhiteSpace(reason))
            upd = upd.Set("RejectionReason", reason);

        await _bookings.UpdateOneAsync(x => x.Id == id, upd);
        return Ok(new { message = "Rejected" });
    }

}
