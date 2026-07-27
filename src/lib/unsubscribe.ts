import type { Message } from "@/lib/types";

export type UnsubscribeTargets = {
  httpUrl: string | null;
  mailto: string | null;
  oneClick: boolean;
};

/** Resolve unsubscribe targets from stored headers or body HTML/text fallback. */
export function resolveUnsubscribeTargets(message: Message | null | undefined): UnsubscribeTargets | null {
  if (!message || message.isOutgoing) return null;

  let httpUrl = message.unsubscribeHttpUrl || null;
  let mailto = message.unsubscribeMailto || null;
  const oneClick = Boolean(message.unsubscribeOneClick && httpUrl);

  if (message.listUnsubscribe) {
    const parsed = parseListUnsubscribeHeader(message.listUnsubscribe);
    if (!httpUrl) httpUrl = parsed.httpUrls[0] || null;
    if (!mailto) mailto = parsed.mailtoUrls[0] || null;
  }
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

const UNSUB_WORD =
  /unsubscribe|opt[\s-]?out|manage\s+(?:email\s+)?preferences|email\s+preferences|remove\s+me|stop\s+receiving|leave\s+(?:this\s+)?list|cancel\s+subscription/i;

function decodeHref(raw: string) {
  return String(raw || "")
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&");
}

function extractUnsubscribeFromHtml(html: string): { httpUrl: string | null; mailto: string | null } {
  const src = String(html || "");
  const httpCandidates: Array<{ url: string; score: number }> = [];
  const mailtoCandidates: Array<{ url: string; score: number }> = [];

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(src))) {
    const attrs = m[1] || "";
    const inner = String(m[2] || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i) || attrs.match(/href\s*=\s*([^\s>]+)/i);
    if (!hrefMatch) continue;
    const raw = decodeHref(hrefMatch[1]);
    const around = `${attrs} ${inner}`.toLowerCase();
    let score = 0;
    if (UNSUB_WORD.test(raw)) score += 3;
    if (UNSUB_WORD.test(inner)) score += 4;
    if (UNSUB_WORD.test(around)) score += 2;
    if (score <= 0) continue;
    if (/^https?:\/\//i.test(raw)) httpCandidates.push({ url: raw, score });
    else if (/^mailto:/i.test(raw)) mailtoCandidates.push({ url: raw, score });
  }

  // Fallback: bare href scan for older markup
  if (!httpCandidates.length && !mailtoCandidates.length) {
    const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
    while ((m = hrefRe.exec(src))) {
      const raw = decodeHref(m[1]);
      const around = src.slice(Math.max(0, m.index - 120), m.index + raw.length + 120).toLowerCase();
      const score =
        (UNSUB_WORD.test(raw) ? 3 : 0) + (UNSUB_WORD.test(around) ? 2 : 0);
      if (score <= 0) continue;
      if (/^https?:\/\//i.test(raw)) httpCandidates.push({ url: raw, score });
      else if (/^mailto:/i.test(raw)) mailtoCandidates.push({ url: raw, score });
    }
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
  const http =
    src.match(/https?:\/\/[^\s<>"']+(?:unsubscribe|optout|opt-out|preferences|u\/|list-manage)[^\s<>"']*/i) ||
    (() => {
      const urls = [...src.matchAll(/https?:\/\/[^\s<>"']+/gi)];
      for (const u of urls) {
        const ctx = src.slice(Math.max(0, (u.index || 0) - 60), (u.index || 0) + u[0].length + 60);
        if (UNSUB_WORD.test(ctx)) return u;
      }
      return null;
    })();
  const mail = src.match(/mailto:[^\s<>"']+/i);
  const mailtoScore =
    mail &&
    UNSUB_WORD.test(
      mail[0] + src.slice(Math.max(0, (mail.index || 0) - 40), (mail.index || 0) + 80),
    )
      ? mail[0]
      : null;
  return {
    httpUrl: http?.[0] || null,
    mailto: mailtoScore,
  };
}
