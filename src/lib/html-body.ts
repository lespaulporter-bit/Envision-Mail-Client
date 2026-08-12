/** Turn a compose/reply body into HTML, preserving pasted markup. */
export function bodyToHtml(body: string): string {
  const raw = String(body || "").trim();
  if (!raw) return "<p></p>";
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return `<p>${raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</p>`;
}

/** Signature block previously (wrongly) appended into the plain-text composer. */
const LEAKED_SIG_WRAP =
  /(?:\n\n)?<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px">[\s\S]*$/i;

/** True when the composer body looks like dumped HTML rather than a normal message. */
export function looksLikeHtmlDump(body: string): boolean {
  const raw = String(body || "");
  if (!raw) return false;
  if (LEAKED_SIG_WRAP.test(raw)) return true;
  const tagCount = (raw.match(/<\/?[a-z][^>]*>/gi) || []).length;
  return tagCount >= 3 || /&nbsp;|<\/?(?:table|tbody|tr|td|span)\b/i.test(raw);
}

/**
 * Plain-text composer must never show raw signature HTML.
 * Strips the known signature wrapper and converts leftover markup to readable text.
 */
export function scrubComposerBody(body: string): string {
  let next = String(body || "").replace(LEAKED_SIG_WRAP, "").trim();
  if (!looksLikeHtmlDump(next) && !/<[a-z][\s\S]*>/i.test(next)) return next;
  next = next
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return next;
}

/** HTML signature block appended only at send time (not into the plain-text box). */
export function signatureHtmlBlock(sig: {
  html: string;
  imageDataUrl?: string | null;
}): string {
  return `<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px">${sig.html}${
    sig.imageDataUrl
      ? `<div style="margin-top:8px"><img src="${sig.imageDataUrl}" alt="" style="max-height:72px"/></div>`
      : ""
  }</div>`;
}
