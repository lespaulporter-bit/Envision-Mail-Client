"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createEmptyState } from "./seed";
import type {
  AppStateData,
  Box,
  CalendarEvent,
  CoverArtMode,
  EmailTemplate,
  MailBox,
  Message,
  Reminder,
  Settings,
  SignatureTemplate,
  Thread,
  Workflow,
} from "./types";
import { normalizeBox, normalizeMailBox } from "./types";
import { syncThreadTags, threadHasContent } from "./thread-tags";
import {
  activatePendingReminders,
  buildMailReminder,
  collectDueReminders,
  mergeNewReminders,
} from "./reminders";
import { normalizeSometimeTasks, weekStartKey } from "./sometime-tasks";
import { mergeRecentRecipients } from "./recipient-suggest";
import { parseMailtoUrl } from "./mailto";
import { uid } from "./utils";

export type AppView =
  | "lesbox"
  | "feed"
  | "paper_trail"
  | "screener"
  | "sent"
  | "spam"
  | "trash"
  | "calendar"
  | "contacts"
  | "attachments"
  | "clips"
  | "snippets"
  | "collections"
  | "workflows"
  | "settings"
  | "search"
  | "focus_reply"
  | "compose"
  | "thread"
  | "set_aside"
  | "reply_later";

interface UiState {
  view: AppView;
  selectedThreadId: string | null;
  selectedContactId: string | null;
  searchQuery: string;
  powerThrough: boolean;
  multiOpenIds: string[];
  /** null = all accounts in MoneyBox $; otherwise filter by desktop account id */
  inboxAccountId: string | null;
  composeDraft: {
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    body: string;
    replyToThreadId?: string | null;
  };
  calendarDate: string;
  calendarView: "day" | "week" | "month" | "agenda";
  /** Settings sub-tab — survives remounts so edits aren't lost after background sync */
  settingsTab: "accounts" | "general" | "mail" | "appearance" | "templates" | "about";
  toast: string | null;
}

interface Actions {
  setView: (view: AppView) => void;
  openThread: (id: string) => void;
  setSearch: (q: string) => void;
  setToast: (msg: string | null) => void;
  togglePowerThrough: () => void;
  toggleMultiOpen: (id: string) => void;
  clearMultiOpen: () => void;
  setInboxAccountId: (accountId: string | null) => void;
  /** Switch active account — UI shows only that account’s mail/contacts. */
  switchAccount: (
    accountId: string | null,
    meta?: { email?: string; name?: string; silent?: boolean },
  ) => void;
  setCompose: (draft: Partial<UiState["composeDraft"]>) => void;
  /**
   * Open a brand-new compose. Always clears body.
   * Pass a mailto: URL or partial fields — never carries over prior draft text.
   */
  startCompose: (
    mailtoOrFields?:
      | string
      | Partial<{ to: string; cc: string; bcc: string; subject: string }>,
  ) => void;
  setCalendarDate: (isoDate: string) => void;
  setCalendarView: (v: UiState["calendarView"]) => void;
  setSettingsTab: (tab: UiState["settingsTab"]) => void;

  screenContact: (
    email: string,
    decision: "allow" | "block",
    box?: MailBox,
  ) => void;
  markSpam: (threadId: string) => void;
  moveThread: (threadId: string, box: Box) => void;
  deleteThreadsToTrash: (threadIds: string[]) => void;
  permanentlyDeleteThreads: (threadIds: string[]) => void;
  restoreThreadsFromTrash: (threadIds: string[]) => void;
  markSeen: (threadId: string, seen?: boolean) => void;
  markAllSeenInBox: (box: Box) => void;
  toggleReplyLater: (threadId: string) => void;
  toggleSetAside: (threadId: string) => void;
  setBubbleUp: (threadId: string, at: string | null) => void;
  toggleBundleContact: (email: string) => void;
  renameSubject: (threadId: string, subject: string) => void;
  muteThread: (threadId: string) => void;
  mergeThreads: (targetId: string, sourceId: string) => void;
  addStickyNote: (threadId: string, text: string) => void;
  addPrivateNote: (threadId: string, text: string) => void;
  toggleThreadNotify: (threadId: string) => void;
  shareThread: (threadId: string) => string;
  clipText: (threadId: string, subject: string, text: string) => void;
  deleteClip: (id: string) => void;
  setWorkflowStage: (threadId: string, workflowId: string, stageId: string) => void;
  addToCollection: (threadId: string, collectionId: string) => void;
  createCollection: (name: string) => void;
  createSnippet: (name: string, body: string) => void;
  deleteSnippet: (id: string) => void;
  upsertSignature: (sig: SignatureTemplate) => void;
  deleteSignature: (id: string) => void;
  setDefaultSignature: (id: string | null) => void;
  upsertEmailTemplate: (tpl: EmailTemplate) => void;
  deleteEmailTemplate: (id: string) => void;
  recordReadReceipt: (messageId: string, readerEmail: string, readerName?: string) => void;
  markOutgoingReadReceipt: (smtpMessageId: string, readerEmail: string, readerName?: string) => void;
  updateContactNotes: (contactId: string, notes: string) => void;
  updateContactNotify: (contactId: string, notify: boolean) => void;
  updateContactAvatar: (contactId: string, avatarImageDataUrl: string | null) => void;
  /** Apply a logo to the contact matching this email (creates contact if missing). */
  setAvatarForEmail: (email: string, name: string, avatarImageDataUrl: string | null) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setCoverArt: (mode: CoverArtMode) => void;

  sendReply: (threadId: string, body: string) => void;
  sendNewEmail: (
    to: string,
    subject: string,
    body: string,
    opts?: {
      requestReadReceipt?: boolean;
      smtpMessageId?: string | null;
      cc?: string[];
      bcc?: string[];
      accountId?: string | null;
      accountEmail?: string | null;
    },
  ) => void;
  rememberRecipients: (emails: string[], names?: Record<string, string>) => void;
  replyToEveryone: (threadIds: string[], body: string) => void;
  importSyncedMail: (
    payload: {
      accountId: string;
      email: string;
      displayName?: string;
      messages: Array<{
        uid: number;
        folder?: "inbox" | "sent" | string;
        from: string;
        fromName: string;
        to: string[];
        subject: string;
        bodyHtml: string;
        bodyText: string;
        sentAt: string;
        seen: boolean;
        attachments: Message["attachments"];
        trackersBlocked: string[];
        messageIdHeader?: string | null;
        inReplyTo?: string | null;
        listUnsubscribe?: string | null;
        listUnsubscribePost?: string | null;
        unsubscribeHttpUrl?: string | null;
        unsubscribeMailto?: string | null;
        unsubscribeOneClick?: boolean;
      }>;
    },
    opts?: {
      /** Background poll — no toast spam; never steals the current screen. */
      background?: boolean;
    },
  ) => { imported: number; screened: number };
  markMessageUnsubscribed: (messageId: string) => void;

