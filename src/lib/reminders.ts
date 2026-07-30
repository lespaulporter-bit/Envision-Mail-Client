import { resolveMeetingLink } from "@/lib/meeting-links";
import type { CalendarEvent, Reminder, Thread } from "@/lib/types";
import { uid } from "@/lib/utils";

const GRACE_AFTER_START_MS = 2 * 60 * 60 * 1000; // still remind up to 2h after start

export function reminderOccurrenceKey(
  source: Reminder["source"],
  sourceId: string,
  extra: string,
): string {
  return `${source}:${sourceId}:${extra}`;
}

export function buildMailReminder(
  thread: Thread,
  dueAt: Date,
  label?: string,
): Omit<Reminder, "id" | "createdAt" | "status"> {
  const mins = Math.max(1, Math.round((+dueAt - Date.now()) / 60000));
  return {
    title: thread.customSubject || thread.subject || "Email reminder",
    subtitle: label || `${thread.contactName} · remind in ${mins}m`,
    dueAt: dueAt.toISOString(),
    source: "mail",
    sourceId: thread.id,
    occurrenceKey: reminderOccurrenceKey("mail", thread.id, dueAt.toISOString()),
  };
}

export function buildCalendarOccurrence(
  event: CalendarEvent,
  minutesBefore: number,
): { fireAt: number; key: string; reminder: Omit<Reminder, "id" | "createdAt" | "status"> } | null {
  const start = +new Date(event.start);
  if (!Number.isFinite(start)) return null;
  const fireAt = start - minutesBefore * 60_000;
  const key = reminderOccurrenceKey("calendar", event.id, `${minutesBefore}:${event.start}`);
  const when =
    minutesBefore <= 0
      ? "Starting now"
      : minutesBefore < 60
        ? `In ${minutesBefore} minutes`
        : minutesBefore === 60
          ? "In 1 hour"
          : `In ${Math.round(minutesBefore / 60)} hours`;
  return {
    fireAt,
    key,
    reminder: {
      title: event.title || "Calendar event",
      subtitle: when,
      dueAt: new Date(fireAt).toISOString(),
      source: "calendar",
      sourceId: event.id,
      occurrenceKey: key,
      location: event.location,
      meetingUrl: resolveMeetingLink(event)?.url,
    },
  };
}

/** Create / activate reminders that are due; never re-fire dismissed occurrenceKeys. */
export function collectDueReminders(opts: {
  now?: number;
  events: CalendarEvent[];
  threads: Thread[];
  existing: Reminder[];
}): Reminder[] {
  const now = opts.now ?? Date.now();
  const existing = opts.existing;
  const known = new Set(existing.map((r) => r.occurrenceKey));
  const next: Reminder[] = [];

  for (const event of opts.events) {
    // Explicit empty array = reminders disabled for this event
    if (Array.isArray(event.reminderMinutes) && event.reminderMinutes.length === 0) continue;
    const minutesList =
      event.reminderMinutes && event.reminderMinutes.length
        ? event.reminderMinutes
        : [15];
    const start = +new Date(event.start);
    const end = +new Date(event.end || event.start);
    if (!Number.isFinite(start)) continue;
    // Skip events long finished
    if (Number.isFinite(end) && end < now - GRACE_AFTER_START_MS) continue;

    for (const minutes of minutesList) {
      const built = buildCalendarOccurrence(event, Number(minutes) || 0);
      if (!built) continue;
      if (known.has(built.key)) continue;
      if (now < built.fireAt) continue;
      // Don't fire reminders for events that ended long ago relative to fire time
      if (now > built.fireAt + GRACE_AFTER_START_MS && now > start + GRACE_AFTER_START_MS) continue;
      known.add(built.key);
      next.push({
        ...built.reminder,
        id: uid("rem"),
        status: "active",
        createdAt: new Date().toISOString(),
        dueAt: new Date(Math.min(built.fireAt, now)).toISOString(),
      });
    }
  }

  // Mail bump-due → one-shot reminder
  for (const thread of opts.threads) {
    if (!thread.bubbleUpAt) continue;
    const due = +new Date(thread.bubbleUpAt);
    if (!Number.isFinite(due) || due > now) continue;
    const key = reminderOccurrenceKey("mail", thread.id, `bump:${thread.bubbleUpAt}`);
    if (known.has(key)) continue;
    known.add(key);
    next.push({
      id: uid("rem"),
      title: thread.customSubject || thread.subject || "Email bumped",
      subtitle: `${thread.contactName} · bumped to the top`,
      dueAt: thread.bubbleUpAt,
      source: "mail",
      sourceId: thread.id,
      occurrenceKey: key,
      status: "active",
      createdAt: new Date().toISOString(),
    });
  }

  return next;
}

export function activatePendingReminders(existing: Reminder[], now = Date.now()): Reminder[] {
  let changed = false;
  const next = existing.map((r) => {
    if (r.status === "pending" && +new Date(r.dueAt) <= now) {
      changed = true;
      return { ...r, status: "active" as const };
    }
    return r;
  });
  return changed ? next : existing;
}

export function mergeNewReminders(existing: Reminder[], incoming: Reminder[]): Reminder[] {
  if (!incoming.length) return existing;
  const keys = new Set(existing.map((r) => r.occurrenceKey));
  const add = incoming.filter((r) => !keys.has(r.occurrenceKey));
  if (!add.length) return existing;
  return [...existing, ...add];
}
