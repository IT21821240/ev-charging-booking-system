using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using Backend.Services;

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

        // Helpful indexes
        _bookings.Indexes.CreateMany(new[]
        {
            new CreateIndexModel<Booking>(
                Builders<Booking>.IndexKeys.Ascending(b => b.Nic).Ascending(b => b.StartTime)),
            new CreateIndexModel<Booking>(
                Builders<Booking>.IndexKeys.Ascending(b => b.StationId).Ascending(b => b.StartTime))
        });
    }

    // GET /api/bookings?nic=200012345678
    [HttpGet]
    public Task<List<Booking>> ForOwner([FromQuery] string nic) =>
        _bookings.Find(b => b.Nic == nic).SortByDescending(b => b.StartTime).ToListAsync();

    // POST /api/bookings
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Booking b)
    {
        var now = DateTime.UtcNow;
        _rules.EnsureCreateAllowed(b.StartTime, now);

        b.Status = "Pending";
        await _bookings.InsertOneAsync(b);
        return Ok(b);
    }

    // PUT /api/bookings/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateBookingDto dto)
    {
        var current = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (current is null) return NotFound();

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
    [HttpDelete("{id}")]
    public async Task<IActionResult> Cancel(string id)
    {
        var current = await _bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (current is null) return NotFound();

        _rules.EnsureUpdateOrCancelAllowed(current.StartTime, DateTime.UtcNow);

        await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update.Set(x => x.Status, "Cancelled"));
        return NoContent();
    }

    // POST /api/bookings/{id}/approve  -> returns qrToken
    // (Backoffice/Operator in final version; add [Authorize] later)
    [HttpPost("{id}/approve")]
    public async Task<IActionResult> Approve(string id)
    {
        var token = Guid.NewGuid().ToString("N");
        var res = await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update.Set(x => x.Status, "Approved").Set(x => x.QrToken, token));
        return res.MatchedCount == 0 ? NotFound() : Ok(new { qrToken = token });
    }

    // GET /api/bookings/validate-qr?token=abc123
    [HttpGet("validate-qr")]
    public async Task<IActionResult> ValidateQr([FromQuery] string token)
    {
        var b = await _bookings.Find(x => x.QrToken == token && x.Status == "Approved").FirstOrDefaultAsync();
        return b is null ? NotFound() : Ok(new
        {
            b.Id,
            b.Nic,
            b.StationId,
            b.StartTime,
            b.EndTime,
            b.Status
        });
    }

    // POST /api/bookings/{id}/finalize
    [HttpPost("{id}/finalize")]
    public async Task<IActionResult> Finalize(string id)
    {
        var res = await _bookings.UpdateOneAsync(x => x.Id == id,
            Builders<Booking>.Update.Set(x => x.Status, "Completed"));
        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Session completed" });
    }
}
