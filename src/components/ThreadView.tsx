"use client";

import { Avatar, Badge, Button, Input, Textarea } from "@/components/ui";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { useMailStore } from "@/lib/store";
import { formatBytes, relativeTime } from "@/lib/utils";
import { desktopApi } from "@/lib/desktop";
import {
  deleteThreadSmart,
  permanentlyDeleteThread,
  restoreThreadFromTrash,
} from "@/lib/mail-delete";
import { useEffect, useMemo, useState } from "react";
import { bodyToHtml } from "@/lib/html-body";

export function ThreadView() {
  const threadId = useMailStore((s) => s.selectedThreadId);
  const threads = useMailStore((s) => s.threads);
  const contacts = useMailStore((s) => s.contacts);
  const workflows = useMailStore((s) => s.workflows);
  const collections = useMailStore((s) => s.collections);
  const getThreadMessages = useMailStore((s) => s.getThreadMessages);
  const sendReply = useMailStore((s) => s.sendReply);
  const toggleReplyLater = useMailStore((s) => s.toggleReplyLater);
  const toggleSetAside = useMailStore((s) => s.toggleSetAside);
  const setBubbleUp = useMailStore((s) => s.setBubbleUp);
  const renameSubject = useMailStore((s) => s.renameSubject);
  const muteThread = useMailStore((s) => s.muteThread);
  const addStickyNote = useMailStore((s) => s.addStickyNote);
  const addPrivateNote = useMailStore((s) => s.addPrivateNote);
  const shareThread = useMailStore((s) => s.shareThread);
  const clipText = useMailStore((s) => s.clipText);
  const moveThread = useMailStore((s) => s.moveThread);
  const setWorkflowStage = useMailStore((s) => s.setWorkflowStage);
  const addToCollection = useMailStore((s) => s.addToCollection);
  const createEventFromThread = useMailStore((s) => s.createEventFromThread);
  const toggleThreadNotify = useMailStore((s) => s.toggleThreadNotify);
  const toggleBundleContact = useMailStore((s) => s.toggleBundleContact);
  const mergeThreads = useMailStore((s) => s.mergeThreads);
  const setView = useMailStore((s) => s.setView);
  const setToast = useMailStore((s) => s.setToast);

  const [reply, setReply] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [replyBcc, setReplyBcc] = useState("");
  const [showReplyCcBcc, setShowReplyCcBcc] = useState(false);
  const [sticky, setSticky] = useState("");
  const [note, setNote] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [accountId, setAccountId] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signatureId, setSignatureId] = useState("");
  const [requestReceipt, setRequestReceipt] = useState(true);
  const signatures = useMailStore((s) => s.signatures || []);
  const settings = useMailStore((s) => s.settings);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const thread = threads.find((t) => t.id === threadId);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    void api.listAccounts().then((list) => {
      const threadAccountId = thread?.accountId;
      const preferred =
        threadAccountId && list.some((a) => a.id === threadAccountId)
          ? threadAccountId
          : inboxAccountId && list.some((a) => a.id === inboxAccountId)
            ? inboxAccountId
            : list[0]?.id || "";
      if (preferred) setAccountId(preferred);
    });
  }, [thread?.accountId, inboxAccountId]);

  useEffect(() => {
    setSignatureId(settings.defaultSignatureId || "");
    setRequestReceipt(settings.requestReadReceiptsByDefault ?? true);
  }, [settings.defaultSignatureId, settings.requestReadReceiptsByDefault]);

  const messages = useMemo(
    () => (threadId ? getThreadMessages(threadId) : []),
    [threadId, getThreadMessages, threads],
  );

  if (!thread) {
    return (
      <div className="p-8 text-muted">
        Select a thread.{" "}
        <button type="button" className="text-blurple underline" onClick={() => setView("lesbox")}>
          Back to MoneyBox $
        </button>
      </div>
    );
  }

  const contact = contacts.find((c) => c.email === thread.contactEmail);
  const subject = thread.customSubject || thread.subject;
  const workflow = workflows.find((w) => w.id === thread.workflowId);
  const mergeCandidates = threads.filter(
    (t) => t.id !== thread.id && t.contactEmail === thread.contactEmail && t.box === thread.box,
  );

  return (
    <div className="mx-auto max-w-3xl animate-fade-in px-4 py-6 md:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setView(thread.box === "feed" ? "feed" : thread.box === "paper_trail" ? "paper_trail" : "lesbox")}>
          ← Back
        </Button>
        <Badge tone="blurple">{thread.box.replace("_", " ")}</Badge>
        {thread.notify ? <Badge tone="salmon">Notify on</Badge> : null}
      </div>

      <header className="mb-6">
        {renaming ? (
          <div className="flex gap-2">
            <Input value={subjectDraft} onChange={(e) => setSubjectDraft(e.target.value)} />
            <Button
              onClick={() => {
                renameSubject(thread.id, subjectDraft.trim() || subject);
                setRenaming(false);
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <h1 className="font-display text-3xl tracking-tight">{subject}</h1>
        )}
        <p className="mt-2 text-sm text-muted">
          {thread.contactName} · {thread.contactEmail}
          {thread.customSubject ? ` · original: “${thread.subject}”` : ""}
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button size="sm" variant="soft" onClick={() => toggleReplyLater(thread.id)}>
          {thread.replyLater ? "Remove Snooze" : "Snooze"}
        </Button>
        <Button size="sm" variant="soft" onClick={() => toggleSetAside(thread.id)}>
          {thread.setAside ? "Remove Hold" : "On Hold"}
        </Button>
        <Button
          size="sm"
          variant="soft"
          onClick={() => {
            const at = new Date();
            at.setDate(at.getDate() + 2);
            setBubbleUp(thread.id, at.toISOString());
          }}
        >
          Bump in 2 days
        </Button>
        <Button size="sm" variant="soft" onClick={() => setBubbleUp(thread.id, null)}>
          Clear Bubble
        </Button>
        <Button size="sm" variant="soft" onClick={() => toggleThreadNotify(thread.id)}>
          {thread.notify ? "Mute notify" : "Notify me"}
        </Button>
        <Button size="sm" variant="soft" onClick={() => toggleBundleContact(thread.contactEmail)}>
          {contact?.bundled ? "Unbundle sender" : "Bundle sender"}
        </Button>
        <Button
          size="sm"
          variant="soft"
          onClick={() => {
            setSubjectDraft(subject);
            setRenaming(true);
          }}
        >
          Rename subject
        </Button>
        <Button size="sm" variant="soft" onClick={() => muteThread(thread.id)}>
          Mute
        </Button>
        <Button size="sm" variant="soft" onClick={() => shareThread(thread.id)}>
          Share link
        </Button>
        <Button size="sm" variant="soft" onClick={() => createEventFromThread(thread.id)}>
          Create event
        </Button>
        <Button size="sm" variant="soft" onClick={() => moveThread(thread.id, "lesbox")}>
          → MoneyBox $
        </Button>
        <Button size="sm" variant="soft" onClick={() => moveThread(thread.id, "feed")}>
          → Feed
        </Button>
        <Button size="sm" variant="soft" onClick={() => moveThread(thread.id, "paper_trail")}>
          → Receipts
        </Button>
        {thread.box === "trash" ? (
          <>
            <Button
              size="sm"
              variant="soft"
              disabled={deleting}
              onClick={() => {
                void restoreThreadFromTrash(thread.id);
              }}
            >
              Restore
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={deleting}
              onClick={() => {
                void (async () => {
                  setDeleting(true);
                  try {
                    await permanentlyDeleteThread(thread.id);
                  } finally {
                    setDeleting(false);
                  }
                })();
              }}
            >
              Delete forever
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="danger"
            disabled={deleting}
            onClick={() => {
              void (async () => {
                setDeleting(true);
                try {
                  await deleteThreadSmart(thread.id);
                } finally {
                  setDeleting(false);
                }
              })();
            }}
          >
            {thread.box === "spam" ? "Delete forever" : "Delete"}
          </Button>
        )}
      </div>

      {(workflow || collections.length > 0 || mergeCandidates.length > 0) && (
        <div className="mb-6 grid gap-3 rounded-2xl border border-line bg-soft/50 p-4 md:grid-cols-3">
          {workflow ? (
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Workflow stage
              <select
                className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm normal-case"
                value={thread.workflowStageId || ""}
                onChange={(e) => setWorkflowStage(thread.id, workflow.id, e.target.value)}
              >
                {workflow.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">
            Add to collection
            <select
              className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm normal-case"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addToCollection(thread.id, e.target.value);
              }}
            >
              <option value="">Choose…</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {mergeCandidates.length ? (
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Merge with
              <select
                className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm normal-case"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) mergeThreads(thread.id, e.target.value);
                }}
              >
                <option value="">Choose thread…</option>
                {mergeCandidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.customSubject || t.subject}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      )}

      {thread.stickyNotes.length > 0 && (
        <div className="mb-4 space-y-2">
          {thread.stickyNotes.map((n) => (
            <div key={n.id} className="rounded-xl bg-[#fff6a5] px-4 py-3 text-sm shadow-sm">
              📌 {n.text}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {messages.map((m) => (
          <article
            key={m.id}
            className={`rounded-2xl border border-line p-5 ${m.isOutgoing ? "ml-8 bg-soft/80" : "bg-white"}`}
          >
            <div className="mb-3 flex items-center gap-3">
              <Avatar name={m.fromName} color={contact?.avatarColor || "#5522FA"} size={34} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{m.fromName}</div>
                <div className="text-xs text-muted">
                  {m.from} · {relativeTime(m.sentAt)}
                </div>
                {(m.to?.length || m.cc?.length || (m.bcc && m.bcc.length)) ? (
                  <div className="mt-0.5 text-[11px] text-muted">
                    {m.to?.length ? <span>To: {m.to.join(", ")} </span> : null}
                    {m.cc?.length ? <span>· Cc: {m.cc.join(", ")} </span> : null}
                    {m.bcc && m.bcc.length ? <span>· Bcc: {m.bcc.join(", ")}</span> : null}
                  </div>
                ) : null}
              </div>
              {m.trackersBlocked.length > 0 ? (
                <Badge tone="salmon">{m.trackersBlocked.length} tracker{m.trackersBlocked.length > 1 ? "s" : ""} blocked</Badge>
              ) : null}
            </div>
            <div className="prose-mail text-[15px]" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
            {m.attachments.length > 0 && (
              <ul className="mt-4 space-y-2">
                {m.attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-lg bg-soft px-3 py-2 text-sm">
                    <span>
                      📎 {a.name} <span className="text-muted">({formatBytes(a.size)})</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => clipText(thread.id, subject, a.name)}
                    >
                      Clip name
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {m.isOutgoing && m.requestReadReceipt ? (
              <div className="mt-3 rounded-lg bg-[#f7f4ff] px-3 py-2 text-xs text-blurple">
                {m.readReceipts?.length
                  ? `Read by ${m.readReceipts.map((r) => r.readerName || r.readerEmail).join(", ")}`
                  : "Read receipt requested — waiting…"}
              </div>
            ) : null}
            {m.isOutgoing && (m.readReceipts?.length || 0) > 0 && !m.requestReadReceipt ? (
              <div className="mt-3 rounded-lg bg-mint/10 px-3 py-2 text-xs text-mint">
                Read by {m.readReceipts!.map((r) => r.readerName || r.readerEmail).join(", ")}
              </div>
            ) : null}
            <div className="mt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const sel = window.getSelection()?.toString().trim();
                  if (sel) clipText(thread.id, subject, sel);
                  else clipText(thread.id, subject, m.bodyText.slice(0, 80));
                }}
              >
                Clip selection / snippet
              </Button>
            </div>
          </article>
        ))}
      </div>

      {thread.privateNotes.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Private notes</h3>
          {thread.privateNotes.map((n) => (
            <div key={n.id} className="rounded-xl border border-dashed border-line bg-soft px-4 py-3 text-sm">
              {n.text}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-4 rounded-2xl border border-line bg-white p-5">
        <EmailTemplatePickers
          showSubjectTemplates={false}
          onInsertBody={(text, mode) =>
            setReply((r) => (mode === "replace" ? text : r ? `${r}\n\n${text}` : text))
          }
        />
        {signatures.length > 0 ? (
          <label className="block text-sm">
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
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Textarea
          rows={5}
          placeholder="Write a reply…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="soft" onClick={() => setShowReplyCcBcc((v) => !v)}>
            {showReplyCcBcc ? "Hide Cc/Bcc" : "Cc / Bcc"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              const last = messages[messages.length - 1];
              const own = (settings.email || "").toLowerCase();
              const extras = [
                ...(last?.to || []),
                ...(last?.cc || []),
              ]
                .map((e) => e.trim())
                .filter((e) => e.includes("@") && e.toLowerCase() !== own && e.toLowerCase() !== thread.contactEmail.toLowerCase());
              setReplyCc([...new Set(extras)].join(", "));
              setShowReplyCcBcc(true);
            }}
          >
            Reply all (fill Cc)
          </Button>
        </div>
        {showReplyCcBcc ? (
          <div className="space-y-2">
            <Input
              placeholder="Cc (comma-separated)"
              value={replyCc}
              onChange={(e) => setReplyCc(e.target.value)}
            />
            <Input
              placeholder="Bcc (comma-separated)"
              value={replyBcc}
              onChange={(e) => setReplyBcc(e.target.value)}
            />
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requestReceipt} onChange={(e) => setRequestReceipt(e.target.checked)} />
          Request read receipt
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={sending}
            onClick={async () => {
              if (sending) return;
              setSending(true);
              try {
                const api = desktopApi();
                const sig = signatures.find((s) => s.id === signatureId) || signatures.find((s) => s.isDefault);
                const bodyText = reply.trim();
                if (!bodyText && !sig?.html) {
                  setToast("Write a reply or choose a signature");
                  return;
                }
                const bodyHtml = `${bodyText ? bodyToHtml(bodyText) : ""}${
                  sig
                    ? `<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px">${sig.html}${
                        sig.imageDataUrl
                          ? `<div style="margin-top:8px"><img src="${sig.imageDataUrl}" alt="" style="max-height:72px"/></div>`
                          : ""
                      }</div>`
                    : ""
                }`;
                const parseAddrs = (raw: string) =>
                  String(raw || "")
                    .split(/[,;]+/)
                    .map((s) => s.trim())
                    .filter((s) => s.includes("@"));
                const ccJoined = parseAddrs(replyCc).join(", ") || undefined;
                const bccJoined = parseAddrs(replyBcc).join(", ") || undefined;
                const sendAccountId = accountId || inboxAccountId || thread.accountId || "";
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
                  to: thread.contactEmail,
                  cc: ccJoined,
                  bcc: bccJoined,
                  subject: `Re: ${thread.customSubject || thread.subject}`,
                  text: bodyText || "(see HTML signature)",
                  html: bodyHtml,
                  requestReadReceipt: requestReceipt,
                });
                if (!result.ok) {
                  const err = result.error || "SMTP send failed";
                  const authHint =
                    /auth|password|credentials|login|535|534/i.test(err)
                      ? " — re-enter your app password in Settings → Accounts"
                      : "";
                  setToast(err + authHint);
                  return;
                }
                setToast(
                  requestReceipt
                    ? "Reply sent · read receipt requested"
                    : "Reply sent via SMTP",
                );
                sendReply(thread.id, bodyText || " ");
                setReply("");
                setReplyCc("");
                setReplyBcc("");
              } catch (err) {
                setToast(err instanceof Error ? err.message : "SMTP send failed");
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? "Sending…" : "Send via SMTP"}
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              toggleReplyLater(thread.id);
              setView("focus_reply");
            }}
          >
            Reply Queue queue
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-line p-4">
          <h4 className="mb-2 text-sm font-semibold">Sticky note</h4>
          <div className="flex gap-2">
            <Input value={sticky} onChange={(e) => setSticky(e.target.value)} placeholder="Phone, link, reminder…" />
            <Button
              variant="soft"
              onClick={() => {
                if (sticky.trim()) {
                  addStickyNote(thread.id, sticky.trim());
                  setSticky("");
                }
              }}
            >
              Add
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <h4 className="mb-2 text-sm font-semibold">Private note</h4>
          <div className="flex gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes from a call…" />
            <Button
              variant="soft"
              onClick={() => {
                if (note.trim()) {
                  addPrivateNote(thread.id, note.trim());
                  setNote("");
                }
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
