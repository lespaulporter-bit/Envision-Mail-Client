import type { AppStateData } from "./types";

/** Empty starter state — no fake contacts, emails, or demo calendar. */
export function createEmptyState(): AppStateData {
  return {
    threads: [],
    messages: {},
    contacts: [],
    collections: [],
    workflows: [],
    snippets: [],
    signatures: [],
    emailTemplates: [],
    clips: [],
    events: [],
    calendars: [
      {
        id: "cal_default",
        name: "Personal",
        color: "#0d9488",
        visible: true,
        source: "local",
      },
    ],
    habits: [],
    journal: [],
    dayLabels: [],
    sometimeTasks: [],
    reminders: [],
    recentRecipients: [],
    settings: {
      displayName: "",
      email: "",
      workEmail: "",
      speakeasyCode: "",
      autoresponderOn: false,
      autoresponderMessage: "I'm away and will get back to you soon.",
      spamCentral: true,
      coverArt: "none",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      secondaryTimezone: "America/Los_Angeles",
      showDualCalendarTimezones: false,
      twoFactorEnabled: false,
      linkedAccounts: false,
      wallpaper: "none",
      wallpaperRotateMinutes: 8,
      autoFetchMinutes: 2,
      autoPurgeTrashDays: 30,
      requestReadReceiptsByDefault: false,
      defaultSignatureId: null,
      defaultEventDurationMinutes: 45,
      defaultEventReminderMinutes: 15,
      hideOtherCalendarEvents: false,
    },
  };
}

/** @deprecated Use createEmptyState — kept for any reset helpers. */
export function createSeed(): AppStateData {
  return createEmptyState();
}
