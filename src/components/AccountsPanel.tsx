"use client";

import { Avatar, Button, Input } from "@/components/ui";
import { desktopApi, isDesktop } from "@/lib/desktop";
import { invalidateAccountBrands } from "@/lib/account-brands";
import { useMailStore } from "@/lib/store";
import type { DesktopAccount } from "@/types/desktop";
import { useCallback, useEffect, useMemo, useState } from "react";

function defaultBrandLetter(email: string, name: string) {
  const domain = (email || "").split("@")[1] || "";
  const fromDomain = domain.replace(/\.(com|net|org|io|co|us|uk)$/i, "").charAt(0);
  const fromName = (name || email || "?").charAt(0);
  return (fromDomain || fromName || "L").toUpperCase();
}

function makeLetterLogoDataUrl(letter: string, color: string) {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = color || "#0d9488";
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "700 64px Georgia, Times New Roman, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((letter || "L").slice(0, 2).toUpperCase(), 64, 68);
  return canvas.toDataURL("image/png");
}

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
  brandColor: "#0d9488",
  brandLetter: "",
  brandLogoDataUrl: "" as string,
  customLogo: false,
};

const QUICK_PROVIDERS = ["gmail", "yahoo", "aol"] as const;

function normalizePassword(raw: string) {
  // Google/Yahoo/AOL app passwords are often shown with spaces
  return String(raw || "").replace(/\s+/g, "").trim();
}

function loadAccountIntoForm(a: DesktopAccount) {
  const letter = a.brandLetter || defaultBrandLetter(a.email, a.name);
  const color = a.brandColor || "#0d9488";
  const hasStoredLogo = Boolean(a.brandLogoDataUrl);
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
    brandColor: color,
    brandLetter: letter,
    brandLogoDataUrl: a.brandLogoDataUrl || makeLetterLogoDataUrl(letter, color),
    // Treat existing uploaded/generated logo as custom until user regenerates letter mark
    customLogo: hasStoredLogo,
  };
}

