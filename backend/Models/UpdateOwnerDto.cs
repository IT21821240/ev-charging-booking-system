// -----------------------------------------------------------------------------
// File: UpdateOwnerDto.cs
// Purpose: Data Transfer Object (DTO) used when updating an EV Owner’s profile
//          information via the OwnersController.
// -----------------------------------------------------------------------------
namespace Backend.Models;
public class UpdateOwnerDto
{
    public string Name { get; set; } = "";
    public string? Phone { get; set; }
    public string? Email { get; set; }
}
