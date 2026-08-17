"use client";

import { CoverArt } from "@/components/CoverArt";
import { ThreadRow } from "@/components/ThreadRow";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { ComposeAttachments } from "@/components/ComposeAttachments";
import type { DraftAttachment } from "@/lib/compose-attachments";
import { toSendAttachments } from "@/lib/compose-attachments";
import { MailHtml } from "@/components/MailHtml";
import { MultiOpenBanner } from "@/components/MultiOpenBanner";
import { UnsubscribeButton } from "@/components/UnsubscribeButton";
import { Badge, Button, EmptyState, Input, SectionHeader } from "@/components/ui";
import { desktopApi, isDesktop, sendShortcutHint, thisComputerLabel } from "@/lib/desktop";
import { bodyToHtml, scrubComposerBody, signatureHtmlBlock } from "@/lib/html-body";
import { asArray } from "@/lib/stable-empty";
import { threadMatchesFilter } from "@/lib/list-filter";
import {
  selectBoxThreads,
  selectCleanupThreads,
  selectDockThreads,
  selectNewSenderThreads,
  selectScreeningThreads,
  useMailStore,
} from "@/lib/store";
import { boxLabel, type Message, type Thread } from "@/lib/types";
import { formatThreadTime, previewText } from "@/lib/utils";
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
            <Button size="sm" variant="soft" onClick={() => setView("cleanup")}>
              Easy Cleanup
            </Button>
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

      {tab === "all" && !powerThrough && settings.coverArt !== "none" ? <CoverArt /> : null}

      <MultiOpenBanner />

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
            Opened mail that&apos;s already on {thisComputerLabel()} for this account. Sync keeps a recent window; use
            Old mail below for older messages on any provider.
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
    </div>
  );
}

