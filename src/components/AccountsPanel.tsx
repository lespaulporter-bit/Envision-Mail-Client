"use client";

import { Button, Input } from "@/components/ui";
import { desktopApi, isDesktop } from "@/lib/desktop";
import { useHeyStore } from "@/lib/store";
import type { DesktopAccount } from "@/types/desktop";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  needsAppPassword?: boolean;
  appPasswordUrl?: string;
};

const emptyForm = {
  id: "",
  name: "",
  email: "",
  provider: "gmail",
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
  username: "",
  password: "",
};

const QUICK_PROVIDERS = ["gmail", "yahoo", "aol"] as const;

function normalizePassword(raw: string) {
  // Google/Yahoo/AOL app passwords are often shown with spaces
  return String(raw || "").replace(/\s+/g, "").trim();
}

function loadAccountIntoForm(a: DesktopAccount) {
  return {
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
  };
}

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [awaitingAppPassword, setAwaitingAppPassword] = useState(false);
  const desktop = isDesktop();

  const activePreset = presets[form.provider];
  const isSimpleProvider = Boolean(activePreset?.imapHost && form.provider !== "custom");

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

  // When user returns from the browser app-password page, nudge them to paste
  useEffect(() => {
    const onFocus = () => {
      if (!awaitingAppPassword) return;
      setStatusTone("info");
      setStatus("Welcome back — paste the app password below, then click Test connection or Save.");
      setToast("Paste your app password into Les Mail");
      setAwaitingAppPassword(false);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [awaitingAppPassword, setToast]);

  const applyPreset = (id: string) => {
    const p = presets[id];
    if (!p) {
      setForm((f) => ({ ...f, provider: id }));
      return;
    }
    setForm((f) => {
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
    setShowAdvanced(id === "custom");
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

  const openAppPasswordPage = async () => {
    const api = desktopApi();
    const url = activePreset?.appPasswordUrl;
    if (!api || !url) {
      setStatusTone("err");
      setStatus("No app-password page for this provider.");
      return;
    }
    setAwaitingAppPassword(true);
    setStatusTone("info");
    setStatus("Opening app password page in your browser… create one, then return here to paste it.");
    setToast("Browser opened — create an app password, then come back");
    if (api.openExternal) {
      await api.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
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
      setShowAdvanced(found.provider === "custom");
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
      } else {
        setStatus(stats.imported ? `Imported ${stats.imported} → LesBox` : "Already up to date");
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

  const payloadFromForm = () => ({
    ...form,
    username: form.username || form.email,
    password: form.password ? normalizePassword(form.password) : undefined,
  });

  const selectedAccountLabel = useMemo(() => {
    if (!form.id) return "";
    const a = accounts.find((x) => x.id === form.id);
    return a ? `${a.name || a.email} (${a.email})` : "";
  }, [accounts, form.id]);

  if (!desktop) {
    return (
      <div className="rounded-2xl border border-amber/40 bg-[#fff8f0] p-4 text-sm">
        <strong>Desktop required for live mail.</strong>
        <p className="mt-1 text-muted">
          IMAP/SMTP accounts work in the Les Mail Mac/Windows app. Open the packaged app to connect Gmail, Yahoo, AOL,
          Stackmail, or custom servers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-xl">Email accounts</h3>
          <p className="text-sm text-muted">
            Unlimited addresses. Passwords stay in macOS Keychain / Windows DPAPI.
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

      {/* Connected accounts → dropdown to select & edit */}
      <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
        <h4 className="font-semibold">Your addresses</h4>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">No accounts yet — use Quick connect below.</p>
        ) : (
          <>
            <label className="block text-sm">
              Select account to edit
              <select
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
                value={form.id || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setForm(emptyForm);
                    return;
                  }
                  const a = accounts.find((x) => x.id === id);
                  if (a) {
                    setForm(loadAccountIntoForm(a));
                    setShowAdvanced(a.provider === "custom");
                    setStatusTone("info");
                    setStatus(`Editing ${a.email}`);
                  }
                }}
              >
                <option value="">— Add new address —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.email} · {a.email}
                    {a.lastError ? " (error)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {form.id ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="soft" disabled={!!busy} onClick={() => void syncOne(form.id)}>
                  {busy === `sync:${form.id}` ? "Syncing…" : `Sync ${selectedAccountLabel || "selected"}`}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!!busy}
                  onClick={async () => {
                    await desktopApi()?.removeAccount(form.id);
                    setForm(emptyForm);
                    await refresh();
                    setStatusTone("ok");
                    setStatus("Account removed");
                  }}
                >
                  Remove
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForm(emptyForm);
                    setShowAdvanced(false);
                  }}
                >
                  Add another instead
                </Button>
              </div>
            ) : null}
            <ul className="space-y-1 text-xs text-muted">
              {accounts.map((a) => (
                <li key={a.id}>
                  {a.email}
                  {a.lastSyncAt ? ` · synced ${new Date(a.lastSyncAt).toLocaleString()}` : " · never synced"}
                  {a.lastError ? ` · ${a.lastError}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
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
            const saved = await api.saveAccount(payloadFromForm());
            if (!saved.ok || !saved.account) {
              setStatusTone("err");
              setStatus(saved.error || "Save failed");
              setToast(saved.error || "Save failed");
              return;
            }
            setStatusTone("ok");
            setStatus(`Saved ${saved.account.email}`);
            setForm(loadAccountIntoForm(saved.account));
            await refresh();
            await syncOne(saved.account.id);
          } finally {
            setBusy(null);
          }
        }}
      >
        <h4 className="font-semibold">{form.id ? "Edit account" : "Add account"}</h4>

        {/* Quick connect Gmail / Yahoo / AOL */}
        {!form.id ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Quick connect</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROVIDERS.map((id) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={form.provider === id ? "primary" : "soft"}
                  onClick={() => applyPreset(id)}
                >
                  {id === "gmail" ? "Gmail" : id === "yahoo" ? "Yahoo" : "AOL"}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("stackmail")}>
                Stackmail
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("custom")}>
                Other…
              </Button>
            </div>
          </div>
        ) : null}

        <label className="block text-sm">
          Provider
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={form.provider}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {(Object.values(presets).length
              ? Object.values(presets)
              : [
                  { id: "gmail", label: "Gmail" },
                  { id: "yahoo", label: "Yahoo" },
                  { id: "aol", label: "AOL" },
                  { id: "custom", label: "Custom" },
                ]
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {activePreset?.hint ? <p className="text-xs text-muted">{activePreset.hint}</p> : null}

        {activePreset?.needsAppPassword && activePreset.appPasswordUrl ? (
          <div className="rounded-xl border border-blurple/30 bg-[#f7f4ff] p-3 text-sm">
            <p className="font-medium text-blurple">App password required</p>
            <p className="mt-1 text-xs text-muted">
              Your normal login password won&apos;t work. Open the provider page, create an app password for “Les Mail”,
              copy it, then paste it below and return here.
            </p>
            <Button type="button" className="mt-2" size="sm" onClick={() => void openAppPasswordPage()}>
              Open App Password page
            </Button>
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder="Display name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Email address"
            required
            value={form.email}
            onChange={(e) => {
              const email = e.target.value;
              setForm({ ...form, email, username: form.username && form.username !== form.email ? form.username : email });
            }}
          />
          <Input
            className="md:col-span-2"
            type="password"
            placeholder={
              form.id
                ? activePreset?.needsAppPassword
                  ? "New app password (leave blank to keep)"
                  : "Password (leave blank to keep)"
                : activePreset?.needsAppPassword
                  ? "App password (paste here)"
                  : "Password / app password"
            }
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={!form.id}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="soft" disabled={!!busy} onClick={() => void autoDetect()}>
            {busy === "discover" ? "Detecting…" : "Auto-detect from email"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide server settings" : "Show server settings"}
          </Button>
        </div>

        {(showAdvanced || !isSimpleProvider) && (
          <div className="grid gap-2 rounded-xl bg-soft/60 p-3 md:grid-cols-2">
            <Input
              placeholder="Username (usually full email)"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <Input
              placeholder="IMAP host"
              value={form.imapHost}
              onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
            />
            <Input
              type="number"
              placeholder="IMAP port"
              value={form.imapPort}
              onChange={(e) => setForm({ ...form, imapPort: Number(e.target.value) })}
            />
            <Input
              placeholder="SMTP host"
              value={form.smtpHost}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
            />
            <Input
              type="number"
              placeholder="SMTP port"
              value={form.smtpPort}
              onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })}
            />
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.imapSecure}
                onChange={(e) => setForm({ ...form, imapSecure: e.target.checked })}
              />
              IMAP SSL/TLS
              <input
                type="checkbox"
                className="ml-4"
                checked={form.smtpSecure}
                onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
              />
              SMTP SSL (off for STARTTLS :587)
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
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
                const result = await api.testAccount(payloadFromForm());
                if (result.suggested?.imapHost) applySuggested(result.suggested);
                if (result.ok) {
                  setStatusTone("ok");
                  setStatus("Connection OK — click Save account.");
                } else {
                  setStatusTone("err");
                  const needsApp =
                    /auth|credential|password|login|invalid/i.test(result.error || "") &&
                    activePreset?.needsAppPassword;
                  setStatus(
                    `${result.stage || "error"}: ${result.error}${
                      needsApp ? " → Use Open App Password page above, then paste the new password." : ""
                    }`,
                  );
                }
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "test" ? "Testing…" : "Test connection"}
          </Button>
          <Button type="submit" disabled={!!busy}>
            {busy === "save" ? "Saving…" : form.id ? "Save changes" : "Save account"}
          </Button>
          {form.id ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm(emptyForm);
                setShowAdvanced(false);
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

export async function syncAllDesktopAccounts() {
  const api = desktopApi();
  if (!api) return { synced: 0, screened: 0, imported: 0 };
  const list = await api.listAccounts();
  const importSyncedMail = useHeyStore.getState().importSyncedMail;
  const updateSettings = useHeyStore.getState().updateSettings;
  let synced = 0;
  let screened = 0;
  let imported = 0;
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
      synced += result.messages.length;
      screened += stats.screened;
      imported += stats.imported;
    }
  }
  return { synced, screened, imported };
}
