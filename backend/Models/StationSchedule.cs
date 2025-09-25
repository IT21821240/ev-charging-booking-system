// -----------------------------------------------------------------------------
// File: StationSchedule.cs
// Purpose: Per-day opening hours and concurrent capacity for a station
// -----------------------------------------------------------------------------
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Backend.Models;

public class StationSchedule
{
    [BsonId]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    // Stored as ObjectId in Mongo; handled as string here
    [BsonRepresentation(BsonType.ObjectId)]
    public string StationId { get; set; } = default!;

    // Date-only (midnight, Kind=Unspecified)
    public DateTime Date { get; set; }

    // Minutes after midnight (avoid TimeOnly serialization issues)
    public int OpenMinutes { get; set; }     // e.g., 360 for 06:00
    public int CloseMinutes { get; set; }    // e.g., 1320 for 22:00

    // <= Station.TotalSlots
    public int MaxConcurrent { get; set; }
}
