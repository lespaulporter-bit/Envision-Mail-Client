/**
 * Envision Mail Client — Railway status / release pointer.
 * Serves no user mail data. Never reads Application Support or accounts.
 */
import http from "node:http";

const PORT = Number(process.env.PORT || 8080);
const GITHUB_REPO =
  process.env.ENVISION_MAIL_GITHUB_REPO ||
  "lespaulporter-bit/Envision-Mail-Client";
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

const html = (body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Envision Mail Client</title>
  <style>
    :root { color-scheme: light; --ink:#14231f; --teal:#0d6e6e; --bg:#e8f2ef; }
    body { margin:0; font-family: "Iowan Old Style", "Palatino Linotype", Palatino, serif;
      background: radial-gradient(1200px 600px at 10% -10%, #cfe8e2, transparent),
                  linear-gradient(160deg, #f4faf8, var(--bg));
      color: var(--ink); min-height: 100vh; display:grid; place-items:center; padding:2rem; }
    main { max-width: 36rem; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -0.03em; margin: 0 0 0.5rem; }
    p { line-height: 1.5; font-size: 1.05rem; opacity: 0.9; }
    a { color: var(--teal); font-weight: 600; }
    .note { margin-top: 1.5rem; font-size: 0.95rem; opacity: 0.75; }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;

async function latestRelease() {
  try {
    const res = await fetch(LATEST_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Envision-Mail-Client-Railway",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      tag: data.tag_name || null,
      name: data.name || null,
      url: data.html_url || RELEASES_URL,
      publishedAt: data.published_at || null,
    };
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health" || url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "Envision Mail Client" }));
    return;
  }

  if (url.pathname === "/api/latest") {
    const latest = await latestRelease();
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    });
    res.end(
      JSON.stringify({
        product: "Envision Mail Client",
        github: GITHUB_REPO,
        releasesUrl: RELEASES_URL,
        latest,
        dataPolicy:
          "Desktop updates never overwrite user mail data under Application Support.",
      }),
    );
    return;
  }

  const latest = await latestRelease();
  const versionLine = latest?.tag
    ? `<p>Latest release: <a href="${latest.url}">${latest.tag}</a></p>`
    : `<p>Releases: <a href="${RELEASES_URL}">${RELEASES_URL}</a></p>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    html(`
      <h1>Envision Mail Client</h1>
      <p>Desktop email for Envision DMS. Installers and auto-updates ship from GitHub Releases.</p>
      ${versionLine}
      <p class="note">Your mail, accounts, and collections stay on the device. Software updates never wipe Application Support data.</p>
    `),
  );
});

server.listen(PORT, () => {
  console.log(`Envision Mail Client update service on :${PORT}`);
});
