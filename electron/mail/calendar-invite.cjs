const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { shell } = require("electron");

/**
 * Detect Microsoft Teams installed for the signed-in user on this computer.
 * We never mint fake join links — meetings must be created in their Teams account.
 */
function detectMicrosoftTeams() {
  const platform = process.platform;
  const found = [];

  if (platform === "darwin") {
    const candidates = [
      "/Applications/Microsoft Teams.app",
      "/Applications/Microsoft Teams (work or school).app",
      "/Applications/Microsoft Teams classic.app",
      path.join(process.env.HOME || "", "Applications", "Microsoft Teams.app"),
      path.join(process.env.HOME || "", "Applications", "Microsoft Teams (work or school).app"),
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) found.push(p);
    }
    // Spotlight fallback — catches renamed / relocated installs
    if (!found.length) {
      try {
        const { execFileSync } = require("child_process");
        const out = execFileSync(
          "mdfind",
          ["kMDItemCFBundleIdentifier == 'com.microsoft.teams2' || kMDItemCFBundleIdentifier == 'com.microsoft.teams'"],
          { encoding: "utf8", timeout: 4000 },
        );
        for (const line of String(out || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)) {
          if (line.endsWith(".app") && fs.existsSync(line)) found.push(line);
        }
      } catch {
        /* ignore */
      }
    }
  } else if (platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const candidates = [
      path.join(local, "Microsoft", "WindowsApps", "MSTeams_8wekyb3d8bbwe", "ms-teams.exe"),
      path.join(local, "Microsoft", "Teams", "current", "Teams.exe"),
      path.join(local, "Microsoft", "Teams", "Update.exe"),
      path.join(programFiles, "Windows Apps", "MSTeams_8wekyb3d8bbwe", "ms-teams.exe"),
      path.join(programFilesX86, "Teams Installer", "Teams.exe"),
      path.join(programFiles, "Microsoft", "Teams", "current", "Teams.exe"),
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) found.push(p);
    }
    // Store apps often resolve via protocol even when path varies
    if (!found.length) {
      try {
        const { execSync } = require("child_process");
        const out = execSync(
          'powershell -NoProfile -Command "Get-AppxPackage -Name MSTeams* | Select-Object -ExpandProperty PackageFullName"',
          { encoding: "utf8", timeout: 5000, windowsHide: true },
        );
        if (String(out || "").trim()) found.push("ms-teams-store");
      } catch {
        /* ignore */
      }
    }
  }

  return {
    installed: found.length > 0,
    paths: found,
    platform,
  };
}

function openViaMacOpen(target) {
  const { execFile } = require("child_process");
  return new Promise((resolve, reject) => {
    execFile("open", [target], (err) => (err ? reject(err) : resolve(true)));
  });
}

function launchMacTeamsApp(appPath) {
  const { execFile } = require("child_process");
  return new Promise((resolve, reject) => {
    const args = appPath ? ["-a", appPath] : ["-a", "Microsoft Teams"];
    execFile("open", args, (err) => (err ? reject(err) : resolve(true)));
  });
}

/**
 * Open Microsoft Teams (desktop preferred) to create a meeting as the signed-in user.
 * Never invents a join URL — caller must paste the real Join link afterward.
 */
async function openTeamsNewMeeting({ title, startIso, endIso } = {}) {
  const detection = detectMicrosoftTeams();
  const subject = String(title || "Meeting").trim().slice(0, 200) || "Meeting";

  const params = new URLSearchParams();
  params.set("subject", subject);
  if (startIso) {
    try {
      params.set("startTime", new Date(startIso).toISOString());
    } catch {
      /* ignore */
    }
  }
  if (endIso) {
    try {
      params.set("endTime", new Date(endIso).toISOString());
    } catch {
      /* ignore */
    }
  }
  const qs = params.toString();
  // Desktop protocol uses the user's signed-in Teams identity on this machine
  const desktopUrl = `msteams:/l/meeting/new?${qs}`;
  const webFallback = `https://teams.microsoft.com/l/meeting/new?${qs}`;

  const tryOpen = async () => {
    if (process.platform === "darwin") {
      // 1) Launch Services protocol (most reliable with signed-in Teams)
      try {
        await openViaMacOpen(desktopUrl);
        return { opened: desktopUrl, method: "mac-open-protocol" };
      } catch {
        /* continue */
      }
      // 2) Launch the app, then retry the deep link
      try {
        const appPath = detection.paths.find((p) => p.endsWith(".app")) || "Microsoft Teams";
        await launchMacTeamsApp(appPath);
        await new Promise((r) => setTimeout(r, 600));
        await openViaMacOpen(desktopUrl);
        return { opened: desktopUrl, method: "mac-app-then-protocol" };
      } catch {
        /* continue */
      }
    }

    try {
      await shell.openExternal(desktopUrl);
      return { opened: desktopUrl, method: "electron-protocol" };
    } catch {
      /* continue */
    }

    await shell.openExternal(webFallback);
    return { opened: webFallback, method: "web-fallback" };
  };

  try {
    const result = await tryOpen();
    return {
      ok: true,
      installed: detection.installed || result.method !== "web-fallback",
      opened: result.opened,
      method: result.method,
      message:
        result.method === "web-fallback"
          ? "Opened Teams in the browser with your Microsoft account. Create the meeting, then paste the Join link here."
          : "Teams opened with your account. Create the meeting, then paste the Join link back into Envision Mail.",
    };
  } catch (err) {
    if (!detection.installed) {
      return {
        ok: false,
        installed: false,
        error:
          "Microsoft Teams is not installed on this computer. Install Teams and sign in with your account, then try again.",
      };
    }
    return {
      ok: false,
      installed: true,
      error: err.message || String(err) || "Could not open Microsoft Teams",
    };
  }
}

function icsEscape(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toIcsUtc(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function toIcsLocalDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function nextLocalDate(iso) {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return toIcsLocalDate(d.toISOString());
}

function buildInviteIcs({
  uid,
  title,
  description,
  location,
  start,
  end,
  allDay = false,
  organizerEmail,
  organizerName,
  invitees = [],
  meetingUrl,
}) {
  const stamp = toIcsUtc(new Date().toISOString());
  const attendees = invitees
    .map(
      (p) =>
        `ATTENDEE;CN=${icsEscape(p.name || p.email)};RSVP=TRUE:mailto:${p.email}`,
    )
    .join("\r\n");

  const desc = [description || "", meetingUrl ? `Join: ${meetingUrl}` : ""].filter(Boolean).join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//Envision Mail//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid || randomUUID()}@envisionmail.local`,
    `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${toIcsLocalDate(start)}` : `DTSTART:${toIcsUtc(start)}`,
    allDay ? `DTEND;VALUE=DATE:${nextLocalDate(start)}` : `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    location ? `LOCATION:${icsEscape(location)}` : null,
    meetingUrl ? `URL:${meetingUrl}` : null,
    `ORGANIZER;CN=${icsEscape(organizerName || organizerEmail)}:mailto:${organizerEmail}`,
    attendees || null,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

module.exports = {
  detectMicrosoftTeams,
  openTeamsNewMeeting,
  buildInviteIcs,
};
