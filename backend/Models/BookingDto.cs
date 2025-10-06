using System;

namespace Backend.Models
{
    public record BookingDto(
        string Id,
        string StationId,
        string Nic,
        string Status,
        bool IsQrActive,
        DateTime StartTimeUtc,
        DateTime EndTimeUtc,
        DateTime StartTimeLocal,
        DateTime EndTimeLocal,
        string TimeZoneId,
        DateTime? QrIssuedAtUtc,
        DateTime? QrExpiresAt,
        DateTime? QrValidatedAtUtc,
        DateTime CreatedAt
    );
}