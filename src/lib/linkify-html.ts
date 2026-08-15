const URL_IN_TEXT = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const TRAILING_NOISE = /(?:[.,;:!?]|&[a-z]+;)+$/i;

function linkifyTextSegment(text: string): string {
  if (!text || !/https?:\/\//i.test(text)) return text;
  return text.replace(URL_IN_TEXT, (match) => {
    const url = match.replace(TRAILING_NOISE, "");
    if (!url) return match;
    const trailing = match.slice(url.length);
    return `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>${trailing}`;
  });
}

/**
 * Match, in priority order: HTML comments, CDATA sections, markup declarations
 * (including `<!DOCTYPE ...>`), processing instructions, then real element tags.
 * Only the last branch captures an element name (group 1); every other branch is
 * non-element markup that must be emitted verbatim. This keeps the linkifier from
 * treating a `<!DOCTYPE ... "http://www.w3.org/TR/html4/loose.dtd">` system id (or
 * any URL inside a comment/declaration) as body text and wrapping it in an <a>,
 * which would inject a stray ">" and leak the declaration tail into the message.
 */
const TOKEN_PATTERN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;

/**
 * Make bare URLs clickable in mail bodies. Plain-text mail arrives as escaped
 * text with no anchors, so a pasted Teams or Zoom link was unreachable.
 * Text already inside <a>, <script>, or <style>, or inside a comment/declaration,
 * is left untouched.
 */
export function linkifyHtml(html: string): string {
  const source = String(html || "");
  if (!/https?:\/\//i.test(source)) return source;

  TOKEN_PATTERN.lastIndex = 0;
  const out: string[] = [];
  let index = 0;
  let anchorDepth = 0;
  let rawDepth = 0;
  let token: RegExpExecArray | null;

  while ((token = TOKEN_PATTERN.exec(source))) {
    const between = source.slice(index, token.index);
    out.push(anchorDepth || rawDepth ? between : linkifyTextSegment(between));

    const name = token[1]?.toLowerCase();
    if (name) {
      const closing = token[0].startsWith("</");
      const selfClosing = token[0].endsWith("/>");
      if (name === "a" && !selfClosing) {
        anchorDepth = closing ? Math.max(0, anchorDepth - 1) : anchorDepth + 1;
      }
      if ((name === "script" || name === "style" || name === "textarea") && !selfClosing) {
        rawDepth = closing ? Math.max(0, rawDepth - 1) : rawDepth + 1;
      }
    }

    out.push(token[0]);
    index = token.index + token[0].length;
  }

  const tail = source.slice(index);
  out.push(anchorDepth || rawDepth ? tail : linkifyTextSegment(tail));
  return out.join("");
}