  addEvent: (event: Omit<CalendarEvent, "id">) => void;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  toggleCalendarVisible: (calendarId: string) => void;
  duplicateEvent: (id: string) => void;
  importMacCalendarData: (payload: {
    calendars: Array<{ id: string; name: string; color?: string }>;
    events: Array<{
      id: string;
      title: string;
      start: string;
      end: string;
      calendarId: string;
      location?: string;
      notes?: string;
    }>;
  }) => void;
  toggleHabit: (habitId: string, date: string) => void;
  addSometimeTask: (text: string) => void;
  /** Checking off a task removes it. Unchecked tasks roll into future weeks. */
  toggleSometimeTask: (id: string) => void;
  rolloverSometimeTasks: () => void;
  setJournal: (date: string, body: string) => void;
  setDayLabel: (date: string, label: string) => void;
  createEventFromThread: (threadId: string) => void;
  /** Fire due calendar/mail reminders; activate pending. Returns newly active count. */
  tickReminders: () => number;
  scheduleMailReminder: (threadId: string, minutesFromNow: number) => void;
  dismissReminder: (id: string) => void;
  snoozeReminder: (id: string, minutes: number) => void;
  openReminder: (id: string) => void;

  createWorkflow: (name: string) => void;
  resetDemo: () => void;

  // selectors as methods for convenience
  getThreadMessages: (threadId: string) => Message[];
  getAttachments: () => AppStateData extends never ? never : import("./types").Attachment[];
}

export type MailStore = AppStateData & UiState & Actions;

const seed = createEmptyState();

function bumpThread(t: Thread): Thread {
  return { ...t, updatedAt: new Date().toISOString() };
}

function threadHasImapMail(thread: Thread, messages: Record<string, Message>): boolean {
  if (thread.accountId) return true;
  if (thread.messageIds.some((id) => id.startsWith("imap_"))) return true;
  return thread.messageIds.some((id) => messages[id]?.id?.startsWith("imap_"));
}

/** Backfill missing accountId from imap_<accountId>_<uid> message ids. Does NOT move screener → lesbox. */
function backfillImapAccountIds(threads: Thread[], messages: Record<string, Message>): Thread[] {
  return threads.map((t) => {
    if (t.accountId) return t;
    if (!threadHasImapMail(t, messages)) return t;

    let accountId: string | null = null;
    for (const mid of t.messageIds) {
      const m = /^imap_(.+)_\d+$/.exec(mid);
      if (m) {
        accountId = m[1];
        break;
      }
    }
    return accountId ? { ...t, accountId } : t;
  });
}



const PERSIST_NAME = "envision-mail-v1";

/** Durable storage: userData JSON file (via Electron) + localStorage mirror. Survives updates & port changes. */
function createDurableStorage() {
  let memory: string | null = null;
  let hydratedFromFile = false;

  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        const api = typeof window !== "undefined" ? window.lesMail : undefined;
        if (api?.loadAppState) {
          const file = (await api.loadAppState()) as { state?: unknown; version?: number } | null;
          if (file && file.state && typeof file.state === "object") {
            const threads = (file.state as { threads?: unknown[] }).threads;
            const collections = (file.state as { collections?: unknown[] }).collections;
            const hasData =
              (Array.isArray(threads) && threads.length > 0) ||
              (Array.isArray(collections) && collections.length > 0);
            if (hasData || !localStorage.getItem(name)) {
              const wrapped = JSON.stringify({ state: file.state, version: file.version ?? 0 });
              memory = wrapped;
              try {
                localStorage.setItem(name, wrapped);
              } catch {
                /* quota */
              }
              hydratedFromFile = true;
              return wrapped;
            }
          }
        }
      } catch {
        /* fall through */
      }
      if (typeof window !== "undefined" && window.localStorage) {
        for (const key of [name, "les-mail-v4", "les-mail-v3", "les-mail-v2", "les-mail-v1"]) {
          const raw = localStorage.getItem(key);
          if (raw) {
            if (key !== name) {
              try {
                localStorage.setItem(name, raw);
              } catch {
                /* ignore */
              }
            }
            memory = raw;
            return raw;
          }
        }
      }
      return memory;
    },
    setItem: async (name: string, value: string): Promise<void> => {
      memory = value;
      try {
        localStorage.setItem(name, value);
      } catch {
        /* ignore quota */
      }
      try {
        const api = typeof window !== "undefined" ? window.lesMail : undefined;
        if (api?.saveAppState) {
          const parsed = JSON.parse(value) as { state?: unknown; version?: number };
          await api.saveAppState(parsed);
        }
      } catch (err) {
        console.warn("saveAppState failed", err);
      }
    },
    removeItem: async (name: string): Promise<void> => {
      memory = null;
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}


