// -----------------------------------------------------------------------------
// File: QrTokenService.cs
// Namespace: Backend.Services
// Purpose: Provides functionality for generating short-lived JWT-based QR tokens
//          for EV charging bookings. Used for secure station validation.
// -----------------------------------------------------------------------------
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using Backend.Models;

public interface IQrTokenService
{
    (string jwt, string jti, DateTime expUtc) GenerateFor(Booking b);
}

public class QrTokenService : IQrTokenService
{
    private readonly string _key;
    public QrTokenService(IConfiguration cfg) => _key = cfg["Jwt:QRSigningKey"];

    public (string jwt, string jti, DateTime expUtc) GenerateFor(Booking b)
    {
        var secKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(_key));
        var creds = new SigningCredentials(secKey, SecurityAlgorithms.HmacSha256);

        var jti = Guid.NewGuid().ToString("N");
        var iat = DateTimeOffset.UtcNow;
        var exp = b.EndTime.AddMinutes(30); // QR valid until 30m after end

        // compact claims so QR stays short
        var claims = new[]
        {
            new Claim("bid", b.Id),
            new Claim("sid", b.StationId),
            new Claim("nic", b.Nic),
            new Claim("st", b.StartTime.ToString("o")),
            new Claim("et", b.EndTime.ToString("o")),
            new Claim(JwtRegisteredClaimNames.Jti, jti),
            new Claim(JwtRegisteredClaimNames.Iat, iat.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
            new Claim(JwtRegisteredClaimNames.Exp, new DateTimeOffset(exp).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        var token = new JwtSecurityToken(claims: claims, signingCredentials: creds);
        var jwt = new JwtSecurityTokenHandler().WriteToken(token);
        return (jwt, jti, exp);
    }
}
