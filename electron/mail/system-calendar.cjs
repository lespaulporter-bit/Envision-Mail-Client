const { syncMacCalendars } = require("./mac-calendar.cjs");
const { syncWindowsOutlookCalendars } = require("./windows-calendar.cjs");

/**
 * Same calendar capability on every desktop OS:
 * - macOS → Apple Calendar.app
 * - Windows → classic Outlook calendar (COM)
 * Local events, Teams invites, and .ics import work on both regardless.
 */
async function syncSystemCalendars() {
  if (process.platform === "darwin") {
    const result = await syncMacCalendars();
    return { ...result, provider: "mac", source: "mac" };
  }
  if (process.platform === "win32") {
    const result = await syncWindowsOutlookCalendars();
    return { ...result, provider: "outlook", source: "windows" };
  }
  return {
    ok: false,
    error: "System calendar sync is available on Mac and Windows desktop apps.",
  };
}

module.exports = { syncSystemCalendars, syncMacCalendars };