export const useMailStore = create<MailStore>()(
  persist(
    (set, get) => ({
      ...seed,
      view: "lesbox",
      selectedThreadId: null,
      selectedContactId: null,
      searchQuery: "",
      powerThrough: false,
      multiOpenIds: [],
      inboxAccountId: null,
      composeDraft: { to: "", cc: "", bcc: "", subject: "", body: "", replyToThreadId: null },
      calendarDate: new Date().toISOString().slice(0, 10),
      calendarView: "week",
      settingsTab: "accounts",
      toast: null,

      setView: (view) => set({ view, selectedThreadId: view === "thread" ? get().selectedThreadId : get().selectedThreadId }),
      openThread: (id) => {
        const thread = get().threads.find((t) => t.id === id);
        if (!thread) return;
        const active = get().inboxAccountId;
        if (active && thread.accountId && thread.accountId !== active) {
          set({ toast: "That email belongs to another account — switch accounts to open it." });
          return;
        }
        set({
          view: "thread",
          selectedThreadId: id,
          threads: get().threads.map((t) => (t.id === id ? { ...t, seen: true } : t)),
        });
      },
      setSearch: (searchQuery) => set({ searchQuery, view: "search" }),
      setToast: (toast) => set({ toast }),
      togglePowerThrough: () => set({ powerThrough: !get().powerThrough }),
      toggleMultiOpen: (id) => {
        const ids = get().multiOpenIds;
        const adding = !ids.includes(id);
        set({
          multiOpenIds: adding ? [...ids, id] : ids.filter((x) => x !== id),
          toast: adding ? "Added to Multi" : "Removed from Multi",
        });
      },
      clearMultiOpen: () => set({ multiOpenIds: [] }),
      setInboxAccountId: (inboxAccountId) =>
        get().switchAccount(inboxAccountId, { silent: true }),
      switchAccount: (accountId, meta) => {
        const prev = get().inboxAccountId;
        const silent = Boolean(meta?.silent);
        const nextSettings = meta?.email
          ? {
              ...get().settings,
              email: meta.email,
              displayName: meta.name || meta.email.split("@")[0] || get().settings.displayName,
            }
          : get().settings;

        // Same account — update profile only; never yank user out of Settings / Compose / Calendar
        if (prev === accountId) {
          if (meta?.email) {
            set({
              settings: nextSettings,
              toast: silent ? get().toast : `Switched to ${meta.email}`,
            });
          }
          return;
        }

        set({
          inboxAccountId: accountId,
          selectedThreadId: null,
          multiOpenIds: [],
          // Silent switches (sync) must not wipe in-progress UI work
          searchQuery: silent ? get().searchQuery : "",
          selectedContactId: silent ? get().selectedContactId : null,
          composeDraft: silent
            ? get().composeDraft
            : { to: "", cc: "", bcc: "", subject: "", body: "", replyToThreadId: null },
          view: silent ? get().view : "lesbox",
          settings: nextSettings,
          toast: silent
            ? get().toast
            : accountId && meta?.email
              ? `Switched to ${meta.email}`
              : accountId
                ? "Account switched"
                : null,
        });
      },
      setCompose: (draft) => set({ composeDraft: { ...get().composeDraft, ...draft } }),
      startCompose: (mailtoOrFields) => {
        // Fresh slate every time — never reuse prior draft body (avoids leaked notes)
        let to = "";
        let cc = "";
        let bcc = "";
        let subject = "";
        if (typeof mailtoOrFields === "string" && mailtoOrFields.trim()) {
          const parsed = parseMailtoUrl(mailtoOrFields);
          if (parsed) {
            to = parsed.to;
            cc = parsed.cc;
            bcc = parsed.bcc;
            subject = parsed.subject;
          } else if (mailtoOrFields.includes("@") && !mailtoOrFields.includes("://")) {
            to = mailtoOrFields.trim();
          }
        } else if (mailtoOrFields && typeof mailtoOrFields === "object") {
          to = String(mailtoOrFields.to || "");
          cc = String(mailtoOrFields.cc || "");
          bcc = String(mailtoOrFields.bcc || "");
          subject = String(mailtoOrFields.subject || "");
        }
        set({
          composeDraft: {
            to,
            cc,
            bcc,
            subject,
            body: "",
            replyToThreadId: null,
          },
          view: "compose",
          selectedThreadId: null,
        });
      },
      setCalendarDate: (calendarDate) => set({ calendarDate }),
      setCalendarView: (calendarView) => set({ calendarView }),
      setSettingsTab: (settingsTab) => set({ settingsTab }),

      screenContact: (email, decision, box = "lesbox") => {
        const activeId = get().inboxAccountId;
        const contacts = get().contacts.map((c) =>
          c.email === email
            ? {
                ...c,
                status: decision === "allow" ? ("allowed" as const) : ("blocked" as const),
                defaultBox: decision === "allow" ? box : c.defaultBox,
              }
            : c,
        );
        const threads = get().threads.map((t) => {
          if (t.contactEmail !== email || t.box !== "screener") return t;
          if (activeId && t.accountId && t.accountId !== activeId) return t;
          if (decision === "block") return { ...t, box: "spam" as Box, seen: true };
          return bumpThread({ ...t, box });
        });
        set({ contacts, threads, toast: decision === "allow" ? `Allowed → ${box.replace("_", " ")}` : "Blocked / spam" });
      },

      markSpam: (threadId) => {
        const thread = get().threads.find((t) => t.id === threadId);
        if (!thread) return;
        set({
          threads: get().threads.map((t) => (t.id === threadId ? { ...t, box: "spam" as Box, seen: true } : t)),
          contacts: get().contacts.map((c) =>
            c.email === thread.contactEmail ? { ...c, status: "blocked" as const } : c,
          ),
          toast: "Blocked & reported to Spam Central",
        });
      },

      moveThread: (threadId, box) =>
        set({
          threads: get().threads.map((t) => (t.id === threadId ? bumpThread({ ...t, box }) : t)),
          toast: `Moved to ${box.replace("_", " ")}`,
        }),

      deleteThreadsToTrash: (threadIds) => {
        const ids = new Set(threadIds);
        set({
          threads: get().threads.map((t) =>
            ids.has(t.id)
              ? { ...t, box: "trash" as Box, seen: true, replyLater: false, setAside: false }
              : t,
          ),
          toast: threadIds.length > 1 ? `Moved ${threadIds.length} to Trash` : "Moved to Trash",
          view: get().view === "thread" && ids.has(get().selectedThreadId || "") ? "lesbox" : get().view,
        });
      },

      permanentlyDeleteThreads: (threadIds) => {
        const ids = new Set(threadIds);
        const msgs = { ...get().messages };
        for (const t of get().threads) {
          if (!ids.has(t.id)) continue;
          for (const mid of t.messageIds) delete msgs[mid];
        }
        set({
          threads: get().threads.filter((t) => !ids.has(t.id)),
          messages: msgs,
          toast: threadIds.length > 1 ? `Deleted ${threadIds.length} forever` : "Deleted forever",
          view: get().view === "thread" && ids.has(get().selectedThreadId || "") ? "trash" : get().view,
          selectedThreadId:
            ids.has(get().selectedThreadId || "") ? null : get().selectedThreadId,
        });
      },

      restoreThreadsFromTrash: (threadIds) => {
        const ids = new Set(threadIds);
        set({
          threads: get().threads.map((t) =>
            ids.has(t.id) ? bumpThread({ ...t, box: "lesbox" as Box, seen: false }) : t,
          ),
          toast: "Restored to MoneyBox $",
        });
      },

      markSeen: (threadId, seen = true) =>
        set({
          threads: get().threads.map((t) => (t.id === threadId ? { ...t, seen } : t)),
        }),

      markAllSeenInBox: (box) =>
        set({
          threads: get().threads.map((t) => (t.box === box ? { ...t, seen: true } : t)),
          toast: "Cleared new mail",
        }),

      toggleReplyLater: (threadId) => {
        const prev = get().threads.find((t) => t.id === threadId);
        const nextVal = !prev?.replyLater;
        set({
          threads: get().threads.map((t) => {
            if (t.id !== threadId) return t;
            const next = bumpThread({ ...t, replyLater: nextVal });
            return { ...next, tags: syncThreadTags(next) };
          }),
          toast: nextVal ? "Snoozed — tagged Snoozed" : "Snooze removed",
        });
      },

      toggleSetAside: (threadId) => {
        const prev = get().threads.find((t) => t.id === threadId);
        const nextVal = !prev?.setAside;
        set({
          threads: get().threads.map((t) => {
            if (t.id !== threadId) return t;
            const next = bumpThread({ ...t, setAside: nextVal });
            return { ...next, tags: syncThreadTags(next) };
          }),
          toast: nextVal ? "On Hold — tagged On Hold" : "Hold removed",
        });
      },

      setBubbleUp: (threadId, at) =>
        set({
          threads: get().threads.map((t) => {
            if (t.id !== threadId) return t;
            const next = bumpThread({ ...t, bubbleUpAt: at, seen: at ? true : t.seen });
            return { ...next, tags: syncThreadTags(next) };
          }),
          toast: at ? "Bumped — tagged Bumped" : "Bump cleared",
        }),

      toggleBundleContact: (email) => {
        const contact = get().contacts.find((c) => c.email === email);
        const bundled = !contact?.bundled;
        set({
          contacts: get().contacts.map((c) => (c.email === email ? { ...c, bundled } : c)),
          threads: get().threads.map((t) => {
            if (t.contactEmail !== email) return t;
            const next = { ...t, bundled };
            return { ...next, tags: syncThreadTags(next) };
          }),
          toast: bundled ? "Bundled — tagged Bundled" : "Sender unbundled",
        });
      },

      renameSubject: (threadId, subject) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, customSubject: subject }) : t,
          ),
          toast: "Subject renamed",
        }),

      muteThread: (threadId) => {
        const prev = get().threads.find((t) => t.id === threadId);
        const nextVal = !prev?.muted;
        set({
          threads: get().threads.map((t) => {
            if (t.id !== threadId) return t;
            const next = bumpThread({
              ...t,
              muted: nextVal,
              seen: nextVal ? true : t.seen,
            });
            return { ...next, tags: syncThreadTags(next) };
          }),
          toast: nextVal ? "Muted — tagged Muted" : "Unmuted",
        });
      },

      mergeThreads: (targetId, sourceId) => {
        const target = get().threads.find((t) => t.id === targetId);
        const source = get().threads.find((t) => t.id === sourceId);
        if (!target || !source) return;
        const mergedIds = [...target.messageIds, ...source.messageIds];
        set({
          threads: get()
            .threads.filter((t) => t.id !== sourceId)
            .map((t) =>
              t.id === targetId
                ? bumpThread({
                    ...t,
                    messageIds: mergedIds,
                    stickyNotes: [...t.stickyNotes, ...source.stickyNotes],
                    privateNotes: [...t.privateNotes, ...source.privateNotes],
                  })
                : t,
            ),
          toast: "Threads merged",
          selectedThreadId: targetId,
        });
      },

      addStickyNote: (threadId, text) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId
              ? bumpThread({
                  ...t,
                  stickyNotes: [...t.stickyNotes, { id: uid("sn"), text, createdAt: new Date().toISOString() }],
                })
              : t,
          ),
        }),

      addPrivateNote: (threadId, text) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId
              ? bumpThread({
                  ...t,
                  privateNotes: [
                    ...t.privateNotes,
                    { id: uid("pn"), text, files: [], createdAt: new Date().toISOString() },
                  ],
                })
              : t,
          ),
        }),

      toggleThreadNotify: (threadId) => {
        const prev = get().threads.find((t) => t.id === threadId);
        const nextVal = !prev?.notify;
        set({
          threads: get().threads.map((t) => {
            if (t.id !== threadId) return t;
            const next = { ...t, notify: nextVal };
            return { ...next, tags: syncThreadTags(next) };
          }),
          toast: nextVal ? "Notify on — tagged Notify" : "Notify off",
        });
      },

      shareThread: (threadId) => {
        const token = uid("share");
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? { ...t, shareToken: token } : t,
          ),
          toast: "Share link ready",
        });
        if (typeof navigator !== "undefined") {
          void navigator.clipboard?.writeText(`${window.location.origin}/share/?token=${token}`);
        }
        return token;
      },

      clipText: (threadId, subject, text) =>
        set({
          clips: [
            {
              id: uid("cl"),
              text,
              sourceThreadId: threadId,
              sourceSubject: subject,
              createdAt: new Date().toISOString(),
            },
            ...get().clips,
          ],
          toast: "Saved highlight",
        }),

      deleteClip: (id) => set({ clips: get().clips.filter((c) => c.id !== id) }),

      setWorkflowStage: (threadId, workflowId, stageId) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, workflowId, workflowStageId: stageId }) : t,
          ),
        }),

      addToCollection: (threadId, collectionId) =>
        set({
          collections: get().collections.map((c) =>
            c.id === collectionId && !c.threadIds.includes(threadId)
              ? { ...c, threadIds: [...c.threadIds, threadId] }
              : c,
          ),
          threads: get().threads.map((t) =>
            t.id === threadId && !t.collectionIds.includes(collectionId)
              ? { ...t, collectionIds: [...t.collectionIds, collectionId] }
              : t,
          ),
        }),

      createCollection: (name) =>
        set({
          collections: [...get().collections, { id: uid("col"), name, threadIds: [], shared: false }],
        }),

      createSnippet: (name, body) =>
        set({
          snippets: [...get().snippets, { id: uid("s"), name, body }],
        }),

      deleteSnippet: (id) => set({ snippets: get().snippets.filter((s) => s.id !== id) }),

      upsertSignature: (sig) => {
        const list = get().signatures || [];
        const exists = list.some((s) => s.id === sig.id);
        const next = exists ? list.map((s) => (s.id === sig.id ? sig : s)) : [...list, sig];
        const normalized = sig.isDefault
          ? next.map((s) => ({ ...s, isDefault: s.id === sig.id }))
          : next;
        set({
          signatures: normalized,
          settings: {
            ...get().settings,
            defaultSignatureId: sig.isDefault ? sig.id : get().settings.defaultSignatureId,
          },
        });
      },

      deleteSignature: (id) =>
        set({
          signatures: (get().signatures || []).filter((s) => s.id !== id),
          settings: {
            ...get().settings,
            defaultSignatureId:
              get().settings.defaultSignatureId === id ? null : get().settings.defaultSignatureId,
          },
        }),

      setDefaultSignature: (id) =>
        set({
          signatures: (get().signatures || []).map((s) => ({ ...s, isDefault: s.id === id })),
          settings: { ...get().settings, defaultSignatureId: id },
        }),

      upsertEmailTemplate: (tpl) => {
        const list = get().emailTemplates || [];
        const exists = list.some((t) => t.id === tpl.id);
        set({
          emailTemplates: exists ? list.map((t) => (t.id === tpl.id ? tpl : t)) : [...list, tpl],
        });
      },

      deleteEmailTemplate: (id) =>
        set({
          emailTemplates: (get().emailTemplates || []).filter((t) => t.id !== id),
        }),

      recordReadReceipt: (messageId, readerEmail, readerName) => {
        const msg = get().messages[messageId];
        if (!msg) return;
        const receipts = msg.readReceipts || [];
        if (receipts.some((r) => r.readerEmail.toLowerCase() === readerEmail.toLowerCase())) return;
        set({
          messages: {
            ...get().messages,
            [messageId]: {
              ...msg,
              readReceipts: [
                ...receipts,
                {
                  id: uid("rr"),
                  readerEmail,
                  readerName,
                  readAt: new Date().toISOString(),
                },
              ],
            },
          },
          toast: `Read by ${readerName || readerEmail}`,
        });
      },

      markOutgoingReadReceipt: (smtpMessageId, readerEmail, readerName) => {
        const entry = Object.entries(get().messages).find(
          ([, m]) => m.smtpMessageId && m.smtpMessageId === smtpMessageId,
        );
        if (!entry) return;
        get().recordReadReceipt(entry[0], readerEmail, readerName);
      },

      updateContactNotes: (contactId, notes) =>
        set({
          contacts: get().contacts.map((c) => (c.id === contactId ? { ...c, notes } : c)),
        }),

      updateContactNotify: (contactId, notify) =>
        set({
          contacts: get().contacts.map((c) => (c.id === contactId ? { ...c, notify } : c)),
        }),

      updateContactAvatar: (contactId, avatarImageDataUrl) =>
        set({
          contacts: get().contacts.map((c) =>
            c.id === contactId ? { ...c, avatarImageDataUrl } : c,
          ),
        }),

      setAvatarForEmail: (email, name, avatarImageDataUrl) => {
        const key = String(email || "")
          .trim()
          .toLowerCase();
        if (!key.includes("@")) return;
        const existing = get().contacts.find((c) => c.email.toLowerCase() === key);
        if (existing) {
          set({
            contacts: get().contacts.map((c) =>
              c.id === existing.id ? { ...c, avatarImageDataUrl, name: name || c.name } : c,
            ),
          });
          return;
        }
        set({
          contacts: [
            ...get().contacts,
            {
              id: uid("c"),
              email: key,
              name: name || key,
              status: "allowed" as const,
              defaultBox: "lesbox" as const,
              notes: "",
              notify: false,
              avatarColor: "#0d9488",
              avatarImageDataUrl,
              bundled: false,
            },
          ],
        });
      },

      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      setCoverArt: (coverArt) => set({ settings: { ...get().settings, coverArt } }),

      sendReply: (threadId, body) => {
        const thread = get().threads.find((t) => t.id === threadId);
        if (!thread || !body.trim()) return;
        const id = uid("m");
        const message: Message = {
          id,
          threadId,
          from: get().settings.email,
          fromName: get().settings.displayName,
          to: [thread.contactEmail],
          cc: [],
          subject: `Re: ${thread.customSubject || thread.subject}`,
          bodyHtml: `<p>${body.replace(/\n/g, "<br/>")}</p>`,
          bodyText: body,
          sentAt: new Date().toISOString(),
          attachments: [],
          trackersBlocked: [],
          isOutgoing: true,
        };
        set({
          messages: { ...get().messages, [id]: message },
          threads: get().threads.map((t) =>
            t.id === threadId
              ? bumpThread({
                  ...t,
                  messageIds: [...t.messageIds, id],
                  replyLater: false,
                  seen: true,
                })
              : t,
          ),
          recentRecipients: mergeRecentRecipients(get().recentRecipients || [], [thread.contactEmail], {
            [thread.contactEmail.toLowerCase()]: thread.contactName,
          }),
          toast: "Reply sent",
        });
      },

      sendNewEmail: (to, subject, body, opts) => {
        const threadId = uid("t");
        const messageId = uid("m");
        const name = to.split("@")[0] || to;
        const ccList = (opts?.cc || []).map((e) => e.trim()).filter(Boolean);
        const bccList = (opts?.bcc || []).map((e) => e.trim()).filter(Boolean);
        let contacts = get().contacts;
        if (!contacts.some((c) => c.email.toLowerCase() === to.toLowerCase())) {
          contacts = [
            ...contacts,
            {
              id: uid("c"),
              email: to.toLowerCase(),
              name,
              status: "allowed",
              defaultBox: "lesbox",
              notes: "",
              notify: false,
              avatarColor: "#0d9488",
              bundled: false,
            },
          ];
        }
        const message: Message = {
          id: messageId,
          threadId,
          from: get().settings.email,
          fromName: get().settings.displayName,
          to: [to],
          cc: ccList,
          bcc: bccList,
          subject,
          bodyHtml: `<p>${body.replace(/\n/g, "<br/>")}</p>`,
          bodyText: body,
          sentAt: new Date().toISOString(),
          attachments: [],
          trackersBlocked: [],
          isOutgoing: true,
          requestReadReceipt: opts?.requestReadReceipt,
          smtpMessageId: opts?.smtpMessageId || null,
          readReceipts: [],
        };
        const thread: Thread = {
          id: threadId,
          subject,
          box: "sent",
          contactEmail: to,
          contactName: name,
          messageIds: [messageId],
          seen: true,
          replyLater: false,
          setAside: false,
          bundled: false,
          muted: false,
          stickyNotes: [],
          privateNotes: [],
          collectionIds: [],
          notify: false,
          accountId: opts?.accountId || get().inboxAccountId || null,
          accountEmail: opts?.accountEmail || get().settings.email || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set({
          contacts,
          messages: { ...get().messages, [messageId]: message },
          threads: [thread, ...get().threads],
          recentRecipients: mergeRecentRecipients(get().recentRecipients || [], [
            to,
            ...ccList,
            ...bccList,
          ]),
          view: "thread",
          selectedThreadId: threadId,
          toast: "Email sent — view it under Sent",
          composeDraft: { to: "", cc: "", bcc: "", subject: "", body: "", replyToThreadId: null },
        });
      },

      rememberRecipients: (emails, names) =>
        set({
          recentRecipients: mergeRecentRecipients(get().recentRecipients || [], emails, names),
        }),

      replyToEveryone: (threadIds, body) => {
        threadIds.forEach((id) => get().sendReply(id, body));
        set({ toast: `Replied to ${threadIds.length} emails` });
      },

      importSyncedMail: ({ accountId, email, messages: incoming }, opts) => {
        let imported = 0;
        let screened = 0;
        let metaUpdated = false;
        const background = Boolean(opts?.background);
        const state = get();
        let threads = [...state.threads];
        let contacts = [...state.contacts];
        const msgs = { ...state.messages };
        const own = String(email || "").toLowerCase();
        const settings = {
          ...state.settings,
          email: state.settings.email || email,
        };

        for (const item of incoming) {
          // Detect read-receipt / MDN replies
          const isReceipt =
            /disposition-notification|read receipt|return receipt/i.test(item.subject) ||
            /Disposition-Notification/i.test(item.bodyText || "") ||
            /was read on|has been read/i.test(item.bodyText || "");
          if (isReceipt) {
            const cleanId = (v: string) => String(v || "").replace(/[<>]/g, "").trim();
            const inReply = cleanId(item.inReplyTo || "");
            const allMsgs = Object.entries(get().messages);
            let matchId: string | null = null;
            for (const [id, m] of allMsgs) {
              if (!m.isOutgoing || !m.requestReadReceipt) continue;
              if (inReply && m.smtpMessageId && inReply.includes(cleanId(m.smtpMessageId))) {
                matchId = id;
                break;
              }
            }
            if (!matchId) {
              const subj = String(item.subject || "").replace(/^((Re|RE|Fwd|FW):\s*)+/i, "").trim().toLowerCase();
              const hit = allMsgs
                .filter(
                  ([, m]) =>
                    m.isOutgoing &&
                    m.requestReadReceipt &&
                    (m.to || []).some((addr) => String(addr).toLowerCase().includes(String(item.from || "").toLowerCase())) &&
                    (!subj || String(m.subject || "").toLowerCase().includes(subj) || subj.includes(String(m.subject || "").toLowerCase())),
                )
                .sort((a, b) => +new Date(b[1].sentAt) - +new Date(a[1].sentAt))[0];
              if (hit) matchId = hit[0];
            }
            if (matchId) {
              get().recordReadReceipt(matchId, item.from, item.fromName || item.from);
            }
          }

          const fromSentFolder = item.folder === "sent";
          const fromSpamFolder = item.folder === "spam";
          const fromTrashFolder = item.folder === "trash";
          const messageId = fromSentFolder
            ? `imap_${accountId}_sent_${item.uid}`
            : fromSpamFolder
              ? `imap_${accountId}_spam_${item.uid}`
              : fromTrashFolder
                ? `imap_${accountId}_trash_${item.uid}`
                : `imap_${accountId}_${item.uid}`;
          if (msgs[messageId]) {
            // Backfill unsubscribe metadata on already-imported mail when headers arrive later
            const prev = msgs[messageId];
            if (
              !prev.isOutgoing &&
              !prev.unsubscribeHttpUrl &&
              !prev.unsubscribeMailto &&
              (item.unsubscribeHttpUrl || item.unsubscribeMailto || item.listUnsubscribe)
            ) {
              msgs[messageId] = {
                ...prev,
                listUnsubscribe: item.listUnsubscribe || prev.listUnsubscribe || null,
                listUnsubscribePost: item.listUnsubscribePost || prev.listUnsubscribePost || null,
                unsubscribeHttpUrl: item.unsubscribeHttpUrl || prev.unsubscribeHttpUrl || null,
                unsubscribeMailto: item.unsubscribeMailto || prev.unsubscribeMailto || null,
                unsubscribeOneClick: Boolean(item.unsubscribeOneClick || prev.unsubscribeOneClick),
              };
              metaUpdated = true;
            }
            continue;
          }

          const isOutgoing = fromSentFolder || item.from.toLowerCase() === own;
          // Thread by counterparty (sender for inbound, recipient for outbound)
          const counterpartyEmail = (
            isOutgoing
              ? item.to?.[0] || item.from
              : item.from
          ).toLowerCase();
          const counterpartyName = isOutgoing
            ? (item.to?.[0] || "Recipient").split("@")[0]
            : item.fromName || item.from.split("@")[0];

          let contact = contacts.find((c) => c.email.toLowerCase() === counterpartyEmail);
          if (!contact) {
            const speakeasy = settings.speakeasyCode;
            const bypass =
              Boolean(speakeasy) &&
              item.subject.toUpperCase().includes(String(speakeasy).toUpperCase());
            const autoAllow = isOutgoing || bypass;
            contact = {
              id: uid("c"),
              email: counterpartyEmail,
              name: counterpartyName,
              status: fromSpamFolder
                ? ("blocked" as const)
                : autoAllow
                  ? ("allowed" as const)
                  : ("pending" as const),
              defaultBox: "lesbox",
              notes: bypass
                ? "Speakeasy bypass"
                : fromSpamFolder
                  ? "From Spam folder"
                  : fromTrashFolder
                    ? "From Trash"
                    : "",
              notify: Boolean(bypass),
              avatarColor: `#${((counterpartyEmail.length * 37) % 0xffffff).toString(16).padStart(6, "0")}`,
              bundled: false,
            };
            contacts = [...contacts, contact];
          }

          const box: Box = fromSentFolder
            ? "sent"
            : fromSpamFolder
              ? "spam"
              : fromTrashFolder
                ? "trash"
                : contact.status === "blocked"
                  ? "spam"
                  : contact.status === "pending"
                    ? "screener"
                    : contact.defaultBox || "lesbox";

          const subjectKey = item.subject.replace(/^(re|fwd|fw):\s*/i, "").trim().toLowerCase();
          let thread = threads.find(
            (t) =>
              t.contactEmail.toLowerCase() === counterpartyEmail &&
              (t.accountId === accountId || !t.accountId) &&
              (fromSentFolder
                ? t.box === "sent"
                : fromSpamFolder
                  ? t.box === "spam"
                  : fromTrashFolder
                    ? t.box === "trash"
                    : t.box !== "sent" && t.box !== "spam" && t.box !== "trash") &&
              (t.subject.replace(/^(re|fwd|fw):\s*/i, "").trim().toLowerCase() === subjectKey ||
                (t.customSubject || "").replace(/^(re|fwd|fw):\s*/i, "").trim().toLowerCase() ===
                  subjectKey),
          );

          const attachmentList = item.attachments.map((a) => ({
            ...a,
            messageId,
            threadId: thread?.id || "",
          }));

          const message: Message = {
            id: messageId,
            threadId: thread?.id || "",
            from: item.from,
            fromName: item.fromName,
            to: item.to?.length ? item.to : [email],
            cc: [],
            subject: item.subject,
            bodyHtml: item.bodyHtml,
            bodyText: item.bodyText,
            sentAt: item.sentAt,
            attachments: attachmentList,
            trackersBlocked: item.trackersBlocked || [],
            isOutgoing,
            listUnsubscribe: item.listUnsubscribe || null,
            listUnsubscribePost: item.listUnsubscribePost || null,
            unsubscribeHttpUrl: item.unsubscribeHttpUrl || null,
            unsubscribeMailto: item.unsubscribeMailto || null,
            unsubscribeOneClick: Boolean(item.unsubscribeOneClick),
          };

          if (!thread) {
            const threadId = uid("t");
            message.threadId = threadId;
            message.attachments = attachmentList.map((a) => ({ ...a, threadId }));
            thread = {
              id: threadId,
              subject: item.subject,
              box,
              contactEmail: counterpartyEmail,
              contactName: counterpartyName,
              messageIds: [messageId],
              seen: item.seen,
              replyLater: false,
              setAside: false,
              bundled: contact.bundled,
              muted: false,
              stickyNotes: [],
              privateNotes: [],
              collectionIds: [],
              notify: contact.notify,
              accountId,
              accountEmail: email,
              createdAt: item.sentAt,
              updatedAt: item.sentAt,
            };
            threads = [thread, ...threads];
            if (box === "screener") screened += 1;
          } else {
            message.threadId = thread.id;
            message.attachments = attachmentList.map((a) => ({ ...a, threadId: thread!.id }));
            const nextBox: Box = fromSentFolder
              ? "sent"
              : fromTrashFolder || thread.box === "trash" || box === "trash"
                ? "trash"
                : thread.box === "spam" || box === "spam"
                  ? "spam"
                  : thread.box === "screener"
                    ? "screener"
                    : thread.box === "sent"
                      ? "sent"
                      : thread.box;
            if (nextBox === "screener" && thread.box !== "screener") screened += 1;
            else if (box === "screener" && thread.box === "screener") screened += 1;
            threads = threads.map((t) =>
              t.id === thread!.id
                ? {
                    ...t,
                    messageIds: t.messageIds.includes(messageId)
                      ? t.messageIds
                      : [...t.messageIds, messageId],
                    seen: item.seen && t.seen,
                    updatedAt: item.sentAt > t.updatedAt ? item.sentAt : t.updatedAt,
                    // Never force screener → lesbox on sync
                    box: nextBox,
                    accountId: t.accountId || accountId,
                    accountEmail: t.accountEmail || email,
                    contactEmail: t.contactEmail || counterpartyEmail,
                    contactName: t.contactName || counterpartyName,
                  }
                : t,
            );
          }

          msgs[messageId] = message;
          imported += 1;
        }

        threads = backfillImapAccountIds(threads, msgs);
        const keepActive = get().inboxAccountId;

        // Never change `view` on sync — that unmounted Settings/Compose/Calendar and wiped drafts.
        if (imported === 0) {
          if (metaUpdated) {
            set({
              threads,
              contacts,
              messages: msgs,
              settings,
              inboxAccountId: keepActive || accountId,
            });
          } else if (!background) {
            set({ toast: "Already up to date" });
          }
          return { imported: 0, screened: 0 };
        }

        set({
          threads,
          contacts,
          messages: msgs,
          settings,
          inboxAccountId: keepActive || accountId,
          toast: screened > 0
            ? `Synced ${imported} · ${screened} need New Senders review`
            : `Synced ${imported} message${imported === 1 ? "" : "s"}${email ? ` (${email})` : ""}`,
        });
        return { imported, screened };
      },

      markMessageUnsubscribed: (messageId) => {
        const prev = get().messages[messageId];
        if (!prev) return;
        set({
          messages: {
            ...get().messages,
            [messageId]: { ...prev, unsubscribedAt: new Date().toISOString() },
          },
        });
      },

      addEvent: (event) => {
        const fallbackCal =
          get().calendars.find((c) => c.source !== "mac" && c.visible)?.id ||
          get().calendars[0]?.id ||
          "cal_default";
        set({
          events: [
            ...get().events,
            {
              ...event,
              id: uid("e"),
              calendarId: event.calendarId || fallbackCal,
              source: event.source ?? "local",
            },
          ],
          toast: "Event added",
        });
      },

      updateEvent: (id, patch) =>
        set({
          events: get().events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }),

      deleteEvent: (id) => set({ events: get().events.filter((e) => e.id !== id) }),

      toggleCalendarVisible: (calendarId) =>
        set({
          calendars: get().calendars.map((c) =>
            c.id === calendarId ? { ...c, visible: !c.visible } : c,
          ),
        }),

      duplicateEvent: (id) => {
        const src = get().events.find((e) => e.id === id);
        if (!src) return;
        const start = new Date(src.start);
        const end = new Date(src.end);
        start.setDate(start.getDate() + 7);
        end.setDate(end.getDate() + 7);
        get().addEvent({
          ...src,
          title: `${src.title} (copy)`,
          start: start.toISOString(),
          end: end.toISOString(),
          invitesSentAt: null,
          externalId: null,
          source: "local",
        });
      },

      importMacCalendarData: ({ calendars: macCals, events: macEvents }) => {
        const pastelColors = ["#A78BFA", "#60A5FA", "#34D399", "#F472B6", "#FBBF24", "#FB923C", "#38BDF8"];
        let calendars = [...get().calendars];
        const calIdByExternal = new Map<string, string>();

        macCals.forEach((mc, i) => {
          const externalId = String(mc.id);
          const existing = calendars.find((c) => c.source === "mac" && c.externalId === externalId);
          if (existing) {
            calendars = calendars.map((c) =>
              c.id === existing.id
                ? {
                    ...c,
                    name: mc.name || c.name,
                    color: mc.color || c.color,
                    visible: c.visible,
                    source: "mac" as const,
                    externalId,
                  }
                : c,
            );
            calIdByExternal.set(externalId, existing.id);
          } else {
            const id = uid("maccal");
            calendars.push({
              id,
              name: mc.name || "Mac Calendar",
              color: mc.color || pastelColors[i % pastelColors.length],
              visible: true,
              source: "mac",
              externalId,
            });
            calIdByExternal.set(externalId, id);
          }
        });

        const keepLocal = get().events.filter((e) => e.source !== "mac");
        const macMerged = macEvents.map((me) => {
          const externalId = String(me.id);
          const prev = get().events.find((e) => e.source === "mac" && e.externalId === externalId);
          const calendarId =
            calIdByExternal.get(String(me.calendarId)) ||
            prev?.calendarId ||
            calendars.find((c) => c.source === "mac")?.id ||
            calendars[0]?.id ||
            "cal_default";
          return {
            id: prev?.id || uid("e"),
            title: me.title || "Untitled",
            start: me.start,
            end: me.end,
            calendarId,
            location: me.location || undefined,
            notes: me.notes || undefined,
            externalId,
            source: "mac" as const,
            reminderMinutes: prev?.reminderMinutes,
            countdown: prev?.countdown,
          };
        });

        set({
          calendars,
          events: [...keepLocal, ...macMerged],
          toast: `Synced ${macMerged.length} Mac event${macMerged.length === 1 ? "" : "s"}`,
        });
      },

      toggleHabit: (habitId, date) =>
        set({
          habits: get().habits.map((h) => {
            if (h.id !== habitId) return h;
            const has = h.completedDates.includes(date);
            return {
              ...h,
              completedDates: has
                ? h.completedDates.filter((d) => d !== date)
                : [...h.completedDates, date],
            };
          }),
        }),

      addSometimeTask: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set({
          sometimeTasks: [
            {
              id: uid("st"),
              text: trimmed,
              done: false,
              createdAt: new Date().toISOString(),
              weekKey: weekStartKey(),
              carriedOver: false,
            },
            ...normalizeSometimeTasks(get().sometimeTasks || []),
          ],
        });
      },

      toggleSometimeTask: (id) => {
        const task = (get().sometimeTasks || []).find((t) => t.id === id);
        if (!task) return;
        // Check off → remove from the list (no strikethrough leftovers)
        set({
          sometimeTasks: normalizeSometimeTasks(
            (get().sometimeTasks || []).filter((t) => t.id !== id),
          ),
          toast: "Task completed",
        });
      },

      rolloverSometimeTasks: () => {
        const next = normalizeSometimeTasks(get().sometimeTasks || []);
        const prev = get().sometimeTasks || [];
        const changed =
          next.length !== prev.length ||
          next.some(
            (t, i) =>
              t.id !== prev[i]?.id ||
              t.weekKey !== prev[i]?.weekKey ||
              Boolean(t.carriedOver) !== Boolean(prev[i]?.carriedOver) ||
              t.done !== prev[i]?.done,
          );
        if (changed) set({ sometimeTasks: next });
      },

      setJournal: (date, body) => {
        const existing = get().journal.find((j) => j.date === date);
        if (existing) {
          set({ journal: get().journal.map((j) => (j.date === date ? { ...j, body } : j)) });
        } else {
          set({ journal: [...get().journal, { id: uid("j"), date, body }] });
        }
      },

      setDayLabel: (date, label) => {
        const existing = get().dayLabels.find((d) => d.date === date);
        if (existing) {
          set({
            dayLabels: label
              ? get().dayLabels.map((d) => (d.date === date ? { ...d, label } : d))
              : get().dayLabels.filter((d) => d.date !== date),
          });
        } else if (label) {
          set({ dayLabels: [...get().dayLabels, { id: uid("dl"), date, label }] });
        }
      },

      createEventFromThread: (threadId) => {
        const thread = get().threads.find((t) => t.id === threadId);
        if (!thread) return;
        const start = new Date();
        start.setHours(start.getHours() + 24, 0, 0, 0);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);
        get().addEvent({
          title: thread.customSubject || thread.subject,
          start: start.toISOString(),
          end: end.toISOString(),
          calendarId:
            get().calendars.find((c) => c.source !== "mac")?.id || get().calendars[0]?.id || "cal_default",
          fromThreadId: threadId,
          reminderMinutes: [15],
        });
        set({ view: "calendar", toast: "Event created with a 15-minute reminder" });
      },

      tickReminders: () => {
        const state = get();
        const existing = state.reminders || [];
        let reminders = activatePendingReminders(existing);
        const incoming = collectDueReminders({
          events: state.events || [],
          threads: state.threads || [],
          existing: reminders,
        });
        reminders = mergeNewReminders(reminders, incoming);
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
        reminders = reminders.filter(
          (r) => r.status !== "dismissed" || +new Date(r.createdAt) > cutoff,
        );
        const beforeActive = existing.filter((r) => r.status === "active").length;
        const afterActive = reminders.filter((r) => r.status === "active").length;
        const same =
          reminders.length === existing.length &&
          reminders.every(
            (r, i) =>
              r.id === existing[i]?.id &&
              r.status === existing[i]?.status &&
              r.dueAt === existing[i]?.dueAt,
          );
        if (!same) set({ reminders });
        return Math.max(0, afterActive - beforeActive);
      },

      scheduleMailReminder: (threadId, minutesFromNow) => {
        const thread = get().threads.find((t) => t.id === threadId);
        if (!thread) return;
        const mins = Math.max(1, Math.round(minutesFromNow));
        const due = new Date(Date.now() + mins * 60_000);
        const draft = buildMailReminder(thread, due, `Remind in ${mins} minute${mins === 1 ? "" : "s"}`);
        const reminder: Reminder = {
          ...draft,
          id: uid("rem"),
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        set({
          reminders: [...(get().reminders || []), reminder],
          toast: `Reminder set — ${mins} minute${mins === 1 ? "" : "s"}`,
        });
      },

      dismissReminder: (id) =>
        set({
          reminders: (get().reminders || []).map((r) =>
            r.id === id ? { ...r, status: "dismissed" as const } : r,
          ),
        }),

      snoozeReminder: (id, minutes) => {
        const mins = minutes === 15 ? 15 : 5;
        const dueAt = new Date(Date.now() + mins * 60_000).toISOString();
        set({
          reminders: (get().reminders || []).map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "pending" as const,
                  dueAt,
                  subtitle: `Snoozed ${mins} min`,
                }
              : r,
          ),
          toast: `Snoozed ${mins} minutes`,
        });
      },

      openReminder: (id) => {
        const r = (get().reminders || []).find((x) => x.id === id);
        if (!r) return;
        if (r.source === "calendar") {
          const ev = get().events.find((e) => e.id === r.sourceId);
          if (ev) set({ view: "calendar", calendarDate: ev.start.slice(0, 10) });
          else set({ view: "calendar" });
        } else if (r.source === "mail") {
          get().openThread(r.sourceId);
        }
      },

      createWorkflow: (name) =>
        set({
          workflows: [
            ...get().workflows,
            {
              id: uid("wf"),
              name,
              stages: [
                { id: uid("ws"), name: "Todo", color: "#FF5A36" },
                { id: uid("ws"), name: "Doing", color: "#F5A623" },
                { id: uid("ws"), name: "Done", color: "#00A86B" },
              ],
            } satisfies Workflow,
          ],
        }),

      resetDemo: () => {
        const fresh = createEmptyState();
        set({
          ...fresh,
          view: "lesbox",
          selectedThreadId: null,
          searchQuery: "",
          powerThrough: false,
          multiOpenIds: [],
          toast: "Local mail data cleared",
        });
      },

      getThreadMessages: (threadId) => {
        const thread = get().threads.find((t) => t.id === threadId);
        if (!thread) return [];
        return thread.messageIds
          .map((id) => get().messages[id])
          .filter(Boolean)
          .sort((a, b) => +new Date(a.sentAt) - +new Date(b.sentAt));
      },

      getAttachments: () => {
        const all = Object.values(get().messages).flatMap((m) => m.attachments);
        return all.sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt));
      },
    }),
    {
      name: PERSIST_NAME,
      storage: createJSONStorage(() => createDurableStorage()),
      partialize: (state) =>
        ({
          threads: state.threads,
          messages: state.messages,
          contacts: state.contacts,
          collections: state.collections,
          workflows: state.workflows,
          snippets: state.snippets,
          signatures: state.signatures,
          emailTemplates: state.emailTemplates,
          clips: state.clips,
          events: state.events,
          calendars: state.calendars,
          habits: state.habits,
          journal: state.journal,
          dayLabels: state.dayLabels,
          sometimeTasks: state.sometimeTasks,
          reminders: state.reminders || [],
          recentRecipients: state.recentRecipients || [],
          settings: state.settings,
          inboxAccountId: state.inboxAccountId,
        }) as MailStore,
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<AppStateData> & { inboxAccountId?: string | null };
        const messages = p.messages || current.messages;
        const threads = (p.threads || current.threads).map((t) => {
          const legacy = t as Thread & { muteed?: boolean };
          let next: Thread = {
            ...t,
            box: normalizeBox(t.box),
            muted: Boolean(legacy.muted ?? legacy.muteed),
          };
          // Drop ghost dock flags on threads with no remaining messages (old demo leftovers)
          if (!threadHasContent(next, messages)) {
            next = {
              ...next,
              replyLater: false,
              setAside: false,
              bubbleUpAt: null,
            };
          }
          next = { ...next, tags: syncThreadTags(next) };
          return next;
        });
        const contactsRaw = (p.contacts || current.contacts).map((c) => ({
          ...c,
          defaultBox: normalizeMailBox(c.defaultBox),
        }));
        const rescued = backfillImapAccountIds(threads, messages);
        const contacts = contactsRaw;
        const rawSettings = { ...current.settings, ...(p.settings || {}) } as typeof current.settings & {
          spamCorps?: boolean;
        };
        const settings = {
          ...rawSettings,
          spamCentral:
            rawSettings.spamCentral ??
            rawSettings.spamCorps ??
            current.settings.spamCentral ??
            true,
          wallpaper: p.settings?.wallpaper ?? current.settings.wallpaper ?? "rotate",
          wallpaperRotateMinutes:
            p.settings?.wallpaperRotateMinutes ?? current.settings.wallpaperRotateMinutes ?? 8,
          autoFetchMinutes: p.settings?.autoFetchMinutes ?? current.settings.autoFetchMinutes ?? 2,
          autoPurgeTrashDays:
            p.settings?.autoPurgeTrashDays ?? current.settings.autoPurgeTrashDays ?? 30,
          requestReadReceiptsByDefault:
            p.settings?.requestReadReceiptsByDefault ??
            current.settings.requestReadReceiptsByDefault ??
            true,
        };
        delete (settings as { spamCorps?: boolean }).spamCorps;
        return {
          ...current,
          ...p,
          threads: rescued,
          contacts,
          messages,
          signatures: p.signatures || current.signatures || [],
          collections: p.collections?.length ? p.collections : current.collections || [],
          workflows: p.workflows?.length ? p.workflows : current.workflows || [],
          snippets: p.snippets?.length ? p.snippets : current.snippets || [],
          emailTemplates: p.emailTemplates?.length
            ? p.emailTemplates
            : current.emailTemplates || [],
          reminders: Array.isArray(p.reminders) ? p.reminders : current.reminders || [],
          recentRecipients: Array.isArray(p.recentRecipients)
            ? p.recentRecipients
            : current.recentRecipients || [],
          sometimeTasks: normalizeSometimeTasks(
            Array.isArray(p.sometimeTasks) ? p.sometimeTasks : current.sometimeTasks || [],
          ),
          settings,
          inboxAccountId: p.inboxAccountId ?? current.inboxAccountId ?? null,
        };
      },
    },
  ),
);

