const http = require("http");
const https = require("https");
const { URL } = require("url");

/**
 * Parse List-Unsubscribe header values into http(s) + mailto targets.
 * Example: <https://x.com/u/1>, <mailto:u@x.com?subject=unsub>
 */
function parseListUnsubscribeHeader(header) {
  const raw = String(header || "").trim();
  if (!raw) return { httpUrls: [], mailtoUrls: [] };
  const angle = [...raw.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim()).filter(Boolean);
  const parts = angle.length ? angle : raw.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  const httpUrls = [];
  const mailtoUrls = [];
  for (const part of parts) {
    if (/^https?:\/\//i.test(part)) httpUrls.push(part);
    else if (/^mailto:/i.test(part)) mailtoUrls.push(part);
  }
  return { httpUrls, mailtoUrls };
}

function headerValue(parsed, name) {
  try {
    const h = parsed?.headers?.get?.(name);
    if (h == null) return "";
    if (typeof h === "object" && h.value) return String(h.value);
    return String(h);
  } catch {
    return "";
  }
}

/** Pull unsubscribe targets from parsed mail + HTML body fallback. */
function extractUnsubscribeInfo(parsed, bodyHtml) {
  const listUnsub = headerValue(parsed, "list-unsubscribe");
  const listUnsubPost = headerValue(parsed, "list-unsubscribe-post");
  const fromHeader = parseListUnsubscribeHeader(listUnsub);
  const oneClick = /List-Unsubscribe\s*=\s*One-Click/i.test(listUnsubPost);

  let httpUrl = fromHeader.httpUrls.find((u) => /^https:/i.test(u)) || fromHeader.httpUrls[0] || "";
  let mailtoUrl = fromHeader.mailtoUrls[0] || "";

  if (!httpUrl && bodyHtml) {
    const fromBody = extractUnsubscribeFromHtml(bodyHtml);
    if (fromBody.httpUrl) httpUrl = fromBody.httpUrl;
    if (!mailtoUrl && fromBody.mailto) mailtoUrl = fromBody.mailto;
  }

  return {
    listUnsubscribe: listUnsub || null,
    listUnsubscribePost: listUnsubPost || null,
    unsubscribeHttpUrl: httpUrl || null,
    unsubscribeMailto: mailtoUrl || null,
    unsubscribeOneClick: Boolean(oneClick && httpUrl),
  };
}

function extractUnsubscribeFromHtml(html) {
  const src = String(html || "");
  const UNSUB_WORD =
    /unsubscribe|opt[\s-]?out|manage\s+(?:email\s+)?preferences|email\s+preferences|remove\s+me|stop\s+receiving|leave\s+(?:this\s+)?list|cancel\s+subscription/i;
  const httpCandidates = [];
  const mailtoCandidates = [];
  const decodeHref = (raw) =>
    String(raw || "")
      .trim()
      .replace(/&amp;/gi, "&")
      .replace(/&#38;/g, "&");

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
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

  if (!httpCandidates.length && !mailtoCandidates.length) {
    const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
    while ((m = hrefRe.exec(src))) {
      const raw = decodeHref(m[1]);
      const around = src.slice(Math.max(0, m.index - 120), m.index + raw.length + 120).toLowerCase();
      const score = (UNSUB_WORD.test(raw) ? 3 : 0) + (UNSUB_WORD.test(around) ? 2 : 0);
      if (score <= 0) continue;
      if (/^https?:\/\//i.test(raw)) httpCandidates.push({ url: raw, score });
      else if (/^mailto:/i.test(raw)) mailtoCandidates.push({ url: raw, score });
    }
  }

  httpCandidates.sort((a, b) => b.score - a.score);
  mailtoCandidates.sort((a, b) => b.score - a.score);
  return {
    httpUrl: httpCandidates[0]?.url || "",
    mailto: mailtoCandidates[0]?.url || "",
  };
}

function parseMailto(mailtoUrl) {
  const raw = String(mailtoUrl || "").trim();
  if (!/^mailto:/i.test(raw)) return null;
  const without = raw.slice("mailto:".length);
  const q = without.indexOf("?");
  const pathPart = q >= 0 ? without.slice(0, q) : without;
  const queryPart = q >= 0 ? without.slice(q + 1) : "";
  let to = "";
  try {
    to = decodeURIComponent(pathPart.split(",")[0] || "").trim();
  } catch {
    to = pathPart.split(",")[0] || "";
  }
  let subject = "unsubscribe";
  let body = "unsubscribe";
  for (const pair of queryPart.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = (eq >= 0 ? pair.slice(0, eq) : pair).trim().toLowerCase();
    let val = eq >= 0 ? pair.slice(eq + 1) : "";
    try {
      val = decodeURIComponent(val.replace(/\+/g, " "));
    } catch {
      /* keep */
    }
    if (key === "subject" && val) subject = val;
    if ((key === "body" || key === "html-body") && val) body = val;
  }
  if (!to.includes("@")) return null;
  return { to, subject, body };
}

function httpRequest(method, urlString, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      reject(new Error("Only http(s) unsubscribe links are allowed"));
      return;
    }
    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          "User-Agent": "EnvisionMail/2.6 (List-Unsubscribe)",
          Accept: "*/*",
          ...(headers || {}),
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("error", (e) => done(reject, e));
        res.on("end", () => {
          const code = res.statusCode || 0;
          const location = res.headers.location;
          if ([301, 302, 303, 307, 308].includes(code) && location) {
            const next = new URL(location, url).toString();
            // One-click POST becomes GET after redirect per common practice for 302/303
            const nextMethod = code === 307 || code === 308 ? method : "GET";
            httpRequest(nextMethod, next, { body: nextMethod === "POST" ? body : undefined, headers })
              .then((v) => done(resolve, v))
              .catch((e) => done(reject, e));
            return;
          }
          done(resolve, {
            ok: code >= 200 && code < 400,
            status: code,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 500),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      done(reject, new Error("Unsubscribe request timed out"));
    });
    req.on("error", (e) => done(reject, e));
    req.on("socket", (socket) => {
      socket.on("error", (e) => done(reject, e));
    });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Silently unsubscribe using one-click POST, HTTP GET, or mailto via SMTP.
 */
async function performUnsubscribe({
  account,
  sendPlainMail,
  unsubscribeHttpUrl,
  unsubscribeMailto,
  unsubscribeOneClick,
}) {
  const httpUrl = String(unsubscribeHttpUrl || "").trim();
  const mailto = String(unsubscribeMailto || "").trim();

  if (httpUrl) {
    if (unsubscribeOneClick) {
      const res = await httpRequest("POST", httpUrl, {
        body: "List-Unsubscribe=One-Click",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength("List-Unsubscribe=One-Click"),
        },
      });
      if (res.ok) return { ok: true, method: "one-click" };
      // Fall through to GET
    }
    const res = await httpRequest("GET", httpUrl);
    if (res.ok) return { ok: true, method: "http-get" };
    if (!mailto) {
      return { ok: false, error: `Unsubscribe link returned HTTP ${res.status}` };
    }
  }

  if (mailto) {
    const parsed = parseMailto(mailto);
    if (!parsed) return { ok: false, error: "Invalid mailto unsubscribe address" };
    if (!account) return { ok: false, error: "Select an account to send the unsubscribe request" };
    await sendPlainMail(account, {
      to: parsed.to,
      subject: parsed.subject || "unsubscribe",
      text: parsed.body || "unsubscribe",
    });
    return { ok: true, method: "mailto" };
  }

  return { ok: false, error: "No unsubscribe link found for this email" };
}

module.exports = {
  extractUnsubscribeInfo,
  extractUnsubscribeFromHtml,
  parseListUnsubscribeHeader,
  parseMailto,
  performUnsubscribe,
};
