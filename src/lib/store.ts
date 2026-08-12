"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createEmptyState } from "./seed";
import type {
  AppStateData,
  Box,
  CalendarEvent,
  Contact,
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
import { normalizeBox, normalizeMailBox, boxLabel, isExternalCalendarSource } from "./types";
import { syncThreadTags, threadHasContent } from "./thread-tags";
import {
  activatePendingReminders,
  buildMailReminder,
  collectDueReminders,
  mergeNewReminders,
} from "./reminders";
import { normalizeSometimeTasks, weekStartKey } from "./sometime-tasks";
import { mergeRecentRecipients } from "./recipient-suggest";
import { localYmd, uid } from "./utils";
import { parseMailtoUrl } from "./mailto";
import { inferThreadAccountId, threadBelongsToAccount, stampMissingAccountId, filterByActiveAccount, belongsToActiveAccount } from "./account-scope";
import { withMeetingLink } from "./meeting-links";

export type AppView =
  | "lesbox"
  | "cleanup"
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

/**
 * Where an open thread should return to — the list it was opened from when we
 * know it, otherwise the list that owns the thread's box.
 */
export function resolveThreadBackView(
  box: Box | null | undefined,
  returnView?: AppView | null,
): AppView {
  if (returnView && returnView !== "thread") return returnView;
  switch (box) {
    case "feed":
    case "screener":
      return "feed";
    case "paper_trail":
      return "paper_trail";
    case "spam":
      return "spam";
    case "sent":
      return "sent";
    case "trash":
      return "trash";
    default:
      return "lesbox";
  }
}

interface UiState {
  view: AppView;
  selectedThreadId: string | null;
  /** Transient list/view to return to after opening a thread. */
  threadReturnView: AppView | null;
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
  /** Move every thread from this sender (active account) to Trash. Returns count. */
  trashAllFromSender: (email: string) => number;
  /** Block sender and move their threads (active account) to Spam. Returns count. */
  blockAllFromSender: (email: string) => number;
  /** Undo a block — allow sender and restore their Spam mail to a box. Returns restored count. */
  unblockSender: (email: string, box?: MailBox) => number;
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
  removeFromWorkflow: (threadId: string) => void;
  addToCollection: (threadId: string, collectionId: string) => void;
  removeFromCollection: (threadId: string, collectionId: string) => void;
  createCollection: (name: string) => void;
  deleteCollection: (collectionId: string) => void;
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
        references?: string[] | string | null;
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
      /**
       * Search / load-older: put mail in MoneyBox (auto-allow new contacts)
       * instead of burying everything in New Senders.
       */
      deliverToInbox?: boolean;
      /** Custom toast; empty string suppresses toast. */
      toastMessage?: string | null;
    },
  ) => { imported: number; screened: number };
  markMessageUnsubscribed: (messageId: string) => void;

  addEvent: (event: Omit<CalendarEvent, "id">) => CalendarEvent;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  /** Clear a past (or any) event from countdowns/reminders without deleting it. */
  dismissEvent: (id: string) => void;
  undismissEvent: (id: string) => void;
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
      allDay?: boolean;
    }>;
  }) => void;
  /** Import from Mac Calendar, Windows Outlook, or .ics — same merge rules on every OS. */
  importSystemCalendarData: (payload: {
    source?: "mac" | "windows" | "ics";
    calendars: Array<{ id: string; name: string; color?: string }>;
    events: Array<{
      id: string;
      title: string;
      start: string;
      end: string;
      calendarId: string;
      location?: string;
      notes?: string;
      allDay?: boolean;
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
  deleteWorkflow: (workflowId: string) => void;
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
    const accountId = inferThreadAccountId(t, messages);
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
          const file = await api.loadAppState();
          let wrapped: string | null = null;
          if (typeof file === "string" && file.trim()) {
            wrapped = file;
          } else if (file && typeof file === "object" && (file as { state?: unknown }).state) {
            wrapped = JSON.stringify({
              state: (file as { state: unknown }).state,
              version: (file as { version?: number }).version ?? 0,
            });
          }
          if (wrapped) {
            try {
              const parsed = JSON.parse(wrapped) as { state?: { threads?: unknown[]; collections?: unknown[] } };
              const threads = parsed.state?.threads;
              const collections = parsed.state?.collections;
              const hasData =
                (Array.isArray(threads) && threads.length > 0) ||
                (Array.isArray(collections) && collections.length > 0);
              if (hasData || !localStorage.getItem(name)) {
                memory = wrapped;
                try {
                  localStorage.setItem(name, wrapped);
                } catch {
                  /* quota — file-backed string is enough */
                }
                hydratedFromFile = true;
                return wrapped;
              }
            } catch {
              /* fall through */
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
          // Pass the string through IPC — avoids cloning a huge object graph twice.
          await api.saveAppState(value);
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
      threadReturnView: null,
      selectedContactId: null,
      searchQuery: "",
      powerThrough: false,
      multiOpenIds: [],
      inboxAccountId: null,
      composeDraft: { to: "", cc: "", bcc: "", subject: "", body: "", replyToThreadId: null },
      calendarDate: localYmd(),
      calendarView: "week",
      settingsTab: "accounts",
      toast: null,

      setView: (view) =>
        set({
          view,
          // Leaving the reading pane retires the remembered list.
          threadReturnView: view === "thread" ? get().threadReturnView : null,
        }),
      openThread: (id) => {
        const thread = get().threads.find((t) => t.id === id);
        if (!thread) return;
        const active = get().inboxAccountId;
        if (active && !threadBelongsToAccount(thread, active, get().messages)) {
          // Should never surface in UI — lists are account-scoped. Fail closed.
          set({ toast: null });
          return;
        }
        set({
          view: "thread",
          selectedThreadId: id,
          threadReturnView: get().view === "thread" ? get().threadReturnView : get().view,
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
          threadReturnView: null,
          multiOpenIds: [],
          // Silent switches (sync) must not wipe in-progress UI work
          searchQuery: silent ? get().searchQuery : "",
          selectedContactId: silent ? get().selectedContactId : null,
          composeDraft: silent
            ? get().composeDraft
            : { to: "", cc: "", bcc: "", subject: "", body: "", replyToThreadId: null },
          view: silent ? get().view : "lesbox",
          settings: nextSettings,
          // Claim any legacy unscoped workspace rows for this account once (never reassign owned rows).
          events: stampMissingAccountId(get().events, accountId),
          calendars: stampMissingAccountId(get().calendars, accountId),
          habits: stampMissingAccountId(get().habits, accountId),
          journal: stampMissingAccountId(get().journal, accountId),
          dayLabels: stampMissingAccountId(get().dayLabels, accountId),
          sometimeTasks: stampMissingAccountId(get().sometimeTasks, accountId),
          reminders: stampMissingAccountId(get().reminders || [], accountId),
          collections: stampMissingAccountId(get().collections, accountId),
          workflows: stampMissingAccountId(get().workflows, accountId),
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
        const addr = String(email || "").toLowerCase().trim();
        const activeId = get().inboxAccountId;
        const contacts = get().contacts.map((c) =>
          c.email.toLowerCase() === addr
            ? {
                ...c,
                status: decision === "allow" ? ("allowed" as const) : ("blocked" as const),
                // Forever routing: Allow → MoneyBox (or chosen box) sticks for all future mail
                defaultBox: decision === "allow" ? box : c.defaultBox,
              }
            : c,
        );
        const threads = get().threads.map((t) => {
          if (t.contactEmail.toLowerCase() !== addr) return t;
          if (activeId && t.accountId && t.accountId !== activeId) return t;
          if (decision === "block") {
            if (t.box === "spam" || t.box === "trash") return t;
            return { ...t, box: "spam" as Box, seen: true };
          }
          // Allow: pull every conversation out of Screening / New Senders / Spam into the chosen box
          if (t.box !== "screener" && t.box !== "spam" && t.box !== "feed") return t;
          return bumpThread({ ...t, box, seen: t.box === "spam" ? false : t.seen });
        });
        const forever =
          decision === "allow" && box === "lesbox"
            ? `Allowed → MoneyBox $ forever — all mail from ${addr} goes there`
            : decision === "allow"
              ? `Allowed → ${boxLabel(box)} forever`
              : "Blocked / spam";
        set({
          contacts,
          threads,
          toast: forever,
        });
      },

      unblockSender: (email, box = "lesbox") => {
        const addr = String(email || "").toLowerCase().trim();
        if (!addr) return 0;
        const activeId = get().inboxAccountId;
        let restored = 0;
        const contacts = get().contacts.map((c) =>
          c.email.toLowerCase() === addr
            ? { ...c, status: "allowed" as const, defaultBox: box }
            : c,
        );
        const hasContact = contacts.some((c) => c.email.toLowerCase() === addr);
        const nextContacts = hasContact
          ? contacts
          : [
              ...contacts,
              {
                id: uid("c"),
                email: addr,
                name: addr.split("@")[0] || addr,
                status: "allowed" as const,
                defaultBox: box,
                notes: "",
                notify: false,
                avatarColor: `#${((addr.length * 37) % 0xffffff).toString(16).padStart(6, "0")}`,
                bundled: false,
              },
            ];
        const threads = get().threads.map((t) => {
          if (t.contactEmail.toLowerCase() !== addr) return t;
          if (activeId && t.accountId && t.accountId !== activeId) return t;
          if (t.box !== "spam" && t.box !== "screener") return t;
          restored += 1;
          return bumpThread({ ...t, box });
        });
        set({
          contacts: nextContacts,
          threads,
          toast:
            restored > 0
              ? `Unblocked ${addr} · ${restored} conversation${restored === 1 ? "" : "s"} → ${boxLabel(box)}`
              : `Unblocked ${addr} — future mail is allowed`,
        });
        return restored;
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

      trashAllFromSender: (email) => {
        const addr = String(email || "").toLowerCase().trim();
        if (!addr) return 0;
        const activeId = get().inboxAccountId;
        const ids = get()
          .threads.filter((t) => {
            if (t.contactEmail.toLowerCase() !== addr) return false;
            if (t.box === "trash") return false;
            if (activeId && t.accountId && t.accountId !== activeId) return false;
            return true;
          })
          .map((t) => t.id);
        if (!ids.length) {
          set({ toast: "No mail from this sender to trash" });
          return 0;
        }
        get().deleteThreadsToTrash(ids);
        set({
          toast: `Moved ${ids.length} conversation${ids.length === 1 ? "" : "s"} from ${addr} to Trash`,
          view:
            get().view === "thread" && ids.includes(get().selectedThreadId || "")
              ? "lesbox"
              : get().view,
          selectedThreadId:
            get().view === "thread" && ids.includes(get().selectedThreadId || "")
              ? null
              : get().selectedThreadId,
        });
        return ids.length;
      },

      blockAllFromSender: (email) => {
        const addr = String(email || "").toLowerCase().trim();
        if (!addr) return 0;
        const activeId = get().inboxAccountId;
        const selectedId = get().selectedThreadId;
        const selectedIsSender = get().threads.some(
          (t) => t.id === selectedId && t.contactEmail.toLowerCase() === addr,
        );
        let count = 0;
        const contacts = get().contacts.map((c) =>
          c.email.toLowerCase() === addr ? { ...c, status: "blocked" as const } : c,
        );
        const hasContact = contacts.some((c) => c.email.toLowerCase() === addr);
        const nextContacts = hasContact
          ? contacts
          : [
              ...contacts,
              {
                id: uid("c"),
                email: addr,
                name: addr.split("@")[0] || addr,
                status: "blocked" as const,
                defaultBox: "lesbox" as const,
                notes: "Blocked after unsubscribe",
                notify: false,
                avatarColor: `#${((addr.length * 37) % 0xffffff).toString(16).padStart(6, "0")}`,
                bundled: false,
              },
            ];
        const threads = get().threads.map((t) => {
          if (t.contactEmail.toLowerCase() !== addr) return t;
          if (activeId && t.accountId && t.accountId !== activeId) return t;
          if (t.box === "spam" || t.box === "trash") return t;
          count += 1;
          return { ...t, box: "spam" as Box, seen: true, replyLater: false, setAside: false };
        });
        set({
          contacts: nextContacts,
          threads,
          toast:
            count > 0
              ? `Blocked ${addr} · ${count} conversation${count === 1 ? "" : "s"} → Spam`
              : `Blocked ${addr} — future mail goes to Spam`,
          ...(selectedIsSender
            ? { view: "lesbox" as const, selectedThreadId: null }
            : {}),
        });
        return count;
      },

      moveThread: (threadId, box) =>
        set({
          threads: get().threads.map((t) => (t.id === threadId ? bumpThread({ ...t, box }) : t)),
          toast: `Moved to ${boxLabel(box)}`,
        }),

      deleteThreadsToTrash: (threadIds) => {
        const ids = new Set(threadIds);
        const selected = get().selectedThreadId;
        const leaving = Boolean(selected && ids.has(selected));
        const fromBox = leaving ? get().threads.find((t) => t.id === selected)?.box : null;
        const backView = resolveThreadBackView(fromBox, get().threadReturnView);
        set({
          threads: get().threads.map((t) =>
            ids.has(t.id)
              ? { ...t, box: "trash" as Box, seen: true, replyLater: false, setAside: false }
              : t,
          ),
          toast: threadIds.length > 1 ? `Moved ${threadIds.length} to Trash` : "Moved to Trash",
          ...(leaving
            ? {
                view: get().view === "thread" ? backView : get().view,
                selectedThreadId: null,
                threadReturnView: null,
              }
            : {}),
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
        const threads = get().threads.map((t) => {
          if (t.id !== threadId) return t;
          const next = bumpThread({ ...t, replyLater: nextVal });
          return { ...next, tags: syncThreadTags(next) };
        });
        const n = countDockThreads(threads, "reply_later", {
          accountId: get().inboxAccountId,
          messages: get().messages,
        });
        set({
          threads,
          toast: nextVal
            ? `Added to Reply Queue · ${n} waiting`
            : `Removed from Reply Queue · ${n} left`,
        });
      },

      toggleSetAside: (threadId) => {
        const prev = get().threads.find((t) => t.id === threadId);
        const nextVal = !prev?.setAside;
        const threads = get().threads.map((t) => {
          if (t.id !== threadId) return t;
          const next = bumpThread({ ...t, setAside: nextVal });
          return { ...next, tags: syncThreadTags(next) };
        });
        const n = countDockThreads(threads, "set_aside", {
          accountId: get().inboxAccountId,
          messages: get().messages,
        });
        set({
          threads,
          toast: nextVal ? `On Hold · ${n} on hold` : `Hold removed · ${n} left`,
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

      clipText: (threadId, subject, text) => {
        const thread = get().threads.find((t) => t.id === threadId);
        const accountId =
          (thread ? inferThreadAccountId(thread, get().messages) : null) ||
          get().inboxAccountId ||
          null;
        set({
          clips: [
            {
              id: uid("cl"),
              text,
              sourceThreadId: threadId,
              sourceSubject: subject,
              createdAt: new Date().toISOString(),
              accountId,
            },
            ...get().clips,
          ],
          toast: "Saved highlight",
        });
      },

      deleteClip: (id) => set({ clips: get().clips.filter((c) => c.id !== id) }),

      setWorkflowStage: (threadId, workflowId, stageId) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, workflowId, workflowStageId: stageId }) : t,
          ),
        }),

      removeFromWorkflow: (threadId) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, workflowId: null, workflowStageId: null }) : t,
          ),
          toast: "Removed from the pipeline",
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

      removeFromCollection: (threadId, collectionId) =>
        set({
          collections: get().collections.map((c) =>
            c.id === collectionId ? { ...c, threadIds: c.threadIds.filter((id) => id !== threadId) } : c,
          ),
          threads: get().threads.map((t) =>
            t.id === threadId
              ? { ...t, collectionIds: t.collectionIds.filter((id) => id !== collectionId) }
              : t,
          ),
        }),

      createCollection: (name) =>
        set({
          collections: [
            ...get().collections,
            {
              id: uid("col"),
              name,
              threadIds: [],
              shared: false,
              accountId: get().inboxAccountId ?? null,
            },
          ],
          toast: `Collection “${name}” created`,
        }),

      // Only the grouping goes away — every conversation stays in its mailbox.
      deleteCollection: (collectionId) =>
        set({
          collections: get().collections.filter((c) => c.id !== collectionId),
          threads: get().threads.map((t) =>
            t.collectionIds.includes(collectionId)
              ? { ...t, collectionIds: t.collectionIds.filter((id) => id !== collectionId) }
              : t,
          ),
          toast: "Collection removed — mail kept",
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
        const deliverToInbox = Boolean(opts?.deliverToInbox);
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
            // Backfill headers / unsubscribe metadata on already-imported mail
            const prev = msgs[messageId];
            const nextUnsub =
              !prev.isOutgoing &&
              !prev.unsubscribeHttpUrl &&
              !prev.unsubscribeMailto &&
              (item.unsubscribeHttpUrl || item.unsubscribeMailto || item.listUnsubscribe);
            const nextLink =
              (!prev.messageIdHeader && item.messageIdHeader) ||
              (!prev.inReplyTo && item.inReplyTo);
            if (nextUnsub || nextLink) {
              msgs[messageId] = {
                ...prev,
                messageIdHeader: prev.messageIdHeader || item.messageIdHeader || null,
                inReplyTo: prev.inReplyTo || item.inReplyTo || null,
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
            const autoAllow = isOutgoing || bypass || deliverToInbox;
            contact = {
              id: uid("c"),
              email: counterpartyEmail,
              name: counterpartyName,
              status: fromSpamFolder
                ? ("blocked" as const)
                : autoAllow
                  ? ("allowed" as const)
                  : ("pending" as const),
              // Pending / new senders live in Screening until Allow → MoneyBox
              defaultBox: autoAllow ? ("lesbox" as const) : ("feed" as const),
              notes: bypass
                ? "Speakeasy bypass"
                : deliverToInbox
                  ? "Allowed via old mail search"
                  : fromSpamFolder
                    ? "From Spam folder"
                    : fromTrashFolder
                      ? "From Trash"
                      : "Awaiting Screening",
              notify: Boolean(bypass),
              avatarColor: `#${((counterpartyEmail.length * 37) % 0xffffff).toString(16).padStart(6, "0")}`,
              bundled: false,
            };
            contacts = [...contacts, contact];
          } else if (
            deliverToInbox &&
            contact.status === "pending" &&
            !fromSpamFolder &&
            !fromTrashFolder
          ) {
            contact = { ...contact, status: "allowed" as const, defaultBox: "lesbox" as const };
            contacts = contacts.map((c) => (c.id === contact!.id ? contact! : c));
          }

          // Forever routing: allowed → defaultBox (MoneyBox when Allowed);
          // pending / new senders → Screening (feed); blocked → spam
          const box: Box = fromSentFolder
            ? "sent"
            : fromSpamFolder
              ? "spam"
              : fromTrashFolder
                ? "trash"
                : contact.status === "blocked"
                  ? "spam"
                  : contact.status === "allowed"
                    ? contact.defaultBox || "lesbox"
                    : "feed";

          const subjectKey = item.subject.replace(/^(re|fwd|fw):\s*/i, "").trim().toLowerCase();
          const cleanMid = (v: string) => String(v || "").replace(/[<>]/g, "").trim().toLowerCase();
          const replyTo = cleanMid(item.inReplyTo || "");
          const refs = Array.isArray(item.references)
            ? item.references.map((r) => cleanMid(String(r)))
            : String(item.references || "")
                .split(/\s+/)
                .map(cleanMid)
                .filter(Boolean);
          const linkIds = new Set([replyTo, ...refs].filter(Boolean));

          // Prefer real conversation linking (In-Reply-To / References) over subject alone
          let thread =
            linkIds.size > 0
              ? threads.find((t) => {
                  if (t.accountId && t.accountId !== accountId) return false;
                  if (fromSentFolder ? t.box !== "sent" : t.box === "sent") return false;
                  if (fromSpamFolder ? t.box !== "spam" : t.box === "spam") return false;
                  if (fromTrashFolder ? t.box !== "trash" : t.box === "trash") return false;
                  return t.messageIds.some((mid) => {
                    const m = msgs[mid];
                    if (!m) return false;
                    const hid = cleanMid(m.messageIdHeader || m.smtpMessageId || "");
                    return Boolean(hid && linkIds.has(hid));
                  });
                })
              : undefined;

          if (!thread) {
            thread = threads.find(
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
          }

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
            messageIdHeader: item.messageIdHeader || null,
            inReplyTo: item.inReplyTo || null,
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
            if (box === "feed" && contact.status === "pending") screened += 1;
          } else {
            message.threadId = thread.id;
            message.attachments = attachmentList.map((a) => ({ ...a, threadId: thread!.id }));
            // Re-apply forever routing on every sync — allowed senders always land in their box
            const nextBox: Box = fromSentFolder
              ? "sent"
              : fromTrashFolder || thread.box === "trash" || box === "trash"
                ? "trash"
                : contact.status === "blocked" || thread.box === "spam" || box === "spam"
                  ? "spam"
                  : contact.status === "allowed"
                    ? contact.defaultBox || "lesbox"
                    : "feed";
            if (nextBox === "feed" && contact.status === "pending" && thread.box !== "feed") {
              screened += 1;
            } else if (box === "feed" && contact.status === "pending" && thread.box === "feed") {
              screened += 1;
            }
            threads = threads.map((t) =>
              t.id === thread!.id
                ? {
                    ...t,
                    messageIds: t.messageIds.includes(messageId)
                      ? t.messageIds
                      : [...t.messageIds, messageId],
                    seen: item.seen && t.seen,
                    updatedAt: item.sentAt > t.updatedAt ? item.sentAt : t.updatedAt,
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
          } else if (!background && opts?.toastMessage !== "") {
            set({
              toast:
                opts?.toastMessage != null ? opts.toastMessage : "Already up to date",
            });
          }
          return { imported: 0, screened: 0 };
        }

        const defaultToast =
          screened > 0
            ? `Synced ${imported} · ${screened} in Screening`
            : `Synced ${imported} message${imported === 1 ? "" : "s"}${email ? ` (${email})` : ""}`;
        set({
          threads,
          contacts,
          messages: msgs,
          settings,
          inboxAccountId: keepActive || accountId,
          ...(opts?.toastMessage === ""
            ? {}
            : { toast: opts?.toastMessage != null ? opts.toastMessage : defaultToast }),
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
        const accountId = event.accountId ?? get().inboxAccountId ?? null;
        let calendars = get().calendars;
        const localForAccount = calendars.find(
          (c) =>
            !isExternalCalendarSource(c.source) &&
            c.visible &&
            belongsToActiveAccount(c, accountId),
        );
        let fallbackCal = localForAccount?.id;
        if (!fallbackCal && accountId) {
          fallbackCal = uid("cal");
          calendars = [
            ...calendars,
            {
              id: fallbackCal,
              name: "Personal",
              color: "#0d9488",
              visible: true,
              source: "local" as const,
              accountId,
            },
          ];
        }
        if (!fallbackCal) {
          fallbackCal =
            calendars.find((c) => !isExternalCalendarSource(c.source) && c.visible)?.id ||
            calendars[0]?.id ||
            "cal_default";
        }
        const created: CalendarEvent = withMeetingLink({
          ...event,
          id: uid("e"),
          calendarId: event.calendarId || fallbackCal,
          source: event.source ?? "local",
          accountId,
        });
        set({
          calendars,
          events: [...get().events, created],
          toast: "Event added",
        });
        return created;
      },

      updateEvent: (id, patch) =>
        set({
          events: get().events.map((e) => (e.id === id ? withMeetingLink({ ...e, ...patch }) : e)),
        }),

      deleteEvent: (id) => set({ events: get().events.filter((e) => e.id !== id) }),

      dismissEvent: (id) => {
        const nowIso = new Date().toISOString();
        set({
          events: get().events.map((e) =>
            e.id === id
              ? withMeetingLink({
                  ...e,
                  dismissedAt: nowIso,
                })
              : e,
          ),
          // Drop calendar reminder rows for this event so Undo can recreate them.
          // (Keeping dismissed rows would block collectDueReminders via occurrenceKey.)
          reminders: (get().reminders || []).filter(
            (r) => !(r.source === "calendar" && r.sourceId === id),
          ),
          toast: "Dismissed — kept on the calendar, cleared from countdowns and reminders",
        });
      },

      undismissEvent: (id) =>
        set({
          events: get().events.map((e) =>
            e.id === id ? { ...e, dismissedAt: null } : e,
          ),
          toast: "Event restored to your active list",
        }),

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
          dismissedAt: null,
        });
      },

      importMacCalendarData: (payload) =>
        get().importSystemCalendarData({ ...payload, source: "mac" }),

      importSystemCalendarData: ({ source = "mac", calendars: incomingCals, events: incomingEvents }) => {
        const pastelColors = ["#A78BFA", "#60A5FA", "#34D399", "#F472B6", "#FBBF24", "#FB923C", "#38BDF8"];
        const defaultName =
          source === "windows" ? "Outlook Calendar" : source === "ics" ? "Imported (.ics)" : "Mac Calendar";
        const idPrefix = source === "windows" ? "wincal" : source === "ics" ? "icscal" : "maccal";
        const toastVerb = source === "ics" ? "Imported" : "Synced";
        const toastNoun =
          source === "windows" ? "Outlook" : source === "ics" ? "calendar" : "Mac";
        const accountId = get().inboxAccountId ?? null;

        let calendars = [...get().calendars];
        const calIdByExternal = new Map<string, string>();

        incomingCals.forEach((mc, i) => {
          const externalId = String(mc.id);
          const existing = calendars.find(
            (c) =>
              c.source === source &&
              c.externalId === externalId &&
              belongsToActiveAccount(c, accountId),
          );
          if (existing) {
            calendars = calendars.map((c) =>
              c.id === existing.id
                ? {
                    ...c,
                    name: mc.name || c.name,
                    color: mc.color || c.color,
                    visible: c.visible,
                    source,
                    externalId,
                    accountId,
                  }
                : c,
            );
            calIdByExternal.set(externalId, existing.id);
          } else {
            const id = uid(idPrefix);
            calendars.push({
              id,
              name: mc.name || defaultName,
              color: mc.color || pastelColors[i % pastelColors.length],
              visible: true,
              source,
              externalId,
              accountId,
            });
            calIdByExternal.set(externalId, id);
          }
        });

        // Replace only this account’s events from this external source.
        const keepOther = get().events.filter(
          (e) => !(e.source === source && belongsToActiveAccount(e, accountId)),
        );
        const merged = incomingEvents.map((me) => {
          const externalId = String(me.id);
          const prev = get().events.find(
            (e) =>
              e.source === source &&
              e.externalId === externalId &&
              belongsToActiveAccount(e, accountId),
          );
          const calendarId =
            calIdByExternal.get(String(me.calendarId)) ||
            prev?.calendarId ||
            calendars.find((c) => c.source === source && belongsToActiveAccount(c, accountId))?.id ||
            calendars[0]?.id ||
            "cal_default";
          // Outlook/Mac often leave Teams/Zoom join URLs in notes or location.
          return withMeetingLink({
            id: prev?.id || uid("e"),
            title: me.title || "Untitled",
            start: me.start,
            end: me.end,
            allDay: me.allDay ?? prev?.allDay,
            calendarId,
            location: me.location || undefined,
            notes: me.notes || undefined,
            externalId,
            source,
            reminderMinutes: prev?.reminderMinutes,
            countdown: prev?.countdown,
            dismissedAt: prev?.dismissedAt,
            accountId,
          });
        });

        set({
          calendars,
          events: [...keepOther, ...merged],
          toast: `${toastVerb} ${merged.length} ${toastNoun} event${merged.length === 1 ? "" : "s"}`,
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
              accountId: get().inboxAccountId ?? null,
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
        const accountId = get().inboxAccountId ?? null;
        const existing = get().journal.find(
          (j) => j.date === date && belongsToActiveAccount(j, accountId),
        );
        if (existing) {
          set({ journal: get().journal.map((j) => (j.id === existing.id ? { ...j, body } : j)) });
        } else {
          set({ journal: [...get().journal, { id: uid("j"), date, body, accountId }] });
        }
      },

      setDayLabel: (date, label) => {
        const accountId = get().inboxAccountId ?? null;
        const existing = get().dayLabels.find(
          (d) => d.date === date && belongsToActiveAccount(d, accountId),
        );
        if (existing) {
          set({
            dayLabels: label
              ? get().dayLabels.map((d) => (d.id === existing.id ? { ...d, label } : d))
              : get().dayLabels.filter((d) => d.id !== existing.id),
          });
        } else if (label) {
          set({ dayLabels: [...get().dayLabels, { id: uid("dl"), date, label, accountId }] });
        }
      },

      createEventFromThread: (threadId) => {
        const thread = get().threads.find((t) => t.id === threadId);
        if (!thread) return;
        const start = new Date();
        start.setHours(start.getHours() + 24, 0, 0, 0);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);
        const accountId =
          inferThreadAccountId(thread, get().messages) || get().inboxAccountId || null;
        get().addEvent({
          title: thread.customSubject || thread.subject,
          start: start.toISOString(),
          end: end.toISOString(),
          calendarId:
            get().calendars.find(
              (c) => !isExternalCalendarSource(c.source) && belongsToActiveAccount(c, accountId),
            )?.id ||
            get().calendars[0]?.id ||
            "cal_default",
          fromThreadId: threadId,
          reminderMinutes: [15],
          accountId,
        });
        set({ view: "calendar", toast: "Event created with a 15-minute reminder" });
      },

      tickReminders: () => {
        const state = get();
        const accountId = state.inboxAccountId;
        const existing = state.reminders || [];
        let reminders = activatePendingReminders(existing);
        const scopedEvents = filterByActiveAccount(state.events || [], accountId);
        const scopedThreads = accountId
          ? (state.threads || []).filter((t) =>
              threadBelongsToAccount(t, accountId, state.messages),
            )
          : state.threads || [];
        const incoming = collectDueReminders({
          events: scopedEvents,
          threads: scopedThreads,
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
          accountId:
            draft.accountId ||
            inferThreadAccountId(thread, get().messages) ||
            get().inboxAccountId ||
            null,
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
          if (ev) set({ view: "calendar", calendarDate: localYmd(ev.start) });
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
              accountId: get().inboxAccountId ?? null,
              stages: [
                { id: uid("ws"), name: "Needs reply", color: "#FF5A36" },
                { id: uid("ws"), name: "In review", color: "#F5A623" },
                { id: uid("ws"), name: "Done", color: "#00A86B" },
              ],
            } satisfies Workflow,
          ],
          toast: `Pipeline “${name}” created`,
        }),

      // Only the board goes away — every conversation stays in its mailbox.
      deleteWorkflow: (workflowId) =>
        set({
          workflows: get().workflows.filter((w) => w.id !== workflowId),
          threads: get().threads.map((t) =>
            t.workflowId === workflowId ? { ...t, workflowId: null, workflowStageId: null } : t,
          ),
          toast: "Pipeline removed — mail kept",
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
        return (thread.messageIds || [])
          .map((id) => get().messages[id])
          .filter(Boolean)
          .sort((a, b) => +new Date(a.sentAt) - +new Date(b.sentAt));
      },

      getAttachments: () => {
        const all = Object.values(get().messages).flatMap((m) => m?.attachments || []);
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
          // Drop dock flags only on true orphans (no messages and no account) — never wipe
          // Snooze / On Hold just because a body hasn't been loaded into memory yet.
          const hasIds = (next.messageIds || []).length > 0;
          if (!hasIds && !next.accountId && !threadHasContent(next, messages)) {
            next = {
              ...next,
              replyLater: false,
              setAside: false,
              bubbleUpAt: null,
            };
          }
          // Migrate legacy New Senders (screener) → Screening (feed)
          if (next.box === "screener") {
            next = { ...next, box: "feed" };
          }
          next = {
            ...next,
            messageIds: Array.isArray(next.messageIds) ? next.messageIds : [],
            collectionIds: Array.isArray(next.collectionIds) ? next.collectionIds : [],
            replyLater: Boolean(next.replyLater),
            setAside: Boolean(next.setAside),
            tags: syncThreadTags({
              ...next,
              messageIds: Array.isArray(next.messageIds) ? next.messageIds : [],
              collectionIds: Array.isArray(next.collectionIds) ? next.collectionIds : [],
              replyLater: Boolean(next.replyLater),
              setAside: Boolean(next.setAside),
            }),
          };
          return next;
        });
        const contactsRaw = (p.contacts || current.contacts).map((c) => {
          let defaultBox = normalizeMailBox(c.defaultBox);
          // Pending senders default to Screening until Allow → MoneyBox
          if (c.status === "pending" && defaultBox === "lesbox") {
            defaultBox = "feed";
          }
          return { ...c, defaultBox };
        });
        const rescued = backfillImapAccountIds(threads, messages);
        const contacts = contactsRaw;
        // Cap any legacy multi‑MB bodies that slipped in before the IMAP size guard.
        const MAX_BODY = 400_000;
        const messagesCapped: typeof messages = {};
        for (const [id, msg] of Object.entries(messages || {})) {
          if (!msg) continue;
          const html = String(msg.bodyHtml || "");
          const text = String(msg.bodyText || "");
          const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
          let nextMsg = msg.attachments === attachments ? msg : { ...msg, attachments };
          if (html.length > MAX_BODY || text.length > MAX_BODY) {
            nextMsg = {
              ...nextMsg,
              attachments,
              bodyHtml:
                html.length > MAX_BODY
                  ? `${html.slice(0, MAX_BODY)}\n<!-- truncated for performance -->`
                  : html,
              bodyText: text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text,
            };
          }
          messagesCapped[id] = nextMsg;
        }
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
          defaultEventDurationMinutes:
            p.settings?.defaultEventDurationMinutes ??
            current.settings.defaultEventDurationMinutes ??
            45,
          defaultEventReminderMinutes:
            p.settings?.defaultEventReminderMinutes ??
            current.settings.defaultEventReminderMinutes ??
            15,
          timezone:
            p.settings?.timezone ||
            current.settings.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "America/New_York",
          secondaryTimezone:
            p.settings?.secondaryTimezone ||
            current.settings.secondaryTimezone ||
            "America/Los_Angeles",
          showDualCalendarTimezones: Boolean(
            p.settings?.showDualCalendarTimezones ?? current.settings.showDualCalendarTimezones,
          ),
        };
        delete (settings as { spamCorps?: boolean }).spamCorps;
        const clipsRaw = Array.isArray(p.clips) ? p.clips : current.clips || [];
        const clips = clipsRaw.map((c) => {
          if (c.accountId) return c;
          const t = rescued.find((x) => x.id === c.sourceThreadId);
          const accountId = t ? inferThreadAccountId(t, messages) : null;
          return accountId ? { ...c, accountId } : c;
        });
        return {
          ...current,
          ...p,
          threads: rescued,
          contacts,
          messages: messagesCapped,
          clips,
          signatures: p.signatures || current.signatures || [],
          snippets: p.snippets?.length ? p.snippets : current.snippets || [],
          emailTemplates: p.emailTemplates?.length
            ? p.emailTemplates
            : current.emailTemplates || [],
          reminders: stampMissingAccountId(
            Array.isArray(p.reminders) ? p.reminders : current.reminders || [],
            p.inboxAccountId ?? current.inboxAccountId ?? null,
          ),
          recentRecipients: Array.isArray(p.recentRecipients)
            ? p.recentRecipients
            : current.recentRecipients || [],
          sometimeTasks: stampMissingAccountId(
            normalizeSometimeTasks(
              Array.isArray(p.sometimeTasks) ? p.sometimeTasks : current.sometimeTasks || [],
            ),
            p.inboxAccountId ?? current.inboxAccountId ?? null,
          ),
          // Backfills join links for events saved before Envision Mail read notes/location.
          events: stampMissingAccountId(
            (Array.isArray(p.events) ? p.events : current.events || []).map(withMeetingLink),
            p.inboxAccountId ?? current.inboxAccountId ?? null,
          ),
          calendars: stampMissingAccountId(
            Array.isArray(p.calendars) ? p.calendars : current.calendars || [],
            p.inboxAccountId ?? current.inboxAccountId ?? null,
          ),
          habits: stampMissingAccountId(
            Array.isArray(p.habits) ? p.habits : current.habits || [],
            p.inboxAccountId ?? current.inboxAccountId ?? null,
          ),
          journal: stampMissingAccountId(
            Array.isArray(p.journal) ? p.journal : current.journal || [],
            p.inboxAccountId ?? current.inboxAccountId ?? null,
          ),
          dayLabels: stampMissingAccountId(
            Array.isArray(p.dayLabels) ? p.dayLabels : current.dayLabels || [],
            p.inboxAccountId ?? current.inboxAccountId ?? null,
          ),
          collections: stampMissingAccountId(
            p.collections?.length ? p.collections : current.collections || [],
            p.inboxAccountId ?? current.inboxAccountId ?? null,
          ),
          workflows: stampMissingAccountId(
            p.workflows?.length ? p.workflows : current.workflows || [],
            p.inboxAccountId ?? current.inboxAccountId ?? null,
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
  opts?: { onlyNew?: boolean; accountId?: string | null; messages?: Record<string, Message | undefined> },
) {
  const now = Date.now();
  const want = normalizeBox(box);
  return threads
    .filter((t) => {
      if (normalizeBox(t.box) !== want) return false;
      // Strict account isolation — never leak another account’s mail
      if (opts?.accountId && !threadBelongsToAccount(t, opts.accountId, opts.messages)) return false;
      if (t.muted && t.seen) return want === "lesbox" ? false : true;
      if (t.bubbleUpAt && +new Date(t.bubbleUpAt) > now && t.seen) return false;
      if (opts?.onlyNew && t.seen) return false;
      return true;
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

/** Screening = former Newsstand (feed). Includes legacy screener until migrated. */
export function selectScreeningThreads(
  threads: Thread[],
  opts?: { accountId?: string | null; messages?: Record<string, Message | undefined>; onlyNew?: boolean },
) {
  const feed = selectBoxThreads(threads, "feed", opts);
  const legacy = selectBoxThreads(threads, "screener", opts);
  const seen = new Set(feed.map((t) => t.id));
  return [...feed, ...legacy.filter((t) => !seen.has(t.id))].sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
  );
}

/** New Senders = Screening mail from contacts still pending Allow / Block. */
export function selectNewSenderThreads(
  threads: Thread[],
  contacts: Contact[],
  opts?: { accountId?: string | null; messages?: Record<string, Message | undefined> },
) {
  const pending = new Set(
    contacts.filter((c) => c.status === "pending").map((c) => c.email.toLowerCase()),
  );
  return selectScreeningThreads(threads, opts).filter((t) =>
    pending.has(t.contactEmail.toLowerCase()),
  );
}

/** Threads for the active account across any box (Snooze, Search, etc.). */
export function selectAccountThreads(
  threads: Thread[],
  accountId: string | null | undefined,
  messages?: Record<string, Message | undefined>,
) {
  if (!accountId) return threads;
  return threads.filter((t) => threadBelongsToAccount(t, accountId, messages));
}

/** Real Snooze / On Hold items — same rules for badge counts and lists. */
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
  return selectAccountThreads(threads, accountId, messages).filter((t) => {
    if (t.box === "trash" || t.box === "spam") return false;
    // Count immediately from flags/tags — do not wait on message bodies (that hid badge updates).
    const flagged = mode === "reply_later" ? Boolean(t.replyLater) : Boolean(t.setAside);
    if (flagged) return true;
    const tag = mode === "reply_later" ? "snoozed" : "on-hold";
    return (t.tags || []).includes(tag);
  });
}

/** Ordered list for Prev / Next while reading — follows the list you came from when possible. */
export function selectThreadListForNavigation(
  threads: Thread[],
  thread: Thread,
  opts: {
    accountId?: string | null;
    messages?: Record<string, Message | undefined>;
    returnView?: AppView | null;
  },
): Thread[] {
  const accountId = opts.accountId;
  const messages = opts.messages;
  const view = resolveThreadBackView(thread.box, opts.returnView);
  if (view === "focus_reply" || view === "reply_later") {
    return selectDockThreads(threads, "reply_later", { accountId, messages });
  }
  if (view === "set_aside") {
    return selectDockThreads(threads, "set_aside", { accountId, messages });
  }
  if (view === "feed") {
    return selectScreeningThreads(threads, { accountId, messages });
  }
  if (view === "cleanup") {
    if (thread.box === "paper_trail") {
      return selectBoxThreads(threads, "paper_trail", { accountId, messages });
    }
    return selectScreeningThreads(threads, { accountId, messages });
  }
  if (view === "paper_trail") return selectBoxThreads(threads, "paper_trail", { accountId, messages });
  if (view === "spam") return selectBoxThreads(threads, "spam", { accountId, messages });
  if (view === "sent") return selectBoxThreads(threads, "sent", { accountId, messages });
  if (view === "trash") return selectBoxThreads(threads, "trash", { accountId, messages });
  return selectBoxThreads(threads, "lesbox", { accountId, messages });
}

export function selectThreadNeighbors(
  threads: Thread[],
  threadId: string,
  opts: {
    accountId?: string | null;
    messages?: Record<string, Message | undefined>;
    returnView?: AppView | null;
  },
): { prevId: string | null; nextId: string | null; index: number; total: number } {
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) return { prevId: null, nextId: null, index: -1, total: 0 };
  const list = selectThreadListForNavigation(threads, thread, opts);
  const index = list.findIndex((t) => t.id === threadId);
  if (index < 0) return { prevId: null, nextId: null, index: -1, total: list.length };
  return {
    prevId: index > 0 ? list[index - 1]!.id : null,
    nextId: index < list.length - 1 ? list[index + 1]!.id : null,
    index,
    total: list.length,
  };
}

/**
 * Lower-priority mail for the reversible Easy Cleanup review queue.
 *
 * Safety rules:
 * - Never include MoneyBox, Sent, Spam, or Trash.
 * - Never include queued / held mail.
 * - Exclude contacts the user has sent or replied to at least twice.
 * - Exclude contacts explicitly routed to MoneyBox.
 */
export function selectCleanupThreads(
  threads: Thread[],
  contacts: Contact[],
  messages: Record<string, Message | undefined>,
  opts?: { accountId?: string | null },
) {
  const scoped = selectAccountThreads(threads, opts?.accountId, messages);
  const sentCounts = new Map<string, number>();

  for (const thread of scoped) {
    for (const messageId of thread.messageIds || []) {
      const message = messages[messageId];
      if (!message?.isOutgoing) continue;
      const recipients = [...(message.to || []), ...(message.cc || []), ...(message.bcc || [])];
      for (const recipient of new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))) {
        sentCounts.set(recipient, (sentCounts.get(recipient) || 0) + 1);
      }
    }
  }

  return scoped
    .filter((thread) => {
      if (!["feed", "screener", "paper_trail"].includes(thread.box)) return false;
      if (thread.replyLater || thread.setAside) return false;
      const email = thread.contactEmail.trim().toLowerCase();
      const contact = contacts.find((item) => item.email.trim().toLowerCase() === email);
      if (contact?.status === "blocked" || contact?.defaultBox === "lesbox") return false;
      return (sentCounts.get(email) || 0) < 2;
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

/** Sidebar / toast helper — live dock badge totals for the active account. */
export function countDockThreads(
  threads: Thread[],
  mode: "reply_later" | "set_aside",
  opts?: {
    accountId?: string | null;
    messages?: Record<string, Message | undefined>;
  },
) {
  return selectDockThreads(threads, mode, opts).length;
}

