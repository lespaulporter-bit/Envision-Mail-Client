"use client";

import { useHeyStore } from "@/lib/store";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

function ShareContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const threads = useHeyStore((s) => s.threads);
  const messages = useHeyStore((s) => s.messages);

  const thread = useMemo(
    () => threads.find((t) => t.shareToken === token),
    [threads, token],
  );

  if (!token || !thread) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-3xl">Shared thread not found</h1>
          <p className="mt-2 text-muted">Open the app, share a thread, then visit the generated link.</p>
          <a href="/app/" className="mt-4 inline-block text-blurple underline">
            Go to app
          </a>
        </div>
      </div>
    );
  }

  const msgs = thread.messageIds.map((id) => messages[id]).filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Shared via HEY</p>
      <h1 className="mt-2 font-display text-4xl">{thread.customSubject || thread.subject}</h1>
      <p className="mt-2 text-muted">
        {thread.contactName} · live thread page
      </p>
      <div className="mt-8 space-y-4">
        {msgs.map((m) => (
          <article key={m.id} className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-2 text-sm font-semibold">{m.fromName}</div>
            <div className="prose-mail" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
          </article>
        ))}
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-muted">Loading…</div>}>
      <ShareContent />
    </Suspense>
  );
}
