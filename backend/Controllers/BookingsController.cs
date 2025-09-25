using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BookingsController : ControllerBase
{
    private readonly IMongoCollection<Booking> _bookings;
    private readonly BookingRules _rules;

    public BookingsController(IMongoDatabase db, BookingRules rules)
    {
        _bookings = db.GetCollection<Booking>("bookings");
        _rules = rules;

        _bookings.Indexes.CreateMany(new[]
        {
            new CreateIndexModel<Booking>(Builders<Booking>.IndexKeys.Ascending(b => b.Nic).Ascending(b => b.StartTime)),
            new CreateIndexModel<Booking>(Builders<Booking>.IndexKeys.Ascending(b => b.StationId).Ascending(b => b.StartTime))
        });
    }

    // GET /api/bookings?nic=200012345678
    [Authorize] // optional but recommended
    [HttpGet]
    public async Task<IActionResult> ForOwner([FromQuery] string nic)
    {
        // If caller is an owner, enforce they can only view their own NIC
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

    // POST /api/bookings
    [Authorize(Roles = "EVOwner")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Booking b)
    {
        var nicClaim = User.FindFirst("nic")?.Value;
        if (!string.Equals(nicClaim, b.Nic, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        try
        {
            _rules.EnsureCreateAllowed(b.StartTime, DateTime.UtcNow);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        b.Status = "Pending";
        await _bookings.InsertOneAsync(b);
        return Ok(b);
    }

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

    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/approve")]
    public async Task<IActionResult> Approve(string id)
    {
        var token = Guid.NewGuid().ToString("N");
        var res = await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update.Set(x => x.Status, "Approved").Set(x => x.QrToken, token));
        return res.MatchedCount == 0 ? NotFound() : Ok(new { qrToken = token });
    }

    [HttpGet("validate-qr")]
    public async Task<IActionResult> ValidateQr([FromQuery] string token)
    {
        var b = await _bookings.Find(x => x.QrToken == token && x.Status == "Approved").FirstOrDefaultAsync();
        return b is null ? NotFound() : Ok(new { b.Id, b.Nic, b.StationId, b.StartTime, b.EndTime, b.Status });
    }

    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/finalize")]
    public async Task<IActionResult> Finalize(string id)
    {
        var res = await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update.Set(x => x.Status, "Completed"));
        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Session completed" });
    }
}
