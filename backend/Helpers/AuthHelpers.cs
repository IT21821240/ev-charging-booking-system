// -----------------------------------------------------------------------------
// File: AuthHelpers.cs
// Namespace: Backend.Helpers;
// Purpose: Provides helper methods for authentication and authorization tasks.
//           Includes methods to retrieve the currently logged-in user from
//           the authentication principal and to verify if a station operator
//           is assigned to a specific station.
// -----------------------------------------------------------------------------
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
