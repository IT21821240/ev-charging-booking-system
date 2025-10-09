// -----------------------------------------------------------------------------
// File: QrValidator.cs
// Purpose: Provides QR JWT validation logic for EV booking verification.
// -----------------------------------------------------------------------------
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using Backend.Models;

namespace Backend.Services
{
    public interface IQrValidator
    {
        Task<(bool ok, string? error, Booking? b)> ValidateAsync(string jwt);
    }

    public class QrValidator : IQrValidator
    {
        private readonly string _key;
        private readonly IBookingsRepository _repo;

        // Grace windows around the local booking window (adjust as needed)
        private static readonly TimeSpan EarlyGrace = TimeSpan.FromMinutes(15);  // allow 15 min early
        private static readonly TimeSpan LateGrace = TimeSpan.FromMinutes(30);  // allow 30 min over

        public QrValidator(IConfiguration cfg, IBookingsRepository repo)
        {
            _key = cfg["Jwt:QRSigningKey"] ?? string.Empty;
            _repo = repo;
        }

        public async Task<(bool ok, string? error, Booking? b)> ValidateAsync(string jwt)
        {
            if (string.IsNullOrWhiteSpace(jwt))
                return (false, "Missing token.", null);

            // --- 1) Verify JWT (signature + lifetime) ---
            ClaimsPrincipal principal;
            try
            {
                principal = new JwtSecurityTokenHandler().ValidateToken(
                    jwt,
                    new TokenValidationParameters
                    {
                        ValidateIssuer = false,
                        ValidateAudience = false,
                        ValidateLifetime = true, // checks 'exp'
                        ValidateIssuerSigningKey = true,
                        IssuerSigningKey = new SymmetricSecurityKey(
                            System.Text.Encoding.UTF8.GetBytes(_key)),
                        ClockSkew = TimeSpan.FromMinutes(2)
                    },
                    out _
                );
            }
            catch (Exception ex)
            {
                return (false, $"Invalid or expired token: {ex.Message}", null);
            }

            // --- 2) Pull required claims from the QR token ---
            string bid = principal.FindFirstValue("bid");
            string sid = principal.FindFirstValue("sid");
            string nic = principal.FindFirstValue("nic");
            string jti = principal.FindFirstValue(JwtRegisteredClaimNames.Jti);

            if (string.IsNullOrEmpty(bid) || string.IsNullOrEmpty(sid) ||
                string.IsNullOrEmpty(nic) || string.IsNullOrEmpty(jti))
                return (false, "Malformed token.", null);

            // --- 3) Load booking ---
            var b = await _repo.GetByIdAsync(bid);
            if (b == null) return (false, "Booking not found.", null);

            // --- 4) Business checks ---
            if (!string.Equals(b.Status, "Approved", StringComparison.OrdinalIgnoreCase))
                return (false, "Booking is not approved yet.", null);

            if (!b.IsQrActive)
                return (false, "QR is inactive.", null);

            if (!string.Equals(b.StationId, sid, StringComparison.OrdinalIgnoreCase))
                return (false, "Station mismatch.", null);

            if (!string.Equals(b.Nic, nic, StringComparison.OrdinalIgnoreCase))
                return (false, "Owner mismatch.", null);

            if (!string.Equals(b.QrJti, jti, StringComparison.OrdinalIgnoreCase))
                return (false, "QR invalid or replaced.", null);

            // --- 5) Time window guard (LOCAL: Asia/Colombo) ---
            // NOW (local)
            var nowLocal = TimezoneHelper.ToLocal(DateTime.UtcNow, "Asia/Colombo");

            // Treat stored booking times as local wall times (since backend stores LKT now)
            // Force Kind=Unspecified to avoid hidden timezone conversions during comparison.
            var startLocal = DateTime.SpecifyKind(b.StartTime, DateTimeKind.Unspecified);
            var endLocal = DateTime.SpecifyKind(b.EndTime, DateTimeKind.Unspecified);

            var windowStart = startLocal - EarlyGrace;
            var windowEnd = endLocal + LateGrace;

            if (nowLocal < windowStart || nowLocal > windowEnd)
                return (false, "QR not valid at this time.", null);

            // ✅ Success (no single-use marking here; controller can handle that if desired)
            return (true, null, b);
        }
    }
}
