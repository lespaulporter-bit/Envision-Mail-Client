"use client";

import { Avatar, Badge, Button } from "@/components/ui";
import { useMailStore } from "@/lib/store";
import type { Thread } from "@/lib/types";
import { cn, formatThreadTime, previewText } from "@/lib/utils";
import { Bell, Bookmark, Clock3, Layers, Trash2 } from "lucide-react";
import { deleteThreadSmart } from "@/lib/mail-delete";

export function ThreadRow({
  thread,
  compact,
  openBody,
}: {
  thread: Thread;
  compact?: boolean;
  openBody?: boolean;
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

  return (
    <article
      className={cn(
        "group relative border-b border-line bg-white transition hover:bg-soft/70",
        !thread.seen && "bg-[#f7f4ff]",
        selected && "ring-2 ring-inset ring-blurple/40",
        openBody && "animate-slide-up",
      )}
    >
      <button type="button" className="flex w-full gap-3 px-4 py-3.5 text-left" onClick={() => openThread(thread.id)}>
        <Avatar name={thread.contactName} color={contact?.avatarColor || "#5522FA"} size={compact ? 32 : 40} />
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
                {thread.notify ? <Bell className="h-3.5 w-3.5 text-blurple" /> : null}
                {thread.replyLater ? <Clock3 className="h-3.5 w-3.5 text-amber" /> : null}
                {thread.setAside ? <Bookmark className="h-3.5 w-3.5 text-em-blue" /> : null}
                {thread.bundled ? <Layers className="h-3.5 w-3.5 text-muted" /> : null}
                {!thread.seen ? <Badge tone="blurple">New</Badge> : null}
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
            <div
              className="prose-mail mt-3 rounded-xl bg-soft/80 p-4 text-sm text-ink"
              dangerouslySetInnerHTML={{ __html: last.bodyHtml }}
            />
          ) : null}
        </div>
      </button>
      <div className="absolute right-3 top-3 hidden gap-1 group-hover:flex">
        <Button size="sm" variant="soft" onClick={() => toggleMultiOpen(thread.id)} title="Open together">
          {selected ? "Selected" : "Multi"}
        </Button>
        <Button size="sm" variant="soft" onClick={() => toggleReplyLater(thread.id)}>
          Snooze
        </Button>
        <Button size="sm" variant="soft" onClick={() => toggleSetAside(thread.id)}>
          On Hold
        </Button>
        <Button
          size="sm"
          variant="danger"
          title={thread.box === "trash" || thread.box === "spam" ? "Delete forever" : "Move to Trash"}
          onClick={() => {
            void deleteThreadSmart(thread.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
  );
}
