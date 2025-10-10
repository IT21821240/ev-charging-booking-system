/*
-------------------------------------------------------------------------------------
File Name    : AdminUsersController.cs
Namespace    : Backend.Controllers
Description  : This controller manages the association between station operators and stations
               in the backend system. It provides endpoints for retrieving, adding, removing,
               and replacing station operators, as well as for listing operator candidates.
-------------------------------------------------------------------------------------
*/
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using System.Linq;
using System.Collections.Generic;

namespace Backend.Controllers;

[ApiController]
[Route("api/stations")]
[Authorize(Roles = "Backoffice")]
public class StationOperatorsController : ControllerBase
{
    private readonly IMongoCollection<Station> _stations;
    private readonly IMongoCollection<User> _users;

    public StationOperatorsController(IMongoDatabase db)
    {
        _stations = db.GetCollection<Station>("stations");
        _users = db.GetCollection<User>("users");
    }

    // Retrieves all active Station Operators assigned to a specific station. Returns 404 if the station does not exist.
    // GET /api/stations/{stationId}/operators
    [HttpGet("{stationId}/operators")]
    public async Task<IActionResult> GetOperatorsForStation(string stationId)
    {
        var stationExists = await _stations.Find(s => s.Id == stationId).AnyAsync();
        if (!stationExists) return NotFound("Station not found.");

        var ops = await _users.Find(u =>
                u.Role == "StationOperator" &&
                u.IsActive &&
                u.AssignedStationIds != null &&
                u.AssignedStationIds.Contains(stationId))
            .Project(u => new { u.Id, u.Email, u.IsActive })
            .ToListAsync();

        return Ok(ops);
    }

    // Assigns an active Station Operator to a specific active station.
    // POST /api/stations/{stationId}/operators/{userId}
    [HttpPost("{stationId}/operators/{userId}")]
    public async Task<IActionResult> AddOperatorToStation(string stationId, string userId)
    {
        var stationExists = await _stations.Find(s => s.Id == stationId && s.IsActive).AnyAsync();
        if (!stationExists) return NotFound("Station not found or inactive.");

        var filter = Builders<User>.Filter.Where(u =>
            u.Id == userId && u.Role == "StationOperator" && u.IsActive);

        var update = Builders<User>.Update.AddToSet(u => u.AssignedStationIds, stationId);

        var res = await _users.UpdateOneAsync(filter, update);
        if (res.MatchedCount == 0)
            return NotFound("Operator not found, not active, or not a StationOperator.");

        return NoContent();
    }

    // Removes a Station Operator’s assignment from a specific station.
    // DELETE /api/stations/{stationId}/operators/{userId}
    [HttpDelete("{stationId}/operators/{userId}")]
    public async Task<IActionResult> RemoveOperatorFromStation(string stationId, string userId)
    {
        var filter = Builders<User>.Filter.Where(u =>
            u.Id == userId && u.Role == "StationOperator");

        var update = Builders<User>.Update.Pull(u => u.AssignedStationIds, stationId);

        var res = await _users.UpdateOneAsync(filter, update);
        if (res.MatchedCount == 0)
            return NotFound("Operator not found or not a StationOperator.");

        return NoContent();
    }

    // DTO must be mutable to avoid CS8852
    public class ReplaceOperatorsRequest
    {
        public List<string>? UserIds { get; set; }
    }

    // Replaces all operators currently assigned to a station with a new list of specified active Station Operators.
    // POST /api/stations/{stationId}/operators:replace
    [HttpPost("{stationId}/operators:replace")]
    public async Task<IActionResult> ReplaceStationOperators(
        string stationId,
        [FromBody] ReplaceOperatorsRequest req)
    {
        // Work with a local list, don't mutate req.UserIds
        var userIds = (req?.UserIds ?? new List<string>()).Distinct().ToList();

        var stationExists = await _stations.Find(s => s.Id == stationId).AnyAsync();
        if (!stationExists) return NotFound("Station not found.");

        // Remove stationId from all StationOperators first
        var pullFilter = Builders<User>.Filter.Eq(u => u.Role, "StationOperator");
        var pullUpdate = Builders<User>.Update.Pull(u => u.AssignedStationIds, stationId);
        await _users.UpdateManyAsync(pullFilter, pullUpdate);

        if (userIds.Count == 0) return NoContent();

        // Add stationId to specified operators
        var pushFilter = Builders<User>.Filter.Where(u =>
            userIds.Contains(u.Id) && u.Role == "StationOperator" && u.IsActive);
        var pushUpdate = Builders<User>.Update.AddToSet(u => u.AssignedStationIds, stationId);

        await _users.UpdateManyAsync(pushFilter, pushUpdate);
        return NoContent();
    }

    // Retrieves a paginated list of active Station Operators
    // GET /api/stations/{stationId}/operators/candidates?q=ann&page=1&pageSize=20
    [HttpGet("{stationId}/operators/candidates")]
    public async Task<IActionResult> GetOperatorCandidates(
        string stationId,
        [FromQuery] string? q = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        if (page <= 0) page = 1;
        if (pageSize <= 0 || pageSize > 100) pageSize = 20;

        // base: active station-operators not already assigned to this station
        var baseFilter = Builders<User>.Filter.And(
            Builders<User>.Filter.Eq(u => u.Role, "StationOperator"),
            Builders<User>.Filter.Eq(u => u.IsActive, true),
            Builders<User>.Filter.Or(
                Builders<User>.Filter.Eq(u => u.AssignedStationIds, null),
                Builders<User>.Filter.Not(Builders<User>.Filter.AnyEq(u => u.AssignedStationIds!, stationId))
            )
        );

        // optional search by email (case-insensitive)
        if (!string.IsNullOrWhiteSpace(q))
        {
            var rx = new MongoDB.Bson.BsonRegularExpression(q.Trim(), "i");
            baseFilter &= Builders<User>.Filter.Regex(u => u.Email, rx);
        }

        var total = await _users.CountDocumentsAsync(baseFilter);

        var items = await _users.Find(baseFilter)
            .SortBy(u => u.Email)
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .Project(u => new { u.Id, u.Email }) // keep it light
            .ToListAsync();

        return Ok(new
        {
            page,
            pageSize,
            total,
            items
        });
    }

}
