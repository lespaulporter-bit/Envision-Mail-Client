"use client";

import { Avatar, Button, EmptyState, Input, SectionHeader, Textarea } from "@/components/ui";
import { AccountsPanel } from "@/components/AccountsPanel";
import { SignaturesPanel } from "@/components/SignaturesPanel";
import { EmailTemplatesPanel } from "@/components/EmailTemplatesPanel";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { desktopApi } from "@/lib/desktop";
import { useHeyStore } from "@/lib/store";
import { formatBytes, relativeTime } from "@/lib/utils";
import { boxLabel } from "@/lib/types";
import { useMemo, useState, useEffect } from "react";

export function ContactsView() {
  const contacts = useHeyStore((s) => s.contacts);
  const updateContactNotes = useHeyStore((s) => s.updateContactNotes);
  const updateContactNotify = useHeyStore((s) => s.updateContactNotify);
  const openThread = useHeyStore((s) => s.openThread);
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const scopedThreads = useMemo(
    () => threads.filter((t) => !inboxAccountId || t.accountId === inboxAccountId),
    [threads, inboxAccountId],
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
        <EmptyState title="No contacts for this account" body="Sync mail or allow senders from Screener." />
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
              <Avatar name={c.name} color={c.avatarColor} size={34} />
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
              <Avatar name={contact.name} color={contact.avatarColor} size={48} />
              <div>
                <h2 className="text-xl font-semibold">{contact.name}</h2>
                <p className="text-sm text-muted">{contact.email}</p>
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
  const getAttachments = useHeyStore((s) => s.getAttachments);
  const openThread = useHeyStore((s) => s.openThread);
  const threads = useHeyStore((s) => s.threads);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const allowedThreadIds = useMemo(() => {
    if (!inboxAccountId) return null;
    return new Set(threads.filter((t) => t.accountId === inboxAccountId).map((t) => t.id));
  }, [threads, inboxAccountId]);
  const attachments = getAttachments().filter(
    (a) => !allowedThreadIds || allowedThreadIds.has(a.threadId),
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader title="Attachments" subtitle="Every file you've received, without digging through threads." />
      {attachments.length === 0 ? (
        <EmptyState title="No attachments" body="Files from email appear here automatically." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {attachments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted">
                  {formatBytes(a.size)} · {relativeTime(a.receivedAt)}
                </div>
              </div>
              <Button size="sm" variant="soft" onClick={() => openThread(a.threadId)}>
                Open thread
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClipsView() {
  const clips = useHeyStore((s) => s.clips);
  const deleteClip = useHeyStore((s) => s.deleteClip);
  const openThread = useHeyStore((s) => s.openThread);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader title="Clips" subtitle="Phone numbers, links, confirmation codes — clipped for instant recall." />
      {clips.length === 0 ? (
        <EmptyState title="No clips yet" body="Select text in a thread and clip it." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {clips.map((c) => (
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
  const snippets = useHeyStore((s) => s.snippets);
  const createSnippet = useHeyStore((s) => s.createSnippet);
  const deleteSnippet = useHeyStore((s) => s.deleteSnippet);
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
            <p className="whitespace-pre-wrap text-sm text-muted">{s.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function CollectionsView() {
  const collections = useHeyStore((s) => s.collections);
  const threads = useHeyStore((s) => s.threads);
  const createCollection = useHeyStore((s) => s.createCollection);
  const openThread = useHeyStore((s) => s.openThread);
  const [name, setName] = useState("");

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Collections"
        subtitle="Combine multiple threads on one page for projects that sprawl across email."
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
      <div className="space-y-4">
        {collections.map((c) => (
          <section key={c.id} className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-2xl">{c.name}</h2>
              {c.shared ? <span className="rounded bg-mint/10 px-2 py-0.5 text-xs font-semibold text-mint">Shared</span> : null}
            </div>
            <ul className="space-y-2">
              {c.threadIds.map((id) => {
                const t = threads.find((x) => x.id === id);
                if (!t) return null;
                return (
                  <li key={id}>
                    <button type="button" className="text-left text-blurple hover:underline" onClick={() => openThread(id)}>
                      {t.contactName}: {t.customSubject || t.subject}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function WorkflowsView() {
  const workflows = useHeyStore((s) => s.workflows);
  const threads = useHeyStore((s) => s.threads);
  const createWorkflow = useHeyStore((s) => s.createWorkflow);
  const openThread = useHeyStore((s) => s.openThread);
  const [name, setName] = useState("");

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader title="Workflows" subtitle="Define stages and track an email’s progress through a multi-step process." />
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
        <Input className="max-w-sm" placeholder="New workflow" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Create</Button>
      </form>
      {workflows.map((wf) => (
        <section key={wf.id} className="mb-6">
          <h2 className="mb-3 font-display text-2xl">{wf.name}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {wf.stages.map((stage) => {
              const stageThreads = threads.filter(
                (t) => t.workflowId === wf.id && t.workflowStageId === stage.id,
              );
              return (
                <div key={stage.id} className="rounded-2xl border border-line bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                    <h3 className="font-semibold">{stage.name}</h3>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {stageThreads.map((t) => (
                      <li key={t.id}>
                        <button type="button" className="text-left hover:text-blurple" onClick={() => openThread(t.id)}>
                          {t.customSubject || t.subject}
                        </button>
                      </li>
                    ))}
                    {stageThreads.length === 0 ? <li className="text-muted">Empty</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function SettingsView() {
  const settings = useHeyStore((s) => s.settings);
  const updateSettings = useHeyStore((s) => s.updateSettings);
  const resetDemo = useHeyStore((s) => s.resetDemo);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <SectionHeader title="Settings" subtitle="Accounts, backgrounds, templates, signatures, auto-fetch, and uninstall." />

      <div className="mb-6 rounded-2xl border border-line bg-white/90 p-5">
        <AccountsPanel />
      </div>

      <div className="mb-6">
        <EmailTemplatesPanel />
      </div>

      <div className="mb-6 rounded-2xl border border-line bg-white/90 p-5">
        <SignaturesPanel />
      </div>

      <div className="mb-6 space-y-3 rounded-2xl border border-line bg-white/90 p-5">
        <h3 className="font-display text-xl">Backgrounds</h3>
        <p className="text-sm text-muted">Ocean, national forests, stars — or rotate through all automatically.</p>
        <label className="block text-sm">
          Theme
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={settings.wallpaper || "rotate"}
            onChange={(e) => updateSettings({ wallpaper: e.target.value as typeof settings.wallpaper })}
          >
            <option value="none">None (clean)</option>
            <option value="ocean">Ocean</option>
            <option value="forest">National forests</option>
            <option value="stars">Stars in the sky</option>
            <option value="rotate">Alternate all (recommended)</option>
          </select>
        </label>
        <label className="block text-sm">
          Rotate every (minutes)
          <Input
            className="mt-1"
            type="number"
            min={1}
            value={settings.wallpaperRotateMinutes ?? 8}
            onChange={(e) => updateSettings({ wallpaperRotateMinutes: Math.max(1, Number(e.target.value) || 8) })}
          />
        </label>
      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-white/90 p-5">
        <label className="block text-sm">
          Display name
          <Input
            className="mt-1"
            value={settings.displayName}
            onChange={(e) => updateSettings({ displayName: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Email
          <Input className="mt-1" value={settings.email} onChange={(e) => updateSettings({ email: e.target.value })} />
        </label>
        <label className="block text-sm">
          Auto-fetch new mail every (minutes)
          <Input
            className="mt-1"
            type="number"
            min={1}
            value={settings.autoFetchMinutes ?? 2}
            onChange={(e) => updateSettings({ autoFetchMinutes: Math.max(1, Number(e.target.value) || 2) })}
          />
          <span className="mt-1 block text-xs text-muted">Also fetches when the window regains focus.</span>
        </label>
        <label className="block text-sm">
          Auto-purge Trash after (days)
          <Input
            className="mt-1"
            type="number"
            min={0}
            value={settings.autoPurgeTrashDays ?? 30}
            onChange={(e) =>
              updateSettings({ autoPurgeTrashDays: Math.max(0, Number(e.target.value) || 0) })
            }
          />
          <span className="mt-1 block text-xs text-muted">
            Default 30. Permanently deletes Trash older than this on sync. Set 0 to disable.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.requestReadReceiptsByDefault ?? true}
            onChange={(e) => updateSettings({ requestReadReceiptsByDefault: e.target.checked })}
          />
          Request read receipts by default
        </label>
        <label className="block text-sm">
          Speakeasy code
          <Input
            className="mt-1"
            value={settings.speakeasyCode}
            onChange={(e) => updateSettings({ speakeasyCode: e.target.value.toUpperCase() })}
          />
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
        />
        <label className="block text-sm">
          Timezone
          <Input className="mt-1" value={settings.timezone} onChange={(e) => updateSettings({ timezone: e.target.value })} />
        </label>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="soft" onClick={resetDemo}>
            Reset demo sample data
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const api = desktopApi();
              if (!api) {
                alert("Uninstall is in the Les Mail desktop app menu.");
                return;
              }
              await api.uninstall();
            }}
          >
            Uninstall Les Mail…
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SearchView() {
  const searchQuery = useHeyStore((s) => s.searchQuery);
  const setSearch = useHeyStore((s) => s.setSearch);
  const threads = useHeyStore((s) => s.threads);
  const messages = useHeyStore((s) => s.messages);
  const openThread = useHeyStore((s) => s.openThread);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);

  const results = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return threads.filter((t) => {
      if (inboxAccountId && t.accountId !== inboxAccountId) return false;
      const hay = [
        t.subject,
        t.customSubject,
        t.contactName,
        t.contactEmail,
        ...t.messageIds.map((id) => messages[id]?.bodyText || ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [searchQuery, threads, messages, inboxAccountId]);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Search"
        subtitle="Search only within the active account’s mail."
      />
      <Input
        className="mb-4 max-w-xl"
        placeholder="Search mail…"
        value={searchQuery}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {searchQuery && results.length === 0 ? (
        <EmptyState title="No matches" body="Try another name, subject, or phrase." />
      ) : (
        <ul className="space-y-2">
          {results.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-left hover:bg-soft"
                onClick={() => openThread(t.id)}
              >
                <div className="font-medium">{t.customSubject || t.subject}</div>
                <div className="text-sm text-muted">
                  {t.contactName} · {t.box}
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
  const composeDraft = useHeyStore((s) => s.composeDraft);
  const setCompose = useHeyStore((s) => s.setCompose);
  const sendNewEmail = useHeyStore((s) => s.sendNewEmail);
  const signatures = useHeyStore((s) => s.signatures || []);
  const settings = useHeyStore((s) => s.settings);
  const replyToEveryone = useHeyStore((s) => s.replyToEveryone);
  const threads = useHeyStore((s) => s.threads);
  const setToast = useHeyStore((s) => s.setToast);
  const [bulk, setBulk] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const [accountId, setAccountId] = useState("");
  const [signatureId, setSignatureId] = useState(settings.defaultSignatureId || "");
  const [requestReceipt, setRequestReceipt] = useState(settings.requestReadReceiptsByDefault ?? true);

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

  const parseAddrs = (raw: string) =>
    String(raw || "")
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));

  const buildHtml = () => {
    const sig = signatures.find((s) => s.id === signatureId) || signatures.find((s) => s.isDefault);
    const body = `<p>${composeDraft.body.replace(/\n/g, "<br/>")}</p>`;
    if (!sig) return body;
    const img = sig.imageDataUrl
      ? `<div style="margin-top:8px"><img src="${sig.imageDataUrl}" alt="" style="max-height:72px"/></div>`
      : "";
    return `${body}<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px">${sig.html}${img}</div>`;
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <SectionHeader title="Compose" subtitle="SMTP send with To, Cc, Bcc, signatures, and optional read receipts." />
      <div className="space-y-3 rounded-2xl border border-line bg-white/90 p-5">
        {accounts.length > 0 ? (
          <label className="block text-sm">
            Send from (active account)
            <select
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
              value={accountId}
              disabled
              title="Switch accounts in the sidebar to write from another address"
            >
              {accounts
                .filter((a) => a.id === accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.email} ({a.email})
                  </option>
                ))}
            </select>
            <span className="mt-1 block text-xs text-muted">
              To send as another address, switch the active account in the sidebar first.
            </span>
          </label>
        ) : null}
        <div className="flex flex-wrap items-start gap-2">
          <Input
            className="min-w-0 flex-1"
            placeholder="To (comma-separated ok)"
            value={composeDraft.to}
            onChange={(e) => setCompose({ to: e.target.value })}
          />
          <Button type="button" size="sm" variant="soft" onClick={() => setShowCcBcc((v) => !v)}>
            {showCcBcc ? "Hide Cc/Bcc" : "Cc / Bcc"}
          </Button>
        </div>
        {showCcBcc ? (
          <>
            <Input
              placeholder="Cc — carbon copy (comma-separated)"
              value={composeDraft.cc || ""}
              onChange={(e) => setCompose({ cc: e.target.value })}
            />
            <Input
              placeholder="Bcc — blind carbon copy (hidden from To/Cc)"
              value={composeDraft.bcc || ""}
              onChange={(e) => setCompose({ bcc: e.target.value })}
            />
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
          onInsertBody={(text, mode) =>
            setCompose({
              body: mode === "replace" ? text : composeDraft.body ? `${composeDraft.body}\n\n${text}` : text,
            })
          }
        />
        <Textarea
          rows={10}
          placeholder="Write your email…"
          value={composeDraft.body}
          onChange={(e) => setCompose({ body: e.target.value })}
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requestReceipt} onChange={(e) => setRequestReceipt(e.target.checked)} />
          Request read receipt
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={sending || !composeDraft.to || !composeDraft.subject || !composeDraft.body}
            onClick={async () => {
              setSending(true);
              try {
                const api = desktopApi();
                const html = buildHtml();
                const toList = parseAddrs(composeDraft.to);
                const ccList = parseAddrs(composeDraft.cc || "");
                const bccList = parseAddrs(composeDraft.bcc || "");
                if (!toList.length) {
                  setToast("Add at least one To address");
                  return;
                }
                const toJoined = toList.join(", ");
                const ccJoined = ccList.length ? ccList.join(", ") : undefined;
                const bccJoined = bccList.length ? bccList.join(", ") : undefined;
                if (api && accountId) {
                  const result = await api.sendMail({
                    accountId,
                    to: toJoined,
                    cc: ccJoined,
                    bcc: bccJoined,
                    subject: composeDraft.subject,
                    text: composeDraft.body,
                    html,
                    requestReadReceipt: requestReceipt,
                  });
                  if (!result.ok) {
                    setToast(result.error || "Send failed");
                    return;
                  }
                  setToast(
                    requestReceipt
                      ? "Sent via SMTP · read receipt requested"
                      : bccList.length
                        ? `Sent via SMTP · ${bccList.length} Bcc`
                        : "Sent via SMTP",
                  );
                  sendNewEmail(toList[0], composeDraft.subject, composeDraft.body, {
                    requestReadReceipt: requestReceipt,
                    smtpMessageId: result.messageId,
                    cc: ccList,
                    bcc: bccList,
                    accountId,
                    accountEmail: accounts.find((a) => a.id === accountId)?.email,
                  });
                } else {
                  sendNewEmail(toList[0], composeDraft.subject, composeDraft.body, {
                    requestReadReceipt: requestReceipt,
                    cc: ccList,
                    bcc: bccList,
                    accountId: inboxAccountId,
                    accountEmail: settings.email,
                  });
                }
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? "Sending…" : accountId ? "Send via SMTP" : "Send (local)"}
          </Button>
          <Button size="sm" variant="soft" onClick={() => setBulk((b) => !b)}>
            Reply to Everyone
          </Button>
        </div>
        {bulk ? (
          <div className="rounded-xl bg-soft p-3 text-sm">
            <Button
              size="sm"
              onClick={() =>
                replyToEveryone(
                  threads.filter((t) => t.replyLater).map((t) => t.id),
                  composeDraft.body || "Thanks — looping back here.",
                )
              }
            >
              Reply to {threads.filter((t) => t.replyLater).length} Reply Later emails
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
