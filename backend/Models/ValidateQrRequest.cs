// -----------------------------------------------------------------------------
// File: ValidateQrRequest.cs
// Namespace: Backend.Models;
// Purpose: Data Transfer Object (DTO) used for validating QR codes during
//          EV charging session authentication.
// -----------------------------------------------------------------------------
namespace Backend.Models
{
	public class ValidateQrRequest
	{
		public string Token { get; set; } = string.Empty;
	}
}
