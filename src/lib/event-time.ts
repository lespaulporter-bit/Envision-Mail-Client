import { format } from "date-fns";

/** Default new-event length when Settings has no value. */
export const DEFAULT_EVENT_DURATION_MINUTES = 45;

/**
 * Default start in the user's local time.
 *
 * Round forward to a five-minute boundary, but never cross noon or midnight:
 * opening the form during AM defaults to AM, and opening it during PM defaults
 * to PM. The user can still switch periods in the form.
 */
export function defaultStartTimeHhmm(now = new Date()): string {
  const d = new Date(now);
  const originalHour = d.getHours();
  const periodEndHour = originalHour < 12 ? 11 : 23;
  const roundedMinutes = Math.ceil(d.getMinutes() / 5) * 5;

  d.setSeconds(0, 0);
  if (roundedMinutes >= 60) {
    if (originalHour < periodEndHour) {
      d.setHours(originalHour + 1, 0, 0, 0);
    } else {
      // Stay in the current AM/PM period instead of silently flipping it.
      d.setHours(periodEndHour, 55, 0, 0);
    }
  } else {
    d.setMinutes(roundedMinutes, 0, 0);
  }
  return format(d, "HH:mm");
}

export function timePeriod(hhmm: string): "AM" | "PM" {
  const hour = Number(String(hhmm || "0:00").split(":")[0]);
  return Number.isFinite(hour) && hour >= 12 ? "PM" : "AM";
}

/** Switch AM/PM without changing the displayed 12-hour clock time. */
export function setTimePeriod(hhmm: string, period: "AM" | "PM"): string {
  const [hourText, minuteText] = String(hhmm || "00:00").split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const normalizedHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 0;
  const normalizedMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  const hour12 = normalizedHour % 12;
  const nextHour = period === "PM" ? hour12 + 12 : hour12;
  return `${String(nextHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
}

export function addMinutesHhmm(hhmm: string, minutes: number): string {
  const [h, m] = String(hhmm || "00:00")
    .split(":")
    .map((n) => Number(n));
  const d = new Date(2000, 0, 1, Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  d.setMinutes(d.getMinutes() + minutes);
  return format(d, "HH:mm");
}

/** Minutes from start→end; negative/invalid → 0. */
export function minutesBetweenHhmm(start: string, end: string): number {
  const [sh, sm] = String(start || "0:0")
    .split(":")
    .map((n) => Number(n));
  const [eh, em] = String(end || "0:0")
    .split(":")
    .map((n) => Number(n));
  const a = (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
  const b = (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0);
  return b - a;
}

/**
 * When start changes: keep the previous duration if it was valid,
 * otherwise use the configured default (45 minutes).
 */
export function endAfterStartChange(
  prevStart: string,
  prevEnd: string,
  nextStart: string,
  defaultDurationMinutes: number,
): string {
  const dur = minutesBetweenHhmm(prevStart, prevEnd);
  const minutes =
    dur > 0 ? dur : Math.max(5, defaultDurationMinutes || DEFAULT_EVENT_DURATION_MINUTES);
  return addMinutesHhmm(nextStart, minutes);
}
