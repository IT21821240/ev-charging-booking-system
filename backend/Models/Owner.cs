// -----------------------------------------------------------------------------
// File: Owner.cs
// Purpose: Represents an EV owner profile stored in MongoDB, including
//          personal details, contact info, and account activity status.
// -----------------------------------------------------------------------------
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models;

public class Owner
{
    [BsonId] // tells Mongo this is the primary key
    [BsonRepresentation(BsonType.ObjectId)] // maps ObjectId <-> string
    public string? Id { get; set; }

    [BsonElement("nic")] // explicitly map field name
    [Required, RegularExpression(@"^[0-9]{9}[VvXx]$|^[0-9]{12}$", ErrorMessage = "NIC format invalid")]
    public string Nic { get; set; } = default!;

    [BsonElement("name")]
    public string Name { get; set; } = "";

    [BsonElement("phone")]
    public string? Phone { get; set; }

    [BsonElement("email")]
    public string? Email { get; set; }

    [BsonElement("isActive")]
    public bool IsActive { get; set; } = true;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
