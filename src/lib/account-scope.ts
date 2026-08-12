import type { Clip, Contact, Message, Thread } from "@/lib/types";

/** Extract account id from imap_<accountId>[_sent|_spam|_trash]_<uid> message ids. */
export function accountIdFromMessageId(messageId: string): string | null {
  const mid = String(messageId || "");
  const special = /^imap_(.+?)_(sent|spam|trash)_(\d+)$/.exec(mid);
  if (special) return special[1];
  const inbox = /^imap_(.+)_(\d+)$/.exec(mid);
  if (inbox) return inbox[1];
  return null;
}

export function inferThreadAccountId(thread: Thread, messages?: Record<string, Message | undefined>) {
  if (thread.accountId) return thread.accountId;
  for (const mid of thread.messageIds || []) {
    const fromId = accountIdFromMessageId(mid);
    if (fromId) return fromId;
    const msg = messages?.[mid];
    if (msg?.id) {
      const fromMsg = accountIdFromMessageId(msg.id);
      if (fromMsg) return fromMsg;
    }
  }
  return null;
}

/**
 * Strict account isolation:
 * - Matching accountId included
 * - Infer from imap_ message ids when accountId missing
 * - Never show another account’s mail (or unscoped demo threads) in an active workspace
 */
export function threadBelongsToAccount(
  thread: Thread,
  accountId: string | null | undefined,
  messages?: Record<string, Message | undefined>,
) {
  if (!accountId) return true;
  const owner = inferThreadAccountId(thread, messages);
  if (!owner) return false;
  return owner === accountId;
}

export function filterThreadsByAccount(
  threads: Thread[],
  accountId: string | null | undefined,
  messages?: Record<string, Message | undefined>,
) {
  if (!accountId) return threads;
  return threads.filter((t) => threadBelongsToAccount(t, accountId, messages));
}

/** Contacts visible for an account = people who appear on that account’s threads. */
export function filterContactsByAccount(
  contacts: Contact[],
  threads: Thread[],
  accountId: string | null | undefined,
  messages?: Record<string, Message | undefined>,
) {
  if (!accountId) return contacts;
  const emails = new Set(
    threads
      .filter((t) => threadBelongsToAccount(t, accountId, messages))
      .map((t) => t.contactEmail.toLowerCase()),
  );
  return contacts.filter((c) => emails.has(c.email.toLowerCase()));
}

export function clipBelongsToAccount(
  clip: Clip,
  accountId: string | null | undefined,
  threads: Thread[],
  messages?: Record<string, Message | undefined>,
) {
  if (!accountId) return true;
  if (clip.accountId) return clip.accountId === accountId;
  const thread = threads.find((t) => t.id === clip.sourceThreadId);
  if (!thread) return false;
  return threadBelongsToAccount(thread, accountId, messages);
}

/** Strict tenancy for stamped workspace data (calendar, habits, boards, …). */
export function belongsToActiveAccount(
  item: { accountId?: string | null } | null | undefined,
  accountId: string | null | undefined,
) {
  if (!accountId) return true;
  if (!item) return false;
  return item.accountId === accountId;
}

export function filterByActiveAccount<T extends { accountId?: string | null }>(
  items: T[] | null | undefined,
  accountId: string | null | undefined,
): T[] {
  const list = items || [];
  if (!accountId) return list;
  return list.filter((item) => item.accountId === accountId);
}

/** Assign legacy unscoped rows to an account once (upgrade path — stops cross-account leaks). */
export function stampMissingAccountId<T extends { accountId?: string | null }>(
  items: T[] | null | undefined,
  accountId: string | null | undefined,
): T[] {
  const list = items || [];
  if (!accountId) return list;
  return list.map((item) => (item.accountId ? item : { ...item, accountId }));
}
