// -----------------------------------------------------------------------------
// File: RegisterRequest.cs
// Namespace: Backend.Models;
// Purpose: Data Transfer Object (DTO) used for user registration requests,
//          containing email, password, role, and optional NIC for EV owners.
// -----------------------------------------------------------------------------
namespace Backend.Models;
public class RegisterRequest
{
    public string Email { get; set; } = default!;
    public string Password { get; set; } = default!;
    public string Role { get; set; } = "EVOwner";
    public string? Nic { get; set; }  // provide when Role = EVOwner
}
