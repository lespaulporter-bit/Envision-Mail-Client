import type { Message, Thread } from "@/lib/types";

/** Built-in action tags kept in sync with thread flags */
export const ACTION_TAG_LABELS: Record<string, string> = {
  snoozed: "Snoozed",
  "on-hold": "On Hold",
  muted: "Muted",
  notify: "Notify",
  bundled: "Bundled",
  bumped: "Bumped",
};

const ACTION_TAG_KEYS = new Set(Object.keys(ACTION_TAG_LABELS));

/** Recompute searchable tags from current thread flags (preserves custom tags). */
export function syncThreadTags(thread: Thread): string[] {
  const custom = (thread.tags || []).filter((t) => !ACTION_TAG_KEYS.has(t));
  const next = new Set(custom);
  if (thread.replyLater) next.add("snoozed");
  if (thread.setAside) next.add("on-hold");
  if (thread.muted) next.add("muted");
  if (thread.notify) next.add("notify");
  if (thread.bundled) next.add("bundled");
  if (thread.bubbleUpAt) next.add("bumped");
  return Array.from(next);
}

/** True when the thread still has at least one message body in the store */
export function threadHasContent(
  thread: Thread,
  messages: Record<string, Message | undefined>,
): boolean {
  const ids = thread.messageIds || [];
  if (!ids.length) return false;
  return ids.some((id) => Boolean(messages[id]));
}

export function tagLabel(tag: string): string {
  return ACTION_TAG_LABELS[tag] || tag;
}
