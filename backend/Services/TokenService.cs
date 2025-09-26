using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Text;

namespace Backend.Services
{
    public class TokenService : ITokenService
    {
        private readonly string _key;
        private readonly string _issuer;
        private readonly string _audience;

        public TokenService(IConfiguration config)
        {
            _key = Environment.GetEnvironmentVariable("JWT_KEY")
                   ?? config["Jwt:Key"]
                   ?? throw new InvalidOperationException("JWT_KEY missing");
            _issuer = Environment.GetEnvironmentVariable("JWT_ISSUER")
                      ?? config["Jwt:Issuer"] ?? "evcs.api";
            _audience = Environment.GetEnvironmentVariable("JWT_AUDIENCE")
                        ?? config["Jwt:Audience"] ?? "evcs.clients";
        }

        public string IssueToken(IEnumerable<Claim> claims)
        {
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_key));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _issuer,
                audience: _audience,
                claims: claims,
                expires: DateTime.UtcNow.AddHours(1),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
