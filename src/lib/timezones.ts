/** Common IANA zones for calendar dual-clock picks. */
export const CALENDAR_TIMEZONE_OPTIONS: Array<{ id: string; label: string; short: string }> = [
  { id: "America/New_York", label: "Eastern Time", short: "ET" },
  { id: "America/Chicago", label: "Central Time", short: "CT" },
  { id: "America/Denver", label: "Mountain Time", short: "MT" },
  { id: "America/Los_Angeles", label: "Pacific Time", short: "PT" },
  { id: "America/Phoenix", label: "Arizona", short: "MST" },
  { id: "America/Anchorage", label: "Alaska", short: "AKT" },
  { id: "Pacific/Honolulu", label: "Hawaii", short: "HT" },
  { id: "UTC", label: "UTC", short: "UTC" },
  { id: "Europe/London", label: "London", short: "London" },
  { id: "Europe/Paris", label: "Paris / CET", short: "CET" },
  { id: "Asia/Tokyo", label: "Tokyo", short: "JST" },
  { id: "Asia/Shanghai", label: "China", short: "CST" },
  { id: "Australia/Sydney", label: "Sydney", short: "AEST" },
];

export function localTimezoneId(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export function timezoneShortLabel(timeZone: string): string {
  const known = CALENDAR_TIMEZONE_OPTIONS.find((z) => z.id === timeZone);
  if (known) return known.short;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
      hour: "numeric",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || timeZone.split("/").pop() || timeZone;
  } catch {
    return timeZone.split("/").pop() || timeZone;
  }
}

export function timezoneDisplayName(timeZone: string): string {
  const known = CALENDAR_TIMEZONE_OPTIONS.find((z) => z.id === timeZone);
  if (known) return known.label;
  return timeZone.replace(/_/g, " ").split("/").pop() || timeZone;
}

/** Live clock: "3:10 PM" in the given zone. */
export function formatClockInZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

/** Format a wall-clock date+HH:mm in `sourceZone` as time in `targetZone`. */
export function formatLocalHhmmInZone(
  dateYmd: string,
  hhmm: string,
  sourceZone: string,
  targetZone: string,
): string {
  if (!dateYmd || !hhmm) return "";
  try {
    const instant = wallTimeToUtc(dateYmd, hhmm, sourceZone);
    if (!instant) return "";
    return new Intl.DateTimeFormat(undefined, {
      timeZone: targetZone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(instant);
  } catch {
    return "";
  }
}

/** Convert a wall-clock date/time in `timeZone` to a real Date (UTC instant). */
export function wallTimeToUtc(dateYmd: string, hhmm: string, timeZone: string): Date | null {
  try {
    const [y, mo, d] = dateYmd.split("-").map((n) => Number(n));
    const [h, mi] = hhmm.split(":").map((n) => Number(n));
    // Guess UTC, then correct using the zone offset at that instant
    let utc = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0);
    for (let i = 0; i < 3; i += 1) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(utc));
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
      const gotY = get("year");
      const gotM = get("month");
      const gotD = get("day");
      const gotH = get("hour");
      const gotMin = get("minute");
      const want = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
      const got = Date.UTC(gotY, gotM - 1, gotD, gotH, gotMin);
      const delta = want - got;
      if (delta === 0) break;
      utc += delta;
    }
    return new Date(utc);
  } catch {
    return null;
  }
}
