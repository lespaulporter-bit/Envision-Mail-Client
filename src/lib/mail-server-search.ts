import { desktopApi, isDesktop, thisComputerLabel } from "@/lib/desktop";
import { useMailStore } from "@/lib/store";

/** Run IMAP search on the active account and import hits into MoneyBox. */
export async function searchAndImportOldMail(query: string, opts?: { limit?: number }) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return { ok: false as const, error: "Enter at least 2 characters.", imported: 0 };
  }
  if (!isDesktop()) {
    return { ok: false as const, error: "Server search needs the Envision Mail desktop app.", imported: 0 };
  }
  const api = desktopApi();
  const accountId = useMailStore.getState().inboxAccountId;
  if (!api?.searchMail || !accountId) {
    return { ok: false as const, error: "Select an account in the sidebar first.", imported: 0 };
  }

  const result = await api.searchMail({ accountId, query: q, limit: opts?.limit ?? 40 });
  if (!result.ok) {
    return { ok: false as const, error: result.error || "Search failed.", imported: 0 };
  }
  const messages = result.messages || [];
  if (!messages.length) {
    useMailStore.getState().setToast(`No server matches for “${q}”`);
    return { ok: true as const, imported: 0, matched: 0 };
  }

  const { imported } = useMailStore.getState().importSyncedMail(
    {
      accountId: result.accountId || accountId,
      email: result.email || "",
      displayName: result.displayName,
      messages,
    },
    {
      deliverToInbox: true,
      toastMessage: "",
    },
  );
  useMailStore.getState().setToast(
    imported > 0
      ? `Found on server · added ${imported} to your mailbox`
      : `Found ${messages.length} on server (already on ${thisComputerLabel()})`,
  );
  return { ok: true as const, imported, matched: result.matched ?? messages.length };
}

/** Pull the next older INBOX chunk past the recent sync window. */
export async function loadOlderInboxMail(skipNewest: number, opts?: { limit?: number }) {
  if (!isDesktop()) {
    return { ok: false as const, error: "Load older needs the desktop app.", imported: 0, nextSkip: skipNewest };
  }
  const api = desktopApi();
  const accountId = useMailStore.getState().inboxAccountId;
  if (!api?.fetchOlderMail || !accountId) {
    return { ok: false as const, error: "Select an account in the sidebar first.", imported: 0, nextSkip: skipNewest };
  }

  const result = await api.fetchOlderMail({
    accountId,
    folder: "inbox",
    skipNewest,
    limit: opts?.limit ?? 40,
  });
  if (!result.ok) {
    return {
      ok: false as const,
      error: result.error || "Could not load older mail.",
      imported: 0,
      nextSkip: skipNewest,
    };
  }
  const messages = result.messages || [];
  if (!messages.length) {
    useMailStore.getState().setToast("No more older mail in this mailbox");
    return {
      ok: true as const,
      imported: 0,
      nextSkip: result.nextSkipNewest ?? skipNewest,
      hasMore: false,
      total: result.total,
    };
  }

  const { imported } = useMailStore.getState().importSyncedMail(
    {
      accountId: result.accountId || accountId,
      email: result.email || "",
      displayName: result.displayName,
      messages,
    },
    {
      deliverToInbox: true,
      toastMessage: "",
    },
  );

  if (imported > 0) {
    useMailStore
      .getState()
      .setToast(`Loaded ${imported} older message${imported === 1 ? "" : "s"}`);
  } else {
    useMailStore.getState().setToast("Those older messages were already downloaded");
  }

  return {
    ok: true as const,
    imported,
    nextSkip: result.nextSkipNewest ?? skipNewest + messages.length,
    hasMore: Boolean(result.hasMore),
    total: result.total,
  };
}
