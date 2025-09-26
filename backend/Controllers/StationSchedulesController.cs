using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using Microsoft.AspNetCore.Authorization;

namespace Backend.Controllers;

[ApiController]
[Route("api")]
[Authorize(Roles = "Backoffice,StationOperator")]
public class StationSchedulesController : ControllerBase
{
    private readonly IMongoCollection<Station> _stations;
    private readonly IMongoCollection<StationSchedule> _schedules;

    public StationSchedulesController(IMongoDatabase db)
    {
        _stations = db.GetCollection<Station>("Stations");
        _schedules = db.GetCollection<StationSchedule>("StationSchedules");
    }

    // POST /api/stations/{id}/schedules
    [HttpPost("stations/{id}/schedules")]
    public async Task<IActionResult> Create(string id, [FromBody] StationSchedule dto)
    {
        var station = await _stations.Find(s => s.Id == id && s.IsActive).FirstOrDefaultAsync();
        if (station is null) return NotFound("Station not found or inactive");

        if (dto.MaxConcurrent <= 0 || dto.MaxConcurrent > station.TotalSlots)
            return BadRequest("MaxConcurrent must be 1..TotalSlots");

        dto.Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString();
        dto.StationId = id;
        await _schedules.InsertOneAsync(dto);
        return Ok(dto);
    }

    // GET /api/stations/{id}/schedules?from=2025-09-26&to=2025-10-03
    [AllowAnonymous] // if you prefer read-open
    [HttpGet("stations/{id}/schedules")]
    public async Task<IActionResult> List(string id, [FromQuery] DateTime from, [FromQuery] DateTime to)
    {
        if (to < from) return BadRequest("to < from");
        var res = await _schedules.Find(x => x.StationId == id && x.Date >= from.Date && x.Date <= to.Date).ToListAsync();
        return Ok(res);
    }

    // PUT /api/schedules/{scheduleId}
    [HttpPut("schedules/{scheduleId}")]
    public async Task<IActionResult> Update(string scheduleId, [FromBody] StationSchedule patch)
    {
        var current = await _schedules.Find(x => x.Id == scheduleId).FirstOrDefaultAsync();
        if (current is null) return NotFound();

        // enforce limits again (need station)
        var station = await _stations.Find(s => s.Id == current.StationId).FirstOrDefaultAsync();
        if (station is null) return NotFound("Station missing");
        if (patch.MaxConcurrent <= 0 || patch.MaxConcurrent > station.TotalSlots)
            return BadRequest("MaxConcurrent must be 1..TotalSlots");

        var upd = Builders<StationSchedule>.Update
          .Set(x => x.Date, patch.Date)
          .Set(x => x.OpenMinutes, patch.OpenMinutes)
          .Set(x => x.CloseMinutes, patch.CloseMinutes)
          .Set(x => x.MaxConcurrent, patch.MaxConcurrent);

        var res = await _schedules.UpdateOneAsync(x => x.Id == scheduleId, upd);
        return res.MatchedCount == 0 ? NotFound() : NoContent();
    }

    // DELETE /api/schedules/{scheduleId}
    [HttpDelete("schedules/{scheduleId}")]
    public async Task<IActionResult> Delete(string scheduleId)
    {
        var res = await _schedules.DeleteOneAsync(x => x.Id == scheduleId);
        return res.DeletedCount == 0 ? NotFound() : NoContent();
    }
}
