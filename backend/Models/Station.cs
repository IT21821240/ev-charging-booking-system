// -----------------------------------------------------------------------------
// File: Station.cs
// Purpose: Represents an EV charging station with its type, location,
//          capacity, and operational status.
// -----------------------------------------------------------------------------
using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class Station
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [Required, StringLength(120)] public string Name { get; set; } = "";
    [Required, RegularExpression("^(AC|DC)$")] public string Type { get; set; } = "AC";
    [Range(1, 1000)] public int TotalSlots { get; set; }

    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public bool IsActive { get; set; } = true;
}

