"use client";

import { Avatar, Button } from "@/components/ui";
import { MailHtml } from "@/components/MailHtml";
import { threadBelongsToAccount } from "@/lib/account-scope";
import { desktopApi } from "@/lib/desktop";
import { bodyToHtml, scrubComposerBody } from "@/lib/html-body";
import { replyThreadingHeaders } from "@/lib/reply-headers";
import { useMailStore } from "@/lib/store";
import type { Thread } from "@/lib/types";
import { cn, formatThreadTime, formatMailDateTime, previewText, relativeTime } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  thread: Thread;
};

/** Other conversations from the same person — expand to read / reply / merge. */
export function PriorEmailsPanel({ thread }: Props) {
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const contacts = useMailStore((s) => s.contacts);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const getThreadMessages = useMailStore((s) => s.getThreadMessages);
  const openThread = useMailStore((s) => s.openThread);
  const mergeThreads = useMailStore((s) => s.mergeThreads);
  const sendReply = useMailStore((s) => s.sendReply);
  const setToast = useMailStore((s) => s.setToast);
  const settings = useMailStore((s) => s.settings);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const prior = useMemo(() => {
    const email = thread.contactEmail.toLowerCase();
    const account = inboxAccountId || thread.accountId;
    return threads
      .filter((t) => {
        if (t.id === thread.id) return false;
        if (t.contactEmail.toLowerCase() !== email) return false;
        if (t.box === "spam" || t.box === "trash") return false;
        if (!threadBelongsToAccount(t, account, messages)) return false;
        return true;
      })
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .slice(0, 15);
  }, [threads, thread, inboxAccountId, messages]);

  if (prior.length === 0) return null;

  const contact = contacts.find((c) => c.email.toLowerCase() === thread.contactEmail.toLowerCase());

  return (
    <section className="mt-8 rounded-2xl border border-line bg-[#f7fbf9] p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-display text-lg text-ink">Previous emails from {thread.contactName}</h3>
          <p className="text-xs text-muted">
            {prior.length} other conversation{prior.length === 1 ? "" : "s"} — expand to read, reply, or link into this
            thread.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {prior.map((t) => {
          const msgs = getThreadMessages(t.id);
          const last = msgs[msgs.length - 1];
          const isOpen = Boolean(expanded[t.id]);
          const subject = t.customSubject || t.subject;
          const preview = last
            ? previewText(last.bodyHtml || last.bodyText || "", 160)
            : "No message body";

          return (
            <li key={t.id} className="overflow-hidden rounded-xl border border-line bg-white">
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-soft/60"
                onClick={() => setExpanded((m) => ({ ...m, [t.id]: !m[t.id] }))}
                aria-expanded={isOpen}
              >
                <span className="mt-1 text-muted">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
                <Avatar
                  name={t.contactName}
                  color={contact?.avatarColor || "#0d9488"}
                  imageUrl={contact?.avatarImageDataUrl || null}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={cn("truncate text-sm", t.seen ? "font-medium" : "font-semibold")}>
                        {subject}
                      </div>
                      <div className="text-[11px] text-muted">
                        {msgs.length} message{msgs.length === 1 ? "" : "s"}
                        {!t.seen ? " · unread" : ""}
                      </div>
                    </div>
                    <time className="shrink-0 text-xs text-muted">{formatThreadTime(t.updatedAt)}</time>
                  </div>
                  {!isOpen ? <p className="mt-1 line-clamp-2 text-sm text-muted">{preview}</p> : null}
                </div>
              </button>

              {isOpen ? (
                <div className="border-t border-line px-3 py-3">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="soft" onClick={() => openThread(t.id)}>
                      Open full thread
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => {
                        mergeThreads(thread.id, t.id);
                        setToast("Linked into this conversation");
                      }}
                    >
                      Link into this conversation
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReplyOpen((m) => ({ ...m, [t.id]: !m[t.id] }))}
                    >
                      {replyOpen[t.id] ? "Hide reply" : "Reply here"}
                    </Button>
                  </div>

                  <div className="max-h-80 space-y-3 overflow-y-auto">
                    {msgs.map((m) => (
                      <article
                        key={m.id}
                        className={cn(
                          "rounded-lg border border-line/80 p-3",
                          m.isOutgoing ? "ml-4 bg-soft/70" : "bg-white",
                        )}
                      >
                        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
                          <span className="font-medium text-ink">{m.fromName}</span>
                          <span title={relativeTime(m.sentAt)}>{formatMailDateTime(m.sentAt)}</span>
                        </div>
                        <MailHtml className="text-sm" html={m.bodyHtml} />
                      </article>
                    ))}
                  </div>

                  {replyOpen[t.id] ? (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void (async () => {
                          const body = (replyDrafts[t.id] || "").trim();
                          if (!body) {
                            setToast("Write a reply first");
                            return;
                          }
                          if (sendingId) return;
                          const api = desktopApi();
                          if (!api) {
                            setToast("Open the Envision Mail desktop app to send via SMTP");
                            return;
                          }
                          const sendAccountId = inboxAccountId || t.accountId || "";
                          if (!sendAccountId) {
                            setToast("Select an account before sending");
                            return;
                          }
                          setSendingId(t.id);
                          try {
                            const bodyHtml = bodyToHtml(scrubComposerBody(body));
                            const result = await api.sendMail({
                              accountId: sendAccountId,
                              to: t.contactEmail,
                              subject: `Re: ${t.customSubject || t.subject}`,
                              text: body,
                              html: bodyHtml,
                              ...replyThreadingHeaders(getThreadMessages(t.id)),
                            });
                            if (!result.ok) {
                              setToast(result.error || "Send failed");
                              return;
                            }
                            sendReply(t.id, body, {
                              fromEmail: t.accountEmail || settings.email,
                              fromName: settings.displayName,
                              smtpMessageId: result.messageId,
                              bodyHtml,
                            });
                            setReplyDrafts((m) => ({ ...m, [t.id]: "" }));
                            setReplyOpen((m) => ({ ...m, [t.id]: false }));
                            setToast("Reply sent");
                          } catch (err) {
                            setToast(err instanceof Error ? err.message : "Send failed");
                          } finally {
                            setSendingId(null);
                          }
                        })();
                      }}
                    >
                      <textarea
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-teal"
                        rows={3}
                        placeholder={`Reply to ${t.contactName}…`}
                        value={replyDrafts[t.id] || ""}
                        onChange={(e) => setReplyDrafts((m) => ({ ...m, [t.id]: e.target.value }))}
                      />
                      <Button type="submit" size="sm" disabled={sendingId === t.id}>
                        {sendingId === t.id ? "Sending…" : "Send reply"}
                      </Button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