export function AccountsPanel() {
  const importSyncedMail = useMailStore((s) => s.importSyncedMail);
  const setToast = useMailStore((s) => s.setToast);
  const updateSettings = useMailStore((s) => s.updateSettings);
  const [accounts, setAccounts] = useState<DesktopAccount[]>([]);
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"ok" | "err" | "info">("info");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [awaitingAppPassword, setAwaitingAppPassword] = useState(false);
  const [showUpdatePassword, setShowUpdatePassword] = useState(false);
  const desktop = isDesktop();

  const activePreset = presets[form.provider];
  const isSimpleProvider = Boolean(activePreset?.imapHost && form.provider !== "custom");
  const selectedAccount = useMemo(
    () => (form.id ? accounts.find((a) => a.id === form.id) : undefined),
    [accounts, form.id],
  );
  /** Hide app-password / test chrome when this account is already verified and working */
  const accountWorking = Boolean(selectedAccount?.verified && !selectedAccount?.authBroken);
  const showCredentialSetup = !form.id || !accountWorking || showUpdatePassword;

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
      setToast("Paste your app password into Envision Mail");
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
        if (/auth|password|credentials|login|535|534|decrypt|safeStorage|re-enter/i.test(result.error || "")) {
          setShowUpdatePassword(true);
        }
        await refresh();
        return;
      }
      setShowUpdatePassword(false);
      const stats = importSyncedMail({
        accountId: result.accountId!,
        email: result.email!,
        displayName: result.displayName,
        messages: result.messages,
      });
      updateSettings({ email: result.email!, displayName: result.displayName || result.email! });
      setStatusTone("ok");
      useMailStore.getState().switchAccount(id, {
        email: result.email!,
        name: result.displayName || result.email!,
        silent: true,
      });
      if (stats.screened > 0) {
        setStatus(`Imported ${stats.imported} · ${stats.screened} in New Senders`);
        useMailStore.getState().setView("screener");
      } else {
        setStatus(stats.imported ? `Imported ${stats.imported} for this account` : "Already up to date");
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

  const brandPreviewUrl = useMemo(() => {
    if (form.customLogo && form.brandLogoDataUrl) return form.brandLogoDataUrl;
    const letter = form.brandLetter || defaultBrandLetter(form.email, form.name);
    return makeLetterLogoDataUrl(letter, form.brandColor || "#0d9488");
  }, [form.brandColor, form.brandLetter, form.brandLogoDataUrl, form.customLogo, form.email, form.name]);

  const payloadFromForm = () => {
    const letter = form.brandLetter || defaultBrandLetter(form.email, form.name);
    const color = form.brandColor || "#0d9488";
    const logo =
      form.customLogo && form.brandLogoDataUrl
        ? form.brandLogoDataUrl
        : makeLetterLogoDataUrl(letter, color);
    return {
      ...form,
      username: form.username || form.email,
      password: form.password ? normalizePassword(form.password) : undefined,
      brandLetter: letter,
      brandColor: color,
      brandLogoDataUrl: logo,
    };
  };

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
          IMAP/SMTP accounts work in the Envision Mail Mac/Windows app. Open the packaged app to connect Gmail, Yahoo, AOL,
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
                    setShowUpdatePassword(Boolean(a.needsPassword || a.authBroken || !a.hasPassword));
                    setStatusTone(a.verified && !a.authBroken ? "ok" : "info");
                    setStatus(
                      a.verified && !a.authBroken
                        ? `${a.email} is connected and working`
                        : `Editing ${a.email}`,
                    );
                  }
                }}
              >
                <option value="">— Add new address —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.email} · {a.email}
                    {a.needsPassword || !a.hasPassword || a.authBroken
                      ? " (needs password)"
                      : a.verified
                        ? " (working)"
                        : a.lastError
                          ? " (error)"
                          : ""}
                  </option>
                ))}
              </select>
            </label>
            {form.id && (selectedAccount?.needsPassword || selectedAccount?.authBroken || selectedAccount?.hasPassword === false) ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="font-medium">Re-enter app password</p>
                <p className="mt-1 text-xs opacity-90">
                  This account needs a new app password (or the saved one can&apos;t be decrypted). Paste it below and Save —
                  your mail data stays on this Mac.
                </p>
              </div>
            ) : null}
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
                  {a.verified && !a.authBroken
                    ? " · working"
                    : a.lastSyncAt
                      ? ` · synced ${new Date(a.lastSyncAt).toLocaleString()}`
                      : " · never synced"}
                  {a.needsPassword || !a.hasPassword || a.authBroken
                    ? " · needs app password"
                    : a.lastError
                      ? ` · ${a.lastError}`
                      : ""}
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
            useMailStore.getState().switchAccount(saved.account.id, {
              email: saved.account.email,
              name: saved.account.name,
            });
            if (saved.account.brandLogoDataUrl) {
              useMailStore
                .getState()
                .setAvatarForEmail(
                  saved.account.email,
                  saved.account.name || saved.account.email,
                  saved.account.brandLogoDataUrl,
                );
            }
            invalidateAccountBrands();
            await refresh();
            await syncOne(saved.account.id);
            // After a good sync, hide credential setup again
            setShowUpdatePassword(false);
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
            className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-white px-3 py-2 disabled:cursor-default disabled:opacity-70"
            value={form.provider}
            disabled={accountWorking && !showUpdatePassword}
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

        {accountWorking && !showUpdatePassword ? (
          <div className="rounded-xl border border-teal/30 bg-[#ecfdf8] p-3 text-sm">
            <p className="font-medium text-teal">Connected and working</p>
            <p className="mt-1 text-xs text-muted">
              App password setup is hidden while this account works. Only open it if you need a new password or code.
            </p>
            <Button
              type="button"
              className="mt-2"
              size="sm"
              variant="soft"
              onClick={() => {
                setShowUpdatePassword(true);
                setStatusTone("info");
                setStatus("Paste a new app password only if your provider requires it.");
              }}
            >
              Update app password…
            </Button>
          </div>
        ) : null}

        {showCredentialSetup && activePreset?.hint ? (
          <p className="text-xs text-muted">{activePreset.hint}</p>
        ) : null}

        {showCredentialSetup && activePreset?.needsAppPassword && activePreset.appPasswordUrl ? (
          <div className="rounded-xl border border-blurple/30 bg-[#f7f4ff] p-3 text-sm">
            <p className="font-medium text-blurple">App password required</p>
            <p className="mt-1 text-xs text-muted">
              Your normal login password won&apos;t work. Open the provider page, create an app password for “Envision Mail”,
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
            disabled={accountWorking && !showUpdatePassword}
            onChange={(e) => {
              const email = e.target.value;
              const nextLetter =
                form.brandLetter && form.id
                  ? form.brandLetter
                  : defaultBrandLetter(email, form.name);
              setForm({
                ...form,
                email,
                username: form.username && form.username !== form.email ? form.username : email,
                brandLetter: nextLetter || form.brandLetter,
              });
            }}
          />
          {showCredentialSetup ? (
            <Input
              className="md:col-span-2"
              type="password"
              placeholder={
                form.id && (selectedAccount?.needsPassword || selectedAccount?.hasPassword === false)
                  ? "Paste new app password (required)"
                  : form.id
                    ? activePreset?.needsAppPassword
                      ? "New app password (leave blank to keep)"
                      : "Password (leave blank to keep)"
                    : activePreset?.needsAppPassword
                      ? "App password (paste here)"
                      : "Password / app password"
              }
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={
                !form.id ||
                Boolean(selectedAccount?.needsPassword) ||
                selectedAccount?.hasPassword === false
              }
              autoComplete="off"
            />
          ) : null}
        </div>

        <div className="rounded-xl border border-line bg-soft/50 p-3">
          <p className="text-sm font-medium">Avatar / logo</p>
          <p className="mt-1 text-xs text-muted">
            Replaces your initials (e.g. “LP”) in Envision Mail threads and is also embedded at the top of messages you
            send. Upload a small PNG/JPEG (under ~400KB).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Avatar
              name={form.name || form.email || "L"}
              color={form.brandColor}
              letter={form.brandLetter || defaultBrandLetter(form.email, form.name)}
              imageUrl={brandPreviewUrl}
              size={56}
            />
            <label className="text-sm">
              Color
              <input
                type="color"
                className="ml-2 h-9 w-12 cursor-pointer rounded border border-line bg-white"
                value={form.brandColor || "#0d9488"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    brandColor: e.target.value,
                    customLogo: false,
                  })
                }
              />
            </label>
            <label className="text-sm">
              Letter
              <Input
                className="ml-2 w-16 inline-flex"
                maxLength={2}
                value={form.brandLetter}
                placeholder="E"
                onChange={(e) =>
                  setForm({
                    ...form,
                    brandLetter: e.target.value.toUpperCase().slice(0, 2),
                    customLogo: false,
                  })
                }
              />
            </label>
            <label className="text-sm">
              <span className="sr-only">Upload logo</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 400_000) {
                    setStatusTone("err");
                    setStatus("Logo too large — use an image under ~400KB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setForm((f) => ({
                      ...f,
                      brandLogoDataUrl: String(reader.result || ""),
                      customLogo: true,
                    }));
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {form.customLogo ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setForm({ ...form, customLogo: false, brandLogoDataUrl: "" })}
              >
                Use letter mark
              </Button>
            ) : null}
          </div>
        </div>

        {showCredentialSetup ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="soft" disabled={!!busy} onClick={() => void autoDetect()}>
              {busy === "discover" ? "Detecting…" : "Auto-detect from email"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Hide server settings" : "Show server settings"}
            </Button>
            {accountWorking && showUpdatePassword ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowUpdatePassword(false);
                  setForm((f) => ({ ...f, password: "" }));
                }}
              >
                Cancel password update
              </Button>
            ) : null}
          </div>
        ) : null}

        {showCredentialSetup && (showAdvanced || !isSimpleProvider) && (
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
          {showCredentialSetup ? (
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
                    setStatus(
                      form.id
                        ? "Connection OK — credentials verified. App password setup will stay hidden."
                        : "Connection OK — click Save account.",
                    );
                    setShowUpdatePassword(false);
                    await refresh();
                  } else {
                    setStatusTone("err");
                    const needsApp =
                      /auth|credential|password|login|invalid/i.test(result.error || "") &&
                      activePreset?.needsAppPassword;
                    setShowUpdatePassword(true);
                    setStatus(
                      `${result.stage || "error"}: ${result.error}${
                        needsApp ? " → Use Open App Password page above, then paste the new password." : ""
                      }`,
                    );
                    await refresh();
                  }
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "test" ? "Testing…" : "Test connection"}
            </Button>
          ) : null}
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
                setShowUpdatePassword(false);
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

