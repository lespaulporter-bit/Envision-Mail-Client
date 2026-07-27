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
