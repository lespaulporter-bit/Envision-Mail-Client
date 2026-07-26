export interface DesktopAccount {
  id: string;
  name: string;
  email: string;
  provider: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  enabled?: boolean;
  hasPassword?: boolean;
  /** True when ciphertext can't be decrypted — user must paste a new app password */
  needsPassword?: boolean;
  /** True when IMAP/SMTP works and a secret is stored — hide setup chrome */
  verified?: boolean;
  authBroken?: boolean;
  verifiedAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  /** Hex color for letter avatar shown in outgoing mail */
  brandColor?: string | null;
  /** 1–2 letter mark (e.g. E for envisiondms.com) */
  brandLetter?: string | null;
  /** Optional uploaded logo as data URL (embedded in sent HTML) */
  brandLogoDataUrl?: string | null;
}

export interface DesktopSyncedMessage {
  uid: number;
  messageIdHeader?: string | null;
  inReplyTo?: string | null;
  references?: string[] | string;
  folder?: "inbox" | "sent" | "spam" | "trash" | string;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  sentAt: string;
  seen: boolean;
  attachments: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    messageId: string;
    threadId: string;
    receivedAt: string;
  }>;
  trackersBlocked: string[];
}

export interface DiscoveredMailSettings {
  ok: boolean;
  error?: string;
  discovered?: boolean;
  provider?: string;
  label?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  hint?: string;
  username?: string;
  mx?: string[];
}

export interface LesMailDesktopApi {
  isDesktop: boolean;
  platform: string;
  presets: () => Promise<Record<string, unknown>>;
  discover: (email: string) => Promise<DiscoveredMailSettings>;
  listAccounts: () => Promise<DesktopAccount[]>;
  saveAccount: (
    payload: Partial<DesktopAccount> & { password?: string },
  ) => Promise<{ ok: boolean; account?: DesktopAccount; error?: string }>;
  removeAccount: (id: string) => Promise<{ ok: boolean }>;
  testAccount: (payload: Partial<DesktopAccount> & { password?: string; id?: string }) => Promise<{
    ok: boolean;
    stage?: string;
    error?: string;
    suggested?: Partial<DesktopAccount>;
  }>;
  syncAccount: (id: string) => Promise<{
    ok: boolean;
    error?: string;
    accountId?: string;
    email?: string;
    displayName?: string;
    messages?: DesktopSyncedMessage[];
  }>;
  loadAppState: () => Promise<unknown>;
  saveAppState: (payload: unknown) => Promise<{ ok: boolean; path?: string }>;
  sendMail: (payload: {
    accountId: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text: string;
    html?: string;
    inReplyTo?: string;
    references?: string;
    requestReadReceipt?: boolean;
  }) => Promise<{ ok: boolean; error?: string; messageId?: string }>;
  moveMessages: (payload: {
    accountId: string;
    sourceFolder: string;
    destFolder: string;
    uids: number[];
  }) => Promise<{ ok: boolean; error?: string; moved?: number }>;
  deleteMessages: (payload: {
    accountId: string;
    folder: string;
    uids: number[];
  }) => Promise<{ ok: boolean; error?: string; deleted?: number }>;
  emptyFolder: (payload: {
    accountId: string;
    folder: "spam" | "trash";
  }) => Promise<{ ok: boolean; error?: string; deleted?: number }>;
  sendCalendarInvites: (payload: {
    accountId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any;
  }) => Promise<{ ok: boolean; error?: string; results?: unknown[] }>;
  generateTeamsUrl: (title?: string) => Promise<{ ok: boolean; url: string }>;
  syncMacCalendars: () => Promise<{
    ok: boolean;
    error?: string;
    calendars?: Array<{ id: string; name: string; color?: string }>;
    events?: Array<{
      id: string;
      title: string;
      start: string;
      end: string;
      calendarId: string;
      location?: string;
      notes?: string;
    }>;
  }>;
  getUpdateStatus: () => Promise<{
    feedUrl: string;
    lastCheckAt: string | null;
    lastResult: string | null;
    lastVersion: string | null;
    nextCheckDueAt: string;
    checkEveryDays: number;
    autoDownload: boolean;
  }>;
  setUpdateFeedUrl: (url: string) => Promise<{ ok: boolean; feedUrl: string }>;
  checkForUpdates: (opts?: { force?: boolean }) => Promise<{
    ok: boolean;
    skipped?: boolean;
    error?: string;
    updateInfo?: { version?: string } | null;
    status?: unknown;
  }>;
  installUpdate: () => Promise<{ ok: boolean; method?: string; error?: string }>;
  getAppInfo: () => Promise<{ name: string; version: string; userData: string; platform: string; isPackaged: boolean }>;
  uninstall: () => Promise<{ ok: boolean; cancelled?: boolean }>;
  openExternal: (url: string) => Promise<{ ok: boolean }>;
  onRequestUninstall: (cb: () => void) => () => void;
  onRequestSync: (cb: () => void) => () => void;
  onOpenSettings: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    lesMail?: LesMailDesktopApi;
  }
}

export {};
