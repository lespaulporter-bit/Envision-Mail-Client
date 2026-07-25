/** Turn a compose/reply body into HTML, preserving pasted markup. */
export function bodyToHtml(body: string): string {
  const raw = String(body || "").trim();
  if (!raw) return "<p></p>";
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return `<p>${raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</p>`;
}
