// -----------------------------------------------------------------------------
// File: LoginRequest.cs
// Purpose: Data Transfer Object (DTO) for handling user login requests.
// -----------------------------------------------------------------------------
namespace Backend.Models;
public class LoginRequest
{
    public string Email { get; set; } = default!;
    public string Password { get; set; } = default!;
}
