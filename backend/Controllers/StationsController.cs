using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class StationsController : ControllerBase
{
    private readonly IMongoCollection<Station> _stations;
    private readonly IMongoCollection<Booking> _bookings;

    public StationsController(IMongoDatabase db)
    {
        _stations = db.GetCollection<Station>("stations");
        _bookings = db.GetCollection<Booking>("bookings");
    }

    // GET /api/stations
    [HttpGet]
    public Task<List<Station>> All() => _stations.Find(_ => true).ToListAsync();

    // POST /api/stations
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Station s)
    {
        await _stations.InsertOneAsync(s);
        return Ok(s);
    }

    // PUT /api/stations/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] Station s)
    {
        s.Id = id;
        var res = await _stations.ReplaceOneAsync(x => x.Id == id, s);
        return res.MatchedCount == 0 ? NotFound() : NoContent();
    }

    // POST /api/stations/{id}/deactivate
    [HttpPost("{id}/deactivate")]
    public async Task<IActionResult> Deactivate(string id)
    {
        var now = DateTime.UtcNow;

        // check if there are active future bookings
        var hasActiveFuture = await _bookings.Find(b =>
            b.StationId == id &&
            b.StartTime > now &&
            (b.Status == "Pending" || b.Status == "Approved")
        ).AnyAsync();

        if (hasActiveFuture)
        {
            return Conflict(new { message = "Cannot deactivate: station has active future bookings." });
        }

        var res = await _stations.UpdateOneAsync(
            s => s.Id == id,
            Builders<Station>.Update.Set(s => s.IsActive, false)
        );

        return res.MatchedCount == 0
            ? NotFound()
            : Ok(new { message = "Station deactivated" });
    }

    // POST /api/stations/{id}/reactivate
    [HttpPost("{id}/reactivate")]
    public async Task<IActionResult> Reactivate(string id)
    {
        var res = await _stations.UpdateOneAsync(
            s => s.Id == id,
            Builders<Station>.Update.Set(s => s.IsActive, true)
        );

        return res.MatchedCount == 0
            ? NotFound()
            : Ok(new { message = "Station reactivated" });
    }
}
