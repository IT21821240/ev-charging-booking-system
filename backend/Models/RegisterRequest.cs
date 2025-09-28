namespace Backend.Models;
public class RegisterRequest
{
    public string Email { get; set; } = default!;
    public string Password { get; set; } = default!;
    public string Role { get; set; } = "EVOwner";
    public string? Nic { get; set; }  // provide when Role = EVOwner
}