export function selectBoxThreads(
  threads: Thread[],
  box: Box,
  opts?: { onlyNew?: boolean; accountId?: string | null },
) {
  const now = Date.now();
  const want = normalizeBox(box);
  return threads
    .filter((t) => {
      if (normalizeBox(t.box) !== want) return false;
      // Strict account isolation — never leak another account’s mail
      if (opts?.accountId) {
        // Keep legacy threads (no accountId) visible so upgrades never hide read mail
        if (t.accountId && t.accountId !== opts.accountId) return false;
      }
      if (t.muted && t.seen) return want === "lesbox" ? false : true;
      if (t.bubbleUpAt && +new Date(t.bubbleUpAt) > now && t.seen) return false;
      if (opts?.onlyNew && t.seen) return false;
      return true;
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

/** Threads for the active account across any box (Snooze, Search, etc.). */
export function selectAccountThreads(
  threads: Thread[],
  accountId: string | null | undefined,
) {
  if (!accountId) return threads;
  return threads.filter((t) => !t.accountId || t.accountId === accountId);
}

/** Real Snooze / On Hold items only — same rules for badge counts and lists. */
export function selectDockThreads(
  threads: Thread[],
  mode: "reply_later" | "set_aside",
  opts?: {
    accountId?: string | null;
    messages?: Record<string, Message | undefined>;
  },
) {
  const accountId = opts?.accountId;
  const messages = opts?.messages;
  return selectAccountThreads(threads, accountId).filter((t) => {
    if (t.box === "trash" || t.box === "spam") return false;
    if (messages && !threadHasContent(t, messages)) return false;
    return mode === "reply_later" ? t.replyLater : t.setAside;
  });
}

