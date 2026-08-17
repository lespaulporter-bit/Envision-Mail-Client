/** Headers so a reply stays in the same conversation at the recipient. */
export function replyThreadingHeaders(
  messages: Array<{ messageIdHeader?: string | null; smtpMessageId?: string | null }>,
): { inReplyTo?: string; references?: string } {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const id = String(messages[i]?.messageIdHeader || messages[i]?.smtpMessageId || "").trim();
    if (id) return { inReplyTo: id, references: id };
  }
  return {};
}

/** Local Sent copy must be recorded even when the body is only a signature or files. */
export function shouldRecordOutgoingReply(
  body: string,
  opts?: { attachments?: unknown[]; bodyHtml?: string },
): boolean {
  if (String(body || "").trim()) return true;
  if (opts?.attachments && opts.attachments.length > 0) return true;
  if (String(opts?.bodyHtml || "").trim()) return true;
  return false;
}
