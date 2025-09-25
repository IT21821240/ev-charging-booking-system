using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Backend.Models;
using Backend.Services;
using BCrypt.Net;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IMongoCollection<User> _users;
    private readonly TokenService _tokens;

    public AuthController(IMongoDatabase db, TokenService tokens)
    {
        _users = db.GetCollection<User>("users");
        _tokens = tokens;

        // ensure unique username
        var idx = Builders<User>.IndexKeys.Ascending(u => u.Username);
        _users.Indexes.CreateOne(new CreateIndexModel<User>(idx, new CreateIndexOptions { Unique = true }));
    }

    // POST: /api/auth/register  (for demo/seed)
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        var user = new User
        {
            Username = req.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = req.Role,
            Nic = req.Nic
        };
        await _users.InsertOneAsync(user);
        return Ok(new { message = "User created" });
    }

    // POST: /api/auth/login
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var user = await _users.Find(u => u.Username == req.Username).FirstOrDefaultAsync();
        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized("Invalid credentials.");

        var token = _tokens.CreateToken(user.Username, user.Role, user.Nic);
        return Ok(new { token, role = user.Role, nic = user.Nic });
    }
}
