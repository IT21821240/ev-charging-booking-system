// -----------------------------------------------------------------------------
// File: BookingRules.cs
// Namespace: Backend.Services
// Purpose: Defines validation rules for EV charging bookings,
//          including time-based restrictions for creation, updates,
//          and cancellations.
// -----------------------------------------------------------------------------
namespace Backend.Services;

public class BookingRules
{
	public void EnsureCreateAllowed(DateTime startUtc, DateTime nowUtc)
	{
		if (startUtc <= nowUtc) throw new InvalidOperationException("Start must be in the future.");
		if (startUtc > nowUtc.AddDays(7)) throw new InvalidOperationException("Bookings allowed only within 7 days.");
	}

	public void EnsureUpdateOrCancelAllowed(DateTime startUtc, DateTime nowUtc)
	{
		if (startUtc - nowUtc < TimeSpan.FromHours(12))
			throw new InvalidOperationException("Update/Cancel requires ≥12 hours before start.");
	}
}
