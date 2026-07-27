import { desktopApi } from "@/lib/desktop";
import { useMailStore } from "@/lib/store";
import type { Message, Thread } from "@/lib/types";
import {
  resolveUnsubscribeTargets,
  type UnsubscribeTargets,
} from "@/lib/unsubscribe";

export type UnsubscribeCandidate = {
  message: Message;
  targets: UnsubscribeTargets | null;
};

/** Prefer the newest inbound message that has an unsubscribe link; else newest inbound. */
export function findUnsubscribeCandidate(
  messages: Message[],
): UnsubscribeCandidate | null {
  let fallback: Message | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.isOutgoing) continue;
    if (!fallback) fallback = m;
    const targets = resolveUnsubscribeTargets(m);
    if (targets || m.unsubscribedAt) return { message: m, targets };
  }
  if (fallback) return { message: fallback, targets: null };
  return null;
}

export function findUnsubscribeForThread(
  thread: Thread,
  messagesById: Record<string, Message | undefined>,
): UnsubscribeCandidate | null {
  const msgs = (thread.messageIds || [])
    .map((id) => messagesById[id])
    .filter((m): m is Message => Boolean(m));
  return findUnsubscribeCandidate(msgs);
}

export type UnsubscribeResult =
  | { ok: true; email: string; name: string; already?: boolean }
  | { ok: false; error: string };

/**
 * Silently unsubscribe using List-Unsubscribe / body links (desktop IPC).
 * On success marks the message and returns sender info for follow-up prompts.
 */
export async function performSilentUnsubscribe(opts: {
  thread: Thread;
  candidate: UnsubscribeCandidate;
  accountId?: string | null;
}): Promise<UnsubscribeResult> {
  const { thread, candidate, accountId } = opts;
  const store = useMailStore.getState();
  const email = thread.contactEmail;
  const name = thread.contactName || email;

  if (candidate.message.unsubscribedAt) {
    return { ok: true, email, name, already: true };
  }

  const targets = candidate.targets;
  if (!targets) {
    return { ok: false, error: "No unsubscribe link on this email" };
  }

  const api = desktopApi();
  if (!api?.unsubscribeMail) {
    return { ok: false, error: "Unsubscribe needs the Envision Mail desktop app" };
  }

  try {
    const result = await api.unsubscribeMail({
      accountId:
        accountId ||
        store.inboxAccountId ||
        thread.accountId ||
        undefined,
      unsubscribeHttpUrl: targets.httpUrl,
      unsubscribeMailto: targets.mailto,
      unsubscribeOneClick: targets.oneClick,
    });
    if (!result.ok) {
      return { ok: false, error: result.error || "Unsubscribe failed" };
    }
    store.markMessageUnsubscribed(candidate.message.id);
    store.setToast("✓ Unsubscribed");
    return { ok: true, email, name };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unsubscribe failed",
    };
  }
}
