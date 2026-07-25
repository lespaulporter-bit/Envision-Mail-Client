import type { Contact, Thread } from "@/lib/types";

/** Strict: thread belongs only to this IMAP account. */
export function threadBelongsToAccount(thread: Thread, accountId: string | null | undefined) {
  if (!accountId) return true;
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
