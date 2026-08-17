"use client";

import { Avatar, Badge, Button, EmptyState, Input, SectionHeader, Textarea } from "@/components/ui";
import { AttachmentList } from "@/components/AttachmentList";
import { BrandLogo } from "@/components/BrandLogo";
import { LinkifiedText } from "@/components/MeetingLink";
import { bodyToHtml, looksLikeHtmlDump, scrubComposerBody, signatureHtmlBlock } from "@/lib/html-body";
import { AccountsPanel } from "@/components/AccountsPanel";
import { SignaturesPanel } from "@/components/SignaturesPanel";
import { EmailTemplatesPanel } from "@/components/EmailTemplatesPanel";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { ComposeAttachments } from "@/components/ComposeAttachments";
import { RecipientSuggestInput } from "@/components/RecipientSuggestInput";
import type { DraftAttachment } from "@/lib/compose-attachments";
import { toSendAttachments } from "@/lib/compose-attachments";
import { parseRecipientEmails } from "@/lib/recipient-suggest";
import { desktopApi, sendShortcutHint, thisComputerLabel } from "@/lib/desktop";
import { useAccountScoped } from "@/lib/use-account-scoped";
import { asArray } from "@/lib/stable-empty";
import { selectAccountThreads, selectDockThreads, useMailStore } from "@/lib/store";
import { clipBelongsToAccount } from "@/lib/account-scope";
import { blockAllFromSenderSmart } from "@/lib/mail-delete";
import { CALENDAR_TIMEZONE_OPTIONS, localTimezoneId } from "@/lib/timezones";
import { formatThreadTime } from "@/lib/utils";
import type { Thread } from "@/lib/types";
import { boxLabel } from "@/lib/types";
import { useMemo, useState, useEffect } from "react";

function TimezoneOptions() {
  const local = localTimezoneId();
  const hasLocal = CALENDAR_TIMEZONE_OPTIONS.some((z) => z.id === local);
  return (
    <>
      {!hasLocal ? <option value={local}>Local · {local}</option> : null}
      {CALENDAR_TIMEZONE_OPTIONS.map((z) => (
        <option key={z.id} value={z.id}>
          {z.label}
          {z.id === local ? " (local)" : ""} — {z.short}
        </option>
      ))}
    </>
  );
}

export function ContactsView() {
  const contacts = useMailStore((s) => s.contacts);
  const updateContactNotes = useMailStore((s) => s.updateContactNotes);
  const updateContactNotify = useMailStore((s) => s.updateContactNotify);
  const openThread = useMailStore((s) => s.openThread);
  const threads = useMailStore((s) => s.threads);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const messages = useMailStore((s) => s.messages);
  const scopedThreads = useMemo(
    () => selectAccountThreads(threads, inboxAccountId, messages),
    [threads, inboxAccountId, messages],
  );
  const scopedContacts = useMemo(() => {
    if (!inboxAccountId) return contacts;
    const emails = new Set(scopedThreads.map((t) => t.contactEmail.toLowerCase()));
    return contacts.filter((c) => emails.has(c.email.toLowerCase()));
  }, [contacts, scopedThreads, inboxAccountId]);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!scopedContacts.some((c) => c.id === selected)) {
      setSelected(scopedContacts[0]?.id || "");
    }
  }, [scopedContacts, selected]);
  const contact = scopedContacts.find((c) => c.id === selected);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Contacts"
        subtitle="People from this account only. Switch accounts in the sidebar to see another set."
      />
      {scopedContacts.length === 0 ? (
        <EmptyState title="No contacts for this account" body="Sync mail or allow senders from New Senders." />
      ) : (
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {scopedContacts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c.id)}
              className={`flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left hover:bg-soft ${selected === c.id ? "bg-[#e6f7f3]" : ""}`}
            >
              <Avatar
                name={c.name}
                color={c.avatarColor}
                imageUrl={c.avatarImageDataUrl || null}
                size={34}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="truncate text-xs text-muted">{c.status} · {c.defaultBox}</div>
              </div>
            </button>
          ))}
        </div>
        {contact ? (
          <div className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-4 flex items-center gap-3">
              <Avatar
                name={contact.name}
                color={contact.avatarColor}
                imageUrl={contact.avatarImageDataUrl || null}
                size={48}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold">{contact.name}</h2>
                <p className="text-sm text-muted">{contact.email}</p>
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-teal">
                  <span className="font-medium underline">
                    {contact.avatarImageDataUrl ? "Change photo / logo" : "Upload photo / logo"}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 400_000) {
                        useMailStore.getState().setToast("Image too large — use one under ~400KB");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        useMailStore
                          .getState()
                          .updateContactAvatar(contact.id, String(reader.result || "") || null);
                        useMailStore.getState().setToast("Contact photo saved");
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {contact.avatarImageDataUrl ? (
                  <button
                    type="button"
                    className="ml-3 text-xs text-muted underline"
                    onClick={() => useMailStore.getState().updateContactAvatar(contact.id, null)}
                  >
                    Use initials
                  </button>
                ) : null}
              </div>
            </div>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={contact.notify}
                onChange={(e) => updateContactNotify(contact.id, e.target.checked)}
              />
              Loud notifications for this contact
            </label>
            {contact.status === "blocked" ? (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-salmon/40 bg-[#fff1ed] px-3 py-2.5">
                <p className="flex-1 text-sm text-ink">
                  <span className="font-semibold text-salmon">Blocked forever</span> — their mail goes to Spam.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    useMailStore.getState().unblockSender(contact.email, "lesbox");
                  }}
                >
                  Unblock
                </Button>
              </div>
            ) : (
              <div className="mb-4">
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => {
                    void blockAllFromSenderSmart(contact.email);
                  }}
                >
                  Block forever
                </Button>
              </div>
            )}
            <h3 className="mb-2 text-sm font-semibold">Contact notes</h3>
            <Textarea
              rows={5}
              value={contact.notes}
              onChange={(e) => updateContactNotes(contact.id, e.target.value)}
              placeholder="Where you met, phone, follow-ups…"
            />
            <h3 className="mb-2 mt-4 text-sm font-semibold">Recent threads</h3>
            <ul className="space-y-1 text-sm">
              {scopedThreads
                .filter((t) => t.contactEmail === contact.email)
                .slice(0, 6)
                .map((t) => (
                  <li key={t.id}>
                    <button type="button" className="text-blurple hover:underline" onClick={() => openThread(t.id)}>
                      {t.customSubject || t.subject}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}

export function AttachmentsView() {
  const getAttachments = useMailStore((s) => s.getAttachments);
  const openThread = useMailStore((s) => s.openThread);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const [filter, setFilter] = useState("");
  const allowedThreadIds = useMemo(() => {
    if (!inboxAccountId) return null;
    return new Set(
      selectAccountThreads(threads, inboxAccountId, messages).map((t) => t.id),
    );
  }, [threads, inboxAccountId, messages]);
  const attachments = getAttachments().filter(
    (a) => !allowedThreadIds || allowedThreadIds.has(a.threadId),
  );
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return attachments;
    return attachments.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.mimeType || "").toLowerCase().includes(q) ||
        a.name.split(".").pop()?.toLowerCase().includes(q),
    );
  }, [attachments, filter]);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader title="Attachments" subtitle="Files from this account only — switch accounts to see another inbox’s files." />
      {attachments.length > 0 ? (
        <Input
          className="mb-4 max-w-md"
          placeholder="Filter by filename or type…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      ) : null}
      {attachments.length === 0 ? (
        <EmptyState title="No attachments" body="Files from email appear here automatically." />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" body="Clear the filter to see every attachment again." />
      ) : (
        <div className="rounded-2xl border border-line bg-white p-3">
          <AttachmentList
            attachments={visible}
            accountIdFor={(a) => threads.find((t) => t.id === a.threadId)?.accountId ?? inboxAccountId}
            renderMeta={(a) => `Received ${formatThreadTime(a.receivedAt)}`}
            renderExtraActions={(a) => (
              <Button size="sm" variant="soft" onClick={() => openThread(a.threadId)}>
                Open thread
              </Button>
            )}
          />
        </div>
      )}
    </div>
  );
}

