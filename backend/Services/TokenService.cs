using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Backend.Services;

public class TokenService
{
    private readonly string _key;
    private readonly string _issuer;
    private readonly string _audience;

    public TokenService(IConfiguration cfg)
    {
        _key = Environment.GetEnvironmentVariable("JWT_KEY") ?? cfg["Jwt:Key"]!;
        _issuer = Environment.GetEnvironmentVariable("JWT_ISSUER") ?? cfg["Jwt:Issuer"] ?? "evcs.api";
        _audience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? cfg["Jwt:Audience"] ?? "evcs.clients";
    }

    public string CreateToken(string username, string role, string? nic = null)
    {
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, username),
            new Claim(ClaimTypes.Name, username),
            new Claim(ClaimTypes.Role, role)
        };
        if (!string.IsNullOrWhiteSpace(nic))
            claims.Add(new Claim("nic", nic));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
