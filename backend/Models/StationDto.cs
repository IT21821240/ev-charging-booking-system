// -----------------------------------------------------------------------------
// File: StationDto.cs
// Purpose: Lightweight DTO for returning station data with image URL included.
// -----------------------------------------------------------------------------
namespace Backend.Models;

public record StationDto(
    string Id,
    string Name,
    string Type,
    int TotalSlots,
    double? Lat,
    double? Lng,
    bool IsActive,
    string? ImageUrl
);
