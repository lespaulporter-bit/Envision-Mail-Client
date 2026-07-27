import type { Message } from "@/lib/types";

export type UnsubscribeTargets = {
  httpUrl: string | null;
  mailto: string | null;
  oneClick: boolean;
};

/** Resolve unsubscribe targets from stored headers or body HTML fallback. */
export function resolveUnsubscribeTargets(message: Message | null | undefined): UnsubscribeTargets | null {
  if (!message || message.isOutgoing) return null;

  let httpUrl = message.unsubscribeHttpUrl || null;
  let mailto = message.unsubscribeMailto || null;
  const oneClick = Boolean(message.unsubscribeOneClick && httpUrl);

  if ((!httpUrl || !mailto) && message.bodyHtml) {
    const fromBody = extractUnsubscribeFromHtml(message.bodyHtml);
    if (!httpUrl && fromBody.httpUrl) httpUrl = fromBody.httpUrl;
    if (!mailto && fromBody.mailto) mailto = fromBody.mailto;
  }
  if ((!httpUrl || !mailto) && message.bodyText) {
    const fromText = extractUnsubscribeFromText(message.bodyText);
    if (!httpUrl && fromText.httpUrl) httpUrl = fromText.httpUrl;
    if (!mailto && fromText.mailto) mailto = fromText.mailto;
  }
  if (message.listUnsubscribe) {
    const parsed = parseListUnsubscribeHeader(message.listUnsubscribe);
    if (!httpUrl) httpUrl = parsed.httpUrls[0] || null;
    if (!mailto) mailto = parsed.mailtoUrls[0] || null;
  }

  if (!httpUrl && !mailto) return null;
  return { httpUrl, mailto, oneClick: Boolean(oneClick && httpUrl) };
}

function parseListUnsubscribeHeader(header: string) {
  const raw = String(header || "").trim();
  const angle = [...raw.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim()).filter(Boolean);
  const parts = angle.length ? angle : raw.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  const httpUrls: string[] = [];
  const mailtoUrls: string[] = [];
  for (const part of parts) {
    if (/^https?:\/\//i.test(part)) httpUrls.push(part);
    else if (/^mailto:/i.test(part)) mailtoUrls.push(part);
  }
  return { httpUrls, mailtoUrls };
}

function extractUnsubscribeFromHtml(html: string): { httpUrl: string | null; mailto: string | null } {
  const src = String(html || "");
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  const httpCandidates: Array<{ url: string; score: number }> = [];
  const mailtoCandidates: Array<{ url: string; score: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(src))) {
    const raw = m[1].trim();
    const around = src.slice(Math.max(0, m.index - 100), m.index + raw.length + 100).toLowerCase();
    const score =
      (/unsubscribe|opt[\s-]?out|manage\s+preferences|email\s+preferences|remove\s+me/i.test(raw) ? 3 : 0) +
      (/unsubscribe|opt[\s-]?out|manage preferences|email preferences|remove me|stop receiving/i.test(around)
        ? 2
        : 0);
    if (score <= 0) continue;
    if (/^https?:\/\//i.test(raw)) httpCandidates.push({ url: raw, score });
    else if (/^mailto:/i.test(raw)) mailtoCandidates.push({ url: raw, score });
  }
  httpCandidates.sort((a, b) => b.score - a.score);
  mailtoCandidates.sort((a, b) => b.score - a.score);
  return {
    httpUrl: httpCandidates[0]?.url || null,
    mailto: mailtoCandidates[0]?.url || null,
  };
}

function extractUnsubscribeFromText(text: string): { httpUrl: string | null; mailto: string | null } {
  const src = String(text || "");
  const http = src.match(/https?:\/\/[^\s<>"']+(?:unsubscribe|optout|opt-out|preferences)[^\s<>"']*/i);
  const mail = src.match(/mailto:[^\s<>"']+/i);
  const mailtoScore =
    mail && /unsubscribe|opt[\s-]?out|remove/i.test(mail[0] + src.slice(Math.max(0, (mail.index || 0) - 40), (mail.index || 0) + 80))
      ? mail[0]
      : null;
  return {
    httpUrl: http?.[0] || null,
    mailto: mailtoScore,
  };
}
