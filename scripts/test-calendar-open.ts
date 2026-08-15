import assert from "node:assert/strict";
import { localYmd } from "../src/lib/utils";

// All-day holidays are stored at local midnight — Day Cover must open that civil day.
const labor = new Date(2026, 8, 7, 0, 0, 0, 0);
assert.equal(localYmd(labor), "2026-09-07");
assert.equal(localYmd(labor.toISOString()), "2026-09-07");

const columbus = new Date(2026, 9, 12, 0, 0, 0, 0);
assert.equal(localYmd(columbus), "2026-10-12");

console.log("calendar-open date handoff: ok");
