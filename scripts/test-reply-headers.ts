import assert from "node:assert/strict";
import { replyThreadingHeaders, shouldRecordOutgoingReply } from "../src/lib/reply-headers";

assert.deepEqual(replyThreadingHeaders([]), {});
assert.deepEqual(replyThreadingHeaders([{ messageIdHeader: null, smtpMessageId: null }]), {});

const fromHeader = replyThreadingHeaders([
  { messageIdHeader: "<old@example.com>", smtpMessageId: "<smtp-old>" },
  { messageIdHeader: "  <latest@example.com>  ", smtpMessageId: "<smtp-latest>" },
]);
assert.deepEqual(fromHeader, {
  inReplyTo: "<latest@example.com>",
  references: "<latest@example.com>",
});

const fromSmtp = replyThreadingHeaders([
  { messageIdHeader: "", smtpMessageId: "<smtp-only@envision>" },
]);
assert.deepEqual(fromSmtp, {
  inReplyTo: "<smtp-only@envision>",
  references: "<smtp-only@envision>",
});

assert.equal(shouldRecordOutgoingReply(""), false);
assert.equal(shouldRecordOutgoingReply("   "), false);
assert.equal(shouldRecordOutgoingReply("Thanks"), true);
assert.equal(shouldRecordOutgoingReply(" ", { attachments: [{ id: "out_1" }] }), true);
assert.equal(shouldRecordOutgoingReply("", { bodyHtml: "<p>Signature</p>" }), true);
assert.equal(shouldRecordOutgoingReply("", { bodyHtml: "   " }), false);
assert.equal(shouldRecordOutgoingReply("", { attachments: [] }), false);

console.log("reply-headers: ok");
