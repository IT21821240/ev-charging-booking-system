using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using Microsoft.AspNetCore.Authorization;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // default: all endpoints require a valid JWT
public class OwnersController : ControllerBase
{
    private readonly IMongoCollection<Owner> _owners;

    public OwnersController(IMongoDatabase db)
    {
        _owners = db.GetCollection<Owner>("owners");

        // Ensure NIC unique index
        var keys = Builders<Owner>.IndexKeys.Ascending(o => o.Nic);
        var opt = new CreateIndexOptions { Unique = true, Name = "ux_owners_nic" };
        _owners.Indexes.CreateOne(new CreateIndexModel<Owner>(keys, opt));
    }

    // POST /api/owners  (owner registration - public)
    [AllowAnonymous]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Owner o)
    {
        try
        {
            o.Nic = o.Nic.Trim().ToUpperInvariant();
            o.CreatedAt = o.UpdatedAt = DateTime.UtcNow;
            await _owners.InsertOneAsync(o);
            return CreatedAtAction(nameof(GetByNic), new { nic = o.Nic }, o);
        }
        catch (MongoWriteException mwx) when (mwx.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            return Conflict("Owner with this NIC already exists.");
        }
    }

    // GET /api/owners/{nic}
    // Any logged-in user; if EVOwner, can only read their own NIC
    [HttpGet("{nic}")]
    public async Task<IActionResult> GetByNic(string nic)
    {
        if (User.IsInRole("EVOwner"))
        {
            var nicClaim = User.FindFirst("nic")?.Value;
            if (!string.Equals(nicClaim, nic, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        var o = await _owners.Find(x => x.Nic == nic).FirstOrDefaultAsync();
        return o is null ? NotFound() : Ok(o);
    }

    // PUT /api/owners/{nic}
    // Any logged-in user; if EVOwner, can only update their own NIC
    [HttpPut("{nic}")]
    public async Task<IActionResult> Update(string nic, [FromBody] UpdateOwnerDto patch)
    {
        if (User.IsInRole("EVOwner"))
        {
            var nicClaim = User.FindFirst("nic")?.Value;
            if (!string.Equals(nicClaim, nic, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        var upd = Builders<Owner>.Update
            .Set(x => x.Name, patch.Name)
            .Set(x => x.Phone, patch.Phone)
            .Set(x => x.Email, patch.Email)
            .Set(x => x.UpdatedAt, DateTime.UtcNow);

        var res = await _owners.UpdateOneAsync(x => x.Nic == nic, upd);
        return res.MatchedCount == 0 ? NotFound() : NoContent();
    }

    // POST /api/owners/{nic}/deactivate  (Backoffice only)
    [Authorize(Roles = "Backoffice")]
    [HttpPost("{nic}/deactivate")]
    public async Task<IActionResult> Deactivate(string nic)
    {
        var res = await _owners.UpdateOneAsync(
            o => o.Nic == nic,
            Builders<Owner>.Update
                .Set(o => o.IsActive, false)
                .Set(o => o.UpdatedAt, DateTime.UtcNow)
        );

        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Owner deactivated" });
    }

    // POST /api/owners/{nic}/reactivate  (Backoffice only)
    [Authorize(Roles = "Backoffice")]
    [HttpPost("{nic}/reactivate")]
    public async Task<IActionResult> Reactivate(string nic)
    {
        var res = await _owners.UpdateOneAsync(
            o => o.Nic == nic,
            Builders<Owner>.Update
                .Set(o => o.IsActive, true)
                .Set(o => o.UpdatedAt, DateTime.UtcNow)
        );

        return res.MatchedCount == 0 ? NotFound() : Ok(new { message = "Owner reactivated" });
    }
}
