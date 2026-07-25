"use client";

import { Button, Input } from "@/components/ui";
import { desktopApi, isDesktop } from "@/lib/desktop";
import { useHeyStore } from "@/lib/store";
import type { DesktopAccount } from "@/types/desktop";
import { useCallback, useEffect, useState } from "react";

type Preset = {
  id: string;
  label: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  hint: string;
};

const emptyForm = {
  id: "",
  name: "",
  email: "",
  provider: "stackmail",
  imapHost: "imap.stackmail.com",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.stackmail.com",
  smtpPort: 465,
  smtpSecure: true,
  username: "",
  password: "",
};

export function AccountsPanel() {
  const importSyncedMail = useHeyStore((s) => s.importSyncedMail);
  const setToast = useHeyStore((s) => s.setToast);
  const updateSettings = useHeyStore((s) => s.updateSettings);
  const [accounts, setAccounts] = useState<DesktopAccount[]>([]);
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"ok" | "err" | "info">("info");
  const desktop = isDesktop();

  const refresh = useCallback(async () => {
    const api = desktopApi();
    if (!api) return;
    const [list, presetMap] = await Promise.all([api.listAccounts(), api.presets()]);
    setAccounts(list);
    setPresets(presetMap as Record<string, Preset>);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!desktop) {
    return (
      <div className="rounded-2xl border border-amber/40 bg-[#fff8f0] p-4 text-sm">
        <strong>Desktop required for live mail.</strong>
        <p className="mt-1 text-muted">
          IMAP/SMTP accounts work in the Les Mail Mac/Windows app. You’re in the browser demo right now — open the
          packaged app to connect Gmail, Outlook, iCloud, Stackmail, or custom servers.
        </p>
      </div>
    );
  }

  const applyPreset = (id: string) => {
    const p = presets[id];
    if (!p) {
      setForm((f) => ({ ...f, provider: id }));
      return;
    }
    setForm((f) => {
      // Custom keeps whatever hosts you already typed (don’t wipe)
      if (id === "custom") {
        return {
          ...f,
          provider: id,
          imapPort: f.imapPort || p.imapPort,
          smtpPort: f.smtpPort || p.smtpPort,
        };
      }
      return {
        ...f,
        provider: id,
        imapHost: p.imapHost || f.imapHost,
        imapPort: p.imapPort,
        imapSecure: p.imapSecure,
        smtpHost: p.smtpHost || f.smtpHost,
        smtpPort: p.smtpPort,
        smtpSecure: p.smtpSecure,
      };
    });
  };

  const applySuggested = (s: Partial<DesktopAccount> & { hint?: string; label?: string }) => {
    setForm((f) => ({
      ...f,
      provider: s.provider || f.provider,
      imapHost: s.imapHost || f.imapHost,
      imapPort: s.imapPort ?? f.imapPort,
      imapSecure: s.imapSecure ?? f.imapSecure,
      smtpHost: s.smtpHost || f.smtpHost,
      smtpPort: s.smtpPort ?? f.smtpPort,
      smtpSecure: s.smtpSecure ?? f.smtpSecure,
      username: s.username || f.username || f.email,
    }));
  };

  const autoDetect = async () => {
    const api = desktopApi();
    if (!api || !form.email.includes("@")) {
      setStatusTone("err");
      setStatus("Enter your email address first, then click Auto-detect.");
      return;
    }
    setBusy("discover");
    setStatusTone("info");
    setStatus("Looking up mail servers for your domain…");
    try {
      const found = await api.discover(form.email);
      if (!found.ok || !found.imapHost) {
        setStatusTone("err");
        setStatus(found.error || "Could not detect servers — enter IMAP/SMTP hosts manually.");
        return;
      }
      applySuggested(found);
      setStatusTone("ok");
      setStatus(
        found.discovered
          ? `Detected ${found.label || found.provider}: ${found.imapHost} / ${found.smtpHost}. ${found.hint || ""}`
          : `Suggested ${found.imapHost} / ${found.smtpHost}. ${found.hint || ""}`,
      );
    } finally {
      setBusy(null);
    }
  };

  const syncOne = async (id: string) => {
    const api = desktopApi();
    if (!api) return;
    setBusy(`sync:${id}`);
    setStatusTone("info");
    setStatus("Syncing…");
    try {
      const result = await api.syncAccount(id);
      if (!result.ok || !result.messages) {
        setStatusTone("err");
        setStatus(result.error || "Sync failed");
        setToast(result.error || "Sync failed");
        return;
      }
      const stats = importSyncedMail({
        accountId: result.accountId!,
        email: result.email!,
        displayName: result.displayName,
        messages: result.messages,
      });
      updateSettings({ email: result.email!, displayName: result.displayName || result.email! });
      setStatusTone("ok");
      if (stats.screened > 0) {
        setStatus(`Imported ${stats.imported} · ${stats.screened} in Screener`);
        // store already navigates to Screener — do not force LesBox
      } else {
        setStatus(
          stats.imported
            ? `Imported ${stats.imported} → LesBox`
            : "Already up to date",
        );
        if (stats.imported > 0) {
          useHeyStore.getState().setInboxAccountId(id);
        }
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const syncAll = async () => {
    for (const a of accounts) {
      // eslint-disable-next-line no-await-in-loop
      await syncOne(a.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-xl">Email accounts (IMAP / SMTP)</h3>
          <p className="text-sm text-muted">
            Connect real inboxes. Passwords are encrypted with macOS Keychain / Windows DPAPI. Unlimited addresses.
          </p>
        </div>
        <Button size="sm" onClick={() => void syncAll()} disabled={!!busy || accounts.length === 0}>
          Sync all
        </Button>
      </div>

      {status ? (
        <p
          className={`text-sm ${
            statusTone === "err" ? "text-salmon" : statusTone === "ok" ? "text-emerald-700" : "text-blurple"
          }`}
        >
          {status}
        </p>
      ) : null}

      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-soft/50 px-3 py-3">
            <div>
              <div className="font-medium">{a.name || a.email}</div>
              <div className="text-xs text-muted">
                {a.email} · {a.provider} · {a.imapHost}:{a.imapPort} ·{" "}
                {a.lastSyncAt ? `synced ${new Date(a.lastSyncAt).toLocaleString()}` : "never synced"}
              </div>
              {a.lastError ? <div className="text-xs text-salmon">{a.lastError}</div> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="soft" disabled={!!busy} onClick={() => void syncOne(a.id)}>
                {busy === `sync:${a.id}` ? "Syncing…" : "Sync"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setForm({
                    id: a.id,
                    name: a.name,
                    email: a.email,
                    provider: a.provider,
                    imapHost: a.imapHost,
                    imapPort: a.imapPort,
                    imapSecure: a.imapSecure,
                    smtpHost: a.smtpHost,
                    smtpPort: a.smtpPort,
                    smtpSecure: a.smtpSecure,
                    username: a.username,
                    password: "",
                  })
                }
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await desktopApi()?.removeAccount(a.id);
                  await refresh();
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        {accounts.length === 0 ? <p className="text-sm text-muted">No accounts yet — add one below.</p> : null}
      </div>

      <form
        className="space-y-3 rounded-2xl border border-line bg-white p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const api = desktopApi();
          if (!api) return;
          setBusy("save");
          setStatusTone("info");
          setStatus("Saving…");
          try {
            const saved = await api.saveAccount({
              ...form,
              username: form.username || form.email,
              password: form.password || undefined,
            });
            if (!saved.ok || !saved.account) {
              setStatusTone("err");
              setStatus(saved.error || "Save failed");
              setToast(saved.error || "Save failed");
              return;
            }
            setStatusTone("ok");
            setStatus(`Saved ${saved.account.email} — click Sync to fetch mail.`);
            setForm(emptyForm);
            await refresh();
            await syncOne(saved.account.id);
          } finally {
            setBusy(null);
          }
        }}
      >
        <h4 className="font-semibold">{form.id ? "Edit account" : "Add account"}</h4>
        <label className="block text-sm">
          Provider
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={form.provider}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {Object.values(presets).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {!Object.keys(presets).length ? (
              <>
                <option value="stackmail">Stackmail / 20i</option>
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook</option>
                <option value="icloud">iCloud</option>
                <option value="custom">Custom</option>
              </>
            ) : null}
          </select>
        </label>
        {presets[form.provider]?.hint ? <p className="text-xs text-muted">{presets[form.provider].hint}</p> : null}
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="Display name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            placeholder="Email address"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value, username: form.username || e.target.value })}
          />
          <Input
            placeholder="Username (usually full email)"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <Input
            type="password"
            placeholder={form.id ? "Password (leave blank to keep)" : "Password / app password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={!form.id}
          />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="IMAP host" value={form.imapHost} onChange={(e) => setForm({ ...form, imapHost: e.target.value })} />
          <Input
            type="number"
            placeholder="IMAP port"
            value={form.imapPort}
            onChange={(e) => setForm({ ...form, imapPort: Number(e.target.value) })}
          />
          <Input placeholder="SMTP host" value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />
          <Input
            type="number"
            placeholder="SMTP port"
            value={form.smtpPort}
            onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.imapSecure} onChange={(e) => setForm({ ...form, imapSecure: e.target.checked })} />
            IMAP SSL/TLS (port 993)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.smtpSecure} onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })} />
            SMTP SSL (off for STARTTLS :587)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="soft" disabled={!!busy} onClick={() => void autoDetect()}>
            {busy === "discover" ? "Detecting…" : "Auto-detect from email"}
          </Button>
          <Button
            type="button"
            variant="soft"
            disabled={!!busy}
            onClick={async () => {
              const api = desktopApi();
              if (!api) return;
              setBusy("test");
              setStatusTone("info");
              setStatus("Testing IMAP + SMTP…");
              try {
                const result = await api.testAccount({
                  ...form,
                  username: form.username || form.email,
                  password: form.password || undefined,
                });
                if (result.suggested?.imapHost) {
                  applySuggested(result.suggested);
                }
                if (result.ok) {
                  setStatusTone("ok");
                  setStatus("Connection OK — IMAP and SMTP work. Click Save account.");
                } else {
                  setStatusTone("err");
                  setStatus(`${result.stage || "error"}: ${result.error}`);
                }
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "test" ? "Testing…" : "Test connection"}
          </Button>
          <Button type="submit" disabled={!!busy}>
            {busy === "save" ? "Saving…" : "Save account"}
          </Button>
          {form.id ? (
            <Button type="button" variant="ghost" onClick={() => setForm(emptyForm)}>
              Cancel edit
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          Hosted business domains (like envisiondms.com) often use <strong>Stackmail / 20i</strong>: imap.stackmail.com /
          smtp.stackmail.com — click Auto-detect to fill that in.
        </p>
      </form>
    </div>
  );
}

export async function syncAllDesktopAccounts() {
  const api = desktopApi();
  if (!api) return { synced: 0, screened: 0 };
  const list = await api.listAccounts();
  const importSyncedMail = useHeyStore.getState().importSyncedMail;
  const updateSettings = useHeyStore.getState().updateSettings;
  let synced = 0;
  let screened = 0;
  for (const a of list) {
    const result = await api.syncAccount(a.id);
    if (result.ok && result.messages) {
      const stats = importSyncedMail({
        accountId: result.accountId!,
        email: result.email!,
        displayName: result.displayName,
        messages: result.messages,
      });
      updateSettings({ email: result.email!, displayName: result.displayName || result.email! });
      synced += stats.imported;
      screened += stats.screened;
    }
  }
  if (screened > 0) {
    useHeyStore.setState({
      view: "screener",
      toast: synced
        ? `Synced ${synced} · ${screened} need Screener review`
        : `${screened} need Screener review`,
    });
  }
  return { synced, screened };
}
