// -----------------------------------------------------------------------------
// File: UpdateBookingDto.cs
// Purpose: Data Transfer Object (DTO) used to update booking time slots
//          (start and end times) in the BookingsController.
// -----------------------------------------------------------------------------
using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class UpdateBookingDto
{
    [Required] public DateTime StartTime { get; set; } // UTC
    [Required] public DateTime EndTime { get; set; }   // UTC

    // New optional local inputs (preferred in Sri Lanka)
    public DateTime? StartTimeLocal { get; set; } // unspecified local wall time
    public DateTime? EndTimeLocal { get; set; }
    public string? TimeZoneId { get; set; } // default "Asia/Colombo"
}

