using System.Security.Claims;

namespace Backend.Services
{
    public interface ITokenService
    {
        string IssueToken(IEnumerable<Claim> claims);
    }
}
