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
    public bool IsQrActive { get; set; } = false;

    // QR tracking
    public string QrJti { get; set; }               // single-use id
    public string QrToken { get; set; }             // the JWT string
    public DateTime? QrIssuedAtUtc { get; set; }
    public DateTime? QrExpiresAt { get; set; }         // End + 30m
    public DateTime? QrValidatedAtUtc { get; set; }    // set on first successful scan

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