export function EasyCleanupView() {
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const contacts = useMailStore((s) => s.contacts);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const setView = useMailStore((s) => s.setView);
  const setToast = useMailStore((s) => s.setToast);
  const openThread = useMailStore((s) => s.openThread);
  const screenContact = useMailStore((s) => s.screenContact);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () => selectCleanupThreads(threads, contacts, messages, { accountId: inboxAccountId }),
    [threads, contacts, messages, inboxAccountId],
  );
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((thread) =>
      [thread.contactName, thread.contactEmail, thread.customSubject || thread.subject]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [candidates, query]);
  const selectedCandidates = candidates.filter((thread) => selected.has(thread.id));
  const allVisibleSelected = visible.length > 0 && visible.every((thread) => selected.has(thread.id));

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((thread) => next.delete(thread.id));
      else visible.forEach((thread) => next.add(thread.id));
      return next;
    });
  };

  const trashSelected = () => {
    if (!selectedCandidates.length || busy) return;
    const confirmed = window.confirm(
      `Move ${selectedCandidates.length} selected conversation${
        selectedCandidates.length === 1 ? "" : "s"
      } to Trash? You can restore them from Trash.`,
    );
    if (!confirmed) return;
    void (async () => {
      setBusy(true);
      try {
        const { moveThreadsToTrashSmart } = await import("@/lib/mail-delete");
        const result = await moveThreadsToTrashSmart(selectedCandidates.map((thread) => thread.id));
        setSelected(new Set());
        setToast(
          result.warnings.length
            ? `Moved ${result.moved} to Trash — server: ${result.warnings[0]}`
            : `Moved ${result.moved} conversation${result.moved === 1 ? "" : "s"} to Trash`,
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Easy Cleanup"
        subtitle="A review queue for mail outside MoneyBox from people you rarely email. Nothing moves until you select it."
        actions={
          <Button size="sm" variant="ghost" onClick={() => setView("lesbox")}>
            Back to MoneyBox $
          </Button>
        }
      />

      <div className="mb-4 rounded-2xl border border-teal/25 bg-[#f3fbf8] p-4">
        <p className="text-sm text-ink">
          Protected automatically: MoneyBox mail, Reply Queue, On Hold, Sent, Spam, Trash, and people you&apos;ve
          emailed at least twice.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-teal"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter visible cleanup mail by sender or subject…"
          />
          <Button size="sm" variant="soft" disabled={!visible.length} onClick={toggleAllVisible}>
            {allVisibleSelected ? "Clear visible" : `Select all visible (${visible.length})`}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!selectedCandidates.length || busy}
            onClick={trashSelected}
          >
            {busy ? "Moving…" : `Move selected to Trash (${selectedCandidates.length})`}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={candidates.length ? "No cleanup mail matches" : "Easy Cleanup is clear"}
          body={
            candidates.length
              ? "Clear the filter to see the full review queue."
              : "There is no lower-priority mail waiting for review."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {visible.map((thread) => {
            const lastId = thread.messageIds[thread.messageIds.length - 1];
            const last = lastId ? messages[lastId] : undefined;
            return (
              <article
                key={thread.id}
                className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-teal"
                  checked={selected.has(thread.id)}
                  onChange={() => toggleSelected(thread.id)}
                  aria-label={`Select ${thread.contactName || thread.contactEmail}`}
                />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openThread(thread.id)}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink">{thread.contactName || thread.contactEmail}</span>
                    <span className="text-xs text-muted">{formatThreadTime(thread.updatedAt)}</span>
                  </div>
                  <div className="truncate text-sm font-medium text-ink">
                    {thread.customSubject || thread.subject}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted">
                    {last ? previewText(last.bodyHtml || last.bodyText || "", 180) : thread.contactEmail}
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {boxLabel(thread.box)} · not in MoneyBox · low reply history
                  </div>
                </button>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => {
                      screenContact(thread.contactEmail, "allow", "lesbox");
                      setSelected((current) => {
                        const next = new Set(current);
                        next.delete(thread.id);
                        return next;
                      });
                    }}
                  >
                    Keep → MoneyBox $
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openThread(thread.id)}>
                    Review
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
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
        subtitle="New and unapproved senders land here. Reply Queue or Trash without Allowing into MoneyBox $ — or Allow → MoneyBox $ forever."
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
  const [filter, setFilter] = useState("");
  const list = useMemo(
    () => selectBoxThreads(threads, "paper_trail", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );
  const visible = useMemo(() => list.filter((t) => threadMatchesFilter(t, filter)), [list, filter]);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="The Receipts"
        subtitle="Receipts, confirmations, and transactional clutter — out of your face, easy to find."
      />
      {list.length > 0 ? (
        <Input
          className="mb-4 max-w-md"
          placeholder="Filter by sender or subject…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      ) : null}
      {list.length === 0 ? (
        <EmptyState title="No paper yet" body="Transactional mail you screen here will wait patiently." />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" body="Clear the filter to see every receipt again." />
      ) : (
        <>
          <MultiOpenBanner />
          <div className="overflow-hidden rounded-2xl border border-line">
            {visible.map((t) => (
              <ThreadRow key={t.id} thread={t} />
            ))}
          </div>
        </>
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
  const toggleReplyLater = useMailStore((s) => s.toggleReplyLater);
  const setView = useMailStore((s) => s.setView);
  const setToast = useMailStore((s) => s.setToast);
  const openThread = useMailStore((s) => s.openThread);

  return (
    <article className="rounded-2xl border border-line bg-white p-5 animate-slide-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{thread.contactName}</h3>
          <p className="text-sm text-muted">{thread.contactEmail}</p>
          <p className="mt-2 font-medium">{thread.subject}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {pending ? <Badge tone="blurple">New sender</Badge> : <Badge tone="soft">In Screening</Badge>}
            {thread.replyLater ? <Badge tone="mint">Reply Queue</Badge> : null}
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
        <Button
          size="sm"
          variant="soft"
          title="Open to read / reply without allowing into MoneyBox $"
          onClick={() => openThread(thread.id)}
        >
          Open
        </Button>
        <Button
          size="sm"
          variant={thread.replyLater ? "primary" : "soft"}
          title={
            thread.replyLater
              ? "Already in Reply Queue — open it from the sidebar"
              : "Add to Reply Queue without moving this sender into MoneyBox $"
          }
          onClick={() => {
            if (!thread.replyLater) {
              toggleReplyLater(thread.id);
            } else {
              setView("focus_reply");
              setToast("Opening Reply Queue");
            }
          }}
        >
          {thread.replyLater ? "In Reply Queue ✓" : "Reply Queue"}
        </Button>
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
          title="Move to Trash — stays out of MoneyBox $"
          onClick={() => {
            void (async () => {
              const { moveThreadToTrashSmart } = await import("@/lib/mail-delete");
              await moveThreadToTrashSmart(thread.id);
            })();
          }}
        >
          Trash
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
        subtitle="First-time senders in Screening. Reply Queue / Trash without MoneyBox $, or Allow → MoneyBox $ forever."
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
  const [filter, setFilter] = useState("");
  const list = useMemo(
    () => selectBoxThreads(threads, "sent", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );
  const visible = useMemo(() => list.filter((t) => threadMatchesFilter(t, filter)), [list, filter]);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Sent"
        subtitle="Green ✓ = recipient opened a message when you requested a read receipt. Sync to refresh status."
      />
      {list.length > 0 ? (
        <Input
          className="mb-4 max-w-md"
          placeholder="Filter by recipient or subject…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          title="No sent mail yet"
          body="Sync an account to pull Sent from IMAP, or write a new message."
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" body="Clear the filter to see every sent conversation again." />
      ) : (
        <>
          <MultiOpenBanner />
          <div className="overflow-hidden rounded-2xl border border-line">
            {visible.map((t) => (
              <ThreadRow key={t.id} thread={t} showReadReceipt />
            ))}
          </div>
        </>
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
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const list = useMemo(
    () => selectBoxThreads(threads, "trash", { accountId: inboxAccountId }),
    [threads, inboxAccountId],
  );
  const visible = useMemo(() => list.filter((t) => threadMatchesFilter(t, filter)), [list, filter]);
  const days = settings.autoPurgeTrashDays ?? 30;
  const selectedVisible = selected.filter((id) => visible.some((t) => t.id === id));

  const toggleSelected = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

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
                    setSelected([]);
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
      {list.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            className="max-w-md"
            placeholder="Filter by sender or subject…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Button
            size="sm"
            variant="soft"
            onClick={() => setSelected(visible.map((t) => t.id))}
            disabled={!visible.length}
          >
            Select all visible
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])} disabled={!selected.length}>
            Clear selection
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || selectedVisible.length === 0}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  const { restoreThreadFromTrash } = await import("@/lib/mail-delete");
                  for (const id of selectedVisible) {
                    // eslint-disable-next-line no-await-in-loop
                    await restoreThreadFromTrash(id);
                  }
                  setSelected([]);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Restore selected ({selectedVisible.length})
          </Button>
        </div>
      ) : null}
      {list.length === 0 ? (
        <EmptyState title="Trash is empty" body="Deleted emails from MoneyBox $ and other views land here first." />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" body="Clear the filter to see every trash item again." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          {visible.map((t) => (
            <div key={t.id} className="border-b border-line last:border-b-0">
              <div className="flex items-start gap-2 px-3 pt-3">
                <input
                  type="checkbox"
                  className="mt-4"
                  checked={selected.includes(t.id)}
                  onChange={() => toggleSelected(t.id)}
                  aria-label={`Select ${t.customSubject || t.subject}`}
                />
                <div className="min-w-0 flex-1">
                  <ThreadRow thread={t} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 px-4 pb-3 pl-10">
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
                        setSelected((ids) => ids.filter((id) => id !== t.id));
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
                        setSelected((ids) => ids.filter((id) => id !== t.id));
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
  const [filter, setFilter] = useState("");
  const list = selectDockThreads(threads, mode, {
    accountId: inboxAccountId,
    messages,
  });
  const visible = useMemo(() => list.filter((t) => threadMatchesFilter(t, filter)), [list, filter]);
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
      {list.length > 0 ? (
        <Input
          className="mb-4 max-w-md"
          placeholder="Filter by sender or subject…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          title="Nothing here"
          body={mode === "reply_later" ? "Snooze threads from any email." : "Hold travel info, links, and numbers."}
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" body="Clear the filter to see every item again." />
      ) : (
        <>
          <MultiOpenBanner />
          <div className="overflow-hidden rounded-2xl border border-line">
            {visible.map((t) => (
              <ThreadRow key={t.id} thread={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function FocusReplyView() {
  const threads = useMailStore((s) => s.threads);
  const messagesMap = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const sendReply = useMailStore((s) => s.sendReply);
  const setToast = useMailStore((s) => s.setToast);
  const signatures = useMailStore((s) => asArray(s.signatures));
  const settings = useMailStore((s) => s.settings);
  const queue = selectDockThreads(threads, "reply_later", {
    accountId: inboxAccountId,
    messages: messagesMap,
  });
  const [index, setIndex] = useState(0);
  const [body, setBody] = useState("");
  const [queueFiles, setQueueFiles] = useState<DraftAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [signatureId, setSignatureId] = useState(settings.defaultSignatureId || "");
  const current = queue[Math.min(index, Math.max(0, queue.length - 1))];
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

  const sendAndNext = async () => {
    if (sending) return;
    const bodyText = scrubComposerBody(body).trim();
    if (bodyText !== body.trim()) setBody(bodyText);
    if (!bodyText) {
      setToast("Write a reply first");
      return;
    }
    setSending(true);
    try {
      const api = desktopApi();
      const sendAccountId = current.accountId || inboxAccountId || "";
      const sig =
        signatures.find((s) => s.id === signatureId) ||
        signatures.find((s) => s.id === settings.defaultSignatureId) ||
        signatures.find((s) => s.isDefault);
      const bodyHtml = `${bodyToHtml(bodyText)}${sig ? signatureHtmlBlock(sig) : ""}`;
      if (!api) {
        setToast("Open the Envision Mail desktop app to send via SMTP");
        return;
      }
      if (!sendAccountId) {
        setToast("Select an account before sending");
        return;
      }
      const result = await api.sendMail({
        accountId: sendAccountId,
        to: current.contactEmail,
        subject: `Re: ${current.customSubject || current.subject}`,
        text: bodyText,
        html: bodyHtml,
        requestReadReceipt: settings.requestReadReceiptsByDefault ?? false,
        attachments: toSendAttachments(queueFiles),
      });
      if (!result.ok) {
        const err = result.error || "SMTP send failed";
        const authHint =
          /auth|password|credentials|login|535|534|decrypt|safeStorage|re-enter/i.test(err)
            ? " — Settings → Accounts → paste a new app password → Save"
            : "";
        setToast(err + authHint);
        return;
      }
      sendReply(current.id, bodyText, {
        attachments: queueFiles.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
          messageId: "",
          threadId: current.id,
          receivedAt: new Date().toISOString(),
        })),
      });
      setBody("");
      setQueueFiles([]);
      setIndex((i) => Math.min(i, Math.max(0, queue.length - 2)));
      setToast("Reply sent via SMTP");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "SMTP send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <SectionHeader
        title="Reply Queue"
        subtitle={`${Math.min(index, queue.length - 1) + 1} of ${queue.length} — includes Screening / New Senders mail you queued (MoneyBox $ stays clear).`}
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
            onSelectSignature={(id) => setSignatureId(id)}
            onInsertBody={(text, mode) => {
              const plain = scrubComposerBody(text);
              setBody((b) =>
                mode === "replace" ? plain : scrubComposerBody(b) ? `${scrubComposerBody(b)}\n\n${plain}` : plain,
              );
            }}
          />
        </div>
        {signatures.length > 0 ? (
          <label className="mt-3 block text-sm">
            Signature for send
            <select
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={signatureId || ""}
              onChange={(e) => setSignatureId(e.target.value)}
            >
              <option value="">No signature</option>
              {signatures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">
              HTML signatures stay formatted for recipients — they are not pasted into this text box.
            </span>
          </label>
        ) : null}
        <textarea
          className="mt-4 w-full rounded-xl border border-line p-3 text-sm"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void sendAndNext();
            }
          }}
          placeholder={`Your reply… (${sendShortcutHint()})`}
        />
        <div className="mt-3">
          <ComposeAttachments
            files={queueFiles}
            onChange={setQueueFiles}
            disabled={sending}
            onError={setToast}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={sending} onClick={() => void sendAndNext()}>
            {sending ? "Sending…" : "Send & next"}
          </Button>
          <Button
            variant="soft"
            disabled={sending}
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
