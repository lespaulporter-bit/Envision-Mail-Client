import assert from "node:assert/strict";
import {
  applyHideOtherCalendars,
  calendarEventIsVisible,
  externalSourcesPresent,
  pruneStaleExternalCalendars,
  unsyncExternalRows,
} from "../src/lib/calendar-sync";

const accountA = "acct_a";
const accountB = "acct_b";

const calendars = [
  { id: "cal_local", name: "Personal", visible: true, source: "local" as const, accountId: accountA },
  { id: "cal_mac", name: "Work", visible: true, source: "mac" as const, externalId: "mac-1", accountId: accountA },
  { id: "cal_win", name: "Outlook", visible: true, source: "windows" as const, externalId: "win-1", accountId: accountA },
  { id: "cal_other", name: "Other inbox", visible: true, source: "mac" as const, externalId: "mac-2", accountId: accountB },
];

const events = [
  { id: "e1", calendarId: "cal_local", source: "local" as const, accountId: accountA },
  { id: "e2", calendarId: "cal_mac", source: "mac" as const, accountId: accountA },
  { id: "e3", calendarId: "cal_win", source: "windows" as const, accountId: accountA },
  { id: "e4", calendarId: "cal_other", source: "mac" as const, accountId: accountB },
];

assert.deepEqual(externalSourcesPresent(calendars, accountA), ["mac", "windows"]);
assert.equal(calendarEventIsVisible(events[0], calendars, false), true);
assert.equal(calendarEventIsVisible(events[1], calendars, false), true);
assert.equal(calendarEventIsVisible(events[1], calendars, true), false);
assert.equal(calendarEventIsVisible(events[0], calendars, true), true);

const hidden = applyHideOtherCalendars(calendars, accountA, true);
assert.equal(hidden.find((c) => c.id === "cal_mac")?.visible, false);
assert.equal(hidden.find((c) => c.id === "cal_local")?.visible, true);
assert.equal(hidden.find((c) => c.id === "cal_other")?.visible, true, "other account stays untouched");

const unsyncedCals = unsyncExternalRows(calendars, accountA, ["mac", "windows", "ics"]);
assert.deepEqual(
  unsyncedCals.map((c) => c.id).sort(),
  ["cal_local", "cal_other"],
);
const unsyncedEvents = unsyncExternalRows(events, accountA, ["mac", "windows"]);
assert.deepEqual(
  unsyncedEvents.map((e) => e.id).sort(),
  ["e1", "e4"],
);

const pruned = pruneStaleExternalCalendars(calendars, "mac", accountA, ["mac-1"]);
assert.ok(pruned.some((c) => c.id === "cal_mac"));
assert.ok(pruned.some((c) => c.id === "cal_other"), "other account mac calendar kept");
const prunedEmpty = pruneStaleExternalCalendars(calendars, "mac", accountA, []);
assert.equal(prunedEmpty.some((c) => c.id === "cal_mac"), false);

console.log("calendar-sync helpers: ok");
