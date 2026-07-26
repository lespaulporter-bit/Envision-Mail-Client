export type MailBox = "lesbox" | "feed" | "paper_trail" | "sent" | "spam" | "trash";

export type Box = MailBox | "imbox" | "screener";

export type ContactStatus = "pending" | "allowed" | "blocked";

export type CoverArtMode = "none" | "gradient" | "photo" | "calendar";

export type CalendarView = "day" | "week" | "month" | "agenda";

export type WallpaperTheme = "none" | "ocean" | "forest" | "stars" | "rotate";

export interface Attachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url?: string;
  messageId: string;
  threadId: string;
  receivedAt: string;
}

export interface Clip {
  id: string;
  text: string;
  sourceThreadId: string;
  sourceSubject: string;
  createdAt: string;
}

export interface Snippet {
  id: string;
  name: string;
  body: string;
}

export interface SignatureTemplate {
  id: string;
  name: string;
  html: string;
  imageDataUrl?: string;
  isDefault?: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject?: string;
  body: string;
}

export interface StickyNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface PrivateNote {
  id: string;
  text: string;
  files: string[];
  createdAt: string;
}

export interface ReadReceipt {
  id: string;
  readerEmail: string;
  readerName?: string;
  readAt: string;
}

export interface Message {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  to: string[];
  cc: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  sentAt: string;
  attachments: Attachment[];
  trackersBlocked: string[];
  isOutgoing?: boolean;
  requestReadReceipt?: boolean;
  readReceipts?: ReadReceipt[];
  smtpMessageId?: string | null;
  /** Raw List-Unsubscribe header when present */
  listUnsubscribe?: string | null;
  listUnsubscribePost?: string | null;
  unsubscribeHttpUrl?: string | null;
  unsubscribeMailto?: string | null;
  unsubscribeOneClick?: boolean;
  /** Set after a successful in-app unsubscribe */
  unsubscribedAt?: string | null;
}

export interface Thread {
  id: string;
  subject: string;
  customSubject?: string;
  box: Box;
  contactEmail: string;
  contactName: string;
  messageIds: string[];
  seen: boolean;
  replyLater: boolean;
  setAside: boolean;
  bubbleUpAt?: string | null;
  bundled: boolean;
  muted: boolean;
  /** Searchable action tags e.g. snoozed, on-hold, muted */
  tags?: string[];
  stickyNotes: StickyNote[];
  privateNotes: PrivateNote[];
  collectionIds: string[];
  workflowId?: string | null;
  workflowStageId?: string | null;
  notify: boolean;
  shareToken?: string | null;
  accountMark?: "personal" | "work" | null;
  /** Desktop IMAP account this thread was synced from */
  accountId?: string | null;
  accountEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  email: string;
  name: string;
  status: ContactStatus;
  defaultBox: MailBox;
  notes: string;
  notify: boolean;
  avatarColor: string;
  /** Optional uploaded photo/logo shown instead of initials */
  avatarImageDataUrl?: string | null;
  bundled: boolean;
}

export interface Collection {
  id: string;
  name: string;
  threadIds: string[];
  shared: boolean;
}

export interface WorkflowStage {
  id: string;
  name: string;
  color: string;
}

export interface Workflow {
  id: string;
  name: string;
  stages: WorkflowStage[];
}

export interface CalendarInvitee {
  email: string;
  name?: string;
  status?: "pending" | "accepted" | "declined";
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  calendarId: string;
  location?: string;
  notes?: string;
  meetingUrl?: string;
  meetingProvider?: "teams" | "zoom" | "meet" | "none";
  invitees?: CalendarInvitee[];
  countdown?: boolean;
  reminderMinutes?: number[];
  fromThreadId?: string | null;
  invitesSentAt?: string | null;
  externalId?: string | null;
  source?: "local" | "mac" | null;
}

export interface SubCalendar {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  source?: "local" | "mac";
  externalId?: string | null;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  completedDates: string[];
}

export interface JournalEntry {
  id: string;
  date: string;
  body: string;
}

export interface DayLabel {
  id: string;
  date: string;
  label: string;
}

export interface SometimeTask {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  /** Monday yyyy-MM-dd for the week this task belongs to */
  weekKey?: string;
  /** True after an unchecked task rolled from a prior week */
  carriedOver?: boolean;
}

/** Outlook-style on-screen reminder (calendar, mail, or manual) */
export interface Reminder {
  id: string;
  title: string;
  subtitle?: string;
  /** When the reminder should appear (ISO) */
  dueAt: string;
  source: "calendar" | "mail" | "manual";
  sourceId: string;
  /** Prevents re-firing the same calendar offset / mail bump */
  occurrenceKey: string;
  status: "pending" | "active" | "dismissed";
  location?: string;
  meetingUrl?: string;
  createdAt: string;
}

export interface Settings {
  displayName: string;
  email: string;
  workEmail?: string;
  speakeasyCode: string;
  autoresponderOn: boolean;
  autoresponderMessage: string;
  /** Show “Block & report” (Spam Central) in New Senders */
  spamCentral: boolean;
  /** @deprecated migrated to spamCentral */
  spamCorps?: boolean;
  coverArt: CoverArtMode;
  coverArtImage?: string;
  timezone: string;
  secondaryTimezone?: string;
  twoFactorEnabled: boolean;
  linkedAccounts: boolean;
  wallpaper: WallpaperTheme;
  wallpaperRotateMinutes: number;
  autoFetchMinutes: number;
  /** Permanently delete Trash older than this many days. Default 30. Set 0 to disable. */
  autoPurgeTrashDays: number;
  requestReadReceiptsByDefault: boolean;
  defaultSignatureId?: string | null;
  /** New calendar event length in minutes (default 45). End time auto-fills from start. */
  defaultEventDurationMinutes?: number;
  /** Default reminder offset for new events (minutes before). -1 = none. */
  defaultEventReminderMinutes?: number;
}

export interface AppStateData {
  threads: Thread[];
  messages: Record<string, Message>;
  contacts: Contact[];
  collections: Collection[];
  workflows: Workflow[];
  snippets: Snippet[];
  signatures: SignatureTemplate[];
  emailTemplates: EmailTemplate[];
  clips: Clip[];
  events: CalendarEvent[];
  calendars: SubCalendar[];
  habits: Habit[];
  journal: JournalEntry[];
  dayLabels: DayLabel[];
  sometimeTasks: SometimeTask[];
  reminders: Reminder[];
  /** Addresses the user has sent to / typed — for compose autocomplete */
  recentRecipients: Array<{ email: string; name?: string; lastUsedAt: string }>;
  settings: Settings;
}

/** Normalize legacy box id */
export function normalizeBox(box: string): Box {
  if (box === "imbox") return "lesbox";
  return box as Box;
}

export function normalizeMailBox(box: string): MailBox {
  const b = normalizeBox(box);
  if (b === "feed" || b === "paper_trail" || b === "sent" || b === "spam" || b === "trash") return b;
  return "lesbox";
}

export function boxLabel(box: Box | string): string {
  const b = normalizeBox(box);
  if (b === "lesbox") return "MoneyBox $";
  if (b === "paper_trail") return "Receipts";
  if (b === "feed") return "Newsstand";
  if (b === "screener") return "New Senders";
  if (b === "sent") return "Sent";
  if (b === "spam") return "Spam";
  if (b === "trash") return "Trash";
  return b;
}
