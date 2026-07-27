import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatThreadTime(iso: string) {
  const d = parseISO(iso);
  if (Number.isNaN(+d)) return "";
  const time = format(d, "h:mm a");
  if (isToday(d)) return `Today · ${time}`;
  if (isYesterday(d)) return `Yesterday · ${time}`;
  if (d.getFullYear() === new Date().getFullYear()) {
    return `${format(d, "MMM d")} · ${time}`;
  }
  return `${format(d, "MMM d, yyyy")} · ${time}`;
}

/** Full weekday + date + time for message detail headers. */
export function formatMailDateTime(iso: string) {
  const d = parseISO(iso);
  if (Number.isNaN(+d)) return "";
  return format(d, "EEE, MMM d, yyyy · h:mm a");
}

export function relativeTime(iso: string) {
  return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
}

/** Live remaining time until an event start — used by Calendar + Day Cover countdowns. */
export function formatCountdown(targetIso: string, nowMs = Date.now()) {
  const diff = +new Date(targetIso) - nowMs;
  if (Number.isNaN(diff)) return { label: "", urgent: false, past: true };
  if (diff <= 0) return { label: "Now", urgent: true, past: true };
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days >= 1) {
    return {
      label: `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`,
      urgent: days < 2,
      past: false,
    };
  }
  return {
    label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    urgent: hours < 6,
    past: false,
  };
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function previewText(html: string, max = 120) {
  const text = stripHtml(html);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
