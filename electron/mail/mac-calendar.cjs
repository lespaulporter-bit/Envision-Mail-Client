const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const JXA = `
ObjC.import("Foundation");

function pad(n) { return n < 10 ? "0" + n : String(n); }

function toISO(d) {
  if (!d) return null;
  try {
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch (e) {
    return null;
  }
}

function colorHex(c) {
  try {
    if (!c) return "#A78BFA";
    var r = Math.round(c.red() * 255);
    var g = Math.round(c.green() * 255);
    var b = Math.round(c.blue() * 255);
    function h(n) {
      var s = Math.max(0, Math.min(255, n)).toString(16);
      return s.length === 1 ? "0" + s : s;
    }
    return "#" + h(r) + h(g) + h(b);
  } catch (e) {
    return "#A78BFA";
  }
}

function run() {
  var Calendar = Application("Calendar");
  Calendar.includeStandardAdditions = true;

  var calendars = [];
  var calList = Calendar.calendars();
  for (var i = 0; i < calList.length; i++) {
    var cal = calList[i];
    var cid = "";
    try { cid = String(cal.uid()); } catch (e1) {
      try { cid = String(cal.id()); } catch (e2) { cid = "cal-" + i; }
    }
    var name = "Calendar";
    try { name = String(cal.name()); } catch (e3) {}
    var color = "#A78BFA";
    try { color = colorHex(cal.color()); } catch (e4) {}
    calendars.push({ id: cid, name: name, color: color });
  }

  var now = new Date();
  var startRange = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  var endRange = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  var events = [];

  for (var ci = 0; ci < calList.length; ci++) {
    var calendar = calList[ci];
    var calendarId = calendars[ci] ? calendars[ci].id : ("cal-" + ci);
    var evs = [];
    try {
      evs = calendar.events.whose({
        _and: [
          { startDate: { _greaterThan: startRange } },
          { startDate: { _lessThan: endRange } }
        ]
      })();
    } catch (e5) {
      try { evs = calendar.events(); } catch (e6) { evs = []; }
    }

    for (var ei = 0; ei < evs.length; ei++) {
      var ev = evs[ei];
      var start = null;
      var end = null;
      try { start = toISO(ev.startDate()); } catch (e7) {}
      try { end = toISO(ev.endDate()); } catch (e8) {}
      if (!start) continue;
      if (startRange && endRange) {
        var st = new Date(start).getTime();
        if (st < startRange.getTime() || st > endRange.getTime()) continue;
      }
      var eid = "";
      try { eid = String(ev.uid()); } catch (e9) {
        try { eid = String(ev.id()); } catch (e10) { eid = calendarId + "-" + ei + "-" + start; }
      }
      var title = "Untitled";
      try { title = String(ev.summary() || "Untitled"); } catch (e11) {}
      var location = "";
      try { location = String(ev.location() || ""); } catch (e12) {}
      var notes = "";
      try { notes = String(ev.description() || ""); } catch (e13) {}
      var url = "";
      try { url = String(ev.url() || ""); } catch (eUrl) {}
      if (url && notes.indexOf(url) < 0) {
        notes = notes ? (notes + "\\n" + url) : url;
      }
      var allDay = false;
      try { allDay = Boolean(ev.allday()); } catch (eAll) { allDay = false; }
      events.push({
        id: eid,
        title: title,
        start: start,
        end: end || start,
        calendarId: calendarId,
        location: location,
        notes: notes,
        allDay: allDay
      });
    }
  }

  return JSON.stringify({ ok: true, calendars: calendars, events: events });
}
`;

function looksLikePermissionError(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("not authorized") ||
    m.includes("not allowed") ||
    m.includes("permission") ||
    m.includes("access not allowed") ||
    m.includes("(-1743)") ||
    m.includes("errhae") ||
    m.includes("automation") ||
    m.includes("denied")
  );
}

async function syncMacCalendars() {
  if (process.platform !== "darwin") {
    return {
      ok: false,
      error: "Mac Calendar sync is only available on macOS.",
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", JXA],
      {
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
        encoding: "utf8",
      },
    );

    const raw = String(stdout || "").trim();
    if (!raw) {
      const err = String(stderr || "").trim();
      if (looksLikePermissionError(err)) {
        return {
          ok: false,
          error:
            "Calendar access denied. Grant Automation permission: System Settings → Privacy & Security → Automation → Envision Mail → Calendar.",
        };
      }
      return { ok: false, error: err || "Calendar.app returned no data." };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (looksLikePermissionError(raw) || looksLikePermissionError(stderr)) {
        return {
          ok: false,
          error:
            "Calendar access denied. Grant Automation permission: System Settings → Privacy & Security → Automation → Envision Mail → Calendar.",
        };
      }
      return { ok: false, error: "Could not parse Calendar.app response." };
    }

    if (!parsed || parsed.ok === false) {
      return {
        ok: false,
        error: parsed?.error || "Calendar sync failed.",
      };
    }

    return {
      ok: true,
      calendars: Array.isArray(parsed.calendars) ? parsed.calendars : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch (err) {
    const message = err?.stderr || err?.message || String(err);
    if (looksLikePermissionError(message)) {
      return {
        ok: false,
        error:
          "Calendar access denied. Grant Automation permission: System Settings → Privacy & Security → Automation → Envision Mail → Calendar.",
      };
    }
    return {
      ok: false,
      error: `Mac Calendar sync failed: ${String(message).slice(0, 400)}`,
    };
  }
}

module.exports = { syncMacCalendars };
