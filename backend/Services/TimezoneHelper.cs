using System;

namespace Backend.Services
{
    public static class TimezoneHelper
    {
        private const string DefaultTz = "Asia/Colombo";

        public static TimeZoneInfo GetZone(string? tzId = null)
        {
            if (string.IsNullOrWhiteSpace(tzId)) tzId = DefaultTz;
            return TimeZoneInfo.FindSystemTimeZoneById(tzId);
        }

        public static DateTime ToLocal(DateTime utc, string? tzId = null)
        {
            var zone = GetZone(tzId);
            if (utc.Kind != DateTimeKind.Utc)
                utc = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
            return TimeZoneInfo.ConvertTimeFromUtc(utc, zone);
        }

        public static DateTime ToUtcFromLocal(DateTime local, string? tzId = null)
        {
            var zone = GetZone(tzId);
            if (local.Kind != DateTimeKind.Unspecified)
                local = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
            var dto = new DateTimeOffset(local, zone.GetUtcOffset(local));
            return dto.UtcDateTime;
        }
    }
}
