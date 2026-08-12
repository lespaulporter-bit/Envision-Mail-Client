import type { Thread } from "@/lib/types";

/** Case-insensitive match against subject, custom subject, contact name, and email. */
export function threadMatchesFilter(thread: Thread, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    thread.subject.toLowerCase().includes(q) ||
    (thread.customSubject || "").toLowerCase().includes(q) ||
    thread.contactName.toLowerCase().includes(q) ||
    thread.contactEmail.toLowerCase().includes(q)
  );
}
