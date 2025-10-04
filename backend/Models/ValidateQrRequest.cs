// -----------------------------------------------------------------------------
// File: ValidateQrRequest.cs
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
