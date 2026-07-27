"use client";

import { CoverArt } from "@/components/CoverArt";
import { ThreadRow } from "@/components/ThreadRow";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { MailHtml } from "@/components/MailHtml";
import { UnsubscribeButton } from "@/components/UnsubscribeButton";
import { Badge, Button, EmptyState, SectionHeader } from "@/components/ui";
import { desktopApi, isDesktop } from "@/lib/desktop";
import { selectBoxThreads, selectDockThreads, selectNewSenderThreads, selectScreeningThreads, useMailStore } from "@/lib/store";
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
  const setView = useMailStore((s) => s.setView);
  const setSearch = useMailStore((s) => s.setSearch);
  const setToast = useMailStore((s) => s.setToast);
  const [tab, setTab] = useState<"all" | "fresh" | "seen">("all");
  const [oldQuery, setOldQuery] = useState("");
  const [oldBusy, setOldBusy] = useState<"search" | "older" | null>(null);
  /** How many newest INBOX messages to skip on the next “Load older” (sync window ≈ 100). */
  const [olderSkip, setOlderSkip] = useState(100);
  const [olderHasMore, setOlderHasMore] = useState(true);

  const messagesMap = useMailStore((s) => s.messages);
  const all = useMemo(
    () => selectBoxThreads(threads, "lesbox", { accountId: inboxAccountId, messages: messagesMap }),
    [threads, inboxAccountId, messagesMap],
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
                  ? "Sync an account in Settings. Allowed contacts land in MoneyBox $; everyone else waits in Screening."
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
            Opened mail that&apos;s already on this Mac for this account. Sync keeps a recent window; use Old mail below
            for older messages on any provider.
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

      {inboxAccountId && isDesktop() ? (
        <section className="mb-6 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="font-display text-lg text-ink">Old mail</h2>
          <p className="mt-1 text-sm text-muted">
            Only the newest messages sync automatically. Search your mail server (any provider) or load the next older
            Inbox batch into this account&apos;s MoneyBox.
          </p>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              const q = oldQuery.trim();
              if (q.length < 2) {
                setToast("Type a name or subject (2+ characters)");
                return;
              }
              setOldBusy("search");
              void (async () => {
                try {
                  const { searchAndImportOldMail } = await import("@/lib/mail-server-search");
                  const res = await searchAndImportOldMail(q, { limit: 50 });
                  if (!res.ok) setToast(res.error || "Search failed");
                  else {
                    setSearch(q);
                    setView("search");
                  }
                } finally {
                  setOldBusy(null);
                }
              })();
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm"
              placeholder="Search older mail by name, subject, or phrase…"
              value={oldQuery}
              onChange={(e) => setOldQuery(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!!oldBusy || oldQuery.trim().length < 2}>
              {oldBusy === "search" ? "Searching…" : "Search server"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="soft"
              disabled={!!oldBusy || !olderHasMore}
              onClick={() => {
                setOldBusy("older");
                void (async () => {
                  try {
                    const { loadOlderInboxMail } = await import("@/lib/mail-server-search");
                    const res = await loadOlderInboxMail(olderSkip, { limit: 40 });
                    if (!res.ok) {
                      setToast(res.error || "Could not load older mail");
                      return;
                    }
                    setOlderSkip(res.nextSkip);
                    setOlderHasMore(res.hasMore !== false);
                  } finally {
                    setOldBusy(null);
                  }
                })();
              }}
            >
              {oldBusy === "older" ? "Loading…" : olderHasMore ? "Load older batch" : "No more batches"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Tip: open <button type="button" className="font-medium text-teal underline" onClick={() => setView("search")}>Search</button> anytime for the same server search.
          </p>
        </section>
      ) : null}

      {tab === "all" && !powerThrough && settings.coverArt !== "none" ? <CoverArt /> : null}
    </div>
  );
}

export function FeedView() {
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const contacts = useMailStore((s) => s.contacts);
  const settings = useMailStore((s) => s.settings);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const screenContact = useMailStore((s) => s.screenContact);
  const markSpam = useMailStore((s) => s.markSpam);
  const list = useMemo(
    () => selectScreeningThreads(threads, { accountId: inboxAccountId, messages }),
    [threads, inboxAccountId, messages],
  );
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Screening"
        subtitle="New and unapproved senders land here. Allow → MoneyBox $ forever — or leave them in Screening."
      />
      {list.length === 0 ? (
        <EmptyState
          title="Screening is clear"
          body="Mail from new senders waits here until you Allow → MoneyBox $. Allowed senders skip Screening forever."
        />
      ) : (
        <div className="mx-auto max-w-2xl space-y-4">
          {list.map((t) => {
            const last = messages[t.messageIds[t.messageIds.length - 1]];
            const contact = contacts.find((c) => c.email.toLowerCase() === t.contactEmail.toLowerCase());
            const pending = !contact || contact.status === "pending";
            return (
              <ScreenerCard
                key={t.id}
                thread={t}
                last={last}
                expanded={Boolean(expandedById[t.id] ?? true)}
                onToggleExpand={() =>
                  setExpandedById((prev) => ({ ...prev, [t.id]: !(prev[t.id] ?? true) }))
                }
                boxChoice="lesbox"
                spamCentral={settings.spamCentral ?? settings.spamCorps ?? true}
                showAllowMoneyBox
                pending={pending}
                onAllow={() => screenContact(t.contactEmail, "allow", "lesbox")}
                onBlock={() => screenContact(t.contactEmail, "block")}
                onSpam={() => {
                  markSpam(t.id);
                  void (async () => {
                    const api = desktopApi();
                    if (!api || !t.accountId) return;
                    const uids = t.messageIds
                      .map((id) => {
                        const m =
                          /^imap_[^_]+_(?:inbox_)?(\d+)$/.exec(id) || /^imap_[^_]+_(\d+)$/.exec(id);
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
                      /* local already updated */
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
  showAllowMoneyBox,
  pending,
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
  showAllowMoneyBox?: boolean;
  pending?: boolean;
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
          <div className="mt-1 flex flex-wrap gap-1.5">
            {pending ? <Badge tone="blurple">New sender</Badge> : <Badge tone="soft">In Screening</Badge>}
            {thread.accountEmail ? <Badge tone="blurple">{thread.accountEmail}</Badge> : null}
          </div>
        </div>
        {last?.trackersBlocked.length ? (
          <Badge tone="salmon">Spy trackers blocked</Badge>
        ) : null}
      </div>
      {hasBody ? (
        expanded ? (
          <MailHtml className="mt-3 rounded-xl bg-soft p-4 text-sm" html={bodyHtml} />
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
        <UnsubscribeButton thread={thread} messageId={last?.id} />
        {showAllowMoneyBox || boxChoice === "lesbox" ? (
          <Button onClick={onAllow} title="This sender’s mail goes to MoneyBox $ forever">
            Allow → MoneyBox $
          </Button>
        ) : (
          <Button onClick={onAllow}>
            Allow → {boxChoice === "feed" ? "Screening" : "Receipts"}
          </Button>
        )}
        <Button variant="danger" onClick={onBlock}>
          Block
        </Button>
        {spamCentral ? (
          <Button variant="soft" onClick={onSpam} title="Spam Central — block sender and move to Spam">
            Block & report
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="danger"
          title="Move this email to Trash"
          onClick={() => {
            void (async () => {
              const { moveThreadToTrashSmart } = await import("@/lib/mail-delete");
              await moveThreadToTrashSmart(thread.id);
            })();
          }}
        >
          Move to Trash
        </Button>
      </div>
    </article>
  );
}

export function ScreenerView() {
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const contacts = useMailStore((s) => s.contacts);
  const settings = useMailStore((s) => s.settings);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const screenContact = useMailStore((s) => s.screenContact);
  const markSpam = useMailStore((s) => s.markSpam);
  const setToast = useMailStore((s) => s.setToast);
  const setView = useMailStore((s) => s.setView);
  const list = useMemo(
    () => selectNewSenderThreads(threads, contacts, { accountId: inboxAccountId, messages }),
    [threads, contacts, inboxAccountId, messages],
  );
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [unsubBusy, setUnsubBusy] = useState(false);

  const allowAllToMoneyBox = () => {
    const seen = new Set<string>();
    for (const t of list) {
      const email = t.contactEmail.toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      screenContact(t.contactEmail, "allow", "lesbox");
    }
  };

  const unsubscribeAllWithLinks = () => {
    void (async () => {
      const { findUnsubscribeForThread, performSilentUnsubscribe } = await import(
        "@/lib/unsubscribe-action"
      );
      setUnsubBusy(true);
      let ok = 0;
      let skipped = 0;
      try {
        const seen = new Set<string>();
        for (const t of list) {
          const key = t.contactEmail.toLowerCase();
          if (seen.has(key)) continue;
          const candidate = findUnsubscribeForThread(t, messages);
          if (!candidate?.targets || candidate.message.unsubscribedAt) {
            skipped += 1;
            continue;
          }
          seen.add(key);
          // eslint-disable-next-line no-await-in-loop
          const result = await performSilentUnsubscribe({
            thread: t,
            candidate,
            accountId: inboxAccountId || t.accountId,
          });
          if (result.ok && !result.already) ok += 1;
          else skipped += 1;
        }
        setToast(
          ok > 0
            ? `✓ Unsubscribed from ${ok} sender${ok === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}`
            : "No unsubscribe links found on visible New Senders",
        );
      } finally {
        setUnsubBusy(false);
      }
    })();
  };

  const toggleExpanded = (id: string) => {
    setExpandedById((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="New Senders"
        subtitle="First-time senders waiting in Screening. Allow → MoneyBox $ forever, or leave them in Screening."
        actions={
          <>
            <Button size="sm" variant="soft" onClick={() => setView("feed")}>
              Open Screening
            </Button>
            {list.length > 0 ? (
              <>
                <Button size="sm" variant="soft" disabled={unsubBusy} onClick={unsubscribeAllWithLinks}>
                  {unsubBusy ? "Unsubscribing…" : "Unsubscribe all with links"}
                </Button>
                <Button size="sm" onClick={allowAllToMoneyBox}>
                  Allow all → MoneyBox $ forever
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="No new senders waiting"
          body="Unknown senders appear here and in Screening. Once you Allow → MoneyBox $, their mail skips Screening forever."
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
                boxChoice="lesbox"
                spamCentral={settings.spamCentral ?? settings.spamCorps ?? true}
                showAllowMoneyBox
                pending
                onAllow={() => screenContact(t.contactEmail, "allow", "lesbox")}
                onBlock={() => screenContact(t.contactEmail, "block")}
                onSpam={() => {
                  markSpam(t.id);
                  void (async () => {
                    const api = desktopApi();
                    if (!api || !t.accountId) return;
                    const uids = t.messageIds
                      .map((id) => {
                        const m =
                          /^imap_[^_]+_(?:inbox_)?(\d+)$/.exec(id) || /^imap_[^_]+_(\d+)$/.exec(id);
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
  const messages = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const setToast = useMailStore((s) => s.setToast);
  const [busy, setBusy] = useState(false);
  const [unsubBusy, setUnsubBusy] = useState(false);
  const list = useMemo(
    () => selectBoxThreads(threads, "spam", { accountId: inboxAccountId, messages }),
    [threads, inboxAccountId, messages],
  );

  const unsubscribeAllWithLinks = () => {
    void (async () => {
      const { findUnsubscribeForThread, performSilentUnsubscribe } = await import(
        "@/lib/unsubscribe-action"
      );
      setUnsubBusy(true);
      let ok = 0;
      let skipped = 0;
      try {
        const seen = new Set<string>();
        for (const t of list) {
          const key = t.contactEmail.toLowerCase();
          if (seen.has(key)) continue;
          const candidate = findUnsubscribeForThread(t, messages);
          if (!candidate?.targets || candidate.message.unsubscribedAt) {
            skipped += 1;
            continue;
          }
          seen.add(key);
          // eslint-disable-next-line no-await-in-loop
          const result = await performSilentUnsubscribe({
            thread: t,
            candidate,
            accountId: inboxAccountId || t.accountId,
          });
          if (result.ok && !result.already) ok += 1;
          else skipped += 1;
        }
        setToast(
          ok > 0
            ? `✓ Unsubscribed from ${ok} spam sender${ok === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}`
            : "No unsubscribe links found in Spam",
        );
      } finally {
        setUnsubBusy(false);
      }
    })();
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Spam"
        subtitle="Junk from your provider’s Spam/Junk folder, plus senders you’ve blocked. Unsubscribe before you empty."
        actions={
          list.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="soft" disabled={unsubBusy} onClick={unsubscribeAllWithLinks}>
                {unsubBusy ? "Unsubscribing…" : "Unsubscribe all with links"}
              </Button>
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
            </div>
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
          {list.map((t) => {
            const lastId = t.messageIds[t.messageIds.length - 1];
            const last = lastId ? messages[lastId] : undefined;
            return (
              <div key={t.id} className="border-b border-line last:border-b-0">
                <ThreadRow thread={t} />
                <div className="flex flex-wrap gap-2 px-4 pb-3">
                  <UnsubscribeButton thread={t} messageId={last?.id} />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      void (async () => {
                        const { moveThreadToTrashSmart } = await import("@/lib/mail-delete");
                        await moveThreadToTrashSmart(t.id);
                      })();
                    }}
                  >
                    Move to Trash
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => {
                      useMailStore.getState().unblockSender(t.contactEmail, "lesbox");
                    }}
                  >
                    Unblock · Not spam → MoneyBox $
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
            );
          })}
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
        {last ? <MailHtml className="mt-4 rounded-xl bg-soft p-4" html={last.bodyHtml} /> : null}
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
