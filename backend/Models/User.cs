namespace Backend.Models;

public class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Email { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;
    // "Backoffice" | "StationOperator" | "EVOwner"
    public string Role { get; set; } = "EVOwner";

    // Optional: link owner NIC if role = EVOwner (so you can enforce ownership)
    public string? Nic { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; }
}
