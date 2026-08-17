import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const prior = readFileSync("src/components/PriorEmailsPanel.tsx", "utf8");
assert.match(prior, /desktopApi\(\)/);
assert.match(prior, /api\.sendMail\(/);
assert.match(prior, /replyThreadingHeaders\(/);
assert.match(prior, /smtpMessageId/);
assert.doesNotMatch(prior, /sendReply\(t\.id, body\);/);

const thread = readFileSync("src/components/ThreadView.tsx", "utf8");
assert.match(thread, /replyThreadingHeaders\(messages\)/);
assert.match(thread, /smtpMessageId: result\.messageId/);
assert.match(thread, /bodyHtml/);

const queue = readFileSync("src/components/EmailViews.tsx", "utf8");
assert.match(queue, /replyThreadingHeaders\(messages\)/);
assert.match(queue, /smtpMessageId: result\.messageId/);

const compose = readFileSync("src/components/MoreViews.tsx", "utf8");
assert.match(compose, /bodyHtml: html/);
assert.match(compose, /fromName: activeAccount/);
assert.doesNotMatch(compose, /replyToEveryone/);
assert.doesNotMatch(compose, /Reply to \$\{snoozeQueue/);

const store = readFileSync("src/lib/store.ts", "utf8");
assert.match(store, /shouldRecordOutgoingReply/);
assert.match(store, /opts\?\.cc/);
assert.match(store, /opts\?\.bcc/);
assert.match(store, /opts\?\.smtpMessageId/);
assert.doesNotMatch(store, /replyToEveryone/);

const attach = readFileSync("electron/mail/attachments.cjs", "utf8");
assert.match(attach, /could not be attached — pick the file again/);

console.log("reply-send-wiring: ok");
