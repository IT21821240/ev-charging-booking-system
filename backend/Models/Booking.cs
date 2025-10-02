namespace Backend.Models;

public class Booking
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Nic { get; set; } = default!;
    public string StationId { get; set; } = default!;
    public DateTime StartTime { get; set; }   // UTC
    public DateTime EndTime { get; set; }     // UTC

    // Pending | Approved | Cancelled | Completed
    public string Status { get; set; } = "Pending";

    // Set when approved
    public string? QrToken { get; set; }

    // 🔽🔽 add these
    public DateTime? QrIssuedAt { get; set; }
    public DateTime? QrExpiresAt { get; set; }
    public DateTime? QrUsedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
