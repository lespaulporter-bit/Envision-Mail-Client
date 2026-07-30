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
 * Make bare URLs clickable in mail bodies. Plain-text mail arrives as escaped
 * text with no anchors, so a pasted Teams or Zoom link was unreachable.
 * Text already inside <a>, <script>, or <style> is left untouched.
 */
export function linkifyHtml(html: string): string {
  const source = String(html || "");
  if (!/https?:\/\//i.test(source)) return source;

  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  const out: string[] = [];
  let index = 0;
  let anchorDepth = 0;
  let rawDepth = 0;
  let tag: RegExpExecArray | null;

  while ((tag = tagPattern.exec(source))) {
    const between = source.slice(index, tag.index);
    out.push(anchorDepth || rawDepth ? between : linkifyTextSegment(between));

    const name = tag[1].toLowerCase();
    const closing = tag[0].startsWith("</");
    const selfClosing = tag[0].endsWith("/>");
    if (name === "a" && !selfClosing) {
      anchorDepth = closing ? Math.max(0, anchorDepth - 1) : anchorDepth + 1;
    }
    if ((name === "script" || name === "style" || name === "textarea") && !selfClosing) {
      rawDepth = closing ? Math.max(0, rawDepth - 1) : rawDepth + 1;
    }

    out.push(tag[0]);
    index = tag.index + tag[0].length;
  }

  const tail = source.slice(index);
  out.push(anchorDepth || rawDepth ? tail : linkifyTextSegment(tail));
  return out.join("");
}
