export type MailBox = "lesbox" | "feed" | "paper_trail";

export type Box = MailBox | "imbox" | "screener" | "spam" | "trash";

export type ContactStatus = "pending" | "allowed" | "blocked";

export type CoverArtMode = "none" | "gradient" | "photo" | "calendar";

export type CalendarView = "day" | "week" | "month";

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
  unfollowed: boolean;
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
}

export interface SubCalendar {
  id: string;
  name: string;
  color: string;
  visible: boolean;
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
}

export interface Settings {
  displayName: string;
  email: string;
  workEmail?: string;
  speakeasyCode: string;
  autoresponderOn: boolean;
  autoresponderMessage: string;
  spamCorps: boolean;
  coverArt: CoverArtMode;
  coverArtImage?: string;
  timezone: string;
  secondaryTimezone?: string;
  twoFactorEnabled: boolean;
  linkedAccounts: boolean;
  wallpaper: WallpaperTheme;
  wallpaperRotateMinutes: number;
  autoFetchMinutes: number;
  requestReadReceiptsByDefault: boolean;
  defaultSignatureId?: string | null;
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
  settings: Settings;
}

/** Normalize legacy box id */
export function normalizeBox(box: string): Box {
  if (box === "imbox") return "lesbox";
  return box as Box;
}

export function normalizeMailBox(box: string): MailBox {
  const b = normalizeBox(box);
  if (b === "feed" || b === "paper_trail") return b;
  return "lesbox";
}

export function boxLabel(box: Box | string): string {
  const b = normalizeBox(box);
  if (b === "lesbox") return "LesBox";
  if (b === "paper_trail") return "Paper Trail";
  if (b === "feed") return "The Feed";
  if (b === "screener") return "Screener";
  return b;
}
