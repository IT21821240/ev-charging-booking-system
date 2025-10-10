// -----------------------------------------------------------------------------
// File: ITokenService.cs
// Namespace: Backend.Services
// Purpose: Defines the interface for issuing JSON Web Tokens (JWT) used for
//          user authentication and authorization in the backend API.
// -----------------------------------------------------------------------------
using System.Security.Claims;

namespace Backend.Services
{
    public interface ITokenService
    {
        string IssueToken(IEnumerable<Claim> claims);
    }
}
