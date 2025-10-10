/*
-------------------------------------------------------------------------------------
File Name    : AuthController.cs
Namespace    : Backend.Controllers
Description  : This controller handles user authentication and authorization 
               operations for the web service. It includes functionalities for 
               registering users, logging in, managing user accounts (activation/
               deactivation/reactivation), and ensuring role-based access control.
-------------------------------------------------------------------------------------
*/
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

    // Constructor: Initializes MongoDB user collection and token service.
    public AuthController(IMongoDatabase db, ITokenService tokens)
    {
        _users = db.GetCollection<User>("users");
        _tokens = tokens;

        // Create a unique index on the Email field to prevent duplicate user entries.
        _users.Indexes.CreateOne(new CreateIndexModel<User>(
            Builders<User>.IndexKeys.Ascending(u => u.Email),
            new CreateIndexOptions { Unique = true, Name = "ux_users_email" }));
    }

    // ========= REGISTER (Backoffice only) =========
    // Method: Register
    // Description: Allows Backoffice users to register new Backoffice or StationOperator accounts.
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
    // Method: Login
    // Description: Validates user credentials and issues a JWT token for authentication.
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

        // ❗block deactivated users
        if (!user.IsActive)
            return Unauthorized("Account is deactivated. Please contact support.");

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
    // Method: GetUsers
    // Description: Retrieves all registered users for management purposes.
    [HttpGet("users")]
    [Authorize(Roles = "Backoffice")]
    public async Task<ActionResult<List<UserDto>>> GetUsers()
    {
        var list = await _users.Find(_ => true)
            .Project(u => new UserDto
            {
                Id = u.Id,
                Email = u.Email,
                Role = u.Role,
                IsActive = u.IsActive,
                CreatedAt = u.CreatedAt,
                AssignedStationIds = u.AssignedStationIds
            })
            .ToListAsync();

        return Ok(list);
    }

    // ========= DEACTIVATE (Backoffice only) =========
    // Method: DeactivateUser
    // Description: Deactivates a specific user account (and associated EV owner profile if applicable).
    [HttpPost("{id}/deactivate")]
    [Authorize(Roles = "Backoffice")]
    public async Task<IActionResult> DeactivateUser(string id)
    {
        var target = await _users.Find(u => u.Id == id).FirstOrDefaultAsync();
        if (target is null) return NotFound(new { message = "User not found." });

        // prevent deactivating yourself
        var currentEmail = User.Identity?.Name;
        if (string.Equals(target.Email, currentEmail, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "You cannot deactivate your own account." });

        // prevent deactivating the last active Backoffice
        if (target.Role == "Backoffice")
        {
            var activeAdmins = await _users.CountDocumentsAsync(u => u.Role == "Backoffice" && u.IsActive);
            if (activeAdmins <= 1)
                return BadRequest(new { message = "Cannot deactivate the last active Backoffice user." });
        }

        var now = DateTime.UtcNow;

        // Deactivate user
        var upd = Builders<User>.Update
            .Set(u => u.IsActive, false)
            .Set(u => u.UpdatedAt, now);

        await _users.UpdateOneAsync(u => u.Id == id, upd);

        // If EVOwner, also deactivate Owner profile
        if (target.Role == "EVOwner" && !string.IsNullOrEmpty(target.Nic))
        {
            var owners = HttpContext.RequestServices.GetRequiredService<IMongoDatabase>().GetCollection<Owner>("owners");
            await owners.UpdateOneAsync(
                o => o.Nic == target.Nic,
                Builders<Owner>.Update
                    .Set(o => o.IsActive, false)
                    .Set(o => o.UpdatedAt, now)
            );
        }

        return Ok(new { message = "User (and owner if applicable) deactivated." });
    }

    // ========= REACTIVATE (Backoffice only) =========
    // Method: ReactivateUser
    // Description: Re-enables a deactivated user and their EV Owner profile if applicable.
    [HttpPost("{id}/reactivate")]
    [Authorize(Roles = "Backoffice")]
    public async Task<IActionResult> ReactivateUser(string id)
    {
        var target = await _users.Find(u => u.Id == id).FirstOrDefaultAsync();
        if (target is null) return NotFound(new { message = "User not found." });

        var now = DateTime.UtcNow;

        // Reactivate user
        var upd = Builders<User>.Update
            .Set(u => u.IsActive, true)
            .Set(u => u.UpdatedAt, now);

        await _users.UpdateOneAsync(u => u.Id == id, upd);

        // If EVOwner, also reactivate Owner profile
        if (target.Role == "EVOwner" && !string.IsNullOrEmpty(target.Nic))
        {
            var owners = HttpContext.RequestServices.GetRequiredService<IMongoDatabase>().GetCollection<Owner>("owners");
            await owners.UpdateOneAsync(
                o => o.Nic == target.Nic,
                Builders<Owner>.Update
                    .Set(o => o.IsActive, true)
                    .Set(o => o.UpdatedAt, now)
            );
        }

        return Ok(new { message = "User (and owner if applicable) reactivated." });
    }
}

// ================= Data Transfer Object (DTO) =================
// Purpose: Used to define a simplified version of the User model for API responses.
public sealed class UserDto
{
    public string Id { get; set; } = default!;     
    public string Email { get; set; } = default!; 
    public string Role { get; set; } = default!;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<string>? AssignedStationIds { get; set; }
}