export async function syncDesktopAccount(accountId: string) {
  const api = desktopApi();
  if (!api) return { synced: 0, screened: 0, imported: 0, ok: false as const };
  const importSyncedMail = useMailStore.getState().importSyncedMail;
  const updateSettings = useMailStore.getState().updateSettings;
  const activeId = useMailStore.getState().inboxAccountId;
  const result = await api.syncAccount(accountId);
  if (!result.ok || !result.messages) {
    return { synced: 0, screened: 0, imported: 0, ok: false as const, error: result.error };
  }
  const stats = importSyncedMail({
    accountId: result.accountId!,
    email: result.email!,
    displayName: result.displayName,
    messages: result.messages,
  });
  // Only update profile display when syncing the active account
  if (!activeId || activeId === accountId) {
    updateSettings({ email: result.email!, displayName: result.displayName || result.email! });
  }
  return {
    synced: result.messages.length,
    screened: stats.screened,
    imported: stats.imported,
    ok: true as const,
  };
}

/** Sync only the active account (isolated workspace). */
export async function syncActiveDesktopAccount() {
  const activeId = useMailStore.getState().inboxAccountId;
  const api = desktopApi();
  if (!api) return { synced: 0, screened: 0, imported: 0 };
  if (!activeId) {
    const list = await api.listAccounts();
    if (!list[0]) return { synced: 0, screened: 0, imported: 0 };
    useMailStore.getState().switchAccount(list[0].id, {
      email: list[0].email,
      name: list[0].name,
      silent: true,
    });
    return syncDesktopAccount(list[0].id);
  }
  return syncDesktopAccount(activeId);
}

/** Background: sync every account’s mail into storage, without changing active workspace. */
export async function syncAllDesktopAccounts() {
  const api = desktopApi();
  if (!api) return { synced: 0, screened: 0, imported: 0 };
  const list = await api.listAccounts();
  const importSyncedMail = useMailStore.getState().importSyncedMail;
  const activeId = useMailStore.getState().inboxAccountId;
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
      synced += result.messages.length;
      if (!activeId || a.id === activeId) screened += stats.screened;
      imported += stats.imported;
    }
  }
  // Refresh display name from active account only
  if (activeId) {
    const active = list.find((a) => a.id === activeId);
    if (active) {
      useMailStore.getState().updateSettings({
        email: active.email,
        displayName: active.name || active.email,
      });
    }
  }
  return { synced, screened, imported };
}
