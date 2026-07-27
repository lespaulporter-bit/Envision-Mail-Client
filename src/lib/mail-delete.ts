import { desktopApi, isDesktop } from "@/lib/desktop";
import { useMailStore } from "@/lib/store";

export type ImapFolderKey = "inbox" | "sent" | "spam" | "trash";

export function parseImapMessageId(
  messageId: string,
): { accountId: string; folder: ImapFolderKey; uid: number } | null {
  const m = /^imap_(.+?)_(?:(sent|spam|trash)_)?(\d+)$/.exec(messageId);
  if (!m) return null;
  return {
    accountId: m[1],
    folder: (m[2] as ImapFolderKey) || "inbox",
    uid: Number(m[3]),
  };
}

function collectImapRefs(threadId: string) {
  const state = useMailStore.getState();
  const thread = state.threads.find((t) => t.id === threadId);
  if (!thread) return { thread: null, byAccount: new Map<string, Map<ImapFolderKey, number[]>>() };
  const byAccount = new Map<string, Map<ImapFolderKey, number[]>>();
  for (const mid of thread.messageIds) {
    const ref = parseImapMessageId(mid);
    if (!ref) continue;
    if (!byAccount.has(ref.accountId)) byAccount.set(ref.accountId, new Map());
    const folders = byAccount.get(ref.accountId)!;
    if (!folders.has(ref.folder)) folders.set(ref.folder, []);
    folders.get(ref.folder)!.push(ref.uid);
  }
  // Prefer thread.accountId when message ids are local-only
  if (!byAccount.size && thread.accountId) {
    byAccount.set(thread.accountId, new Map([["inbox", []]]));
  }
  return { thread, byAccount };
}

async function syncMoveToServer(
  byAccount: Map<string, Map<ImapFolderKey, number[]>>,
  destFolder: ImapFolderKey,
) {
  const api = desktopApi();
  if (!api || !isDesktop()) return { ok: true as const, warnings: [] as string[] };
  const warnings: string[] = [];
  for (const [accountId, folders] of byAccount) {
    for (const [sourceFolder, uids] of folders) {
      if (!uids.length) continue;
      if (sourceFolder === destFolder) continue;
      const result = await api.moveMessages({
        accountId,
        sourceFolder,
        destFolder,
        uids,
      });
      if (!result.ok) warnings.push(result.error || "Move failed");
    }
  }
  return { ok: warnings.length === 0, warnings };
}

async function syncDeleteOnServer(byAccount: Map<string, Map<ImapFolderKey, number[]>>) {
  const api = desktopApi();
  if (!api || !isDesktop()) return { ok: true as const, warnings: [] as string[] };
  const warnings: string[] = [];
  for (const [accountId, folders] of byAccount) {
    for (const [folder, uids] of folders) {
      if (!uids.length) continue;
      const result = await api.deleteMessages({ accountId, folder, uids });
      if (!result.ok) warnings.push(result.error || "Delete failed");
    }
  }
  return { ok: warnings.length === 0, warnings };
}

/** Delete → Trash (local + IMAP when possible). From Trash/Spam → permanent. */
export async function deleteThreadSmart(threadId: string) {
  const { thread, byAccount } = collectImapRefs(threadId);
  if (!thread) return { ok: false, error: "Thread not found" };
  const store = useMailStore.getState();

  if (thread.box === "trash" || thread.box === "spam") {
    const server = await syncDeleteOnServer(byAccount);
    store.permanentlyDeleteThreads([threadId]);
    if (server.warnings.length) {
      store.setToast(`Deleted locally — server: ${server.warnings[0]}`);
    }
    return { ok: true, permanent: true as const };
  }

  const server = await syncMoveToServer(byAccount, "trash");
  store.deleteThreadsToTrash([threadId]);
  if (server.warnings.length) {
    store.setToast(`Moved to Trash — server: ${server.warnings[0]}`);
  }
  return { ok: true, permanent: false as const };
}

export async function permanentlyDeleteThread(threadId: string) {
  const { thread, byAccount } = collectImapRefs(threadId);
  if (!thread) return { ok: false, error: "Thread not found" };
  const server = await syncDeleteOnServer(byAccount);
  useMailStore.getState().permanentlyDeleteThreads([threadId]);
  if (server.warnings.length) {
    useMailStore.getState().setToast(`Removed locally — server: ${server.warnings[0]}`);
  }
  return { ok: true };
}

export async function emptySpamFolder() {
  const store = useMailStore.getState();
  const activeId = store.inboxAccountId;
  const spamThreads = store.threads.filter(
    (t) => t.box === "spam" && (!activeId || t.accountId === activeId),
  );
  const api = desktopApi();
  const warnings: string[] = [];
  if (api && isDesktop()) {
    const accountIds = new Set(
      spamThreads.map((t) => t.accountId).filter(Boolean) as string[],
    );
    const list = accountIds.size
      ? [...accountIds]
      : activeId
        ? [activeId]
        : ((await api.listAccounts()).map((a) => a.id) as string[]);
    for (const accountId of list) {
      const result = await api.emptyFolder({ accountId, folder: "spam" });
      if (!result.ok) warnings.push(result.error || "Empty spam failed");
    }
  }
  store.permanentlyDeleteThreads(spamThreads.map((t) => t.id));
  store.setToast(
    warnings.length
      ? `Spam cleared locally — ${warnings[0]}`
      : `Spam emptied (${spamThreads.length})`,
  );
  return { ok: true };
}

