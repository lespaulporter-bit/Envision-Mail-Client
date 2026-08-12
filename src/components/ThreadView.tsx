"use client";

import { Avatar, Badge, Button, Input, Textarea } from "@/components/ui";
import { AttachmentList } from "@/components/AttachmentList";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { MailHtml } from "@/components/MailHtml";
import { PriorEmailsPanel } from "@/components/PriorEmailsPanel";
import { RecipientSuggestInput } from "@/components/RecipientSuggestInput";
import { UnsubscribeButton } from "@/components/UnsubscribeButton";
import { threadBelongsToAccount } from "@/lib/account-scope";
import { resolveThreadBackView, useMailStore } from "@/lib/store";
import { tagLabel } from "@/lib/thread-tags";
import { cn, formatMailDateTime, previewText, relativeTime } from "@/lib/utils";
import { desktopApi, sendShortcutHint } from "@/lib/desktop";
import { brandForEmail, loadAccountBrands } from "@/lib/account-brands";
import {
  blockAllFromSenderSmart,
  permanentlyDeleteThread,
  restoreThreadFromTrash,
} from "@/lib/mail-delete";
import { useEffect, useMemo, useState } from "react";
import { bodyToHtml } from "@/lib/html-body";
import { boxLabel } from "@/lib/types";

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
  const removeFromWorkflow = useMailStore((s) => s.removeFromWorkflow);
  const addToCollection = useMailStore((s) => s.addToCollection);
  const removeFromCollection = useMailStore((s) => s.removeFromCollection);
  const createEventFromThread = useMailStore((s) => s.createEventFromThread);
  const scheduleMailReminder = useMailStore((s) => s.scheduleMailReminder);
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
  const [brandsTick, setBrandsTick] = useState(0);
  // Keyed "<threadId>:<messageId>" so switching threads restores default collapsing.
  const [collapseOverrides, setCollapseOverrides] = useState<Record<string, boolean>>({});
  const signatures = useMailStore((s) => s.signatures || []);
  const settings = useMailStore((s) => s.settings);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const threadReturnView = useMailStore((s) => s.threadReturnView);
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
    void loadAccountBrands(true).then(() => setBrandsTick((n) => n + 1));
  }, [thread?.accountId, inboxAccountId]);

  useEffect(() => {
    setSignatureId(settings.defaultSignatureId || "");
    setRequestReceipt(settings.requestReadReceiptsByDefault ?? true);
  }, [settings.defaultSignatureId, settings.requestReadReceiptsByDefault]);

  const storeMessages = useMailStore((s) => s.messages);
  const messages = useMemo(
    () => (threadId ? getThreadMessages(threadId) : []),
    [threadId, getThreadMessages, threads, storeMessages],
  );

  // Long threads open with only the newest message expanded, until the reader says otherwise.
  const defaultCollapsedIds = useMemo(
    () => (messages.length > 1 ? new Set(messages.slice(0, -1).map((m) => m.id)) : new Set<string>()),
    [messages],
  );
  const isCollapsed = (messageId: string) =>
    collapseOverrides[`${threadId}:${messageId}`] ?? defaultCollapsedIds.has(messageId);
  const setCollapsed = (messageId: string, collapsed: boolean) =>
    setCollapseOverrides((current) => ({ ...current, [`${threadId}:${messageId}`]: collapsed }));

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

  const contact = contacts.find((c) => c.email.toLowerCase() === thread.contactEmail.toLowerCase());
  const subject = thread.customSubject || thread.subject;
  const workflow = workflows.find((w) => w.id === thread.workflowId);
  const stage = workflow?.stages.find((s) => s.id === thread.workflowStageId);
  const threadCollections = collections.filter((c) => thread.collectionIds.includes(c.id));
  const mergeCandidates = threads.filter(
    (t) =>
      t.id !== thread.id &&
      t.contactEmail.toLowerCase() === thread.contactEmail.toLowerCase() &&
      t.box === thread.box &&
      threadBelongsToAccount(t, inboxAccountId || thread.accountId, storeMessages),
  );

  const sendViaSmtp = async () => {
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
      const { parseRecipientEmails } = await import("@/lib/recipient-suggest");
      const ccJoined = parseRecipientEmails(replyCc).join(", ") || undefined;
      const bccJoined = parseRecipientEmails(replyBcc).join(", ") || undefined;
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
          /auth|password|credentials|login|535|534|decrypt|safeStorage|re-enter/i.test(err)
            ? " — Settings → Accounts → paste a new app password → Save"
            : "";
        setToast(err + authHint);
        return;
      }
      setToast(requestReceipt ? "Reply sent · read receipt requested" : "Reply sent via SMTP");
      sendReply(thread.id, bodyText || " ");
      setReply("");
      setReplyCc("");
      setReplyBcc("");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "SMTP send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-in px-4 py-6 md:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView(resolveThreadBackView(thread.box, threadReturnView))}
        >
          ← Back
        </Button>
        <Badge tone="blurple">{boxLabel(thread.box)}</Badge>
        {(thread.tags || []).map((tag) => (
          <Badge key={tag} tone={tag === "muted" || tag === "on-hold" ? "salmon" : tag === "snoozed" ? "mint" : "soft"}>
            {tagLabel(tag)}
          </Badge>
        ))}
        {messages.length > 1 ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                const next: Record<string, boolean> = {};
                for (const m of messages) next[`${threadId}:${m.id}`] = false;
                setCollapseOverrides((current) => ({ ...current, ...next }));
              }}
            >
              Expand all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const next: Record<string, boolean> = {};
                for (const m of messages) next[`${threadId}:${m.id}`] = true;
                setCollapseOverrides((current) => ({ ...current, ...next }));
              }}
            >
              Collapse all
            </Button>
          </>
        ) : null}
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
        {workflow && stage ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-line">
            <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
            {workflow.name} · {stage.name}
          </p>
        ) : null}
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={thread.replyLater ? "primary" : "soft"}
          className={cn(thread.replyLater && "bg-teal text-white hover:bg-teal/90")}
          title={
            thread.replyLater
              ? "In Reply Queue — click to open the queue, or hold Shift and click to remove"
              : "Add this email to Reply Queue so you can knock out replies later"
          }
          onClick={(e) => {
            if (thread.replyLater && e.shiftKey) {
              toggleReplyLater(thread.id);
              setToast("Removed from Reply Queue");
              return;
            }
            if (!thread.replyLater) {
              toggleReplyLater(thread.id);
              setToast("Added to Reply Queue");
              return;
            }
            setView("focus_reply");
            setToast("Opening Reply Queue");
          }}
        >
          {thread.replyLater ? "In Reply Queue ✓" : "Reply Queue"}
        </Button>
        <Button
          size="sm"
          variant={thread.setAside ? "primary" : "soft"}
          className={cn(thread.setAside && "ring-2 ring-teal/30")}
          onClick={() => toggleSetAside(thread.id)}
        >
          {thread.setAside ? "On Hold ✓" : "On Hold"}
        </Button>
        <Button
          size="sm"
          variant={thread.bubbleUpAt ? "primary" : "soft"}
          onClick={() => {
            const at = new Date();
            at.setDate(at.getDate() + 2);
            setBubbleUp(thread.id, at.toISOString());
          }}
        >
          {thread.bubbleUpAt ? "Bumped ✓" : "Bump in 2 days"}
        </Button>
        <Button
          size="sm"
          variant="soft"
          disabled={!thread.bubbleUpAt}
          onClick={() => setBubbleUp(thread.id, null)}
        >
          Clear Bubble
        </Button>
        <Button
          size="sm"
          variant={thread.notify ? "primary" : "soft"}
          onClick={() => toggleThreadNotify(thread.id)}
        >
          {thread.notify ? "Notify on ✓" : "Notify me"}
        </Button>
        <Button size="sm" variant="soft" onClick={() => scheduleMailReminder(thread.id, 5)}>
          Remind 5 min
        </Button>
        <Button size="sm" variant="soft" onClick={() => scheduleMailReminder(thread.id, 15)}>
          Remind 15 min
        </Button>
        <Button size="sm" variant="soft" onClick={() => scheduleMailReminder(thread.id, 60)}>
          Remind 1 hr
        </Button>
        <Button
          size="sm"
          variant={contact?.bundled || thread.bundled ? "primary" : "soft"}
          onClick={() => toggleBundleContact(thread.contactEmail)}
        >
          {contact?.bundled || thread.bundled ? "Bundled ✓" : "Bundle sender"}
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
        <Button
          size="sm"
          variant={thread.muted ? "primary" : "soft"}
          onClick={() => muteThread(thread.id)}
        >
          {thread.muted ? "Muted ✓" : "Mute"}
        </Button>
        <UnsubscribeButton thread={thread} />
        {contact?.status === "blocked" ? (
          <Button
            size="sm"
            variant="primary"
            className="bg-emerald-700 text-white hover:bg-emerald-800"
            title="Undo block — allow this sender again and restore their Spam mail"
            onClick={() => {
              useMailStore.getState().unblockSender(thread.contactEmail, "lesbox");
            }}
          >
            Unblock sender
          </Button>
        ) : (
          <>
            {contact?.status !== "allowed" ||
            thread.box === "feed" ||
            thread.box === "screener" ? (
              <Button
                size="sm"
                onClick={() => {
                  useMailStore.getState().screenContact(thread.contactEmail, "allow", "lesbox");
                }}
                title="This sender’s mail goes to MoneyBox $ forever"
              >
                Allow → MoneyBox $
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="soft"
              title="Block this sender forever — future mail goes to Spam (you can Unblock later)"
              onClick={() => {
                void blockAllFromSenderSmart(thread.contactEmail);
              }}
            >
              Block forever
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant={thread.shareToken ? "primary" : "soft"}
          onClick={() => shareThread(thread.id)}
        >
          {thread.shareToken ? "Link shared ✓" : "Share link"}
        </Button>
        <Button size="sm" variant="soft" onClick={() => createEventFromThread(thread.id)}>
          Create event
        </Button>
        <Button size="sm" variant="soft" onClick={() => moveThread(thread.id, "lesbox")}>
          → MoneyBox $
        </Button>
        <Button size="sm" variant="soft" onClick={() => moveThread(thread.id, "feed")}>
          → Screening
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
          <>
            <Button
              size="sm"
              variant="danger"
              disabled={deleting}
              onClick={() => {
                void (async () => {
                  setDeleting(true);
                  try {
                    const { moveThreadToTrashSmart } = await import("@/lib/mail-delete");
                    await moveThreadToTrashSmart(thread.id);
                  } finally {
                    setDeleting(false);
                  }
                })();
              }}
            >
              Move to Trash
            </Button>
            {thread.box === "spam" ? (
              <Button
                size="sm"
                variant="soft"
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
            ) : null}
          </>
        )}
      </div>

      {(workflows.length > 0 || collections.length > 0 || mergeCandidates.length > 0) && (
        <div className="mb-6 grid gap-3 rounded-2xl border border-line bg-soft/50 p-4 md:grid-cols-3">
          {workflows.length ? (
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Pipeline stage
              <select
                className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm normal-case"
                value={workflow && thread.workflowStageId ? `${workflow.id}:${thread.workflowStageId}` : ""}
                onChange={(e) => {
                  const [workflowId, stageId] = e.target.value.split(":");
                  if (workflowId && stageId) setWorkflowStage(thread.id, workflowId, stageId);
                  else removeFromWorkflow(thread.id);
                }}
              >
                <option value="">Not in a pipeline</option>
                {workflows.map((wf) => (
                  <optgroup key={wf.id} label={wf.name}>
                    {wf.stages.map((s) => (
                      <option key={s.id} value={`${wf.id}:${s.id}`}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">
            Add to collection
            <select
              className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm normal-case"
              value=""
              onChange={(e) => {
                if (e.target.value) addToCollection(thread.id, e.target.value);
              }}
            >
              <option value="">{collections.length ? "Choose…" : "Create one in Collections first"}</option>
              {collections
                .filter((c) => !thread.collectionIds.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            {threadCollections.length ? (
              <span className="mt-2 flex flex-wrap gap-1 normal-case">
                {threadCollections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title="Remove from this collection"
                    onClick={() => removeFromCollection(thread.id, c.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink ring-1 ring-line hover:text-salmon"
                  >
                    {c.name} ×
                  </button>
                ))}
              </span>
            ) : null}
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
              {(() => {
                // brandsTick forces re-render after account logos load
                void brandsTick;
                const accountBrand = brandForEmail(m.from) || (m.isOutgoing ? brandForEmail(settings.email) : null);
                const fromContact = contacts.find((c) => c.email.toLowerCase() === String(m.from || "").toLowerCase());
                const imageUrl =
                  accountBrand?.brandLogoDataUrl ||
                  fromContact?.avatarImageDataUrl ||
                  (!m.isOutgoing ? contact?.avatarImageDataUrl : null) ||
                  null;
                return (
                  <Avatar
                    name={m.fromName}
                    color={accountBrand?.brandColor || fromContact?.avatarColor || contact?.avatarColor || "#0d9488"}
                    letter={accountBrand?.brandLetter || undefined}
                    imageUrl={imageUrl}
                    size={34}
                  />
                );
              })()}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{m.fromName}</div>
                <div className="text-xs text-muted" title={relativeTime(m.sentAt)}>
                  {m.from} · {formatMailDateTime(m.sentAt)}
                </div>
                {(m.to?.length || m.cc?.length || (m.bcc && m.bcc.length)) ? (
                  <div className="mt-0.5 text-[11px] text-muted">
                    {m.to?.length ? <span>To: {m.to.join(", ")} </span> : null}
                    {m.cc?.length ? <span>· Cc: {m.cc.join(", ")} </span> : null}
                    {m.bcc && m.bcc.length ? <span>· Bcc: {m.bcc.join(", ")}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {m.trackersBlocked.length > 0 ? (
                  <Badge tone="salmon">
                    {m.trackersBlocked.length} tracker{m.trackersBlocked.length > 1 ? "s" : ""} blocked
                  </Badge>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCollapsed(m.id, !isCollapsed(m.id))}
                  aria-expanded={!isCollapsed(m.id)}
                >
                  {isCollapsed(m.id) ? "Expand" : "Collapse"}
                </Button>
              </div>
            </div>
            {!isCollapsed(m.id) ? (
              <>
                <MailHtml className="text-[15px]" html={m.bodyHtml} />
                <AttachmentList
                  className="mt-4"
                  attachments={m.attachments}
                  accountId={thread.accountId || accountId || inboxAccountId}
                  renderExtraActions={(a) => (
                    <Button size="sm" variant="ghost" onClick={() => clipText(thread.id, subject, a.name)}>
                      Clip name
                    </Button>
                  )}
                />
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
              </>
            ) : (
              <button
                type="button"
                className="w-full rounded-xl bg-soft px-3 py-2 text-left text-sm text-ink"
                onClick={() => setCollapsed(m.id, false)}
              >
                <p className="line-clamp-3 whitespace-pre-wrap">
                  {previewText(m.bodyHtml || m.bodyText || "", 220)}
                </p>
                {m.attachments.length > 0 ? (
                  <span className="mt-1 block text-xs text-muted">
                    📎 {m.attachments.length} attachment{m.attachments.length > 1 ? "s" : ""}
                  </span>
                ) : null}
                <span className="mt-1 inline-block text-xs font-medium text-teal">Expand</span>
              </button>
            )}
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

      <PriorEmailsPanel thread={thread} />

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
          placeholder={`Write a reply… (${sendShortcutHint()})`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void sendViaSmtp();
            }
          }}
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
            <RecipientSuggestInput
              label="Cc"
              placeholder="Cc — paste comma-separated addresses"
              value={replyCc}
              onChange={setReplyCc}
            />
            <RecipientSuggestInput
              label="Bcc"
              placeholder="Bcc — paste comma-separated addresses"
              value={replyBcc}
              onChange={setReplyBcc}
            />
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requestReceipt} onChange={(e) => setRequestReceipt(e.target.checked)} />
          Request read receipt
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={sending} onClick={() => void sendViaSmtp()}>
            {sending ? "Sending…" : "Send via SMTP"}
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              if (!thread.replyLater) toggleReplyLater(thread.id);
              setView("focus_reply");
            }}
            title="Add to Reply Queue and open it"
          >
            {thread.replyLater ? "Open Reply Queue" : "Add to Reply Queue"}
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
