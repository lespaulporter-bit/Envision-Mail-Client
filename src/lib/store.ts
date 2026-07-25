"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSeed } from "./seed";
import type {
  AppStateData,
  Box,
  CalendarEvent,
  CoverArtMode,
  EmailTemplate,
  MailBox,
  Message,
  Settings,
  SignatureTemplate,
  Thread,
  Workflow,
} from "./types";
import { normalizeBox, normalizeMailBox } from "./types";
import { uid } from "./utils";

export type AppView =
  | "lesbox"
  | "feed"
  | "paper_trail"
  | "screener"
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
  /** null = all accounts in LesBox; otherwise filter by desktop account id */
  inboxAccountId: string | null;
  composeDraft: {
    to: string;
    subject: string;
    body: string;
    replyToThreadId?: string | null;
  };
  calendarDate: string;
  calendarView: "day" | "week" | "month";
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
  setCompose: (draft: Partial<UiState["composeDraft"]>) => void;
  setCalendarDate: (isoDate: string) => void;
  setCalendarView: (v: UiState["calendarView"]) => void;

  screenContact: (
    email: string,
    decision: "allow" | "block",
    box?: MailBox,
  ) => void;
  markSpam: (threadId: string) => void;
  moveThread: (threadId: string, box: Box) => void;
  markSeen: (threadId: string, seen?: boolean) => void;
  markAllSeenInBox: (box: Box) => void;
  toggleReplyLater: (threadId: string) => void;
  toggleSetAside: (threadId: string) => void;
  setBubbleUp: (threadId: string, at: string | null) => void;
  toggleBundleContact: (email: string) => void;
  renameSubject: (threadId: string, subject: string) => void;
  unfollowThread: (threadId: string) => void;
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
  updateSettings: (patch: Partial<Settings>) => void;
  setCoverArt: (mode: CoverArtMode) => void;

  sendReply: (threadId: string, body: string) => void;
  sendNewEmail: (to: string, subject: string, body: string, opts?: { requestReadReceipt?: boolean; smtpMessageId?: string | null }) => void;
  replyToEveryone: (threadIds: string[], body: string) => void;
  importSyncedMail: (payload: {
    accountId: string;
    email: string;
    displayName?: string;
    messages: Array<{
      uid: number;
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
    }>;
  }) => { imported: number; screened: number };

  addEvent: (event: Omit<CalendarEvent, "id">) => void;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  toggleHabit: (habitId: string, date: string) => void;
  addSometimeTask: (text: string) => void;
  toggleSometimeTask: (id: string) => void;
  setJournal: (date: string, body: string) => void;
  setDayLabel: (date: string, label: string) => void;
  createEventFromThread: (threadId: string) => void;

  createWorkflow: (name: string) => void;
  resetDemo: () => void;

  // selectors as methods for convenience
  getThreadMessages: (threadId: string) => Message[];
  getAttachments: () => AppStateData extends never ? never : import("./types").Attachment[];
}

export type HeyStore = AppStateData & UiState & Actions;

const seed = createSeed();

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

