// -----------------------------------------------------------------------------
// File: StationSchedule.cs
// Namespace: Backend.Models;
// Purpose: Represents the per-day operating schedule and maximum concurrent
//          capacity for a charging station.
// -----------------------------------------------------------------------------
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Backend.Models;

public class StationSchedule
{
    // Store Mongo _id as ObjectId, but expose as string in C#
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    // Stored as ObjectId in Mongo; handled as string here
    public string StationId { get; set; } = default!;

    // Date-only (midnight, Kind=Unspecified)
    public DateTime Date { get; set; }

    // Minutes after midnight (avoid TimeOnly serialization issues)
    public int OpenMinutes { get; set; }     // e.g., 360 for 06:00
    public int CloseMinutes { get; set; }    // e.g., 1320 for 22:00

    // <= Station.TotalSlots
    public int MaxConcurrent { get; set; }
}
