// -----------------------------------------------------------------------------
// File: BookingDto.cs
// Namespace: Backend.Models;
// Purpose: Defines a data transfer object (DTO) for representing booking details.
//          Used to transfer booking-related data between the backend and clients,
//          including station information, user identification (NIC), booking
//          status, time details (both UTC and local), and QR code metadata.
// -----------------------------------------------------------------------------
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