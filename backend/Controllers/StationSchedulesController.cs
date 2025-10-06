// -----------------------------------------------------------------------------
// File: StationSchedulesController.cs
// Purpose: Station schedule management for operators/backoffice.
//          Create/list/update/delete daily schedules and expose a public
//          slots endpoint that computes availability from bookings.
// -----------------------------------------------------------------------------
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
    private readonly IMongoCollection<Booking> _bookings;

    public StationSchedulesController(IMongoDatabase db)
    {
        _stations = db.GetCollection<Station>("stations");
        _schedules = db.GetCollection<StationSchedule>("stationSchedules");
        _bookings = db.GetCollection<Booking>("bookings");
    }

    // POST /api/stations/{id}/schedules
    [HttpPost("stations/{id}/schedules")]
    public async Task<IActionResult> Create(string id, [FromBody] StationSchedule dto)
    {
        var station = await _stations.Find(s => s.Id == id && s.IsActive).FirstOrDefaultAsync();
        if (station is null) return NotFound("Station not found or inactive");

        // ✅ normalize date to UTC midnight
        dto.Date = dto.Date.Date.AddHours(12);

        // ✅ validate time range in minutes
        if (dto.OpenMinutes < 0 || dto.OpenMinutes >= dto.CloseMinutes || dto.CloseMinutes > 1440)
            return BadRequest("Open/Close minutes invalid");

        // existing max concurrent check
        if (dto.MaxConcurrent <= 0 || dto.MaxConcurrent > station.TotalSlots)
            return BadRequest("MaxConcurrent must be 1..TotalSlots");

        dto.Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString();
        dto.StationId = id;

        await _schedules.InsertOneAsync(dto);
        return Ok(dto);
    }

    // GET /api/stations/{id}/schedules?from=2025-09-26&to=2025-10-03
    [HttpGet("stations/{id}/schedules")]
    public async Task<IActionResult> List(string id, [FromQuery] DateTime from, [FromQuery] DateTime to)
    {
        if (to < from) return BadRequest("to < from");

        // ✅ normalize to UTC date-only to avoid off-by-one issues
        var fromLocal = DateTime.SpecifyKind(from.Date, DateTimeKind.Unspecified);
        var toLocal = DateTime.SpecifyKind(to.Date, DateTimeKind.Unspecified);
        var res = await _schedules.Find(x => x.StationId == id &&
            x.Date >= fromLocal && x.Date <= toLocal).ToListAsync();

        return Ok(res);
    }


    // PUT /api/schedules/{scheduleId}
    [HttpPut("schedules/{scheduleId}")]
    public async Task<IActionResult> Update(string scheduleId, [FromBody] StationSchedule patch)
    {
        var current = await _schedules.Find(x => x.Id == scheduleId).FirstOrDefaultAsync();
        if (current is null) return NotFound();

        var station = await _stations.Find(s => s.Id == current.StationId).FirstOrDefaultAsync();
        if (station is null) return NotFound("Station missing");

        // ✅ normalize date to UTC midnight
        var normalizedDate = patch.Date.Date.AddHours(12);

        // ✅ validate time range in minutes
        if (patch.OpenMinutes < 0 || patch.OpenMinutes >= patch.CloseMinutes || patch.CloseMinutes > 1440)
            return BadRequest("Open/Close minutes invalid");

        // existing max concurrent check
        if (patch.MaxConcurrent <= 0 || patch.MaxConcurrent > station.TotalSlots)
            return BadRequest("MaxConcurrent must be 1..TotalSlots");

        var upd = Builders<StationSchedule>.Update
            .Set(x => x.Date, normalizedDate)
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

    // GET /api/stations/{stationId}/slots?date=2025-10-06&minutesPerSlot=30
    [AllowAnonymous] // or [Authorize] if you prefer
    [HttpGet("stations/{stationId}/slots")]
    public async Task<IActionResult> GetSlots(
        string stationId, [FromQuery] DateTime date,
        [FromQuery] int minutesPerSlot = 30)
    {
        if (minutesPerSlot <= 0) return BadRequest("minutesPerSlot must be > 0");

        // ✅ Treat query date as a LOCAL calendar day (Unspecified)
        var day = DateTime.SpecifyKind(date.Date, DateTimeKind.Unspecified);
        var next = day.AddDays(1);

        // ✅ Match schedule by range (avoids .Date translation + Kind issues)
        var sched = await _schedules.Find(s =>
            s.StationId == stationId &&
            s.Date >= day && s.Date < next
        ).FirstOrDefaultAsync();

        if (sched == null) return NotFound("No schedule for the selected date.");

        // Build local slots from Open..Close (local wall-clock)
        var openLocal = day.AddMinutes(sched.OpenMinutes);
        var closeLocal = day.AddMinutes(sched.CloseMinutes);
        if (closeLocal <= openLocal) return BadRequest("Invalid schedule.");

        var slots = new List<object>();
        for (var start = openLocal; start < closeLocal; start = start.AddMinutes(minutesPerSlot))
        {
            var end = start.AddMinutes(minutesPerSlot);
            if (end > closeLocal) break;

            // Convert local -> UTC for overlap checks (bookings are stored in UTC)
            var startUtc = Backend.Services.TimezoneHelper.ToUtcFromLocal(start, "Asia/Colombo");
            var endUtc = Backend.Services.TimezoneHelper.ToUtcFromLocal(end, "Asia/Colombo");

            var activeCount = await _bookings.CountDocumentsAsync(b =>
                b.StationId == stationId &&
                (b.Status == "Pending" || b.Status == "Approved") &&
                b.StartTime < endUtc && b.EndTime > startUtc);

            var available = Math.Max(0, sched.MaxConcurrent - (int)activeCount);

            slots.Add(new
            {
                startLocal = start,
                endLocal = end,
                startUtc,
                endUtc,
                available
            });
        }

        return Ok(new { date = day, minutesPerSlot, maxConcurrent = sched.MaxConcurrent, slots });
    }

}
