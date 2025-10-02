using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using Microsoft.AspNetCore.Authorization;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // default: all actions require a valid JWT
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
    // Any authenticated role can view stations (Backoffice/Operator/Owner)
    [HttpGet]
    public Task<List<Station>> All() => _stations.Find(_ => true).ToListAsync();

    // POST /api/stations  (Backoffice only)
    [Authorize(Roles = "Backoffice")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Station s)
    {
        await _stations.InsertOneAsync(s);
        return Ok(s);
    }

    // PUT /api/stations/{id}  (Backoffice only)
    [Authorize(Roles = "Backoffice")]
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] Station s)
    {
        s.Id = id;
        var res = await _stations.ReplaceOneAsync(x => x.Id == id, s);
        return res.MatchedCount == 0 ? NotFound() : NoContent();
    }

    // POST /api/stations/{id}/deactivate  (Backoffice or StationOperator)
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/deactivate")]
    public async Task<IActionResult> Deactivate(string id)
    {
        var now = DateTime.UtcNow;

        // block if there are future Pending/Approved bookings
        var hasActiveFuture = await _bookings.Find(b =>
            b.StationId == id &&
            b.StartTime > now &&
            (b.Status == "Pending" || b.Status == "Approved")
        ).AnyAsync();

        if (hasActiveFuture)
            return Conflict(new { message = "Cannot deactivate: station has active future bookings." });

        var res = await _stations.UpdateOneAsync(
            s => s.Id == id,
            Builders<Station>.Update.Set(s => s.IsActive, false)
        );

        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Station deactivated" });
    }

    // POST /api/stations/{id}/reactivate  (Backoffice or StationOperator)
    [Authorize(Roles = "Backoffice,StationOperator")]
    [HttpPost("{id}/reactivate")]
    public async Task<IActionResult> Reactivate(string id)
    {
        var res = await _stations.UpdateOneAsync(
            s => s.Id == id,
            Builders<Station>.Update.Set(s => s.IsActive, true)
        );

        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Station reactivated" });
    }

    // GET /api/stations/{id}?expand=false
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id, [FromQuery] bool expand = false)
    {
        var station = await _stations.Find(s => s.Id == id).FirstOrDefaultAsync();
        if (station == null) return NotFound();

        if (!expand) return Ok(station);

        // If you later add schedules or want counters, you can expand here.
        var pendingCount = await _bookings.CountDocumentsAsync(b =>
            b.StationId == id && b.Status == "Pending");
        return Ok(new { station, pendingCount });
    }

}
