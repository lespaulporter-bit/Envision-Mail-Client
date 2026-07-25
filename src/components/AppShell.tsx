"use client";

import { CalendarView } from "@/components/CalendarView";
import {
  DockListView,
  FeedView,
  FocusReplyView,
  LesBoxView,
  PaperTrailView,
  ScreenerView,
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
import { ThreadView } from "@/components/ThreadView";
import { Button, Toast } from "@/components/ui";
import { WallpaperBackground } from "@/components/WallpaperBackground";
import { syncAllDesktopAccounts } from "@/components/AccountsPanel";
import { desktopApi, isDesktop } from "@/lib/desktop";
import { selectBoxThreads, useHeyStore, type AppView } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  CalendarDays,
  ClipboardList,
  Clock3,
  ContactRound,
  FileStack,
  Inbox,
  Layers3,
  Newspaper,
  Paperclip,
  PenSquare,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

const nav: {
  id: AppView;
  label: string;
  icon: ComponentType<{ className?: string }>;
  countKey?: string;
  pastel?: string;
  pastelActive?: string;
}[] = [
  { id: "lesbox", label: "LesBox", icon: Inbox, countKey: "lesbox", pastel: "bg-[#d6e8ff]", pastelActive: "bg-[#b8d6ff]" },
  { id: "feed", label: "The Feed", icon: Newspaper, countKey: "feed", pastel: "bg-[#d8f5e8]", pastelActive: "bg-[#b8ebd4]" },
  { id: "paper_trail", label: "Paper Trail", icon: Receipt, countKey: "paper_trail", pastel: "bg-[#ffe4d6]", pastelActive: "bg-[#ffd0b8]" },
  { id: "screener", label: "Screener", icon: ShieldCheck, countKey: "screener", pastel: "bg-[#fff0c8]", pastelActive: "bg-[#ffe29a]" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, pastel: "bg-[#e8ddff]", pastelActive: "bg-[#d4c4ff]" },
  { id: "reply_later", label: "Reply Later", icon: Clock3, countKey: "reply_later", pastel: "bg-[#d9f0f7]", pastelActive: "bg-[#bde4f0]" },
  { id: "set_aside", label: "Set Aside", icon: Bookmark, countKey: "set_aside", pastel: "bg-[#fce0eb]", pastelActive: "bg-[#f7c5d8]" },
  { id: "focus_reply", label: "Focus & Reply", icon: ClipboardList, pastel: "bg-[#d5f2ef]", pastelActive: "bg-[#b5e8e2]" },
  { id: "contacts", label: "Contacts", icon: ContactRound, pastel: "bg-[#ece0f5]", pastelActive: "bg-[#dcc8ed]" },
  { id: "attachments", label: "Attachments", icon: Paperclip },
  { id: "clips", label: "Clips", icon: Layers3 },
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
  const view = useHeyStore((s) => s.view);
  const setView = useHeyStore((s) => s.setView);
  const threads = useHeyStore((s) => s.threads);
  const toast = useHeyStore((s) => s.toast);
  const setToast = useHeyStore((s) => s.setToast);
  const setSearch = useHeyStore((s) => s.setSearch);
  const settings = useHeyStore((s) => s.settings);
  const inboxAccountId = useHeyStore((s) => s.inboxAccountId);
  const setInboxAccountId = useHeyStore((s) => s.setInboxAccountId);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const [appVersion, setAppVersion] = useState("10.0.0");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    void api.getAppInfo().then((info) => {
      if (info?.version) setAppVersion(info.version);
    });
    const loadAccounts = () => {
      void api.listAccounts().then((list) =>
        setAccounts(list.map((a) => ({ id: a.id, email: a.email, name: a.name }))),
      );
    };
    loadAccounts();
    const offUninstall = api.onRequestUninstall(() => {
      void api.uninstall();
    });
    const offSync = api.onRequestSync(() => {
      void (async () => {
        setSyncing(true);
        try {
          const result = await syncAllDesktopAccounts();
          loadAccounts();
          if (!(result.screened > 0)) {
            setInboxAccountId(null);
          }
          // Store already sets Screener when screened; otherwise leave / go LesBox
          if (!(result.screened > 0) && useHeyStore.getState().view !== "screener") {
            setView("lesbox");
          }
        } finally {
          setSyncing(false);
        }
      })();
    });
    const offSettings = api.onOpenSettings(() => setView("settings"));
    return () => {
      offUninstall();
      offSync();
      offSettings();
    };
  }, [setView, setInboxAccountId]);

  // Auto-sync on launch + interval (push/fetch style polling)
  useEffect(() => {
    if (!isDesktop()) return;
    const minutes = Math.max(1, useHeyStore.getState().settings.autoFetchMinutes || 2);
    const run = () => {
      void syncAllDesktopAccounts().then(() => {
        const api = desktopApi();
        if (!api) return;
        void api.listAccounts().then((list) =>
          setAccounts(list.map((a) => ({ id: a.id, email: a.email, name: a.name }))),
        );
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

  const counts = {
    lesbox: selectBoxThreads(threads, "lesbox", { onlyNew: true, accountId: null }).length,
    feed: selectBoxThreads(threads, "feed", { onlyNew: true }).length,
    paper_trail: selectBoxThreads(threads, "paper_trail", { onlyNew: true }).length,
    screener: selectBoxThreads(threads, "screener").length,
    reply_later: threads.filter((t) => t.replyLater).length,
    set_aside: threads.filter((t) => t.setAside).length,
  };

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-soft text-muted">
        Loading Les Mail…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen bg-[linear-gradient(165deg,#efe8ff_0%,#e8f7f2_42%,#fff4eb_100%)]">
      <WallpaperBackground />
      <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-line bg-white/70 backdrop-blur">
        <div className="border-b border-line px-4 py-4">
          <a href="/" className="font-display text-3xl tracking-tight" style={{ backgroundImage: "var(--hey-gradient)", WebkitBackgroundClip: "text", color: "transparent" }}>
            Les Mail
          </a>
          <p className="mt-1 truncate text-xs text-muted">{settings.email}</p>
        </div>
        <div className="space-y-1 p-2">
          <Button className="w-full justify-start" onClick={() => setView("compose")}>
            <PenSquare className="h-4 w-4" /> Write
          </Button>
          {isDesktop() ? (
            <Button
              className="w-full justify-start"
              variant="soft"
              disabled={syncing}
              onClick={() => {
                void (async () => {
                  setSyncing(true);
                  try {
                    const result = await syncAllDesktopAccounts();
                    const api = desktopApi();
                    if (api) {
                      const list = await api.listAccounts();
                      setAccounts(list.map((a) => ({ id: a.id, email: a.email, name: a.name })));
                    }
                    if (!(result.screened > 0)) {
                      setInboxAccountId(null);
                      if (useHeyStore.getState().view !== "screener") {
                        setView("lesbox");
                      }
                    }
                  } finally {
                    setSyncing(false);
                  }
                })();
              }}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync mail"}
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
            const isLesBox = item.id === "lesbox";
            const active = isLesBox
              ? (view === "lesbox" || view === "thread") && !inboxAccountId
              : view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (isLesBox) setInboxAccountId(null);
                  else setView(item.id);
                }}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                  item.pastel
                    ? active
                      ? `${item.pastelActive} font-semibold text-ink`
                      : `${item.pastel} text-ink hover:brightness-[0.97]`
                    : active
                      ? "bg-[#f0ebff] font-semibold text-blurple"
                      : "text-ink hover:bg-soft/80",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span
                  className={cn(
                    "flex-1 truncate",
                    isLesBox && "font-bold text-hey-blue",
                  )}
                >
                  {item.label}
                </span>
                {count ? (
                  <span className="rounded-md bg-blurple px-1.5 py-0.5 text-[10px] font-bold text-white">{count}</span>
                ) : null}
              </button>
            );
          })}

          {accounts.length > 0 ? (
            <div className="mt-3 border-t border-line pt-3">
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Inboxes
              </div>
              {accounts.map((a) => {
                const newCount = selectBoxThreads(threads, "lesbox", {
                  onlyNew: true,
                  accountId: a.id,
                }).length;
                const screenerCount = selectBoxThreads(threads, "screener", {
                  accountId: a.id,
                }).length;
                const active = view === "lesbox" && inboxAccountId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setInboxAccountId(a.id)}
                    className={cn(
                      "mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                      active ? "bg-[#f0ebff] font-semibold text-blurple" : "text-ink hover:bg-soft",
                    )}
                    title={a.email}
                  >
                    <Inbox className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="flex-1 truncate">{a.email}</span>
                    {screenerCount ? (
                      <span
                        className="rounded-md bg-amber px-1.5 py-0.5 text-[10px] font-bold text-white"
                        title="In Screener"
                      >
                        {screenerCount}
                      </span>
                    ) : null}
                    {newCount ? (
                      <span className="rounded-md bg-blurple px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {newCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </nav>
        <div className="border-t border-line p-3 text-[11px] leading-relaxed text-muted">
          Les Mail {appVersion} — Screener for new mail, LesBox when you allow. Menu → Uninstall to
          remove.
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto pb-28">
        {view === "lesbox" && <LesBoxView />}
        {view === "feed" && <FeedView />}
        {view === "paper_trail" && <PaperTrailView />}
        {view === "screener" && <ScreenerView />}
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
      view !== "set_aside" ? (
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
              Reply Later · {counts.reply_later}
            </button>
          ) : null}
          {counts.set_aside > 0 ? (
            <button
              type="button"
              onClick={() => setView("set_aside")}
              className="pointer-events-auto rounded-full bg-hey-blue px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-2 ring-white/80"
            >
              Set Aside · {counts.set_aside}
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
    </div>
  );
}
