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

  if (!httpUrl && message.bodyHtml) {
    httpUrl = extractUnsubscribeFromHtml(message.bodyHtml);
  }
  if (!mailto && message.listUnsubscribe) {
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

function extractUnsubscribeFromHtml(html: string): string | null {
  const src = String(html || "");
  const hrefRe = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  const candidates: Array<{ url: string; score: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(src))) {
    const url = m[1];
    const around = src.slice(Math.max(0, m.index - 80), m.index + url.length + 80).toLowerCase();
    const score =
      (/unsubscribe|opt[\s-]?out|manage\s+preferences|email\s+preferences/i.test(url) ? 3 : 0) +
      (/unsubscribe|opt[\s-]?out|manage preferences|email preferences/i.test(around) ? 2 : 0);
    if (score > 0) candidates.push({ url, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || null;
}