export const useHeyStore = create<HeyStore>()(
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
      composeDraft: { to: "", subject: "", body: "", replyToThreadId: null },
      calendarDate: new Date().toISOString().slice(0, 10),
      calendarView: "week",
      toast: null,

      setView: (view) => set({ view, selectedThreadId: view === "thread" ? get().selectedThreadId : get().selectedThreadId }),
      openThread: (id) => {
        const thread = get().threads.find((t) => t.id === id);
        if (!thread) return;
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
        set({
          multiOpenIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
        });
      },
      clearMultiOpen: () => set({ multiOpenIds: [] }),
      setInboxAccountId: (inboxAccountId) => set({ inboxAccountId, view: "lesbox" }),
      setCompose: (draft) => set({ composeDraft: { ...get().composeDraft, ...draft } }),
      setCalendarDate: (calendarDate) => set({ calendarDate }),
      setCalendarView: (calendarView) => set({ calendarView }),

      screenContact: (email, decision, box = "lesbox") => {
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
          toast: "Marked as spam — thanks, Spam Corps",
        });
      },

      moveThread: (threadId, box) =>
        set({
          threads: get().threads.map((t) => (t.id === threadId ? bumpThread({ ...t, box }) : t)),
          toast: `Moved to ${box.replace("_", " ")}`,
        }),

      markSeen: (threadId, seen = true) =>
        set({
          threads: get().threads.map((t) => (t.id === threadId ? { ...t, seen } : t)),
        }),

      markAllSeenInBox: (box) =>
        set({
          threads: get().threads.map((t) => (t.box === box ? { ...t, seen: true } : t)),
          toast: "Cleared new mail",
        }),

      toggleReplyLater: (threadId) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, replyLater: !t.replyLater }) : t,
          ),
        }),

      toggleSetAside: (threadId) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, setAside: !t.setAside }) : t,
          ),
        }),

      setBubbleUp: (threadId, at) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, bubbleUpAt: at, seen: at ? true : t.seen }) : t,
          ),
          toast: at ? "Will bubble up later" : "Bubble up cleared",
        }),

      toggleBundleContact: (email) => {
        const contact = get().contacts.find((c) => c.email === email);
        const bundled = !contact?.bundled;
        set({
          contacts: get().contacts.map((c) => (c.email === email ? { ...c, bundled } : c)),
          threads: get().threads.map((t) => (t.contactEmail === email ? { ...t, bundled } : t)),
          toast: bundled ? "Sender bundled" : "Sender unbundled",
        });
      },

      renameSubject: (threadId, subject) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, customSubject: subject }) : t,
          ),
        }),

      unfollowThread: (threadId) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? bumpThread({ ...t, unfollowed: true, seen: true }) : t,
          ),
          toast: "Unfollowed thread",
        }),

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

      toggleThreadNotify: (threadId) =>
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? { ...t, notify: !t.notify } : t,
          ),
        }),

      shareThread: (threadId) => {
        const token = uid("share");
        set({
          threads: get().threads.map((t) =>
            t.id === threadId ? { ...t, shareToken: token } : t,
          ),
          toast: "Share link copied",
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
          toast: "Clipped",
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
          toast: "Reply sent",
        });
      },

      sendNewEmail: (to, subject, body, opts) => {
        const threadId = uid("t");
        const messageId = uid("m");
        const name = to.split("@")[0] || to;
        let contacts = get().contacts;
        if (!contacts.some((c) => c.email === to)) {
          contacts = [
            ...contacts,
            {
              id: uid("c"),
              email: to,
              name,
              status: "allowed",
              defaultBox: "lesbox",
              notes: "",
              notify: false,
              avatarColor: "#5522FA",
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
          cc: [],
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
          box: "lesbox",
          contactEmail: to,
          contactName: name,
          messageIds: [messageId],
          seen: true,
          replyLater: false,
          setAside: false,
          bundled: false,
          unfollowed: false,
          stickyNotes: [],
          privateNotes: [],
          collectionIds: [],
          notify: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set({
          contacts,
          messages: { ...get().messages, [messageId]: message },
          threads: [thread, ...get().threads],
          view: "thread",
          selectedThreadId: threadId,
          toast: "Email sent",
          composeDraft: { to: "", subject: "", body: "", replyToThreadId: null },
        });
      },

      replyToEveryone: (threadIds, body) => {
        threadIds.forEach((id) => get().sendReply(id, body));
        set({ toast: `Replied to ${threadIds.length} emails` });
      },

      importSyncedMail: ({ accountId, email, messages: incoming }) => {
        let imported = 0;
        let screened = 0;
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
            const original = Object.values(get().messages).find(
              (m) =>
                m.isOutgoing &&
                m.requestReadReceipt &&
                item.inReplyTo &&
                m.smtpMessageId &&
                String(item.inReplyTo).includes(String(m.smtpMessageId).replace(/[<>]/g, "")),
            );
            const fallback =
              original ||
              Object.values(get().messages)
                .filter((m) => m.isOutgoing && m.requestReadReceipt && m.to?.includes?.(item.from))
                .sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt))[0];
            if (fallback) {
              get().recordReadReceipt(fallback.id, item.from, item.fromName);
            }
          }

          const messageId = `imap_${accountId}_${item.uid}`;
          if (msgs[messageId]) continue;

          const isOutgoing = item.from.toLowerCase() === own;
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
            // Outgoing: you chose this recipient → LesBox. Inbound unknown → Screener (unless Speakeasy).
            const autoAllow = isOutgoing || bypass;
            contact = {
              id: uid("c"),
              email: counterpartyEmail,
              name: counterpartyName,
              status: autoAllow ? ("allowed" as const) : ("pending" as const),
              defaultBox: "lesbox",
              notes: bypass ? "Speakeasy bypass" : "",
              notify: Boolean(bypass),
              avatarColor: `#${((counterpartyEmail.length * 37) % 0xffffff).toString(16).padStart(6, "0")}`,
              bundled: false,
            };
            contacts = [...contacts, contact];
          }
          // Do NOT auto-promote pending → allowed on sync

          const box: Box =
            contact.status === "blocked"
              ? "spam"
              : contact.status === "pending"
                ? "screener"
                : contact.defaultBox || "lesbox";

          const subjectKey = item.subject.replace(/^(re|fwd|fw):\s*/i, "").trim().toLowerCase();
          let thread = threads.find(
            (t) =>
              t.contactEmail.toLowerCase() === counterpartyEmail &&
              (t.accountId === accountId || !t.accountId) &&
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
              unfollowed: false,
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
            const nextBox: Box =
              thread.box === "spam" || box === "spam"
                ? "spam"
                : thread.box === "screener"
                  ? "screener"
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

        if (screened > 0) {
          set({
            threads,
            contacts,
            messages: msgs,
            settings,
            view: "screener",
            toast: `Synced ${imported} · ${screened} need Screener review`,
          });
        } else if (imported > 0) {
          set({
            threads,
            contacts,
            messages: msgs,
            settings,
            view: "lesbox",
            inboxAccountId: accountId,
            toast: `Synced ${imported} message${imported === 1 ? "" : "s"} → LesBox${email ? ` (${email})` : ""}`,
          });
        } else {
          set({
            threads,
            contacts,
            messages: msgs,
            settings,
            toast: "Already up to date",
          });
        }
        return { imported, screened };
      },

      addEvent: (event) =>
        set({ events: [...get().events, { ...event, id: uid("e") }], toast: "Event added" }),

      updateEvent: (id, patch) =>
        set({
          events: get().events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }),

      deleteEvent: (id) => set({ events: get().events.filter((e) => e.id !== id) }),

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

      addSometimeTask: (text) =>
        set({
          sometimeTasks: [
            { id: uid("st"), text, done: false, createdAt: new Date().toISOString() },
            ...get().sometimeTasks,
          ],
        }),

      toggleSometimeTask: (id) =>
        set({
          sometimeTasks: get().sometimeTasks.map((t) =>
            t.id === id ? { ...t, done: !t.done } : t,
          ),
        }),

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
          calendarId: "cal2",
          fromThreadId: threadId,
          reminderMinutes: [15],
        });
        set({ view: "calendar" });
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
        const fresh = createSeed();
        set({
          ...fresh,
          view: "lesbox",
          selectedThreadId: null,
          searchQuery: "",
          powerThrough: false,
          multiOpenIds: [],
          toast: "Demo data reset",
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
      name: "les-mail-v4",
      partialize: (state) => ({
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
        settings: state.settings,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<AppStateData>;
        const threads = (p.threads || current.threads).map((t) => ({
          ...t,
          box: normalizeBox(t.box),
        }));
        const contactsRaw = (p.contacts || current.contacts).map((c) => ({
          ...c,
          defaultBox: normalizeMailBox(c.defaultBox),
        }));
        const messages = p.messages || current.messages;
        const rescued = backfillImapAccountIds(threads, messages);
        const contacts = contactsRaw;
        const settings = {
          ...current.settings,
          ...(p.settings || {}),
          wallpaper: p.settings?.wallpaper ?? current.settings.wallpaper ?? "rotate",
          wallpaperRotateMinutes:
            p.settings?.wallpaperRotateMinutes ?? current.settings.wallpaperRotateMinutes ?? 8,
          autoFetchMinutes: p.settings?.autoFetchMinutes ?? current.settings.autoFetchMinutes ?? 2,
          requestReadReceiptsByDefault:
            p.settings?.requestReadReceiptsByDefault ??
            current.settings.requestReadReceiptsByDefault ??
            true,
        };
        return {
          ...current,
          ...p,
          threads: rescued,
          contacts,
          messages,
          signatures: p.signatures || current.signatures || [],
          emailTemplates: p.emailTemplates?.length
            ? p.emailTemplates
            : current.emailTemplates || [],
          settings,
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
      if (opts?.accountId) {
        if (t.accountId !== opts.accountId && t.accountEmail !== opts.accountId) return false;
      }
      if (t.unfollowed && t.seen) return want === "lesbox" ? false : true;
      if (t.bubbleUpAt && +new Date(t.bubbleUpAt) > now && t.seen) return false;
      if (opts?.onlyNew && t.seen) return false;
      return true;
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

