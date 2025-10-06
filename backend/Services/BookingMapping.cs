using Backend.Models;
using static Backend.Services.TimezoneHelper;

namespace Backend.Services
{
    public static class BookingMapping
    {
        public static BookingDto ToDto(Booking b, string? tz = null)
        {
            var startLocal = ToLocal(b.StartTime, tz);
            var endLocal = ToLocal(b.EndTime, tz);
            var zoneId = GetZone(tz).Id;

            return new BookingDto(
                b.Id,
                b.StationId,
                b.Nic,
                b.Status,
                b.IsQrActive,
                b.StartTime,
                b.EndTime,
                startLocal,
                endLocal,
                zoneId,
                b.QrIssuedAtUtc,
                b.QrExpiresAt,
                b.QrValidatedAtUtc,
                b.CreatedAt
            );
        }
    }
}
