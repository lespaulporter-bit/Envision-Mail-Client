import type { Contact, Thread } from "@/lib/types";

/**
 * Account isolation with legacy tolerance:
 * - Matching accountId always included
 * - Threads with no accountId (pre-isolation / migrated Les Mail) stay visible
 *   so users never lose previously read mail after upgrade
 */
export function threadBelongsToAccount(thread: Thread, accountId: string | null | undefined) {
  if (!accountId) return true;
  if (!thread.accountId) return true;
  return thread.accountId === accountId;
}

export function filterThreadsByAccount(threads: Thread[], accountId: string | null | undefined) {
  if (!accountId) return threads;
  return threads.filter((t) => threadBelongsToAccount(t, accountId));
}

/** Contacts visible for an account = people who appear on that account’s threads. */
export function filterContactsByAccount(
  contacts: Contact[],
  threads: Thread[],
  accountId: string | null | undefined,
) {
  if (!accountId) return contacts;
  const emails = new Set(
    threads
      .filter((t) => threadBelongsToAccount(t, accountId))
      .map((t) => t.contactEmail.toLowerCase()),
  );
  return contacts.filter((c) => emails.has(c.email.toLowerCase()));
}
