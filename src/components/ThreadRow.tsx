"use client";

import { UnsubscribeButton } from "@/components/UnsubscribeButton";
import { Avatar, Badge, Button } from "@/components/ui";
import { MailHtml } from "@/components/MailHtml";
import { useMailStore } from "@/lib/store";
import { tagLabel } from "@/lib/thread-tags";
import type { Thread } from "@/lib/types";
import { cn, formatThreadTime, previewText } from "@/lib/utils";
import { Bell, Bookmark, CheckSquare, Clock3, Layers, Paperclip, Square, Trash2 } from "lucide-react";
import { moveThreadToTrashSmart, permanentlyDeleteThread } from "@/lib/mail-delete";

export function ThreadRow({
  thread,
  compact,
  openBody,
  showReadReceipt,
  showUnsubscribe,
}: {
  thread: Thread;
  compact?: boolean;
  openBody?: boolean;
  showReadReceipt?: boolean;
  /** Show Unsubscribe in the hover action strip (MoneyBox, Feed, etc.). */
  showUnsubscribe?: boolean;
}) {
  const messages = useMailStore((s) => s.messages);
  const contacts = useMailStore((s) => s.contacts);
  const multiOpenIds = useMailStore((s) => s.multiOpenIds);
  const openThread = useMailStore((s) => s.openThread);
  const toggleMultiOpen = useMailStore((s) => s.toggleMultiOpen);
  const toggleReplyLater = useMailStore((s) => s.toggleReplyLater);
  const toggleSetAside = useMailStore((s) => s.toggleSetAside);
  const settings = useMailStore((s) => s.settings);

  const lastId = thread.messageIds[thread.messageIds.length - 1];
  const last = lastId ? messages[lastId] : undefined;
  const contact = contacts.find((c) => c.email === thread.contactEmail);
  const subject = thread.customSubject || thread.subject;
  const selected = multiOpenIds.includes(thread.id);

  const outgoing = thread.messageIds
    .map((id) => messages[id])
    .filter((m) => m && m.isOutgoing);
  const requested = showReadReceipt && outgoing.some((m) => m.requestReadReceipt);
  const readCount = showReadReceipt
    ? outgoing.reduce((n, m) => n + (m.readReceipts?.length || 0), 0)
    : 0;
  const wasRead = readCount > 0;
  const attachmentCount = thread.messageIds.reduce(
    (n, id) => n + (messages[id]?.attachments.length || 0),
    0,
  );

  return (
    <article
      className={cn(
        "group relative border-b border-line bg-white transition hover:bg-soft/70",
        !thread.seen && "bg-[#f3fbf8]",
        selected && "ring-2 ring-inset ring-teal/40",
        openBody && "animate-slide-up",
      )}
    >
      <button type="button" className="flex w-full gap-3 px-4 py-3.5 text-left" onClick={() => openThread(thread.id)}>
        {showReadReceipt ? (
          <span
            className="mt-1 shrink-0"
            title={
              wasRead
                ? `Read receipt: opened (${readCount})`
                : requested
                  ? "Read receipt requested — waiting"
                  : "No read receipt requested"
            }
          >
            {wasRead ? (
              <CheckSquare className="h-5 w-5 text-[#059669]" strokeWidth={2.5} />
            ) : requested ? (
              <Square className="h-5 w-5 text-[#d97706]" strokeWidth={2.25} />
            ) : (
              <Square className="h-5 w-5 text-line" strokeWidth={2} />
            )}
          </span>
        ) : null}
        <Avatar
          name={thread.contactName}
          color={contact?.avatarColor || "#0d9488"}
          imageUrl={contact?.avatarImageDataUrl || null}
          size={compact ? 32 : 40}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn("truncate text-sm", !thread.seen ? "font-semibold" : "font-medium")}>
                  {thread.contactName}
                </span>
                {settings.linkedAccounts && thread.accountMark === "personal" ? (
                  <span title="Personal">▲</span>
                ) : null}
                {settings.linkedAccounts && thread.accountMark === "work" ? (
                  <span title="Work">◼️</span>
                ) : null}
                {thread.notify ? <Bell className="h-3.5 w-3.5 text-teal" /> : null}
                {thread.replyLater ? <Clock3 className="h-3.5 w-3.5 text-amber" /> : null}
                {thread.setAside ? <Bookmark className="h-3.5 w-3.5 text-em-blue" /> : null}
                {thread.bundled ? <Layers className="h-3.5 w-3.5 text-muted" /> : null}
                {attachmentCount > 0 ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-muted"
                    title={`${attachmentCount} attachment${attachmentCount > 1 ? "s" : ""}`}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {attachmentCount > 1 ? <span className="text-[11px]">{attachmentCount}</span> : null}
                  </span>
                ) : null}
                {!thread.seen ? <Badge tone="blurple">New</Badge> : null}
                {(thread.tags || []).slice(0, 4).map((tag) => (
                  <Badge key={tag} tone={tag === "muted" ? "salmon" : tag === "snoozed" ? "mint" : "soft"}>
                    {tagLabel(tag)}
                  </Badge>
                ))}
                {wasRead ? (
                  <Badge tone="soft">
                    <span className="inline-flex items-center gap-1 text-[#047857]">
                      <CheckSquare className="h-3 w-3" /> Read
                    </span>
                  </Badge>
                ) : requested ? (
                  <Badge tone="soft">Receipt pending</Badge>
                ) : null}
                {thread.accountEmail ? (
                  <Badge tone="soft">{thread.accountEmail}</Badge>
                ) : null}
              </div>
              <div className={cn("truncate text-sm", !thread.seen ? "text-ink" : "text-muted")}>{subject}</div>
            </div>
            <time className="shrink-0 text-xs text-muted">{formatThreadTime(thread.updatedAt)}</time>
          </div>
          {last ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted">{previewText(last.bodyHtml, openBody ? 280 : 140)}</p>
          ) : null}
          {openBody && last ? (
            <MailHtml className="mt-3 rounded-xl bg-soft/80 p-4 text-sm text-ink" html={last.bodyHtml} />
          ) : null}
        </div>
      </button>
      <div className="absolute right-3 top-3 hidden gap-1 group-hover:flex">
        {(showUnsubscribe || thread.box === "screener" || thread.box === "spam" || thread.box === "lesbox") ? (
          <UnsubscribeButton thread={thread} messageId={last?.id} />
        ) : null}
        <Button
          size="sm"
          variant={selected ? "primary" : "soft"}
          onClick={() => toggleMultiOpen(thread.id)}
          title="Open together"
        >
          {selected ? "Multi ✓" : "Multi"}
        </Button>
        <Button
          size="sm"
          variant={thread.replyLater ? "primary" : "soft"}
          onClick={() => toggleReplyLater(thread.id)}
          title="Add to Reply Queue / Snooze"
        >
          {thread.replyLater ? "Queued ✓" : "Reply Queue"}
        </Button>
        <Button
          size="sm"
          variant={thread.setAside ? "primary" : "soft"}
          onClick={() => toggleSetAside(thread.id)}
        >
          {thread.setAside ? "On Hold ✓" : "On Hold"}
        </Button>
        {thread.box === "trash" ? (
          <Button
            size="sm"
            variant="danger"
            title="Delete forever"
            onClick={() => {
              void permanentlyDeleteThread(thread.id);
            }}
          >
            Delete forever
          </Button>
        ) : (
          <Button
            size="sm"
            variant="danger"
            title="Move to Trash"
            onClick={() => {
              void moveThreadToTrashSmart(thread.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Move to Trash
          </Button>
        )}
      </div>
    </article>
  );
}
