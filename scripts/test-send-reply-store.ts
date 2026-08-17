import assert from "node:assert/strict";

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(String(key)) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(String(key), String(value));
  },
  removeItem: (key: string) => {
    memory.delete(String(key));
  },
};
(globalThis as { localStorage?: typeof localStorageMock }).localStorage = localStorageMock;
(globalThis as { window?: { localStorage: typeof localStorageMock } }).window = {
  localStorage: localStorageMock,
};

async function main() {
const { useMailStore } = await import("../src/lib/store");

const now = new Date().toISOString();
useMailStore.setState({
  settings: { ...useMailStore.getState().settings, displayName: "Pat", email: "pat@envision.test" },
  threads: [
    {
      id: "t1",
      subject: "Hello",
      box: "lesbox",
      contactEmail: "jane@example.com",
      contactName: "Jane",
      messageIds: ["m1"],
      seen: true,
      replyLater: false,
      setAside: false,
      bundled: false,
      muted: false,
      stickyNotes: [],
      privateNotes: [],
      collectionIds: [],
      notify: false,
      accountId: "acct_test",
      accountEmail: "pat@envision.test",
      createdAt: now,
      updatedAt: now,
    },
  ],
  messages: {
    m1: {
      id: "m1",
      threadId: "t1",
      from: "jane@example.com",
      fromName: "Jane",
      to: ["pat@envision.test"],
      cc: [],
      subject: "Hello",
      bodyHtml: "<p>Hi</p>",
      bodyText: "Hi",
      sentAt: now,
      attachments: [],
      trackersBlocked: [],
      messageIdHeader: "<hello@example.com>",
    },
  },
});

const before = Object.keys(useMailStore.getState().messages).length;
useMailStore.getState().sendReply("t1", " ");
assert.equal(Object.keys(useMailStore.getState().messages).length, before, "space-only body must not record");

useMailStore.getState().sendReply("t1", "", { bodyHtml: "<p>Signature</p>" });
const afterSig = useMailStore.getState();
assert.equal(Object.keys(afterSig.messages).length, before + 1, "signature-only HTML must record");
const recorded = Object.values(afterSig.messages).find((m) => m?.isOutgoing);
assert.ok(recorded);
assert.equal(recorded?.from, "pat@envision.test");
assert.deepEqual(recorded?.cc, []);

useMailStore.getState().sendReply("t1", "Thanks", {
  cc: ["cc@example.com"],
  bcc: ["hidden@example.com"],
  fromEmail: "other@envision.test",
  smtpMessageId: "<smtp-1>",
  requestReadReceipt: true,
  bodyHtml: "<p>Thanks</p>",
});
const withMeta = Object.values(useMailStore.getState().messages).find((m) => m?.smtpMessageId === "<smtp-1>");
assert.ok(withMeta);
assert.equal(withMeta?.from, "other@envision.test");
assert.deepEqual(withMeta?.cc, ["cc@example.com"]);
assert.deepEqual(withMeta?.bcc, ["hidden@example.com"]);
assert.equal(withMeta?.requestReadReceipt, true);
assert.equal(withMeta?.messageIdHeader, "<smtp-1>");

console.log("send-reply-store: ok");
}

void main();
