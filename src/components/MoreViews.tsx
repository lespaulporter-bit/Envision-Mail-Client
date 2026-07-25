"use client";

import { Avatar, Button, EmptyState, Input, SectionHeader, Textarea } from "@/components/ui";
import { BrandLogo } from "@/components/BrandLogo";
import { bodyToHtml } from "@/lib/html-body";
import { AccountsPanel } from "@/components/AccountsPanel";
import { SignaturesPanel } from "@/components/SignaturesPanel";
import { EmailTemplatesPanel } from "@/components/EmailTemplatesPanel";
import { EmailTemplatePickers } from "@/components/EmailTemplatePickers";
import { desktopApi } from "@/lib/desktop";
import { useMailStore } from "@/lib/store";
import { formatBytes, relativeTime } from "@/lib/utils";
import { boxLabel } from "@/lib/types";
import { useMemo, useState, useEffect } from "react";

export function ContactsView() {
  const contacts = useMailStore((s) => s.contacts);
  const updateContactNotes = useMailStore((s) => s.updateContactNotes);
  const updateContactNotify = useMailStore((s) => s.updateContactNotify);
  const openThread = useMailStore((s) => s.openThread);
  const threads = useMailStore((s) => s.threads);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
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
  const getAttachments = useMailStore((s) => s.getAttachments);
  const openThread = useMailStore((s) => s.openThread);
  const threads = useMailStore((s) => s.threads);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
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
  const clips = useMailStore((s) => s.clips);
  const deleteClip = useMailStore((s) => s.deleteClip);
  const openThread = useMailStore((s) => s.openThread);

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader title="Highlights" subtitle="Phone numbers, links, confirmation codes — clipped for instant recall." />
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
  const snippets = useMailStore((s) => s.snippets);
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
            <p className="whitespace-pre-wrap text-sm text-muted">{s.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function CollectionsView() {
  const collections = useMailStore((s) => s.collections);
  const threads = useMailStore((s) => s.threads);
  const createCollection = useMailStore((s) => s.createCollection);
  const openThread = useMailStore((s) => s.openThread);
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
  const workflows = useMailStore((s) => s.workflows);
  const threads = useMailStore((s) => s.threads);
  const createWorkflow = useMailStore((s) => s.createWorkflow);
  const openThread = useMailStore((s) => s.openThread);
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
  const settings = useMailStore((s) => s.settings);
  const updateSettings = useMailStore((s) => s.updateSettings);
  const resetDemo = useMailStore((s) => s.resetDemo);
  const [tab, setTab] = useState<"accounts" | "general" | "mail" | "appearance" | "templates" | "about">(
    "accounts",
  );
  const [appVersion, setAppVersion] = useState("2.3.0");

  useEffect(() => {
    const api = desktopApi();
    if (!api?.getAppInfo) return;
    void api.getAppInfo().then((info) => {
      if (info?.version) setAppVersion(info.version);
    });
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
            <label className="block text-sm font-medium">
              Timezone
              <Input
                className="mt-1.5"
                value={settings.timezone}
                onChange={(e) => updateSettings({ timezone: e.target.value })}
                placeholder="America/New_York"
              />
            </label>
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
                checked={settings.spamCorps}
                onChange={(e) => updateSettings({ spamCorps: e.target.checked })}
              />
              Enable Spam Corps actions in New Senders
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
  const composeDraft = useMailStore((s) => s.composeDraft);
  const setCompose = useMailStore((s) => s.setCompose);
  const sendNewEmail = useMailStore((s) => s.sendNewEmail);
  const signatures = useMailStore((s) => s.signatures || []);
  const settings = useMailStore((s) => s.settings);
  const replyToEveryone = useMailStore((s) => s.replyToEveryone);
  const threads = useMailStore((s) => s.threads);
  const setToast = useMailStore((s) => s.setToast);
  const [bulk, setBulk] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
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
    const body = bodyToHtml(composeDraft.body);
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
              Reply to {threads.filter((t) => t.replyLater).length} Snooze emails
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
