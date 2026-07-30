import type { CalendarEvent } from "@/lib/types";
import { isFakeMeetingUrl, sanitizeMeetingUrl } from "@/lib/utils";

export type MeetingProvider = NonNullable<CalendarEvent["meetingProvider"]>;

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?"'”’)\]}>]+$/;

export function extractUrls(text?: string | null): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of String(text).matchAll(URL_PATTERN)) {
    const cleaned = match[0].replace(TRAILING_PUNCTUATION, "");
    if (cleaned) found.push(cleaned);
  }
  return found;
}

export function detectMeetingProvider(url?: string | null): MeetingProvider {
  const value = String(url || "").toLowerCase();
  if (!value) return "none";
  if (/teams\.microsoft\.|teams\.live\.|^msteams:/.test(value)) return "teams";
  if (/zoom\.us|zoomgov\.com/.test(value)) return "zoom";
  if (/meet\.google\./.test(value)) return "meet";
  return "none";
}

export function meetingLinkLabel(provider: MeetingProvider): string {
  if (provider === "teams") return "Join Teams meeting";
  if (provider === "zoom") return "Join Zoom meeting";
  if (provider === "meet") return "Join Google Meet";
  return "Join meeting";
}

/** Mac Calendar and pasted invites often leave the join URL in notes or location. */
export function findMeetingUrl(text?: string | null): string {
  for (const url of extractUrls(text)) {
    if (isFakeMeetingUrl(url)) continue;
    if (detectMeetingProvider(url) !== "none") return url;
  }
  return "";
}

export interface ResolvedMeetingLink {
  url: string;
  provider: MeetingProvider;
  label: string;
  /** True when the URL came from notes/location instead of the meeting field. */
  derived: boolean;
}

type MeetingFields = Pick<CalendarEvent, "meetingUrl" | "meetingProvider" | "location" | "notes">;

export function resolveMeetingLink(event: Partial<MeetingFields> | null | undefined): ResolvedMeetingLink | null {
  if (!event) return null;
  const saved = sanitizeMeetingUrl(event.meetingUrl || "");
  if (saved) {
    const detected = detectMeetingProvider(saved);
    const provider =
      detected !== "none" ? detected : event.meetingProvider && event.meetingProvider !== "none" ? event.meetingProvider : "none";
    return { url: saved, provider, label: meetingLinkLabel(provider), derived: false };
  }
  const fromText = findMeetingUrl(event.location) || findMeetingUrl(event.notes);
  if (!fromText) return null;
  const provider = detectMeetingProvider(fromText);
  return { url: fromText, provider, label: meetingLinkLabel(provider), derived: true };
}

/**
 * Promote a join URL hidden in notes/location onto the event itself, so invites,
 * reminders, and the .ics all carry the same link the calendar shows.
 */
export function withMeetingLink<T extends Partial<MeetingFields>>(event: T): T {
  const resolved = resolveMeetingLink(event);
  if (!resolved) {
    return event.meetingUrl ? { ...event, meetingUrl: undefined, meetingProvider: "none" } : event;
  }
  if (!resolved.derived && event.meetingProvider === resolved.provider) return event;
  return { ...event, meetingUrl: resolved.url, meetingProvider: resolved.provider };
}
