using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using MongoDB.Driver;
using System.Security.Claims;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // default: all require JWT
public class OwnersController : ControllerBase
{
    private readonly IMongoCollection<Owner> _owners;
    private readonly ITokenService _tokens;

    public OwnersController(IMongoDatabase db, ITokenService tokens)
    {
        _owners = db.GetCollection<Owner>("owners");
        _tokens = tokens;

        // Unique NIC
        var keys = Builders<Owner>.IndexKeys.Ascending(o => o.Nic);
        _owners.Indexes.CreateOne(new CreateIndexModel<Owner>(keys, new CreateIndexOptions { Unique = true, Name = "ux_owners_nic" }));
    }

    // ---------- DTOs ----------
    public record RegisterOwnerDto(string Nic, string Name, string? Email, string? Phone);
    public record SelfRegisterDto(string Nic, string Email, string Password, string? Name, string? Phone);
    public record UpdateOwnerDto(string Name, string? Email, string? Phone);

    // ---------- MOBILE: self-register (profile upsert + create users login EVOwner) ----------
    [AllowAnonymous]
    [HttpPost("self-register")]
    public async Task<IActionResult> SelfRegister([FromBody] SelfRegisterDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Nic) ||
            string.IsNullOrWhiteSpace(dto.Email) ||
            string.IsNullOrWhiteSpace(dto.Password))
            return BadRequest("NIC, Email and Password are required.");

        var now = DateTime.UtcNow;
        var users = HttpContext.RequestServices
            .GetRequiredService<IMongoDatabase>()
            .GetCollection<User>("users");

        var email = dto.Email.Trim().ToLowerInvariant();

        // ✅ Check once
        var existing = await users.Find(u => u.Email == email).FirstOrDefaultAsync();
        if (existing is not null)
            return Conflict(new { message = "Email already in use." });

        // 1) Upsert owner profile
        var upd = Builders<Owner>.Update
            .SetOnInsert(o => o.Nic, dto.Nic)
            .Set(o => o.Name, dto.Name)
            .Set(o => o.Email, dto.Email)
            .Set(o => o.Phone, dto.Phone)
            .SetOnInsert(o => o.IsActive, true)
            .SetOnInsert(o => o.CreatedAt, now)
            .Set(o => o.UpdatedAt, now);

        await _owners.UpdateOneAsync(o => o.Nic == dto.Nic, upd, new UpdateOptions { IsUpsert = true });

        // 2) Insert user
        var user = new User
        {
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Role = "EVOwner",
            Nic = dto.Nic,
            IsActive = true,
            CreatedAt = now
        };

        await users.InsertOneAsync(user);

        // 3) Issue token
        var claims = new List<Claim> {
        new Claim(ClaimTypes.Role, "EVOwner"),
        new Claim("nic", dto.Nic),
        new Claim("email", email)
    };
        var token = _tokens.IssueToken(claims);

        return Ok(new { message = "Registered. You are now signed in on mobile.", token, role = "EVOwner", nic = dto.Nic, email = dto.Email });
    }

    // ---------- WEB (Backoffice): create owner PROFILE ONLY ----------
    // POST /api/owners
    [HttpPost]
    [Authorize(Roles = "Backoffice")]
    public async Task<IActionResult> Create([FromBody] RegisterOwnerDto dto)
    {
        var owner = new Owner
        {
            Nic = dto.Nic,
            Name = dto.Name,
            Email = dto.Email,
            Phone = dto.Phone,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        try
        {
            await _owners.InsertOneAsync(owner);
            return CreatedAtAction(nameof(GetByNic), new { nic = owner.Nic }, owner);
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            return Conflict(new { message = "Owner with this NIC already exists." });
        }
    }

    // ---------- WEB+MOBILE: get by NIC ----------
    [HttpGet("{nic}")]
    public async Task<IActionResult> GetByNic(string nic)
    {
        // EVOwner can only read their own profile
        if (User.IsInRole("EVOwner"))
        {
            var nicClaim = User.FindFirst("nic")?.Value;
            if (!string.Equals(nicClaim, nic, StringComparison.OrdinalIgnoreCase))
                return Forbid();
        }

        var o = await _owners.Find(x => x.Nic == nic).FirstOrDefaultAsync();
        return o is null ? NotFound() : Ok(o);
    }

    // ---------- WEB: list owners with paging & filters (Backoffice-only) ----------
    // GET /api/owners?page=1&pageSize=50&q=ga&isActive=true
    [HttpGet]
    [Authorize(Roles = "Backoffice")]
    public async Task<ActionResult<object>> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? q = null,
        [FromQuery] bool? isActive = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        var filter = Builders<Owner>.Filter.Empty;
        var filters = new List<FilterDefinition<Owner>>();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var rx = new MongoDB.Bson.BsonRegularExpression(q, "i"); // case-insensitive contains
            filters.Add(Builders<Owner>.Filter.Or(
                Builders<Owner>.Filter.Regex(o => o.Nic, rx),
                Builders<Owner>.Filter.Regex(o => o.Name, rx),
                Builders<Owner>.Filter.Regex(o => o.Email, rx),
                Builders<Owner>.Filter.Regex(o => o.Phone, rx)
            ));
        }
        if (isActive.HasValue)
            filters.Add(Builders<Owner>.Filter.Eq(o => o.IsActive, isActive.Value));

        if (filters.Count > 0)
            filter = Builders<Owner>.Filter.And(filters);

        var total = await _owners.CountDocumentsAsync(filter);
        var items = await _owners
            .Find(filter)
            .SortByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync();

        return Ok(new { page, pageSize, total, items });
    }

    // ---------- WEB+MOBILE: update profile ----------
    [HttpPut("{nic}")]
    public async Task<IActionResult> Update(string nic, [FromBody] UpdateOwnerDto patch)
    {
        // EVOwner can only update their own profile
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

    // ---------- WEB (Backoffice): deactivate/reactivate ----------
    [Authorize(Roles = "Backoffice")]
    [HttpPost("{nic}/deactivate")]
    public async Task<IActionResult> Deactivate(string nic)
    {
        var now = DateTime.UtcNow;

        // Deactivate Owner profile
        var ownerRes = await _owners.UpdateOneAsync(
            o => o.Nic == nic,
            Builders<Owner>.Update
                .Set(o => o.IsActive, false)
                .Set(o => o.UpdatedAt, now)
        );

        // Deactivate corresponding user (if exists)
        var users = HttpContext.RequestServices.GetRequiredService<IMongoDatabase>().GetCollection<User>("users");
        await users.UpdateOneAsync(
            u => u.Nic == nic && u.Role == "EVOwner",
            Builders<User>.Update
                .Set(u => u.IsActive, false)
                .Set(u => u.UpdatedAt, now)
        );

        return ownerRes.MatchedCount == 0
            ? NotFound(new { message = "Owner not found." })
            : Ok(new { message = "Owner and user account deactivated." });
    }

    [Authorize(Roles = "Backoffice")]
    [HttpPost("{nic}/reactivate")]
    public async Task<IActionResult> Reactivate(string nic)
    {
        var now = DateTime.UtcNow;

        // Reactivate Owner profile
        var ownerRes = await _owners.UpdateOneAsync(
            o => o.Nic == nic,
            Builders<Owner>.Update
                .Set(o => o.IsActive, true)
                .Set(o => o.UpdatedAt, now)
        );

        // Reactivate corresponding user (if exists)
        var users = HttpContext.RequestServices.GetRequiredService<IMongoDatabase>().GetCollection<User>("users");
        await users.UpdateOneAsync(
            u => u.Nic == nic && u.Role == "EVOwner",
            Builders<User>.Update
                .Set(u => u.IsActive, true)
                .Set(u => u.UpdatedAt, now)
        );

        return ownerRes.MatchedCount == 0
            ? NotFound(new { message = "Owner not found." })
            : Ok(new { message = "Owner and user account reactivated." });
    }

    // ---------- MOBILE: EV Owner self-deactivate ----------
    [HttpPost("self-deactivate")]
    [Authorize(Roles = "EVOwner")]
    public async Task<IActionResult> SelfDeactivate()
    {
        var nicClaim = User.FindFirst("nic")?.Value;
        if (string.IsNullOrEmpty(nicClaim))
            return Unauthorized("NIC claim missing.");

        var now = DateTime.UtcNow;

        // Deactivate Owner profile
        var ownerRes = await _owners.UpdateOneAsync(
            o => o.Nic == nicClaim,
            Builders<Owner>.Update
                .Set(o => o.IsActive, false)
                .Set(o => o.UpdatedAt, now)
        );

        if (ownerRes.MatchedCount == 0)
            return NotFound(new { message = "Owner not found." });

        // Deactivate User login
        var users = HttpContext.RequestServices.GetRequiredService<IMongoDatabase>().GetCollection<User>("users");
        await users.UpdateOneAsync(
            u => u.Nic == nicClaim && u.Role == "EVOwner",
            Builders<User>.Update
                .Set(u => u.IsActive, false)
                .Set(u => u.UpdatedAt, now)
        );

        return Ok(new { message = "Your account and login have been deactivated." });
    }
}
