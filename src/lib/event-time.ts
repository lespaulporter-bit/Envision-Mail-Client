import { format } from "date-fns";

/** Default new-event length when Settings has no value. */
export const DEFAULT_EVENT_DURATION_MINUTES = 45;

/** HH:mm (24h storage for <input type="time"> — OS shows AM/PM in the locale). */
export function defaultStartTimeHhmm(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return format(d, "HH:mm");
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
