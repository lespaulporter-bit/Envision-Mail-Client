"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { UnsubscribeFollowUpDialog } from "@/components/UnsubscribeFollowUpDialog";
import {
  blockAllFromSenderSmart,
  trashAllFromSenderSmart,
} from "@/lib/mail-delete";
import {
  findUnsubscribeCandidate,
  findUnsubscribeForThread,
  performSilentUnsubscribe,
} from "@/lib/unsubscribe-action";
import { resolveUnsubscribeTargets } from "@/lib/unsubscribe";
import { useMailStore } from "@/lib/store";
import type { Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  thread: Thread;
  /** Prefer a specific inbound message (e.g. Screener card “last”). */
  messageId?: string;
  size?: "sm" | "md";
  className?: string;
  /** When false, hide if no inbound message exists. Default true when inbound exists. */
  alwaysShow?: boolean;
};

/**
 * Shared Unsubscribe control for Thread, New Senders, Spam, and list rows.
 * On success: ✓ toast + optional trash/block/both follow-up.
 */
export function UnsubscribeButton({
  thread,
  messageId,
  size = "sm",
  className,
  alwaysShow = true,
}: Props) {
  const messages = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const setToast = useMailStore((s) => s.setToast);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [followUp, setFollowUp] = useState<{ email: string; name: string } | null>(null);

  const candidate = useMemo(() => {
    if (messageId) {
      const m = messages[messageId];
      if (m && !m.isOutgoing) {
        const targets = resolveUnsubscribeTargets(m);
        if (targets || m.unsubscribedAt || alwaysShow) {
          return { message: m, targets: targets || null };
        }
      }
    }
    return findUnsubscribeForThread(thread, messages);
  }, [thread, messages, messageId, alwaysShow]);

  if (!candidate) return null;

  const done = Boolean(candidate.message.unsubscribedAt) || flash;
  const hasLink = Boolean(candidate.targets);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={done ? "primary" : "soft"}
        className={cn(
          done && "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/30",
          className,
        )}
        disabled={busy || done}
        title={
          hasLink
            ? "Silently unsubscribe using the list’s unsubscribe link"
            : "No unsubscribe link found on this email yet"
        }
        onClick={(e) => {
          e.stopPropagation();
          void (async () => {
            setBusy(true);
            try {
              const result = await performSilentUnsubscribe({
                thread,
                candidate,
                accountId: inboxAccountId || thread.accountId,
              });
              if (!result.ok) {
                setToast(result.error);
                return;
              }
              if (result.already) {
                setToast("Already unsubscribed");
                return;
              }
              setFlash(true);
              setFollowUp({ email: result.email, name: result.name });
              window.setTimeout(() => setFlash(false), 3200);
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {done ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Unsubscribed
          </span>
        ) : busy ? (
          "Unsubscribing…"
        ) : (
          "Unsubscribe"
        )}
      </Button>

      {followUp ? (
        <UnsubscribeFollowUpDialog
          senderEmail={followUp.email}
          senderName={followUp.name}
          onDismiss={() => setFollowUp(null)}
          onTrash={() => {
            const email = followUp.email;
            setFollowUp(null);
            void trashAllFromSenderSmart(email);
          }}
          onBlock={() => {
            const email = followUp.email;
            setFollowUp(null);
            void blockAllFromSenderSmart(email);
          }}
          onBoth={() => {
            const email = followUp.email;
            setFollowUp(null);
            void (async () => {
              await trashAllFromSenderSmart(email);
              await blockAllFromSenderSmart(email);
              useMailStore.getState().setToast(`✓ Unsubscribed · trashed & blocked ${email}`);
            })();
          }}
        />
      ) : null}
    </>
  );
}

/** Resolve candidate for a thread’s message list (ThreadView convenience). */
export function useThreadUnsubscribeCandidate(threadId: string | null) {
  const getThreadMessages = useMailStore((s) => s.getThreadMessages);
  const messages = useMailStore((s) => s.messages);
  const threads = useMailStore((s) => s.threads);
  return useMemo(() => {
    if (!threadId) return null;
    const list = getThreadMessages(threadId);
    return findUnsubscribeCandidate(list);
    // threads/messages invalidate when store updates message flags
  }, [threadId, getThreadMessages, threads, messages]);
}
