import { isOutgoingAttachmentId } from "@/lib/compose-attachments";
import type { Attachment } from "@/lib/types";

/** Sync mints ids as att_<folder>_<uid>_<index>; outgoing compose files use out_*. */
const SERVER_ATTACHMENT_ID = /^att_[a-z]+_\d+_\d+$/i;

export type AttachmentKind = "image" | "pdf" | "text" | "other";

export function isServerAttachment(attachment: Pick<Attachment, "id">): boolean {
  return SERVER_ATTACHMENT_ID.test(attachment.id || "") || isOutgoingAttachmentId(attachment.id);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function attachmentKind(mimeType: string, name = ""): AttachmentKind {
  const mime = (mimeType || "").toLowerCase();
  const ext = extensionOf(name);
  if (mime.startsWith("image/") && !mime.includes("svg")) return "image";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "avif"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime.startsWith("text/") ||
    ["application/json", "application/xml", "text/calendar"].includes(mime) ||
    ["txt", "csv", "log", "md", "json", "xml", "ics", "eml"].includes(ext)
  ) {
    return "text";
  }
  return "other";
}

/** Only these render usefully inside the app; everything else hands off to the OS. */
export function canPreviewInApp(mimeType: string, name = ""): boolean {
  return attachmentKind(mimeType, name) !== "other";
}

export function attachmentIcon(mimeType: string, name = ""): string {
  const ext = extensionOf(name);
  switch (attachmentKind(mimeType, name)) {
    case "image":
      return "🖼️";
    case "pdf":
      return "📕";
    case "text":
      return ext === "csv" ? "📊" : "📄";
    default:
      break;
  }
  if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return "🗜️";
  if (["doc", "docx", "pages", "rtf"].includes(ext)) return "📝";
  if (["xls", "xlsx", "numbers"].includes(ext)) return "📊";
  if (["ppt", "pptx", "key"].includes(ext)) return "📽️";
  if (["mp3", "wav", "m4a", "aac"].includes(ext)) return "🎵";
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "🎬";
  return "📎";
}

/** base64 → object URL so previews don't hold a giant data string in the DOM. */
export function base64ToObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
  return URL.createObjectURL(blob);
}

export function base64ToText(base64: string, limit = 200_000): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return text.length > limit ? `${text.slice(0, limit)}\n\n… truncated for preview …` : text;
}
