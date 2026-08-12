const { dialog, BrowserWindow } = require("electron");
const fs = require("fs");

function unescapeIcs(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function unfoldIcs(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

/** Parse DTSTART/DTEND — supports UTC (Z), floating local, and VALUE=DATE all-day. */
function parseIcsDate(raw, params) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const isDateOnly = /VALUE=DATE/i.test(params || "") || /^\d{8}$/.test(value);
  if (isDateOnly) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    const local = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    return Number.isNaN(local.getTime()) ? null : local.toISOString();
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, yy, mo, dd, hh, mi, ss, z] = m;
  if (z) {
    const iso = `${yy}-${mo}-${dd}T${hh}:${mi}:${ss}.000Z`;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const local = new Date(Number(yy), Number(mo) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

function parseIcsCalendar(text) {
  const unfolded = unfoldIcs(text);
  const lines = unfolded.split(/\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { title: "Untitled", location: "", notes: "", id: "", start: null, end: null };
      continue;
    }
    if (line === "END:VEVENT") {
      if (current?.start) {
        events.push({
          id: current.id || `ics_${current.start}_${events.length}`,
          title: current.title || "Untitled",
          start: current.start,
          end: current.end || current.start,
          location: current.location || undefined,
          notes: current.notes || undefined,
          calendarId: "ics-import",
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const right = line.slice(colon + 1);
    const [name, ...paramParts] = left.split(";");
    const params = paramParts.join(";");
    const key = name.toUpperCase();

    if (key === "SUMMARY") current.title = unescapeIcs(right);
    else if (key === "LOCATION") current.location = unescapeIcs(right);
    else if (key === "DESCRIPTION") current.notes = unescapeIcs(right);
    else if (key === "UID") current.id = right.trim();
    else if (key === "URL" && right && !current.notes.includes(right)) {
      current.notes = current.notes ? `${current.notes}\n${right}` : right;
    } else if (key === "DTSTART") current.start = parseIcsDate(right, params);
    else if (key === "DTEND") current.end = parseIcsDate(right, params);
  }

  return events;
}

async function importIcsFiles() {
  const win = BrowserWindow.getFocusedWindow();
  const picked = await dialog.showOpenDialog(win || undefined, {
    title: "Import calendar (.ics)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Calendar", extensions: ["ics", "ical"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (picked.canceled || !picked.filePaths?.length) {
    return { ok: true, cancelled: true, calendars: [], events: [] };
  }

  const events = [];
  for (const filePath of picked.filePaths) {
    try {
      const text = fs.readFileSync(filePath, "utf8");
      const parsed = parseIcsCalendar(text);
      for (const ev of parsed) {
        events.push({
          ...ev,
          id: `ics:${pathBasename(filePath)}:${ev.id}`,
        });
      }
    } catch (err) {
      return {
        ok: false,
        error: `Could not read ${pathBasename(filePath)}: ${err?.message || err}`,
      };
    }
  }

  return {
    ok: true,
    calendars: [
      {
        id: "ics-import",
        name: "Imported (.ics)",
        color: "#0d9488",
      },
    ],
    events,
    source: "ics",
    provider: "ics",
  };
}

function pathBasename(filePath) {
  return String(filePath || "").split(/[/\\]/).pop() || "file";
}

module.exports = { importIcsFiles, parseIcsCalendar };
