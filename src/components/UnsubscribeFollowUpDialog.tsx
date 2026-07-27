"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

type Props = {
  senderEmail: string;
  senderName?: string;
  onTrash: () => void;
  onBlock: () => void;
  onBoth: () => void;
  onDismiss: () => void;
};

/** Shown after a successful silent unsubscribe. */
export function UnsubscribeFollowUpDialog({
  senderEmail,
  senderName,
  onTrash,
  onBlock,
  onBoth,
  onDismiss,
}: Props) {
  const label = senderName && senderName !== senderEmail ? `${senderName} (${senderEmail})` : senderEmail;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-ink/45 p-3 sm:items-center sm:p-6"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsub-followup-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            ✓ Unsubscribed
          </p>
          <h2 id="unsub-followup-title" className="mt-1 font-display text-xl tracking-tight text-ink">
            Clean up mail from this sender?
          </h2>
          <p className="mt-1 text-sm text-muted">
            You’re off their list. Want to trash existing mail from <span className="font-medium text-ink">{label}</span>
            , block future mail, or both?
          </p>
        </div>
        <div className="space-y-2 px-4 py-4">
          <Button type="button" className="w-full justify-start" variant="soft" onClick={onTrash}>
            Trash all mail from this sender
          </Button>
          <Button type="button" className="w-full justify-start" variant="soft" onClick={onBlock}>
            Block all mail from this sender
          </Button>
          <Button type="button" className="w-full justify-start" onClick={onBoth}>
            Trash and block
          </Button>
          <Button type="button" className="w-full" variant="ghost" onClick={onDismiss}>
            Keep their mail · Done
          </Button>
        </div>
      </div>
    </div>
  );
}
