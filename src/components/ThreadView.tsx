"use client";

import { Avatar, Badge, Button, Input, Textarea } from "@/components/ui";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { useHeyStore } from "@/lib/store";
import { formatBytes, relativeTime } from "@/lib/utils";
import { desktopApi } from "@/lib/desktop";
import { useEffect, useMemo, useState } from "react";

export function ThreadView() {
  const threadId = useHeyStore((s) => s.selectedThreadId);
  const threads = useHeyStore((s) => s.threads);
  const contacts = useHeyStore((s) => s.contacts);
  const workflows = useHeyStore((s) => s.workflows);
  const collections = useHeyStore((s) => s.collections);
  const getThreadMessages = useHeyStore((s) => s.getThreadMessages);
  const sendReply = useHeyStore((s) => s.sendReply);
  const toggleReplyLater = useHeyStore((s) => s.toggleReplyLater);
  const toggleSetAside = useHeyStore((s) => s.toggleSetAside);
  const setBubbleUp = useHeyStore((s) => s.setBubbleUp);
  const renameSubject = useHeyStore((s) => s.renameSubject);
  const unfollowThread = useHeyStore((s) => s.unfollowThread);
  const addStickyNote = useHeyStore((s) => s.addStickyNote);
  const addPrivateNote = useHeyStore((s) => s.addPrivateNote);
  const shareThread = useHeyStore((s) => s.shareThread);
  const clipText = useHeyStore((s) => s.clipText);
  const moveThread = useHeyStore((s) => s.moveThread);
  const setWorkflowStage = useHeyStore((s) => s.setWorkflowStage);
  const addToCollection = useHeyStore((s) => s.addToCollection);
  const createEventFromThread = useHeyStore((s) => s.createEventFromThread);
  const toggleThreadNotify = useHeyStore((s) => s.toggleThreadNotify);
  const toggleBundleContact = useHeyStore((s) => s.toggleBundleContact);
  const mergeThreads = useHeyStore((s) => s.mergeThreads);
  const setView = useHeyStore((s) => s.setView);
  const setToast = useHeyStore((s) => s.setToast);

  const [reply, setReply] = useState("");
  const [sticky, setSticky] = useState("");
  const [note, setNote] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [accountId, setAccountId] = useState("");
  const [sending, setSending] = useState(false);
  const [signatureId, setSignatureId] = useState("");
  const [requestReceipt, setRequestReceipt] = useState(true);
  const signatures = useHeyStore((s) => s.signatures || []);
  const settings = useHeyStore((s) => s.settings);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    void api.listAccounts().then((list) => {
      if (list[0]) setAccountId(list[0].id);
    });
  }, []);

  useEffect(() => {
    setSignatureId(settings.defaultSignatureId || "");
    setRequestReceipt(settings.requestReadReceiptsByDefault ?? true);
  }, [settings.defaultSignatureId, settings.requestReadReceiptsByDefault]);

  const thread = threads.find((t) => t.id === threadId);
  const messages = useMemo(
    () => (threadId ? getThreadMessages(threadId) : []),
    [threadId, getThreadMessages, threads],
  );

  if (!thread) {
    return (
      <div className="p-8 text-muted">
        Select a thread.{" "}
        <button type="button" className="text-blurple underline" onClick={() => setView("lesbox")}>
          Back to LesBox
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
          {thread.replyLater ? "Remove Reply Later" : "Reply Later"}
        </Button>
        <Button size="sm" variant="soft" onClick={() => toggleSetAside(thread.id)}>
          {thread.setAside ? "Unset Aside" : "Set Aside"}
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
          Bubble Up in 2 days
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
        <Button size="sm" variant="soft" onClick={() => unfollowThread(thread.id)}>
          Unfollow
        </Button>
        <Button size="sm" variant="soft" onClick={() => shareThread(thread.id)}>
          Share link
        </Button>
        <Button size="sm" variant="soft" onClick={() => createEventFromThread(thread.id)}>
          Create event
        </Button>
        <Button size="sm" variant="soft" onClick={() => moveThread(thread.id, "lesbox")}>
          → LesBox
        </Button>
        <Button size="sm" variant="soft" onClick={() => moveThread(thread.id, "feed")}>
          → Feed
        </Button>
        <Button size="sm" variant="soft" onClick={() => moveThread(thread.id, "paper_trail")}>
          → Paper Trail
        </Button>
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requestReceipt} onChange={(e) => setRequestReceipt(e.target.checked)} />
          Request read receipt
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={sending || !reply.trim()}
            onClick={async () => {
              setSending(true);
              try {
                const api = desktopApi();
                const sig = signatures.find((s) => s.id === signatureId) || signatures.find((s) => s.isDefault);
                const bodyHtml = `<p>${reply.replace(/\n/g, "<br/>")}</p>${
                  sig
                    ? `<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px">${sig.html}${
                        sig.imageDataUrl
                          ? `<div style="margin-top:8px"><img src="${sig.imageDataUrl}" alt="" style="max-height:72px"/></div>`
                          : ""
                      }</div>`
                    : ""
                }`;
                if (api && accountId) {
                  const result = await api.sendMail({
                    accountId,
                    to: thread.contactEmail,
                    subject: `Re: ${thread.customSubject || thread.subject}`,
                    text: reply,
                    html: bodyHtml,
                    requestReadReceipt: requestReceipt,
                  });
                  if (!result.ok) {
                    setToast(result.error || "SMTP send failed");
                    return;
                  }
                }
                sendReply(thread.id, reply);
                setReply("");
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? "Sending…" : accountId ? "Send reply via SMTP" : "Send reply"}
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              toggleReplyLater(thread.id);
              setView("focus_reply");
            }}
          >
            Focus & Reply queue
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
