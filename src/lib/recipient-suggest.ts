import type { Contact, Message, Thread } from "@/lib/types";

export type RecipientSuggestion = {
  email: string;
  name: string;
  source: "contact" | "recent" | "mail";
  rank: number;
};

export type RecentRecipient = {
  email: string;
  name?: string;
  lastUsedAt: string;
};

/** Common email pattern — good enough for paste/normalize (not full RFC validation). */
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function normalizeEmail(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^<|>$/g, "");
}

/**
 * Outlook-style multi-recipient parse.
 * Accepts commas, semicolons, newlines, tabs, and `Name <email>` forms.
 * Extracts every real address so paste from Excel/Outlook/Gmail just works.
 */
export function parseRecipientEmails(raw: string): string[] {
  const text = String(raw || "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text) return [];

  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(EMAIL_RE)) {
    const email = normalizeEmail(match[0]);
    if (!email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    found.push(email);
  }
  return found;
}

/** Clean field value to a comma-separated list of emails (Outlook paste friendly). */
export function normalizeRecipientField(raw: string): string {
  return parseRecipientEmails(raw).join(", ");
}

/** Last incomplete address token while typing comma/semicolon/newline-separated recipients. */
export function currentRecipientQuery(value: string): { prefix: string; query: string } {
  const raw = String(value || "");
  // Split off the last segment; keep prior complete emails as prefix
  const parts = raw.split(/[,;\n\r]+/);
  const lastRaw = parts[parts.length - 1] ?? "";
  const query = lastRaw.trim();
  const prior = parts.slice(0, -1).join(", ");
  const prefixEmails = parseRecipientEmails(prior);
  const prefix = prefixEmails.length ? `${prefixEmails.join(", ")}, ` : "";

  // Finished address with trailing separator → ready for the next one
  if (!query && prefixEmails.length) {
    return { prefix, query: "" };
  }
  return { prefix, query };
}

export function applyRecipientSuggestion(value: string, email: string): string {
  const { prefix } = currentRecipientQuery(value);
  const clean = normalizeEmail(email);
  const already = new Set(parseRecipientEmails(prefix));
  if (already.has(clean)) {
    return prefix || `${clean}, `;
  }
  // Trailing comma + space so the next address is easy (Outlook-style)
  return `${prefix}${clean}, `;
}

/**
 * Merge a pasted recipient blob into the current field around the selection.
 * Replaces the selected range (or appends) with normalized emails.
 */
export function mergePastedRecipients(
  value: string,
  pasted: string,
  selectionStart: number,
  selectionEnd: number,
): string {
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const beforeEmails = parseRecipientEmails(before.replace(/[,;\s]+$/g, ""));
  const pastedEmails = parseRecipientEmails(pasted);
  const afterEmails = parseRecipientEmails(after.replace(/^[,;\s]+/g, ""));
  if (!pastedEmails.length) {
    // No emails in paste — let the browser do a normal paste
    return value;
  }
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const e of [...beforeEmails, ...pastedEmails, ...afterEmails]) {
    if (seen.has(e)) continue;
    seen.add(e);
    merged.push(e);
  }
  return merged.join(", ");
}

/**
 * Ranked suggestions from address book, recent sends, and mail history.
 */
export function buildRecipientSuggestions(opts: {
  query: string;
  contacts: Contact[];
  threads: Thread[];
  messages: Record<string, Message | undefined>;
  recent?: RecentRecipient[];
  exclude?: string[];
  ownEmails?: string[];
  limit?: number;
}): RecipientSuggestion[] {
  const q = opts.query.trim().toLowerCase();
  // Empty query: still offer recent + address-book matches (browse on focus)
  const browsing = q.length < 1;

  const exclude = new Set((opts.exclude || []).map(normalizeEmail));
  for (const own of opts.ownEmails || []) exclude.add(normalizeEmail(own));

  const byEmail = new Map<string, RecipientSuggestion>();

  const upsert = (emailRaw: string, name: string, source: RecipientSuggestion["source"], rank: number) => {
    const email = normalizeEmail(emailRaw);
    if (!email.includes("@") || exclude.has(email)) return;
    const hay = `${name} ${email}`.toLowerCase();
    if (!browsing && !hay.includes(q)) return;
    const prev = byEmail.get(email);
    if (!prev || rank > prev.rank) {
      byEmail.set(email, {
        email,
        name: name || prev?.name || email.split("@")[0] || email,
        source,
        rank,
      });
    } else if (prev && name && (!prev.name || prev.name === prev.email.split("@")[0])) {
      byEmail.set(email, { ...prev, name });
    }
  };

  for (const c of opts.contacts || []) {
    const boost = c.status === "allowed" ? 0 : c.status === "blocked" ? -50 : -5;
    upsert(c.email, c.name || "", "contact", (browsing ? 80 : 100) + boost);
  }

  for (const r of opts.recent || []) {
    upsert(r.email, r.name || "", "recent", browsing ? 100 : 90);
  }

  if (!browsing) {
    for (const t of opts.threads || []) {
      upsert(t.contactEmail, t.contactName || "", "mail", 70);
    }

    for (const m of Object.values(opts.messages || {})) {
      if (!m) continue;
      if (m.from) upsert(m.from, m.fromName || "", "mail", m.isOutgoing ? 55 : 65);
      for (const to of m.to || []) upsert(to, "", "mail", 60);
      for (const cc of m.cc || []) upsert(cc, "", "mail", 50);
    }
  }

  return Array.from(byEmail.values())
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      // Prefer prefix matches
      const aStarts = a.email.startsWith(q) || a.name.toLowerCase().startsWith(q) ? 1 : 0;
      const bStarts = b.email.startsWith(q) || b.name.toLowerCase().startsWith(q) ? 1 : 0;
      if (bStarts !== aStarts) return bStarts - aStarts;
      return a.email.localeCompare(b.email);
    })
    .slice(0, opts.limit ?? 8);
}

export function mergeRecentRecipients(
  existing: RecentRecipient[],
  emails: string[],
  names?: Record<string, string>,
): RecentRecipient[] {
  const now = new Date().toISOString();
  const map = new Map<string, RecentRecipient>();
  for (const r of existing || []) {
    const e = normalizeEmail(r.email);
    if (e.includes("@")) map.set(e, { ...r, email: e });
  }
  for (const raw of emails) {
    const e = normalizeEmail(raw);
    if (!e.includes("@")) continue;
    map.set(e, {
      email: e,
      name: names?.[e] || map.get(e)?.name,
      lastUsedAt: now,
    });
  }
  return Array.from(map.values())
    .sort((a, b) => +new Date(b.lastUsedAt) - +new Date(a.lastUsedAt))
    .slice(0, 200);
}
