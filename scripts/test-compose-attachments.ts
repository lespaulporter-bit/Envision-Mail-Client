import assert from "node:assert/strict";
import {
  canAddAttachments,
  isOutgoingAttachmentId,
  toSendAttachments,
  attachmentBytesTotal,
  MAX_ATTACHMENT_BYTES,
} from "../src/lib/compose-attachments";
import { isServerAttachment } from "../src/lib/attachments";

assert.equal(isOutgoingAttachmentId("out_abc123"), true);
assert.equal(isOutgoingAttachmentId("att_inbox_12_0"), false);
assert.equal(isServerAttachment({ id: "att_inbox_12_0" }), true);
assert.equal(isServerAttachment({ id: "out_deadbeef" }), true);
assert.equal(isServerAttachment({ id: "local-file" }), false);

const ok = canAddAttachments([], [{ name: "a.pdf", size: 1024 }]);
assert.equal(ok.ok, true);

const tooBig = canAddAttachments([], [{ name: "huge.bin", size: MAX_ATTACHMENT_BYTES + 1 }]);
assert.equal(tooBig.ok, false);

const overTotal = canAddAttachments(
  [{ size: MAX_ATTACHMENT_BYTES - 100 }],
  [{ name: "more.bin", size: 200 }],
);
assert.equal(overTotal.ok, false);

assert.equal(attachmentBytesTotal([{ size: 10 }, { size: 15 }]), 25);

const payload = toSendAttachments([
  { id: "out_1", name: "a.pdf", size: 10, mimeType: "application/pdf" },
  { id: "out_2", name: "b.txt", size: 4, mimeType: "text/plain", contentBase64: "aGk=" },
]);
assert.deepEqual(payload[0], { id: "out_1", filename: "a.pdf", contentType: "application/pdf" });
assert.equal(payload[1].contentBase64, "aGk=");

console.log("compose-attachments: ok");
