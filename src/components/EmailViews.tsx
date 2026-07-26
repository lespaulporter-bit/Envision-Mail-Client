"use client";

import { CoverArt } from "@/components/CoverArt";
import { ThreadRow } from "@/components/ThreadRow";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { Badge, Button, EmptyState, SectionHeader } from "@/components/ui";
import { desktopApi } from "@/lib/desktop";
import { selectBoxThreads, selectDockThreads, useMailStore } from "@/lib/store";
import type { Message, Thread } from "@/lib/types";
import { previewText } from "@/lib/utils";
import { useMemo, useState } from "react";

export function MoneyBoxView() {
  const threads = useMailStore((s) => s.threads);
  const settings = useMailStore((s) => s.settings);
  const powerThrough = useMailStore((s) => s.powerThrough);
  const multiOpenIds = useMailStore((s) => s.multiOpenIds);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const togglePowerThrough = useMailStore((s) => s.togglePowerThrough);
  const markAllSeenInBox = useMailStore((s) => s.markAllSeenInBox);
  const setCoverArt = useMailStore((s) => s.setCoverArt);
  const clearMultiOpen = useMailStore((s) => s.clearMultiOpen);
  const openThread = useMailStore((s) => s.openThread);
  const [tab, setTab] = useState<"all" | "fresh" | "seen">("all");

  const all = useMemo(
    () => selectBoxThreads(threads, "lesbox", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );
  const now = Date.now();
  const bubbled = all.filter((t) => t.bubbleUpAt && +new Date(t.bubbleUpAt) <= now);
  const bubbledIds = new Set(bubbled.map((t) => t.id));
  const fresh = all.filter((t) => !t.seen && !(t.bubbleUpAt && +new Date(t.bubbleUpAt) > now));
  const seen = all.filter((t) => t.seen && !bubbledIds.has(t.id));

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

  const listNew = displayFresh;
  const inboxLabel = all[0]?.accountEmail || settings.email || "this account";
  const showFresh = tab === "all" || tab === "fresh";
  const showSeen = tab === "all" || tab === "seen";

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="MoneyBox $"
        subtitle={
          inboxAccountId
            ? `${all.length} messages for ${inboxLabel} — Fresh and previously read stay visible.`
            : "Connect an account in Settings — each account is an isolated workspace."
        }
        actions={
          <>
            <Button size="sm" variant={powerThrough ? "primary" : "soft"} onClick={togglePowerThrough}>
              Clear New
            </Button>
            <Button size="sm" variant="soft" onClick={() => markAllSeenInBox("lesbox")}>
              Mark all seen
            </Button>
            <select
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
              value={settings.coverArt}
              onChange={(e) => setCoverArt(e.target.value as typeof settings.coverArt)}
            >
              <option value="none">No day cover</option>
              <option value="gradient">Gradient cover</option>
              <option value="photo">Photo cover</option>
              <option value="calendar">Calendar cover</option>
            </select>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["all", `All (${all.length})`],
            ["fresh", `Fresh (${listNew.length})`],
            ["seen", `Previously read (${seen.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "rounded-full bg-teal px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm"
                : "rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-[#e6f7f3]"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {multiOpenIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-teal/30 bg-[#e6f7f3] px-4 py-3 text-sm">
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

      {bubbled.length > 0 && tab !== "seen" && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Bumped</h2>
          <div className="overflow-hidden rounded-2xl border border-line">
            {bubbled.map((t) => (
              <ThreadRow key={t.id} thread={t} openBody={multiOpenIds.includes(t.id)} />
            ))}
          </div>
        </section>
      )}

      {showFresh && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            Fresh <Badge tone="blurple">{listNew.length}</Badge>
          </h2>
          {listNew.length === 0 ? (
            <EmptyState
              title="You're caught up on new mail"
              body={
                all.length === 0
                  ? "Sync an account in Settings. Allowed contacts land here; new senders go to New Senders first."
                  : "No unread mail — your previously read emails are listed below."
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
      )}

      {showSeen && (
        <section className="mb-6 rounded-2xl border-2 border-teal/25 bg-[#f3fbf8] p-4">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-teal">
            Previously read <Badge tone="soft">{seen.length}</Badge>
          </h2>
          <p className="mb-3 text-xs text-muted">
            Every email you’ve already opened stays here — always visible, never tucked away.
          </p>
          {seen.length === 0 ? (
            <EmptyState title="No previously read mail yet" body="After you open a message, it appears in this list." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              {seen.map((t) => (
                <ThreadRow key={t.id} thread={t} openBody={multiOpenIds.includes(t.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "all" && !powerThrough && settings.coverArt !== "none" ? <CoverArt /> : null}
    </div>
  );
}

export function FeedView() {
  const threads = useMailStore((s) => s.threads);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const list = useMemo(
    () => selectBoxThreads(threads, "feed", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Newsstand"
        subtitle="Newsletters and long-reads, already open. Scroll and enjoy."
      />
      {list.length === 0 ? (
        <EmptyState title="Newsstand is empty" body="Screen newsletters into Newsstand and they'll show up here expanded." />
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
  const threads = useMailStore((s) => s.threads);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const list = useMemo(
    () => selectBoxThreads(threads, "paper_trail", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="The Receipts"
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
  spamCentral,
  onAllow,
  onBlock,
  onSpam,
}: {
  thread: Thread;
  last?: Message;
  expanded: boolean;
  onToggleExpand: () => void;
  boxChoice: "lesbox" | "feed" | "paper_trail";
  spamCentral: boolean;
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
          Allow → {boxChoice === "lesbox" ? "MoneyBox $" : boxChoice === "feed" ? "Feed" : "Receipts"}
        </Button>
        <Button variant="danger" onClick={onBlock}>
          Block
        </Button>
        {spamCentral ? (
          <Button variant="soft" onClick={onSpam} title="Spam Central — block sender and move to Spam">
            Block & report
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function ScreenerView() {
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const settings = useMailStore((s) => s.settings);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const screenContact = useMailStore((s) => s.screenContact);
  const markSpam = useMailStore((s) => s.markSpam);
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
        title="New Senders"
        subtitle="New synced senders wait here. Allow them into MoneyBox $, Newsstand, or Receipts — or block."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-muted">
              Allow into
              <select
                className="rounded-lg border border-line bg-white px-2 py-1.5"
                value={boxChoice}
                onChange={(e) => setBoxChoice(e.target.value as typeof boxChoice)}
              >
                <option value="lesbox">MoneyBox $</option>
                <option value="feed">Newsstand</option>
                <option value="paper_trail">Receipts</option>
              </select>
            </label>
            {list.length > 0 ? (
              <Button size="sm" variant="soft" onClick={allowAllVisible}>
                Allow all visible to MoneyBox $
              </Button>
            ) : null}
          </>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="New Senders is clear"
          body="Sync mail from Settings or the sidebar. Unknown senders land here first — Allow moves them to MoneyBox $ (or Feed / Receipts)."
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
                spamCentral={settings.spamCentral ?? settings.spamCorps ?? true}
                onAllow={() => screenContact(t.contactEmail, "allow", boxChoice)}
                onBlock={() => screenContact(t.contactEmail, "block")}
                onSpam={() => {
                  markSpam(t.id);
                  // Best-effort: also move IMAP messages into the server Spam folder
                  void (async () => {
                    const api = desktopApi();
                    if (!api || !t.accountId) return;
                    const uids = t.messageIds
                      .map((id) => {
                        const m = /^imap_[^_]+_(?:inbox_)?(\d+)$/.exec(id) || /^imap_[^_]+_(\d+)$/.exec(id);
                        return m ? Number(m[1]) : 0;
                      })
                      .filter((u) => u > 0);
                    if (!uids.length) return;
                    try {
                      await api.moveMessages({
                        accountId: t.accountId,
                        sourceFolder: "inbox",
                        destFolder: "spam",
                        uids,
                      });
                    } catch {
                      /* local spam box already updated */
                    }
                  })();
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SentView() {
  const threads = useMailStore((s) => s.threads);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const list = useMemo(
    () => selectBoxThreads(threads, "sent", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Sent"
        subtitle="Green ✓ = recipient opened a message when you requested a read receipt. Sync to refresh status."
      />
      {list.length === 0 ? (
        <EmptyState
          title="No sent mail yet"
          body="Sync an account to pull Sent from IMAP, or write a new message."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          {list.map((t) => (
            <ThreadRow key={t.id} thread={t} showReadReceipt />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpamView() {
  const threads = useMailStore((s) => s.threads);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const screenContact = useMailStore((s) => s.screenContact);
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
          body="Sync to load your Spam/Junk mailbox, or block senders from New Senders."
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
                  Not spam → MoneyBox $
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
  const threads = useMailStore((s) => s.threads);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const settings = useMailStore((s) => s.settings);
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
        <EmptyState title="Trash is empty" body="Deleted emails from MoneyBox $ and other views land here first." />
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
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const list = selectDockThreads(threads, mode, {
    accountId: inboxAccountId,
    messages,
  });
  const setView = useMailStore((s) => s.setView);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title={mode === "reply_later" ? "Snooze" : "On Hold"}
        subtitle={
          mode === "reply_later"
            ? "Emails that need a reply when you have time."
            : "Reference material kept at hand, out of your face."
        }
        actions={
          mode === "reply_later" ? (
            <Button onClick={() => setView("focus_reply")}>Reply Queue</Button>
          ) : null
        }
      />
      {list.length === 0 ? (
        <EmptyState
          title="Nothing here"
          body={mode === "reply_later" ? "Snooze threads from any email." : "Hold travel info, links, and numbers."}
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
  const threads = useMailStore((s) => s.threads);
  const messagesMap = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const sendReply = useMailStore((s) => s.sendReply);
  const queue = selectDockThreads(threads, "reply_later", {
    accountId: inboxAccountId,
    messages: messagesMap,
  });
  const [index, setIndex] = useState(0);
  const [body, setBody] = useState("");
  const current = queue[index];
  const getThreadMessages = useMailStore((s) => s.getThreadMessages);

  if (!current) {
    return (
      <div className="px-4 py-6 md:px-8">
        <EmptyState title="Reply Queue complete" body="No Snooze emails left. Nice work." />
      </div>
    );
  }

  const messages = getThreadMessages(current.id);
  const last = messages[messages.length - 1];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <SectionHeader
        title="Reply Queue"
        subtitle={`${index + 1} of ${queue.length} — MoneyBox $ hidden so you can knock these out.`}
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
