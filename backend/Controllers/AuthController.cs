using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using MongoDB.Driver;
using Backend.Models;
using Backend.Services;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IMongoCollection<User> _users;
    private readonly ITokenService _tokens;

    public AuthController(IMongoDatabase db, ITokenService tokens)
    {
        _users = db.GetCollection<User>("users");
        _tokens = tokens;

        // indexes (see above snippet); safe to call once here
        _users.Indexes.CreateOne(new CreateIndexModel<User>(
            Builders<User>.IndexKeys.Ascending(u => u.Email),
            new CreateIndexOptions { Unique = true, Name = "ux_users_email" }));
        _users.Indexes.CreateOne(new CreateIndexModel<User>(
            Builders<User>.IndexKeys.Ascending(u => u.Username),
            new CreateIndexOptions { Unique = true, Sparse = true, Name = "ux_users_username" }));
    }

    // ========= REGISTER (Backoffice only) =========
    // Backoffice creates Backoffice/StationOperator users
    [HttpPost("register")]
    [Authorize(Roles = "Backoffice")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email and password are required.");

        if (req.Role is not ("Backoffice" or "StationOperator"))
            return BadRequest("Invalid role. Use Backoffice or StationOperator.");

        var user = new User
        {
            Email = req.Email.Trim().ToLowerInvariant(),
            Username = null, // legacy field not used
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = req.Role,
            Nic = null,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        try
        {
            await _users.InsertOneAsync(user);
            return Ok(new { message = "User created" });
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            return Conflict(new { message = "Email already in use." });
        }
    }

    // ========= LOGIN =========
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        // Validate first
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email and password are required.");

        // Normalize email and fetch user
        var email = req.Email.Trim().ToLowerInvariant();
        var user = await _users.Find(u => u.Email == email).FirstOrDefaultAsync();

        // Check credentials
        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized("Invalid credentials.");

        // Claims + token
        var claims = new List<Claim>
    {
        new Claim(ClaimTypes.Name, user.Email),   // Name = email
        new Claim(ClaimTypes.Role, user.Role),
        new Claim("nic", user.Nic ?? string.Empty),
        new Claim("email", user.Email)
    };

        var token = _tokens.IssueToken(claims);
        return Ok(new { token, role = user.Role, nic = user.Nic, email = user.Email });
    }

    // ========= LIST USERS (Backoffice only) =========
    [HttpGet("users")]
    [Authorize(Roles = "Backoffice")]
    public async Task<ActionResult<List<UserDto>>> GetUsers()
    {
        var list = await _users.Find(_ => true)
            .Project(u => new UserDto
            {
                Id = u.Id,
                Username = u.Username,
                Email = u.Email,
                Role = u.Role,
                IsActive = u.IsActive,
                CreatedAt = u.CreatedAt
            })
            .ToListAsync();

        return Ok(list);
    }

    // ========= DEACTIVATE (Backoffice only) =========
    [HttpPost("{id}/deactivate")]
    [Authorize(Roles = "Backoffice")]
    public async Task<IActionResult> DeactivateUser(string id)
    {
        var target = await _users.Find(u => u.Id == id).FirstOrDefaultAsync();
        if (target is null) return NotFound("User not found.");

        // prevent deactivating yourself
        var currentUsername = User.Identity?.Name;
        if (string.Equals(target.Username, currentUsername, StringComparison.OrdinalIgnoreCase))
            return BadRequest("You cannot deactivate your own account.");

        // prevent deactivating the last active Backoffice
        if (target.Role == "Backoffice")
        {
            var activeAdmins = await _users.CountDocumentsAsync(u => u.Role == "Backoffice" && u.IsActive);
            if (activeAdmins <= 1)
                return BadRequest("Cannot deactivate the last active Backoffice user.");
        }

        var upd = Builders<User>.Update.Set(u => u.IsActive, false);
        await _users.UpdateOneAsync(u => u.Id == id, upd);
        return NoContent();
    }

    // ========= REACTIVATE (Backoffice only) =========
    [HttpPost("{id}/reactivate")]
    [Authorize(Roles = "Backoffice")]
    public async Task<IActionResult> ReactivateUser(string id)
    {
        var exists = await _users.Find(u => u.Id == id).AnyAsync();
        if (!exists) return NotFound("User not found.");

        var upd = Builders<User>.Update.Set(u => u.IsActive, true);
        await _users.UpdateOneAsync(u => u.Id == id, upd);
        return NoContent();
    }
}

// Return shape for list users
public sealed class UserDto
{
    public string Id { get; set; } = default!;
    public string? Username { get; set; }        
    public string Email { get; set; } = default!; 
    public string Role { get; set; } = default!;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}
