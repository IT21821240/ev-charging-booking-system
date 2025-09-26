using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class UpdateBookingDto
{
    [Required] public DateTime StartTime { get; set; } // UTC
    [Required] public DateTime EndTime { get; set; }   // UTC
}

