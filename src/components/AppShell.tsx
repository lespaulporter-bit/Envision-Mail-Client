"use client";

import { CalendarView } from "@/components/CalendarView";
import {
  DockListView,
  EasyCleanupView,
  FeedView,
  FocusReplyView,
  MoneyBoxView,
  PaperTrailView,
  ScreenerView,
  SentView,
  SpamView,
  TrashView,
} from "@/components/EmailViews";
import {
  AttachmentsView,
  ClipsView,
  CollectionsView,
  ComposeView,
  ContactsView,
  SearchView,
  SettingsView,
  SnippetsView,
  WorkflowsView,
} from "@/components/MoreViews";
import { ReminderOverlay } from "@/components/ReminderOverlay";
import { ThreadView } from "@/components/ThreadView";
import { BrandLogo } from "@/components/BrandLogo";
import { Button, Toast } from "@/components/ui";
import { WallpaperBackground } from "@/components/WallpaperBackground";
import { syncActiveDesktopAccount } from "@/components/AccountsPanel";
import { desktopApi, isDesktop } from "@/lib/desktop";
import {
  selectBoxThreads,
  selectDockThreads,
  resolveThreadBackView,
  selectCleanupThreads,
  selectNewSenderThreads,
  selectScreeningThreads,
  useMailStore,
  type AppView,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { purgeOldTrash } from "@/lib/mail-delete";
import {
  Bookmark,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  ContactRound,
  FileStack,
  Inbox,
  Layers3,
  ListChecks,
  Newspaper,
  Paperclip,
  PenSquare,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";

const nav: {
  id: AppView;
  label: string;
  icon: ComponentType<{ className?: string }>;
  countKey?: string;
  pastel?: string;
  pastelActive?: string;
}[] = [
  { id: "lesbox", label: "MoneyBox $", icon: Inbox, countKey: "lesbox", pastel: "bg-[#d6e8ff]", pastelActive: "bg-[#b8d6ff]" },
  { id: "feed", label: "Screening", icon: ShieldCheck, countKey: "feed", pastel: "bg-[#d8f5e8]", pastelActive: "bg-[#b8ebd4]" },
  { id: "paper_trail", label: "Receipts", icon: Receipt, countKey: "paper_trail", pastel: "bg-[#ffe4d6]", pastelActive: "bg-[#ffd0b8]" },
  { id: "screener", label: "New Senders", icon: Newspaper, countKey: "screener", pastel: "bg-[#fff0c8]", pastelActive: "bg-[#ffe29a]" },
  { id: "cleanup", label: "Easy Cleanup", icon: ListChecks, countKey: "cleanup", pastel: "bg-[#e6f7f3]", pastelActive: "bg-[#c8eee5]" },
  { id: "sent", label: "Sent", icon: Send, pastel: "bg-[#e0eefc]", pastelActive: "bg-[#c8dff8]" },
  { id: "spam", label: "Spam", icon: ShieldAlert, countKey: "spam", pastel: "bg-[#ffe8e4]", pastelActive: "bg-[#ffd4cc]" },
  { id: "trash", label: "Trash", icon: Trash2, countKey: "trash", pastel: "bg-[#ececec]", pastelActive: "bg-[#dddddd]" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, pastel: "bg-[#e8ddff]", pastelActive: "bg-[#d4c4ff]" },
  { id: "reply_later", label: "Snooze", icon: Clock3, countKey: "reply_later", pastel: "bg-[#d9f0f7]", pastelActive: "bg-[#bde4f0]" },
  { id: "set_aside", label: "On Hold", icon: Bookmark, countKey: "set_aside", pastel: "bg-[#fce0eb]", pastelActive: "bg-[#f7c5d8]" },
  { id: "focus_reply", label: "Reply Queue", icon: ClipboardList, countKey: "focus_reply", pastel: "bg-[#d5f2ef]", pastelActive: "bg-[#b5e8e2]" },
  { id: "contacts", label: "Contacts", icon: ContactRound, pastel: "bg-[#ece0f5]", pastelActive: "bg-[#dcc8ed]" },
  { id: "attachments", label: "Attachments", icon: Paperclip },
  { id: "clips", label: "Highlights", icon: Layers3 },
  { id: "snippets", label: "Snippets", icon: FileStack },
  { id: "collections", label: "Collections", icon: Layers3 },
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "settings", label: "Settings", icon: Settings },
];

function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

export function AppShell() {
  const hydrated = useHydrated();
  const view = useMailStore((s) => s.view);
  const setView = useMailStore((s) => s.setView);
  const selectedThreadId = useMailStore((s) => s.selectedThreadId);
  const threadReturnView = useMailStore((s) => s.threadReturnView);
  const startCompose = useMailStore((s) => s.startCompose);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const contacts = useMailStore((s) => s.contacts);
  const toast = useMailStore((s) => s.toast);
  const setToast = useMailStore((s) => s.setToast);
  const setSearch = useMailStore((s) => s.setSearch);
  const settings = useMailStore((s) => s.settings);
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const switchAccount = useMailStore((s) => s.switchAccount);
  const rolloverSometimeTasks = useMailStore((s) => s.rolloverSometimeTasks);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const [appVersion, setAppVersion] = useState("2.6.43");

  const activeAccount = accounts.find((a) => a.id === inboxAccountId) || null;
  const scoped = inboxAccountId;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  useEffect(() => {
    rolloverSometimeTasks();
    const id = window.setInterval(() => rolloverSometimeTasks(), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [rolloverSometimeTasks]);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    void api.getAppInfo().then((info) => {
      if (info?.version) setAppVersion(info.version);
    });
    const loadAccounts = () => {
      void api.listAccounts().then((list) => {
        const mapped = list.map((a) => ({ id: a.id, email: a.email, name: a.name }));
        setAccounts(mapped);
        const current = useMailStore.getState().inboxAccountId;
        if (!mapped.length) {
          if (current) switchAccount(null, { silent: true });
          return;
        }
        const stillValid = current && mapped.some((a) => a.id === current);
        if (!stillValid) {
          switchAccount(mapped[0].id, {
            email: mapped[0].email,
            name: mapped[0].name,
            silent: true,
          });
        }
      });
    };
    loadAccounts();
    const offUninstall = api.onRequestUninstall(() => {
      void api.uninstall();
    });
    const offSync = api.onRequestSync(() => {
      void (async () => {
        setSyncing(true);
        try {
          await syncActiveDesktopAccount();
          loadAccounts();
        } finally {
          setSyncing(false);
        }
      })();
    });
    const offSettings = api.onOpenSettings(() => setView("settings"));
    const offMailto = api.onOpenMailto
      ? api.onOpenMailto((url) => {
          startCompose(url);
        })
      : () => {};
    return () => {
      offUninstall();
      offSync();
      offSettings();
      offMailto();
    };
  }, [setView, switchAccount, startCompose]);

  useEffect(() => {
    if (!isDesktop()) return;
    const minutes = Math.max(1, useMailStore.getState().settings.autoFetchMinutes || 2);
    const run = () => {
      void syncActiveDesktopAccount().then(() => {
        const api = desktopApi();
        if (!api) return;
        void api.listAccounts().then((list) =>
          setAccounts(list.map((a) => ({ id: a.id, email: a.email, name: a.name }))),
        );
        void purgeOldTrash();
      });
    };
    const start = setTimeout(run, 1200);
    const interval = setInterval(run, minutes * 60_000);
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const counts = useMemo(
    () => ({
      lesbox: selectBoxThreads(threads, "lesbox", { onlyNew: true, accountId: scoped, messages }).length,
      feed: selectScreeningThreads(threads, {
        onlyNew: true,
        accountId: scoped,
        messages,
      }).length,
      paper_trail: selectBoxThreads(threads, "paper_trail", {
        onlyNew: true,
        accountId: scoped,
        messages,
      }).length,
      screener: selectNewSenderThreads(threads, contacts, {
        accountId: scoped,
        messages,
      }).length,
      spam: selectBoxThreads(threads, "spam", { accountId: scoped, messages }).length,
      trash: selectBoxThreads(threads, "trash", { accountId: scoped, messages }).length,
      reply_later: selectDockThreads(threads, "reply_later", {
        accountId: scoped,
        messages,
      }).length,
      set_aside: selectDockThreads(threads, "set_aside", {
        accountId: scoped,
        messages,
      }).length,
      // Reply Queue is the same Snooze set — keep badge in sync with Snooze
      focus_reply: selectDockThreads(threads, "reply_later", {
        accountId: scoped,
        messages,
      }).length,
      cleanup: selectCleanupThreads(threads, contacts, messages, { accountId: scoped }).length,
    }),
    [threads, messages, contacts, scoped],
  );

  // Reading a thread keeps its origin list lit in the sidebar.
  const activeListView =
    view === "thread"
      ? resolveThreadBackView(
          threads.find((t) => t.id === selectedThreadId)?.box,
          threadReturnView,
        )
      : view;

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-soft text-muted">
        Loading Envision Mail…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen bg-[linear-gradient(165deg,#e8f7f2_0%,#eef8f4_42%,#fff8f0_100%)]">
      <WallpaperBackground />
      <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-line bg-white/70 backdrop-blur">
        <div className="border-b border-line px-4 py-4">
          <BrandLogo href="/" showVersion />
          {accounts.length > 0 ? (
            <label className="relative mt-3 block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                Active account
              </span>
              <div className="relative">
                <select
                  className="relative z-20 w-full cursor-pointer appearance-none rounded-lg border border-line bg-white py-2 pl-3 pr-8 text-xs font-medium text-ink outline-none focus:border-blurple"
                  value={inboxAccountId || accounts[0]?.id || ""}
                  onChange={(e) => {
                    const a = accounts.find((x) => x.id === e.target.value);
                    if (!a) return;
                    switchAccount(a.id, { email: a.email, name: a.name });
                  }}
                  title="Switch account — only this account’s mail is shown"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              </div>
              <p className="mt-1 text-[10px] text-muted">Isolated workspace · other accounts hidden</p>
            </label>
          ) : (
            <p className="mt-2 truncate text-xs text-muted">
              {settings.email || "Add an account in Settings"}
            </p>
          )}
        </div>
        <div className="space-y-1 p-2">
          <Button className="w-full justify-start" onClick={() => startCompose()}>
            <PenSquare className="h-4 w-4" /> Write
          </Button>
          {isDesktop() ? (
            <Button
              className="w-full justify-start"
              variant="soft"
              disabled={syncing || !inboxAccountId}
              onClick={() => {
                void (async () => {
                  setSyncing(true);
                  try {
                    await syncActiveDesktopAccount();
                    const api = desktopApi();
                    if (api) {
                      const list = await api.listAccounts();
                      setAccounts(list.map((a) => ({ id: a.id, email: a.email, name: a.name })));
                    }
                  } finally {
                    setSyncing(false);
                  }
                })();
              }}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />{" "}
              {syncing ? "Syncing…" : "Sync this account"}
            </Button>
          ) : null}
          <Button
            className="w-full justify-start"
            variant="soft"
            onClick={() => {
              setSearch("");
              setView("search");
            }}
          >
            <Search className="h-4 w-4" /> Search
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {nav.map((item) => {
            const Icon = item.icon;
            const count = item.countKey ? counts[item.countKey as keyof typeof counts] : 0;
            const active = activeListView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                  item.pastel
                    ? active
                      ? `${item.pastelActive} font-semibold text-ink`
                      : `${item.pastel} text-ink hover:brightness-[0.97]`
                    : active
                      ? "bg-[#e6f7f3] font-semibold text-blurple"
                      : "text-ink hover:bg-soft/80",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span className={cn("flex-1 truncate", item.id === "lesbox" && "font-bold text-teal")}>
                  {item.label}
                </span>
                {count > 0 ? (
                  <span
                    key={`${item.id}-${count}`}
                    className="animate-fade-in rounded-md bg-teal px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-line p-3 text-[11px] leading-relaxed text-muted">
          <div className="font-medium text-ink">EnvisionMail {appVersion}</div>
          <div className="mt-1">Thank you for using Envision DMS.</div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto pb-28">
        {view === "lesbox" && <MoneyBoxView />}
        {view === "cleanup" && <EasyCleanupView />}
        {view === "feed" && <FeedView />}
        {view === "paper_trail" && <PaperTrailView />}
        {view === "screener" && <ScreenerView />}
        {view === "sent" && <SentView />}
        {view === "spam" && <SpamView />}
        {view === "trash" && <TrashView />}
        {view === "calendar" && <CalendarView />}
        {view === "reply_later" && <DockListView mode="reply_later" />}
        {view === "set_aside" && <DockListView mode="set_aside" />}
        {view === "focus_reply" && <FocusReplyView />}
        {view === "contacts" && <ContactsView />}
        {view === "attachments" && <AttachmentsView />}
        {view === "clips" && <ClipsView />}
        {view === "snippets" && <SnippetsView />}
        {view === "collections" && <CollectionsView />}
        {view === "workflows" && <WorkflowsView />}
        {view === "settings" && <SettingsView />}
        {view === "search" && <SearchView />}
        {view === "compose" && <ComposeView />}
        {view === "thread" && <ThreadView />}
      </main>

      {(counts.reply_later > 0 || counts.set_aside > 0) &&
      view !== "focus_reply" &&
      view !== "reply_later" &&
      view !== "set_aside" &&
      view !== "compose" ? (
        <div
          className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3"
          aria-label="Quick docks"
        >
          {counts.reply_later > 0 ? (
            <button
              type="button"
              onClick={() => setView("reply_later")}
              className="pointer-events-auto rounded-full bg-amber px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-2 ring-white/80"
            >
              Snooze · {counts.reply_later}
            </button>
          ) : null}
          {counts.set_aside > 0 ? (
            <button
              type="button"
              onClick={() => setView("set_aside")}
              className="pointer-events-auto rounded-full bg-teal px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-2 ring-white/80"
            >
              On Hold · {counts.set_aside}
            </button>
          ) : null}
        </div>
      ) : null}

      {toast ? (
        <div
          className={cn(
            "fixed left-1/2 z-50 -translate-x-1/2",
            (counts.reply_later > 0 || counts.set_aside > 0) &&
              view !== "focus_reply" &&
              view !== "reply_later" &&
              view !== "set_aside"
              ? "bottom-28"
              : "bottom-6",
          )}
        >
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      ) : null}

      <ReminderOverlay />
    </div>
  );
}