export function ClipsView() {
  const clips = useMailStore((s) => s.clips);
  const deleteClip = useMailStore((s) => s.deleteClip);
  const openThread = useMailStore((s) => s.openThread);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const scopedClips = useMemo(
    () => clips.filter((c) => clipBelongsToAccount(c, inboxAccountId, threads, messages)),
    [clips, inboxAccountId, threads, messages],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Highlights"
        subtitle="Clips from this account only — never mixed with another inbox."
      />
      {scopedClips.length === 0 ? (
        <EmptyState title="No highlights for this account" body="Select text in a thread and clip it." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {scopedClips.map((c) => (
            <article key={c.id} className="rounded-2xl border border-line bg-white p-4">
              <p className="font-mono text-sm">{c.text}</p>
              <p className="mt-2 text-xs text-muted">From {c.sourceSubject}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="soft" onClick={() => openThread(c.sourceThreadId)}>
                  Source
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteClip(c.id)}>
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function SnippetsView() {
  const snippets = useMailStore((s) => asArray(s.snippets));
  const createSnippet = useMailStore((s) => s.createSnippet);
  const deleteSnippet = useMailStore((s) => s.deleteSnippet);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader title="Snippets" subtitle="Insert a few sentences or an entire email without retyping." />
      <form
        className="mb-6 space-y-2 rounded-2xl border border-line bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && body.trim()) {
            createSnippet(name.trim(), body.trim());
            setName("");
            setBody("");
          }
        }}
      >
        <Input placeholder="Snippet name" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea rows={4} placeholder="Snippet body" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit">Add snippet</Button>
      </form>
      <div className="space-y-3">
        {snippets.map((s) => (
          <article key={s.id} className="rounded-2xl border border-line bg-white p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="font-semibold">{s.name}</h3>
              <Button size="sm" variant="ghost" onClick={() => deleteSnippet(s.id)}>
                Delete
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted">
              <LinkifiedText text={s.body} />
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

/** Puts a conversation into a collection or pipeline stage without leaving the board. */
function AddMailPicker({
  threads,
  onPick,
  label,
  emptyNote,
}: {
  threads: Thread[];
  onPick: (threadId: string) => void;
  label: string;
  emptyNote: string;
}) {
  if (threads.length === 0) return <p className="text-xs text-muted">{emptyNote}</p>;
  return (
    <select
      className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
    >
      <option value="">{label}</option>
      {threads.slice(0, 100).map((t) => (
        <option key={t.id} value={t.id}>
          {t.contactName} — {t.customSubject || t.subject}
        </option>
      ))}
    </select>
  );
}

function byNewest(a: Thread, b: Thread) {
  return +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

export function CollectionsView() {
  const collections = useAccountScoped((s) => s.collections);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const createCollection = useMailStore((s) => s.createCollection);
  const addToCollection = useMailStore((s) => s.addToCollection);
  const removeFromCollection = useMailStore((s) => s.removeFromCollection);
  const deleteCollection = useMailStore((s) => s.deleteCollection);
  const openThread = useMailStore((s) => s.openThread);
  const [name, setName] = useState("");
  const scopedThreads = useMemo(
    () => [...selectAccountThreads(threads, inboxAccountId, messages)].sort(byNewest),
    [threads, inboxAccountId, messages],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Collections"
        subtitle="Group conversations by deal, customer, or project. Threads from this account only — switch accounts for another workspace."
      />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            createCollection(name.trim());
            setName("");
          }
        }}
      >
        <Input className="max-w-sm" placeholder="New collection name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Create</Button>
      </form>
      {collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          body="Name one above — “Metro2 deal”, “Trade-ins”, “Lender docs” — then add conversations to it from here or from any open email."
        />
      ) : (
        <div className="space-y-4">
          {collections.map((c) => {
            const inCollection = scopedThreads.filter((t) => c.threadIds.includes(t.id));
            const available = scopedThreads.filter((t) => !c.threadIds.includes(t.id));
            return (
              <section key={c.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl">{c.name}</h2>
                  <Badge tone={inCollection.length ? "blurple" : "soft"}>{inCollection.length}</Badge>
                  {c.shared ? (
                    <span className="rounded bg-mint/10 px-2 py-0.5 text-xs font-semibold text-mint">Shared</span>
                  ) : null}
                  <Button
                    className="ml-auto"
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteCollection(c.id)}
                    title="Removes the collection only — your mail stays put"
                  >
                    Delete collection
                  </Button>
                </div>
                <ul className="mb-3 space-y-1">
                  {inCollection.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openThread(t.id)}
                      >
                        <span className="block truncate text-sm font-medium text-ink">
                          {t.customSubject || t.subject}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {t.contactName} · {formatThreadTime(t.updatedAt)}
                        </span>
                      </button>
                      <Button size="sm" variant="soft" onClick={() => openThread(t.id)}>
                        Open
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeFromCollection(t.id, c.id)}>
                        Remove
                      </Button>
                    </li>
                  ))}
                  {inCollection.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-line px-3 py-4 text-sm text-muted">
                      Nothing here yet — pick a conversation below to add the first one.
                    </li>
                  ) : null}
                </ul>
                <AddMailPicker
                  threads={available}
                  onPick={(id) => addToCollection(id, c.id)}
                  label={`Add mail to ${c.name}…`}
                  emptyNote={
                    scopedThreads.length === 0
                      ? "Sync an account to see conversations you can add."
                      : "Every conversation in this account is already in this collection."
                  }
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkflowsView() {
  const workflows = useAccountScoped((s) => s.workflows);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const createWorkflow = useMailStore((s) => s.createWorkflow);
  const deleteWorkflow = useMailStore((s) => s.deleteWorkflow);
  const setWorkflowStage = useMailStore((s) => s.setWorkflowStage);
  const removeFromWorkflow = useMailStore((s) => s.removeFromWorkflow);
  const openThread = useMailStore((s) => s.openThread);
  const [name, setName] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const scopedThreads = useMemo(
    () => [...selectAccountThreads(threads, inboxAccountId, messages)].sort(byNewest),
    [threads, inboxAccountId, messages],
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Workflows"
        subtitle="Move a conversation across stages as the deal progresses. Drag a card between columns, or use the arrows."
      />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            createWorkflow(name.trim());
            setName("");
          }
        }}
      >
        <Input className="max-w-sm" placeholder="New pipeline name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Create</Button>
      </form>
      {workflows.length === 0 ? (
        <EmptyState
          title="No pipelines yet"
          body="Create one above — “Deal pipeline” starts with Needs reply, In review, and Done — then drop conversations into a stage."
        />
      ) : null}
      {workflows.map((wf) => {
        const inPipeline = scopedThreads.filter((t) => t.workflowId === wf.id);
        return (
          <section key={wf.id} className="mb-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl">{wf.name}</h2>
              <Badge tone={inPipeline.length ? "blurple" : "soft"}>{inPipeline.length} in play</Badge>
              <Button
                className="ml-auto"
                size="sm"
                variant="ghost"
                onClick={() => deleteWorkflow(wf.id)}
                title="Removes the board only — your mail stays put"
              >
                Delete pipeline
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {wf.stages.map((stage, stageIndex) => {
                const stageThreads = inPipeline.filter((t) => t.workflowStageId === stage.id);
                const available = scopedThreads.filter(
                  (t) => !(t.workflowId === wf.id && t.workflowStageId === stage.id),
                );
                const prev = wf.stages[stageIndex - 1];
                const next = wf.stages[stageIndex + 1];
                return (
                  <div
                    key={stage.id}
                    className="rounded-2xl border border-line bg-white p-4 transition"
                    onDragOver={(e) => {
                      if (draggingId) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (draggingId) setWorkflowStage(draggingId, wf.id, stage.id);
                      setDraggingId(null);
                    }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                      <h3 className="font-semibold">{stage.name}</h3>
                      <Badge tone="soft">{stageThreads.length}</Badge>
                    </div>
                    <ul className="mb-3 space-y-2 text-sm">
                      {stageThreads.map((t) => (
                        <li
                          key={t.id}
                          draggable
                          onDragStart={() => setDraggingId(t.id)}
                          onDragEnd={() => setDraggingId(null)}
                          className="cursor-grab rounded-xl border border-line px-3 py-2 active:cursor-grabbing"
                        >
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => openThread(t.id)}
                          >
                            <span className="block truncate font-medium text-ink hover:text-blurple">
                              {t.customSubject || t.subject}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {t.contactName} · {formatThreadTime(t.updatedAt)}
                            </span>
                          </button>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {prev ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                title={`Move to ${prev.name}`}
                                onClick={() => setWorkflowStage(t.id, wf.id, prev.id)}
                              >
                                ‹ {prev.name}
                              </Button>
                            ) : null}
                            {next ? (
                              <Button
                                size="sm"
                                variant="soft"
                                title={`Move to ${next.name}`}
                                onClick={() => setWorkflowStage(t.id, wf.id, next.id)}
                              >
                                {next.name} ›
                              </Button>
                            ) : null}
                            <Button size="sm" variant="ghost" onClick={() => removeFromWorkflow(t.id)}>
                              Remove
                            </Button>
                          </div>
                        </li>
                      ))}
                      {stageThreads.length === 0 ? (
                        <li className="rounded-xl border border-dashed border-line px-3 py-4 text-muted">
                          Drop a card here, or add mail below.
                        </li>
                      ) : null}
                    </ul>
                    <AddMailPicker
                      threads={available}
                      onPick={(id) => setWorkflowStage(id, wf.id, stage.id)}
                      label={`Add mail to ${stage.name}…`}
                      emptyNote={
                        scopedThreads.length === 0
                          ? "Sync an account to see conversations you can add."
                          : "Every conversation in this account is already in this stage."
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function SettingsView() {
  const settings = useMailStore((s) => s.settings);
  const updateSettings = useMailStore((s) => s.updateSettings);
  const resetDemo = useMailStore((s) => s.resetDemo);
  const tab = useMailStore((s) => s.settingsTab);
  const setTab = useMailStore((s) => s.setSettingsTab);
  const setToast = useMailStore((s) => s.setToast);
  const [appVersion, setAppVersion] = useState("2.6.68");
  const [updateStatus, setUpdateStatus] = useState<{
    feedUrl: string;
    lastCheckAt: string | null;
    nextCheckDueAt: string;
    lastResult: string | null;
    lastVersion?: string | null;
    lastError?: string | null;
    checkEveryDays: number;
  } | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    const api = desktopApi();
    if (!api?.getAppInfo) return;
    void (async () => {
      const info = await api.getAppInfo();
      if (info?.version) setAppVersion(info.version);
      const st = await api.getUpdateStatus?.();
      if (st) setUpdateStatus(st);
    })();
  }, []);

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: "accounts", label: "Accounts" },
    { id: "general", label: "General" },
    { id: "mail", label: "Mail" },
    { id: "appearance", label: "Appearance" },
    { id: "templates", label: "Templates" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
      <SectionHeader
        title="Settings"
        subtitle="Configure Envision Mail for your dealership workflow — accounts, mail behavior, and appearance."
      />

      <div className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-line bg-white/90 p-1.5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              tab === item.id
                ? "bg-blurple text-white shadow-sm"
                : "text-muted hover:bg-soft hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <section className="rounded-2xl border border-line bg-white/95 p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="font-display text-xl text-ink">Email accounts</h3>
            <p className="mt-1 text-sm text-muted">
              Connect IMAP/SMTP accounts. Switch the active account in the sidebar — each workspace stays isolated.
            </p>
          </div>
          <AccountsPanel />
        </section>
      ) : null}

      {tab === "general" ? (
        <section className="space-y-5 rounded-2xl border border-line bg-white/95 p-5 shadow-sm">
          <div>
            <h3 className="font-display text-xl text-ink">Profile</h3>
            <p className="mt-1 text-sm text-muted">How you appear when composing and in the sidebar.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium">
              Display name
              <Input
                className="mt-1.5"
                value={settings.displayName}
                onChange={(e) => updateSettings({ displayName: e.target.value })}
                placeholder="Your name"
              />
            </label>
            <label className="block text-sm font-medium">
              Primary email
              <Input
                className="mt-1.5"
                value={settings.email}
                onChange={(e) => updateSettings({ email: e.target.value })}
                placeholder="you@company.com"
              />
            </label>
            <label className="block text-sm font-medium">
              Work email (optional)
              <Input
                className="mt-1.5"
                value={settings.workEmail || ""}
                onChange={(e) => updateSettings({ workEmail: e.target.value })}
              />
            </label>
          </div>
          <div className="rounded-xl border border-line bg-soft/50 p-4">
            <h4 className="font-medium text-ink">Calendar timezones</h4>
            <p className="mt-1 text-xs text-muted">
              By default Calendar shows your computer’s local timezone only. Turn on a second clock to compare Eastern, Pacific, etc.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(settings.showDualCalendarTimezones)}
                onChange={(e) => updateSettings({ showDualCalendarTimezones: e.target.checked })}
              />
              Show a second timezone on Calendar
            </label>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium">
                Primary timezone
                <select
                  className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2"
                  value={settings.timezone || localTimezoneId()}
                  onChange={(e) => {
                    const timezone = e.target.value;
                    const secondary = settings.secondaryTimezone || "America/Los_Angeles";
                    updateSettings(
                      secondary === timezone
                        ? {
                            timezone,
                            secondaryTimezone:
                              timezone === "America/Los_Angeles" ? "America/New_York" : "America/Los_Angeles",
                          }
                        : { timezone },
                    );
                  }}
                >
                  <TimezoneOptions />
                </select>
              </label>
              <label className="block text-sm font-medium">
                Second timezone
                <select
                  className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 disabled:opacity-50"
                  disabled={!settings.showDualCalendarTimezones}
                  value={settings.secondaryTimezone || "America/Los_Angeles"}
                  onChange={(e) => {
                    const secondaryTimezone = e.target.value;
                    const primary = settings.timezone || localTimezoneId();
                    if (secondaryTimezone === primary) {
                      updateSettings({
                        secondaryTimezone:
                          primary === "America/Los_Angeles" ? "America/New_York" : "America/Los_Angeles",
                      });
                      return;
                    }
                    updateSettings({ secondaryTimezone });
                  }}
                >
                  <TimezoneOptions />
                </select>
              </label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.linkedAccounts}
              onChange={(e) => updateSettings({ linkedAccounts: e.target.checked })}
            />
            Show personal / work marks on threads
          </label>
        </section>
      ) : null}

      {tab === "mail" ? (
        <section className="space-y-5 rounded-2xl border border-line bg-white/95 p-5 shadow-sm">
          <div>
            <h3 className="font-display text-xl text-ink">Mail behavior</h3>
            <p className="mt-1 text-sm text-muted">Sync, New Senders, receipts, and cleanup.</p>
          </div>
          <div className="rounded-xl border border-line bg-soft/50 p-4">
            <h4 className="font-medium text-ink">Calendar event defaults</h4>
            <p className="mt-1 text-xs text-muted">
              When you set a start time, the end time auto-fills using this duration (shown in your AM/PM time format).
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium">
                Default event length (minutes)
                <Input
                  className="mt-1.5"
                  type="number"
                  min={5}
                  step={5}
                  value={settings.defaultEventDurationMinutes ?? 45}
                  onChange={(e) =>
                    updateSettings({
                      defaultEventDurationMinutes: Math.max(5, Number(e.target.value) || 45),
                    })
                  }
                />
                <span className="mt-1 block text-xs font-normal text-muted">Default 45 — e.g. 10:00 AM → 10:45 AM.</span>
              </label>
              <label className="block text-sm font-medium">
                Default reminder
                <select
                  className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2"
                  value={settings.defaultEventReminderMinutes ?? 15}
                  onChange={(e) =>
                    updateSettings({ defaultEventReminderMinutes: Number(e.target.value) })
                  }
                >
                  <option value={-1}>None</option>
                  <option value={0}>At event time</option>
                  <option value={5}>5 minutes before</option>
                  <option value={15}>15 minutes before</option>
                  <option value={30}>30 minutes before</option>
                  <option value={60}>1 hour before</option>
                  <option value={1440}>1 day before</option>
                </select>
              </label>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium">
              Auto-fetch every (minutes)
              <Input
                className="mt-1.5"
                type="number"
                min={1}
                value={settings.autoFetchMinutes ?? 2}
                onChange={(e) => updateSettings({ autoFetchMinutes: Math.max(1, Number(e.target.value) || 2) })}
              />
              <span className="mt-1 block text-xs font-normal text-muted">Also syncs when the window regains focus.</span>
            </label>
            <label className="block text-sm font-medium">
              Auto-purge Trash after (days)
              <Input
                className="mt-1.5"
                type="number"
                min={0}
                value={settings.autoPurgeTrashDays ?? 30}
                onChange={(e) =>
                  updateSettings({ autoPurgeTrashDays: Math.max(0, Number(e.target.value) || 0) })
                }
              />
              <span className="mt-1 block text-xs font-normal text-muted">Default 30. Use 0 to disable.</span>
            </label>
            <label className="block text-sm font-medium md:col-span-2">
              Speakeasy code
              <Input
                className="mt-1.5"
                value={settings.speakeasyCode}
                onChange={(e) => updateSettings({ speakeasyCode: e.target.value.toUpperCase() })}
                placeholder="Optional bypass code in subject"
              />
            </label>
          </div>
          <div className="space-y-3 rounded-xl bg-soft/80 p-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.requestReadReceiptsByDefault ?? false}
                onChange={(e) => updateSettings({ requestReadReceiptsByDefault: e.target.checked })}
              />
              Request read receipts by default
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.spamCentral ?? settings.spamCorps ?? true}
                onChange={(e) => updateSettings({ spamCentral: e.target.checked })}
              />
              Spam Central — show “Block & report” in New Senders
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.autoresponderOn}
                onChange={(e) => updateSettings({ autoresponderOn: e.target.checked })}
              />
              Autoresponder on
            </label>
            <Textarea
              rows={3}
              value={settings.autoresponderMessage}
              onChange={(e) => updateSettings({ autoresponderMessage: e.target.value })}
              placeholder="Away message…"
            />
          </div>
        </section>
      ) : null}

      {tab === "appearance" ? (
        <section className="space-y-5 rounded-2xl border border-line bg-white/95 p-5 shadow-sm">
          <div>
            <h3 className="font-display text-xl text-ink">Appearance</h3>
            <p className="mt-1 text-sm text-muted">Background atmosphere and MoneyBox $ day cover.</p>
          </div>
          <label className="block text-sm font-medium">
            Wallpaper theme
            <select
              className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={settings.wallpaper || "none"}
              onChange={(e) => updateSettings({ wallpaper: e.target.value as typeof settings.wallpaper })}
            >
              <option value="none">None (clean)</option>
              <option value="ocean">Ocean</option>
              <option value="forest">National forests</option>
              <option value="stars">Stars in the sky</option>
              <option value="rotate">Alternate all</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Rotate every (minutes)
            <Input
              className="mt-1.5"
              type="number"
              min={1}
              value={settings.wallpaperRotateMinutes ?? 8}
              onChange={(e) =>
                updateSettings({ wallpaperRotateMinutes: Math.max(1, Number(e.target.value) || 8) })
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Default MoneyBox $ day cover
            <select
              className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={settings.coverArt}
              onChange={(e) => updateSettings({ coverArt: e.target.value as typeof settings.coverArt })}
            >
              <option value="none">None</option>
              <option value="gradient">Gradient</option>
              <option value="photo">Photo</option>
              <option value="calendar">Calendar (countdowns & habits)</option>
            </select>
          </label>
        </section>
      ) : null}

      {tab === "templates" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-white/95 p-5 shadow-sm">
            <h3 className="mb-3 font-display text-xl text-ink">Email templates</h3>
            <EmailTemplatesPanel />
          </section>
          <section className="rounded-2xl border border-line bg-white/95 p-5 shadow-sm">
            <h3 className="mb-3 font-display text-xl text-ink">Signatures</h3>
            <SignaturesPanel />
          </section>
        </div>
      ) : null}

      {tab === "about" ? (
        <section className="space-y-5 rounded-2xl border border-line bg-white/95 p-5 shadow-sm">
          <div className="space-y-2">
            <BrandLogo showVersion size="lg" href="" />
            <p className="text-sm text-muted">EnvisionMail Version {appVersion}</p>
            <p className="text-sm text-ink">Thank you for using Envision DMS.</p>
          </div>
          <div className="rounded-xl border border-line bg-soft/70 p-4 text-sm text-muted">
            New installs start empty — no sample contacts or demo email. Connect a real account under Accounts to sync
            mail.
          </div>

          <div className="rounded-xl border border-line bg-soft/70 p-4 text-sm">
            <h4 className="font-semibold text-ink">Automatic updates</h4>
            <p className="mt-1 text-muted">
              Envision Mail checks for a newer version every {updateStatus?.checkEveryDays ?? 60} days and downloads it
              automatically when available.
            </p>
            <p className="mt-2 text-xs text-muted">
              Last check:{" "}
              {updateStatus?.lastCheckAt ? new Date(updateStatus.lastCheckAt).toLocaleString() : "Not yet"}
              {updateStatus?.lastResult ? ` · ${updateStatus.lastResult}` : ""}
              {updateStatus?.lastVersion ? ` · v${updateStatus.lastVersion}` : ""}
            </p>
            {updateStatus?.lastError ? (
              <p className="mt-1 text-xs text-salmon">{updateStatus.lastError}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted">
              Next scheduled check:{" "}
              {updateStatus?.nextCheckDueAt ? new Date(updateStatus.nextCheckDueAt).toLocaleString() : "Soon"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="soft"
                disabled={updateBusy}
                onClick={() => {
                  void (async () => {
                    const api = desktopApi();
                    if (!api?.checkForUpdates) {
                      setToast("Update checks are available in the desktop app.");
                      return;
                    }
                    setUpdateBusy(true);
                    // Use the in-app toast + status panel for every outcome. Electron can
                    // suppress or hide native window.alert/confirm, which made the button
                    // look dead ("nothing happens"); the app's own UI always renders.
                    try {
                      const refreshStatus = async () => {
                        const next = (await api.getUpdateStatus?.()) as typeof updateStatus;
                        if (next) setUpdateStatus(next);
                        return next;
                      };
                      setToast("Checking for updates…");
                      const res = await api.checkForUpdates({ force: true });
                      let st = await refreshStatus();
                      if (!res.ok) {
                        setToast(res.error || st?.lastError || "Update check failed");
                        return;
                      }
                      // `updateInfo` is only set when a strictly newer version exists,
                      // so it (not lastVersion, which is also set when up to date) is
                      // the signal that an update is actually available.
                      const remote = res.updateInfo?.version || null;
                      if (!remote) {
                        const latestPublished = st?.lastVersion;
                        setToast(
                          latestPublished && latestPublished !== appVersion
                            ? `Latest published is v${latestPublished} — you're on v${appVersion}.`
                            : `You're on the latest version (v${appVersion}).`,
                        );
                        return;
                      }
                      // Wait for the download to finish, then install right away — a manual
                      // check is an explicit request to update now (Windows downloads in the
                      // background; macOS usually finishes by the time the check returns).
                      setToast(`Update v${remote} found — downloading…`);
                      const deadline = Date.now() + 120_000;
                      let result = String(st?.lastResult || "");
                      while (
                        result !== "downloaded" &&
                        result !== "error" &&
                        Date.now() < deadline
                      ) {
                        await new Promise((r) => setTimeout(r, 1500));
                        st = await refreshStatus();
                        result = String(st?.lastResult || "");
                      }
                      if (result === "error") {
                        setToast(st?.lastError || "Update download failed — please try again.");
                        return;
                      }
                      if (result === "downloaded" && api.installUpdate) {
                        setToast(`Installing v${remote} — Envision Mail will restart…`);
                        const r = await api.installUpdate();
                        if (!r.ok) setToast(r.error || "Install failed");
                      } else {
                        setToast(
                          `Update v${remote} is downloading — use “Restart & install” when it appears.`,
                        );
                      }
                    } catch (err) {
                      setToast(err instanceof Error ? err.message : "Update check failed");
                    } finally {
                      setUpdateBusy(false);
                      try {
                        const st = await api.getUpdateStatus?.();
                        if (st) setUpdateStatus(st as typeof updateStatus);
                      } catch {
                        /* ignore status refresh errors */
                      }
                    }
                  })();
                }}
              >
                {updateBusy ? "Checking…" : "Check for updates now"}
              </Button>
              {updateStatus?.lastResult === "downloaded" ||
              updateStatus?.lastResult === "installing" ||
              updateStatus?.lastResult === "downloading" ? (
                <Button
                  size="sm"
                  disabled={updateBusy}
                  onClick={() => {
                    void (async () => {
                      const api = desktopApi();
                      if (!api?.installUpdate) {
                        setToast("Restart to install is available in the desktop app.");
                        return;
                      }
                      setUpdateBusy(true);
                      setToast("Installing update — Envision Mail will restart…");
                      try {
                        const res = await api.installUpdate();
                        if (!res.ok) setToast(res.error || "Install failed");
                      } catch (err) {
                        setToast(err instanceof Error ? err.message : String(err));
                        setUpdateBusy(false);
                      }
                    })();
                  }}
                >
                  Restart & install
                  {updateStatus?.lastVersion ? ` v${updateStatus.lastVersion}` : " update"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="soft"
              onClick={() => {
                if (confirm("Clear all local mail, contacts, and calendar data on this device?")) resetDemo();
              }}
            >
              Clear local data
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const api = desktopApi();
                if (!api) {
                  alert("Uninstall is available in the Envision Mail desktop app menu.");
                  return;
                }
                await api.uninstall();
              }}
            >
              Uninstall Envision Mail…
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function SearchView() {
  const searchQuery = useMailStore((s) => s.searchQuery);
  const setSearch = useMailStore((s) => s.setSearch);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const openThread = useMailStore((s) => s.openThread);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const setToast = useMailStore((s) => s.setToast);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverNote, setServerNote] = useState("");

  const results = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return selectAccountThreads(threads, inboxAccountId, messages).filter((t) => {
      const hay = [
        t.subject,
        t.customSubject,
        t.contactName,
        t.contactEmail,
        ...(t.tags || []),
        ...(t.tags || []).map((tag) =>
          tag === "on-hold"
            ? "on hold hold"
            : tag === "snoozed"
              ? "snooze snoozed"
              : tag,
        ),
        ...t.messageIds.map((id) => messages[id]?.bodyText || ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [searchQuery, threads, messages, inboxAccountId]);

  const runServerSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setToast("Type at least 2 characters, then search the server");
      return;
    }
    setServerBusy(true);
    setServerNote("");
    try {
      const { searchAndImportOldMail } = await import("@/lib/mail-server-search");
      const res = await searchAndImportOldMail(q, { limit: 50 });
      if (!res.ok) {
        setServerNote(res.error || "Search failed");
        setToast(res.error || "Search failed");
        return;
      }
      if (!res.imported && !res.matched) {
        setServerNote(`No matches on the mail server for “${q}”.`);
      } else {
        setServerNote(
          res.imported
            ? `Pulled ${res.imported} message${res.imported === 1 ? "" : "s"} from the server into this account.`
            : `Matches were already on ${thisComputerLabel()} — see the list below.`,
        );
      }
    } finally {
      setServerBusy(false);
    }
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Search"
        subtitle="Search this account’s downloaded mail — or Search server for older messages on any IMAP provider (Gmail, Yahoo, AOL, custom)."
      />
      <form
        className="mb-4 flex max-w-xl flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void runServerSearch();
        }}
      >
        <Input
          className="flex-1"
          placeholder="Name, subject, or phrase…"
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <Button type="submit" disabled={serverBusy || searchQuery.trim().length < 2}>
          {serverBusy ? "Searching server…" : "Search server"}
        </Button>
      </form>
      <p className="mb-4 max-w-xl text-xs text-muted">
        Local results update as you type. <strong className="font-medium text-ink">Search server</strong> queries your
        mail host (All Mail / Archive when available, otherwise Inbox + Sent) and downloads matches for this account only.
      </p>
      {serverNote ? <p className="mb-4 text-sm text-teal">{serverNote}</p> : null}
      {searchQuery && results.length === 0 && !serverBusy ? (
        <EmptyState
          title="No local matches"
          body="Try Search server to look through older mail still on your mail host."
        />
      ) : (
        <ul className="space-y-2">
          {results.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-left hover:bg-soft"
                onClick={() => openThread(t.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.customSubject || t.subject}</div>
                    <div className="text-sm text-muted">
                      {t.contactName} · {boxLabel(t.box)}
                      {!t.seen ? " · Unread" : ""}
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-muted">{formatThreadTime(t.updatedAt)}</time>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ComposeView() {
  const composeDraft = useMailStore((s) => s.composeDraft);
  const setCompose = useMailStore((s) => s.setCompose);
  const startCompose = useMailStore((s) => s.startCompose);
  const sendNewEmail = useMailStore((s) => s.sendNewEmail);
  const signatures = useMailStore((s) => asArray(s.signatures));
  const settings = useMailStore((s) => s.settings);
  const replyToEveryone = useMailStore((s) => s.replyToEveryone);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const setToast = useMailStore((s) => s.setToast);
  const setView = useMailStore((s) => s.setView);
  const rememberRecipients = useMailStore((s) => s.rememberRecipients);
  const [bulk, setBulk] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const snoozeQueue = selectDockThreads(threads, "reply_later", {
    accountId: inboxAccountId,
    messages,
  });
  const [accountId, setAccountId] = useState("");
  const [signatureId, setSignatureId] = useState(settings.defaultSignatureId || "");
  const [requestReceipt, setRequestReceipt] = useState(settings.requestReadReceiptsByDefault ?? true);
  const [composeFiles, setComposeFiles] = useState<DraftAttachment[]>([]);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    void api.listAccounts().then((list) => {
      setAccounts(list.map((a) => ({ id: a.id, email: a.email, name: a.name })));
      const preferred = inboxAccountId && list.some((a) => a.id === inboxAccountId)
        ? inboxAccountId
        : list[0]?.id || "";
      setAccountId(preferred);
    });
  }, [inboxAccountId]);

  useEffect(() => {
    if (inboxAccountId) setAccountId(inboxAccountId);
  }, [inboxAccountId]);

  useEffect(() => {
    if ((composeDraft.cc || composeDraft.bcc) && !showCcBcc) setShowCcBcc(true);
  }, [composeDraft.cc, composeDraft.bcc, showCcBcc]);

  // Repair accidental signature HTML dumped into the plain-text composer (once per change).
  useEffect(() => {
    const body = composeDraft.body;
    if (!looksLikeHtmlDump(body)) return;
    const cleaned = scrubComposerBody(body);
    if (cleaned === body) return;
    // Avoid toast+setCompose feedback loops if scrub is imperfect.
    if (scrubComposerBody(cleaned) !== cleaned) return;
    setCompose({ body: cleaned });
    setToast("Cleaned HTML out of the message box — your signature still attaches when you send");
  }, [composeDraft.body, setCompose, setToast]);

  const buildHtml = () => {
    const sig = signatures.find((s) => s.id === signatureId) || signatures.find((s) => s.isDefault);
    const raw = scrubComposerBody(String(composeDraft.body || "")).trim();
    const body = raw ? bodyToHtml(raw) : "";
    if (!sig) return body || "<p></p>";
    return `${body}${signatureHtmlBlock(sig)}`;
  };

  const activeAccount =
    accounts.find((a) => a.id === (accountId || inboxAccountId)) || accounts[0] || null;

  const doSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      const api = desktopApi();
      let toList = parseRecipientEmails(composeDraft.to);
      const ccList = parseRecipientEmails(composeDraft.cc || "");
      const bccList = parseRecipientEmails(composeDraft.bcc || "");
      const primaryContact = toList[0] || bccList[0] || "";
      if (!toList.length && !bccList.length) {
        setToast("Add at least one To or Bcc address");
        return;
      }
      if (!toList.length && bccList.length) {
        // Outlook-style Bcc-only: many SMTP servers need a To — use your From address
        const self =
          accounts.find((a) => a.id === (accountId || inboxAccountId))?.email ||
          settings.email ||
          "";
        if (!self) {
          setToast("Add a To address, or select an account for Bcc-only send");
          return;
        }
        toList = [self];
      }
      if (!String(composeDraft.subject || "").trim()) {
        setToast("Add a subject");
        return;
      }
      const sig = signatures.find((s) => s.id === signatureId) || signatures.find((s) => s.isDefault);
      const bodyText = scrubComposerBody(String(composeDraft.body || "")).trim();
      if (bodyText !== String(composeDraft.body || "").trim()) {
        setCompose({ body: bodyText });
      }
      if (!bodyText && !sig?.html) {
        setToast("Write a message or choose a signature");
        return;
      }
      const html = buildHtml();
      const toJoined = toList.join(", ");
      const ccJoined = ccList.length ? ccList.join(", ") : undefined;
      const bccJoined = bccList.length ? bccList.join(", ") : undefined;
      const sendAccountId = accountId || inboxAccountId || accounts[0]?.id || "";
      if (!api) {
        setToast("Open the Envision Mail desktop app to send via SMTP");
        return;
      }
      if (!sendAccountId) {
        setToast("Add/select an account in Settings before sending");
        return;
      }
      const result = await api.sendMail({
        accountId: sendAccountId,
        to: toJoined,
        cc: ccJoined,
        bcc: bccJoined,
        subject: composeDraft.subject,
        text: bodyText || "(see HTML signature)",
        html,
        requestReadReceipt: requestReceipt,
        attachments: toSendAttachments(composeFiles),
      });
      if (!result.ok) {
        const err = result.error || "Send failed";
        const authHint =
          /auth|password|credentials|login|535|534|decrypt|safeStorage|re-enter/i.test(err)
            ? " — Settings → Accounts → paste a new app password → Save"
            : "";
        setToast(err + authHint);
        return;
      }
      rememberRecipients([...parseRecipientEmails(composeDraft.to), ...ccList, ...bccList]);
      setToast(
        requestReceipt
          ? "Sent via SMTP · read receipt requested — check Sent for ✓ when opened"
          : bccList.length > 1 || toList.length > 1 || ccList.length > 1
            ? `Sent via SMTP · ${toList.length + ccList.length + bccList.length} recipients`
            : bccList.length
              ? `Sent via SMTP · ${bccList.length} Bcc`
              : "Sent via SMTP",
      );
      sendNewEmail(primaryContact || toList[0], composeDraft.subject, bodyText || sig?.html || "", {
        requestReadReceipt: requestReceipt,
        smtpMessageId: result.messageId,
        cc: ccList,
        bcc: bccList,
        accountId: sendAccountId,
        accountEmail: accounts.find((a) => a.id === sendAccountId)?.email,
        attachments: composeFiles.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
        })),
      });
      setCompose({ to: "", cc: "", bcc: "", subject: "", body: "", replyToThreadId: null });
      setComposeFiles([]);
      setView("sent");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-36 md:px-8">
      <SectionHeader
        title="Compose"
        subtitle="New messages start blank — links only fill To/Cc/Bcc/Subject, never the body."
      />
      <div className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white/95 p-3 shadow-sm backdrop-blur">
        <Button disabled={sending} onClick={() => void doSend()}>
          {sending ? "Sending…" : "Send via SMTP"}
        </Button>
        <Button
          type="button"
          variant="soft"
          disabled={sending}
          onClick={() => {
            startCompose();
            setComposeFiles([]);
            setToast("Draft cleared");
          }}
        >
          Discard
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requestReceipt} onChange={(e) => setRequestReceipt(e.target.checked)} />
          Request read receipt
        </label>
      </div>
      <div className="relative z-10 space-y-3 rounded-2xl border border-line bg-white/90 p-5">
        {activeAccount ? (
          <div className="rounded-lg border border-line bg-soft/60 px-3 py-2 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Send from</div>
            <div className="font-medium text-ink">
              {activeAccount.name || activeAccount.email}{" "}
              <span className="text-muted">({activeAccount.email})</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Switch the active account in the sidebar to write from another address.
            </p>
          </div>
        ) : (
          <p className="text-sm text-amber-800">Add an account in Settings before sending.</p>
        )}
        <div className="flex flex-wrap items-start gap-2">
          <RecipientSuggestInput
            className="min-w-0 flex-1"
            label="To"
            placeholder="To — type or paste many: a@x.com, b@y.com"
            value={composeDraft.to}
            onChange={(to) => setCompose({ to })}
            autoFocus
          />
          <Button type="button" size="sm" variant="soft" className="mt-5" onClick={() => setShowCcBcc((v) => !v)}>
            {showCcBcc ? "Hide Cc/Bcc" : "Cc / Bcc"}
          </Button>
        </div>
        {showCcBcc ? (
          <>
            <RecipientSuggestInput
              label="Cc"
              placeholder="Cc — paste comma-separated addresses"
              value={composeDraft.cc || ""}
              onChange={(cc) => setCompose({ cc })}
            />
            <RecipientSuggestInput
              label="Bcc"
              placeholder="Bcc — paste comma-separated addresses"
              value={composeDraft.bcc || ""}
              onChange={(bcc) => setCompose({ bcc })}
            />
            <p className="text-xs text-muted">
              Tip: copy a list from Outlook, Excel, or Gmail and paste into To / Cc / Bcc — commas, semicolons, or
              new lines all work.
            </p>
          </>
        ) : null}
        <Input
          placeholder="Subject"
          value={composeDraft.subject}
          onChange={(e) => setCompose({ subject: e.target.value })}
        />
        <EmailTemplatePickers
          showSubjectTemplates
          onInsertSubject={(subject) => setCompose({ subject })}
          onSelectSignature={(id) => setSignatureId(id)}
          onInsertBody={(text, mode) => {
            const plain = scrubComposerBody(text);
            setCompose({
              body:
                mode === "replace"
                  ? plain
                  : composeDraft.body
                    ? `${scrubComposerBody(composeDraft.body)}\n\n${plain}`
                    : plain,
            });
          }}
        />
        <ComposeAttachments
          files={composeFiles}
          onChange={setComposeFiles}
          disabled={sending}
          onError={setToast}
        />
        <Textarea
          rows={10}
          placeholder={`Write your email… (${sendShortcutHint()})`}
          value={composeDraft.body}
          onChange={(e) => setCompose({ body: e.target.value })}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void doSend();
            }
          }}
        />
        {signatures.length > 0 ? (
          <label className="block text-sm">
            Signature for send
            <select
              className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-white px-3 py-2"
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
        <div className="flex flex-wrap gap-2">
          <Button disabled={sending} onClick={() => void doSend()}>
            {sending ? "Sending…" : "Send via SMTP"}
          </Button>
          <Button
            size="sm"
            variant="soft"
            type="button"
            onClick={() => {
              setShowCcBcc(true);
              setToast("Add everyone in Cc — then Send via SMTP");
            }}
          >
            Reply to Everyone
          </Button>
        </div>
        {bulk ? (
          <div className="rounded-xl bg-soft p-3 text-sm">
            <Button
              size="sm"
              onClick={() =>
                replyToEveryone(
                  snoozeQueue.map((t) => t.id),
                  composeDraft.body || "Thanks — looping back here.",
                )
              }
            >
              Reply to {snoozeQueue.length} Snooze emails
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
