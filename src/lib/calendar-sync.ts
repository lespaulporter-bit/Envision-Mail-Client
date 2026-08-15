import { belongsToActiveAccount } from "./account-scope";
import { isExternalCalendarSource } from "./types";
import type { CalendarEvent, SubCalendar } from "./types";

export type ExternalCalendarSource = "mac" | "windows" | "ics";

export const ALL_EXTERNAL_CALENDAR_SOURCES: ExternalCalendarSource[] = ["mac", "windows", "ics"];
export const COMPUTER_CALENDAR_SOURCES: ExternalCalendarSource[] = ["mac", "windows"];

export function isComputerCalendarSource(source?: string | null): source is "mac" | "windows" {
  return source === "mac" || source === "windows";
}

/** Events from Mac / Outlook / .ics that the user asked to hide in bulk. */
export function calendarEventIsVisible(
  event: Pick<CalendarEvent, "calendarId" | "source">,
  calendars: Array<Pick<SubCalendar, "id" | "visible" | "source">>,
  hideOtherCalendarEvents?: boolean,
): boolean {
  if (hideOtherCalendarEvents && isExternalCalendarSource(event.source)) return false;
  const cal = calendars.find((c) => c.id === event.calendarId);
  if (!cal) return !isExternalCalendarSource(event.source);
  return cal.visible !== false;
}

export function unsyncExternalRows<T extends { source?: string | null; accountId?: string | null }>(
  items: T[],
  accountId: string | null | undefined,
  sources: Iterable<string>,
): T[] {
  const drop = new Set(Array.from(sources).filter(Boolean));
  if (!drop.size) return items;
  return items.filter(
    (item) => !(drop.has(String(item.source || "")) && belongsToActiveAccount(item, accountId)),
  );
}

export function applyHideOtherCalendars<
  T extends { source?: string | null; accountId?: string | null; visible: boolean },
>(calendars: T[], accountId: string | null | undefined, hide: boolean): T[] {
  let changed = false;
  const next = calendars.map((c) => {
    if (!isExternalCalendarSource(c.source)) return c;
    if (!belongsToActiveAccount(c, accountId)) return c;
    const visible = !hide;
    if (c.visible === visible) return c;
    changed = true;
    return { ...c, visible };
  });
  return changed ? next : calendars;
}

/** Drop SubCalendar chips whose OS calendar disappeared on the last sync. */
export function pruneStaleExternalCalendars<
  T extends { source?: string | null; accountId?: string | null; externalId?: string | null },
>(
  calendars: T[],
  source: string,
  accountId: string | null | undefined,
  incomingExternalIds: Iterable<string>,
): T[] {
  const keep = new Set(Array.from(incomingExternalIds).map(String));
  return calendars.filter((c) => {
    if (c.source !== source || !belongsToActiveAccount(c, accountId)) return true;
    return keep.has(String(c.externalId || ""));
  });
}

export function externalSourcesPresent(
  items: Array<{ source?: string | null; accountId?: string | null }>,
  accountId: string | null | undefined,
): ExternalCalendarSource[] {
  const found = new Set<ExternalCalendarSource>();
  for (const item of items) {
    if (!isExternalCalendarSource(item.source)) continue;
    if (!belongsToActiveAccount(item, accountId)) continue;
    found.add(item.source);
  }
  return ALL_EXTERNAL_CALENDAR_SOURCES.filter((s) => found.has(s));
}
