import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("src/components/EmailViews.tsx", "utf8");
const start = src.indexOf("export function FocusReplyView");
assert.ok(start >= 0, "FocusReplyView exists");
const view = src.slice(start);
assert.match(view, /collapseOverrides/);
assert.match(view, /\?\? true/);
assert.match(view, /Expand all/);
assert.match(view, /Collapse all/);
assert.match(view, /Send & next/);
assert.match(view, /Skip/);
assert.match(view, /ComposeAttachments/);
assert.doesNotMatch(view, /last \? <MailHtml className="mt-4 rounded-xl bg-soft p-4"/);

console.log("reply-queue-collapse: ok");
