"use client";

import { CoverArt } from "@/components/CoverArt";
import { ThreadRow } from "@/components/ThreadRow";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { Badge, Button, EmptyState, SectionHeader } from "@/components/ui";
import { selectBoxThreads, useHeyStore } from "@/lib/store";
import type { Message, Thread } from "@/lib/types";
import { previewText } from "@/lib/utils";
import { useMemo, useState } from "react";

export function LesBoxView() {
  const threads = useHeyStore((s) => s.threads);
  const settings = useHeyStore((s) => s.settings);
  const powerThrough = useHeyStore((s) => s.powerThrough);
  const multiOpenIds = useHeyStore((s) => s.multiOpenIds);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const togglePowerThrough = useHeyStore((s) => s.togglePowerThrough);
  const markAllSeenInBox = useHeyStore((s) => s.markAllSeenInBox);
  const setCoverArt = useHeyStore((s) => s.setCoverArt);
  const clearMultiOpen = useHeyStore((s) => s.clearMultiOpen);
  const openThread = useHeyStore((s) => s.openThread);

  const all = useMemo(
    () => selectBoxThreads(threads, "lesbox", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );
  const now = Date.now();
  const bubbled = all.filter((t) => t.bubbleUpAt && +new Date(t.bubbleUpAt) <= now);
  const fresh = all.filter((t) => !t.seen && !(t.bubbleUpAt && +new Date(t.bubbleUpAt) > now));
  const seen = all.filter((t) => t.seen);

  // Bundle: show only newest per bundled contact in list
  const displayFresh = useMemo(() => {
    const seenContacts = new Set<string>();
    return fresh.filter((t) => {
      if (!t.bundled) return true;
      if (seenContacts.has(t.contactEmail)) return false;
      seenContacts.add(t.contactEmail);
      return true;
    });
  }, [fresh]);

  const listNew = powerThrough ? displayFresh : displayFresh;
  const inboxLabel = all[0]?.accountEmail || settings.email || "this account";

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="LesBox"
        subtitle={
          inboxAccountId
            ? `Only mail for ${inboxLabel}. Switch accounts in the sidebar to see another inbox.`
            : "Connect an account in Settings — each account is an isolated workspace."
        }
        actions={
          <>
            <Button size="sm" variant={powerThrough ? "primary" : "soft"} onClick={togglePowerThrough}>
              Power Through New
            </Button>
            <Button size="sm" variant="soft" onClick={() => markAllSeenInBox("lesbox")}>
              Mark all seen
            </Button>
            <select
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
              value={settings.coverArt}
              onChange={(e) => setCoverArt(e.target.value as typeof settings.coverArt)}
            >
              <option value="none">No cover art</option>
              <option value="gradient">Gradient cover</option>
              <option value="photo">Photo cover</option>
              <option value="calendar">Calendar cover</option>
            </select>
          </>
        }
      />

      {multiOpenIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blurple/30 bg-[#f7f4ff] px-4 py-3 text-sm">
          <span>
            <strong>{multiOpenIds.length}</strong> emails open together — scroll like a feed.
          </span>
          <Button size="sm" variant="soft" onClick={() => multiOpenIds.forEach((id) => openThread(id))}>
            Jump first
          </Button>
          <Button size="sm" variant="ghost" onClick={clearMultiOpen}>
            Clear
          </Button>
        </div>
      )}

      {bubbled.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Bubbled up</h2>
          <div className="overflow-hidden rounded-2xl border border-line">
            {bubbled.map((t) => (
              <ThreadRow key={t.id} thread={t} openBody={multiOpenIds.includes(t.id)} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          New for you <Badge tone="blurple">{listNew.length}</Badge>
        </h2>
        {listNew.length === 0 ? (
          <EmptyState
            title="You're caught up"
            body={
              all.length === 0
                ? "Sync an account in Settings. Allowed contacts land here; new senders go to Screener first."
                : "No unread mail in this inbox."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            {listNew.map((t) => (
              <ThreadRow key={t.id} thread={t} openBody={powerThrough || multiOpenIds.includes(t.id)} />
            ))}
          </div>
        )}
      </section>

      {!powerThrough && settings.coverArt !== "none" ? <CoverArt /> : null}

      {!powerThrough && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Previously seen <Badge>{seen.length}</Badge>
          </h2>
          {seen.length === 0 ? (
            <EmptyState title="Nothing here yet" body="Read mail shows up in this list." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line">
              {seen.map((t) => (
                <ThreadRow key={t.id} thread={t} compact openBody={multiOpenIds.includes(t.id)} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function FeedView() {
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const list = useMemo(
    () => selectBoxThreads(threads, "feed", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="The Feed"
        subtitle="Newsletters and long-reads, already open. Scroll and enjoy."
      />
      {list.length === 0 ? (
        <EmptyState title="Feed is empty" body="Screen newsletters into The Feed and they'll show up here expanded." />
      ) : (
        <div className="mx-auto max-w-2xl space-y-4">
          {list.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-2xl border border-line shadow-sm">
              <ThreadRow thread={t} openBody />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PaperTrailView() {
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const list = useMemo(
    () => selectBoxThreads(threads, "paper_trail", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="The Paper Trail"
        subtitle="Receipts, confirmations, and transactional clutter — out of your face, easy to find."
      />
      {list.length === 0 ? (
        <EmptyState title="No paper yet" body="Transactional mail you screen here will wait patiently." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          {list.map((t) => (
            <ThreadRow key={t.id} thread={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScreenerCard({
  thread,
  last,
  expanded,
  onToggleExpand,
  boxChoice,
  spamCorps,
  onAllow,
  onBlock,
  onSpam,
}: {
  thread: Thread;
  last?: Message;
  expanded: boolean;
  onToggleExpand: () => void;
  boxChoice: "lesbox" | "feed" | "paper_trail";
  spamCorps: boolean;
  onAllow: () => void;
  onBlock: () => void;
  onSpam: () => void;
}) {
  const bodyHtml = last?.bodyHtml?.trim() ?? "";
  const hasBody = Boolean(bodyHtml);
  const plainSummary = hasBody ? previewText(bodyHtml, 220) : "";

  return (
    <article className="rounded-2xl border border-line bg-white p-5 animate-slide-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{thread.contactName}</h3>
          <p className="text-sm text-muted">{thread.contactEmail}</p>
          <p className="mt-2 font-medium">{thread.subject}</p>
          {thread.accountEmail ? (
            <p className="mt-1">
              <Badge tone="blurple">{thread.accountEmail}</Badge>
            </p>
          ) : null}
        </div>
        {last?.trackersBlocked.length ? (
          <Badge tone="salmon">Spy trackers blocked</Badge>
        ) : null}
      </div>
      {hasBody ? (
        expanded ? (
          <div
            className="prose-mail mt-3 rounded-xl bg-soft p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : (
          <div className="mt-3 rounded-xl bg-soft p-4 text-sm text-ink">
            <p className="line-clamp-4 whitespace-pre-wrap">{plainSummary}</p>
          </div>
        )
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {hasBody ? (
          <Button size="sm" variant="soft" onClick={onToggleExpand}>
            {expanded ? "Collapse" : "Expand"}
          </Button>
        ) : null}
        <Button onClick={onAllow}>
          Allow → {boxChoice === "lesbox" ? "LesBox" : boxChoice === "feed" ? "Feed" : "Paper Trail"}
        </Button>
        <Button variant="danger" onClick={onBlock}>
          Block
        </Button>
        {spamCorps ? (
          <Button variant="soft" onClick={onSpam}>
            Spam Corps
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function ScreenerView() {
  const threads = useHeyStore((s) => s.threads);
  const messages = useHeyStore((s) => s.messages);
  const settings = useHeyStore((s) => s.settings);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const screenContact = useHeyStore((s) => s.screenContact);
  const markSpam = useHeyStore((s) => s.markSpam);
  const list = useMemo(
    () => selectBoxThreads(threads, "screener", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );
  const [boxChoice, setBoxChoice] = useState<"lesbox" | "feed" | "paper_trail">("lesbox");
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});

  const allowAllVisible = () => {
    const seen = new Set<string>();
    for (const t of list) {
      const email = t.contactEmail.toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      screenContact(t.contactEmail, "allow", "lesbox");
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedById((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="The Screener"
        subtitle="New synced senders wait here. Allow them into LesBox, The Feed, or Paper Trail — or block."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-muted">
              Allow into
              <select
                className="rounded-lg border border-line bg-white px-2 py-1.5"
                value={boxChoice}
                onChange={(e) => setBoxChoice(e.target.value as typeof boxChoice)}
              >
                <option value="lesbox">LesBox</option>
                <option value="feed">The Feed</option>
                <option value="paper_trail">Paper Trail</option>
              </select>
            </label>
            {list.length > 0 ? (
              <Button size="sm" variant="soft" onClick={allowAllVisible}>
                Allow all visible to LesBox
              </Button>
            ) : null}
          </>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="Screener is clear"
          body="Sync mail from Settings or the sidebar. Unknown senders land here first — Allow moves them to LesBox (or Feed / Paper Trail)."
        />
      ) : (
        <div className="space-y-4">
          {list.map((t) => {
            const last = messages[t.messageIds[t.messageIds.length - 1]];
            return (
              <ScreenerCard
                key={t.id}
                thread={t}
                last={last}
                expanded={Boolean(expandedById[t.id])}
                onToggleExpand={() => toggleExpanded(t.id)}
                boxChoice={boxChoice}
                spamCorps={settings.spamCorps}
                onAllow={() => screenContact(t.contactEmail, "allow", boxChoice)}
                onBlock={() => screenContact(t.contactEmail, "block")}
                onSpam={() => markSpam(t.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SentView() {
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const list = useMemo(
    () => selectBoxThreads(threads, "sent", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Sent"
        subtitle="Mail you’ve sent — synced from your provider’s Sent folder, plus messages sent from Les Mail."
      />
      {list.length === 0 ? (
        <EmptyState
          title="No sent mail yet"
          body="Sync an account to pull Sent from IMAP, or write a new message."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          {list.map((t) => (
            <ThreadRow key={t.id} thread={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpamView() {
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const screenContact = useHeyStore((s) => s.screenContact);
  const [busy, setBusy] = useState(false);
  const list = useMemo(
    () => selectBoxThreads(threads, "spam", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Spam"
        subtitle="Junk from your provider’s Spam/Junk folder, plus senders you’ve blocked."
        actions={
          list.length > 0 ? (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const { emptySpamFolder } = await import("@/lib/mail-delete");
                    await emptySpamFolder();
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Empty Spam
            </Button>
          ) : null
        }
      />
      {list.length === 0 ? (
        <EmptyState
          title="Spam is empty"
          body="Sync to load your Spam/Junk mailbox, or block senders from Screener."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          {list.map((t) => (
            <div key={t.id} className="border-b border-line last:border-b-0">
              <ThreadRow thread={t} />
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => screenContact(t.contactEmail, "allow", "lesbox")}
                >
                  Not spam → LesBox
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const { permanentlyDeleteThread } = await import("@/lib/mail-delete");
                        await permanentlyDeleteThread(t.id);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Delete forever
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TrashView() {
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const settings = useHeyStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  const list = useMemo(
    () => selectBoxThreads(threads, "trash", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );
  const days = settings.autoPurgeTrashDays ?? 30;

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Trash"
        subtitle={
          days > 0
            ? `Deleted mail lives here. Items older than ${days} days are purged automatically.`
            : "Deleted mail lives here. Auto-purge is off (set days in Settings)."
        }
        actions={
          list.length > 0 ? (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const { emptyTrashFolder } = await import("@/lib/mail-delete");
                    await emptyTrashFolder();
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Empty Trash
            </Button>
          ) : null
        }
      />
      {list.length === 0 ? (
        <EmptyState title="Trash is empty" body="Deleted emails from LesBox and other views land here first." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          {list.map((t) => (
            <div key={t.id} className="border-b border-line last:border-b-0">
              <ThreadRow thread={t} />
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                <Button
                  size="sm"
                  variant="soft"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const { restoreThreadFromTrash } = await import("@/lib/mail-delete");
                        await restoreThreadFromTrash(t.id);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const { permanentlyDeleteThread } = await import("@/lib/mail-delete");
                        await permanentlyDeleteThread(t.id);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Delete forever
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DockListView({ mode }: { mode: "reply_later" | "set_aside" }) {
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const list = threads.filter(
    (t) =>
      (!inboxAccountId || t.accountId === inboxAccountId) &&
      (mode === "reply_later" ? t.replyLater : t.setAside),
  );
  const setView = useHeyStore((s) => s.setView);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title={mode === "reply_later" ? "Reply Later" : "Set Aside"}
        subtitle={
          mode === "reply_later"
            ? "Emails that need a reply when you have time."
            : "Reference material kept at hand, out of your face."
        }
        actions={
          mode === "reply_later" ? (
            <Button onClick={() => setView("focus_reply")}>Focus & Reply</Button>
          ) : null
        }
      />
      {list.length === 0 ? (
        <EmptyState
          title="Nothing here"
          body={mode === "reply_later" ? "Mark threads Reply Later from any email." : "Set aside travel info, links, and numbers."}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          {list.map((t) => (
            <ThreadRow key={t.id} thread={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FocusReplyView() {
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const sendReply = useHeyStore((s) => s.sendReply);
  const queue = threads.filter(
    (t) => t.replyLater && (!inboxAccountId || t.accountId === inboxAccountId),
  );
  const [index, setIndex] = useState(0);
  const [body, setBody] = useState("");
  const current = queue[index];
  const getThreadMessages = useHeyStore((s) => s.getThreadMessages);

  if (!current) {
    return (
      <div className="px-4 py-6 md:px-8">
        <EmptyState title="Focus & Reply complete" body="No Reply Later emails left. Nice work." />
      </div>
    );
  }

  const messages = getThreadMessages(current.id);
  const last = messages[messages.length - 1];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <SectionHeader
        title="Focus & Reply"
        subtitle={`${index + 1} of ${queue.length} — LesBox hidden so you can knock these out.`}
      />
      <article className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-display text-2xl">{current.customSubject || current.subject}</h2>
        <p className="mt-1 text-sm text-muted">
          {current.contactName} · {current.contactEmail}
        </p>
        {last ? (
          <div className="prose-mail mt-4 rounded-xl bg-soft p-4" dangerouslySetInnerHTML={{ __html: last.bodyHtml }} />
        ) : null}
        <div className="mt-4">
          <EmailTemplatePickers
            showSubjectTemplates={false}
            onInsertBody={(text, mode) =>
              setBody((b) => (mode === "replace" ? text : b ? `${b}\n\n${text}` : text))
            }
          />
        </div>
        <textarea
          className="mt-4 w-full rounded-xl border border-line p-3 text-sm"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Your reply…"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              sendReply(current.id, body);
              setBody("");
              setIndex((i) => Math.min(i, Math.max(0, queue.length - 2)));
            }}
          >
            Send & next
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              setBody("");
              setIndex((i) => Math.min(i + 1, queue.length - 1));
            }}
          >
            Skip
          </Button>
        </div>
      </article>
    </div>
  );
}
