/** Parse a mailto: URL into compose fields. Body is intentionally ignored. */

import { normalizeRecipientField, parseRecipientEmails } from "@/lib/recipient-suggest";

export type MailtoComposeFields = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
};

const EMPTY: MailtoComposeFields = { to: "", cc: "", bcc: "", subject: "" };

function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw.replace(/\+/g, " ");
  }
}

function splitAddrs(raw: string): string {
  return normalizeRecipientField(raw);
}

/**
 * Extract To / Cc / Bcc / Subject from a mailto URL.
 * Never returns a body — new mail from a link must start blank.
 */
export function parseMailtoUrl(input: string): MailtoComposeFields | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!lower.startsWith("mailto:")) return null;

  const withoutScheme = raw.slice("mailto:".length);
  const q = withoutScheme.indexOf("?");
  const pathPart = q >= 0 ? withoutScheme.slice(0, q) : withoutScheme;
  const queryPart = q >= 0 ? withoutScheme.slice(q + 1) : "";

  const toFromPath = splitAddrs(decodeParam(pathPart));
  const fields: MailtoComposeFields = { ...EMPTY, to: toFromPath };

  if (queryPart) {
    for (const pair of queryPart.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const key = (eq >= 0 ? pair.slice(0, eq) : pair).trim().toLowerCase();
      const val = eq >= 0 ? decodeParam(pair.slice(eq + 1)) : "";
      if (key === "to") {
        const extra = parseRecipientEmails(val);
        const merged = [...parseRecipientEmails(fields.to), ...extra];
        fields.to = [...new Set(merged)].join(", ");
      } else if (key === "cc") {
        fields.cc = splitAddrs(val);
      } else if (key === "bcc") {
        fields.bcc = splitAddrs(val);
      } else if (key === "subject") {
        fields.subject = val.trim();
      }
      // body / html-body intentionally ignored — never prefill message text from a link
    }
  }

  return fields;
}

export function isMailtoUrl(input: string): boolean {
  return String(input || "")
    .trim()
    .toLowerCase()
    .startsWith("mailto:");
}