export async function emptyTrashFolder() {
  const store = useMailStore.getState();
  const activeId = store.inboxAccountId;
  const trashThreads = store.threads.filter(
    (t) => t.box === "trash" && (!activeId || t.accountId === activeId),
  );
  const api = desktopApi();
  const warnings: string[] = [];
  if (api && isDesktop()) {
    const accountIds = new Set(
      trashThreads.map((t) => t.accountId).filter(Boolean) as string[],
    );
    const list = accountIds.size
      ? [...accountIds]
      : activeId
        ? [activeId]
        : ((await api.listAccounts()).map((a) => a.id) as string[]);
    for (const accountId of list) {
      const result = await api.emptyFolder({ accountId, folder: "trash" });
      if (!result.ok) warnings.push(result.error || "Empty trash failed");
    }
  }
  store.permanentlyDeleteThreads(trashThreads.map((t) => t.id));
  store.setToast(
    warnings.length
      ? `Trash cleared locally — ${warnings[0]}`
      : `Trash emptied (${trashThreads.length})`,
  );
  return { ok: true };
}

export async function restoreThreadFromTrash(threadId: string) {
  const { thread, byAccount } = collectImapRefs(threadId);
  if (!thread) return { ok: false, error: "Thread not found" };
  const server = await syncMoveToServer(byAccount, "inbox");
  useMailStore.getState().restoreThreadsFromTrash([threadId]);
  if (server.warnings.length) {
    useMailStore.getState().setToast(`Restored locally — server: ${server.warnings[0]}`);
  }
  return { ok: true };
}

/** Permanently remove Trash older than N days (default 30). 0 = skip. */
export async function purgeOldTrash(days?: number) {
  const store = useMailStore.getState();
  const purgeDays = days ?? store.settings.autoPurgeTrashDays ?? 30;
  if (!purgeDays || purgeDays < 1) return { ok: true, purged: 0 };
  const cutoff = Date.now() - purgeDays * 86_400_000;
  const stale = store.threads.filter(
    (t) => t.box === "trash" && +new Date(t.updatedAt) < cutoff,
  );
  if (!stale.length) return { ok: true, purged: 0 };
  for (const t of stale) {
    // eslint-disable-next-line no-await-in-loop
    await permanentlyDeleteThread(t.id);
  }
  store.setToast(`Auto-purged ${stale.length} trash item${stale.length === 1 ? "" : "s"} (older than ${purgeDays}d)`);
  return { ok: true, purged: stale.length };
}

/** Trash every conversation from a sender (local + IMAP when possible). */
export async function trashAllFromSenderSmart(email: string) {
  const store = useMailStore.getState();
  const addr = String(email || "").toLowerCase().trim();
  const activeId = store.inboxAccountId;
  const targets = store.threads.filter((t) => {
    if (t.contactEmail.toLowerCase() !== addr) return false;
    if (t.box === "trash" || t.box === "spam") return false;
    if (activeId && t.accountId && t.accountId !== activeId) return false;
    return true;
  });
  const warnings: string[] = [];
  for (const t of targets) {
    const { byAccount } = collectImapRefs(t.id);
    // eslint-disable-next-line no-await-in-loop
    const server = await syncMoveToServer(byAccount, "trash");
    warnings.push(...server.warnings);
  }
  const count = store.trashAllFromSender(addr);
  if (warnings.length) {
    store.setToast(`Trashed ${count} · server: ${warnings[0]}`);
  }
  return { ok: true, count };
}

/** Block sender and move their conversations to Spam (local + IMAP when possible). */
export async function blockAllFromSenderSmart(email: string) {
  const store = useMailStore.getState();
  const addr = String(email || "").toLowerCase().trim();
  const activeId = store.inboxAccountId;
  const targets = store.threads.filter((t) => {
    if (t.contactEmail.toLowerCase() !== addr) return false;
    if (t.box === "spam" || t.box === "trash") return false;
    if (activeId && t.accountId && t.accountId !== activeId) return false;
    return true;
  });
  const warnings: string[] = [];
  for (const t of targets) {
    const { byAccount } = collectImapRefs(t.id);
    // eslint-disable-next-line no-await-in-loop
    const server = await syncMoveToServer(byAccount, "spam");
    warnings.push(...server.warnings);
  }
  const count = store.blockAllFromSender(addr);
  if (warnings.length) {
    store.setToast(`Blocked ${addr} · server: ${warnings[0]}`);
  }
  return { ok: true, count };
}
