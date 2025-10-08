// AuthHelpers.cs
using System.Security.Claims;
using MongoDB.Driver;
using Backend.Models;

namespace Backend.Helpers;

public static class AuthHelpers
{
    public static async Task<User?> GetCurrentUserAsync(ClaimsPrincipal principal, IMongoDatabase db)
    {
        var email = principal.Identity?.Name;
        if (string.IsNullOrWhiteSpace(email)) return null;

        var users = db.GetCollection<User>("users");
        return await users.Find(u => u.Email == email).FirstOrDefaultAsync();
    }

    public static bool OperatorHasStation(User me, string stationId)
        => me.AssignedStationIds?.Contains(stationId) == true;
}
