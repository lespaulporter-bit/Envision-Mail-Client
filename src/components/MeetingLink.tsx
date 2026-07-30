"use client";

import { desktopApi } from "@/lib/desktop";
import { extractUrls, type ResolvedMeetingLink } from "@/lib/meeting-links";
import { cn } from "@/lib/utils";
import { Video } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

/** Desktop hands links to the system browser, which then offers the Teams/Zoom app. */
function openLink(url: string, event: MouseEvent) {
  const api = desktopApi();
  if (!api) return;
  event.preventDefault();
  event.stopPropagation();
  void api.openExternal(url);
}

export function ExternalLink({
  href,
  className,
  children,
  title,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={title}
      className={className}
      onClick={(e) => openLink(href, e)}
    >
      {children}
    </a>
  );
}

/** The clickable Join affordance shown wherever an event is listed. */
export function JoinMeetingLink({
  link,
  className,
  compact,
}: {
  link: ResolvedMeetingLink;
  className?: string;
  compact?: boolean;
}) {
  return (
    <ExternalLink
      href={link.url}
      title={link.url}
      className={cn(
        "mt-1 inline-flex items-center gap-1.5 rounded-full bg-teal px-2.5 py-1 font-semibold text-white transition hover:brightness-110",
        compact ? "text-[11px]" : "text-xs",
        className,
      )}
    >
      <Video className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {link.label}
    </ExternalLink>
  );
}

/** Free text (event notes, location) with any URLs turned into working links. */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const urls = extractUrls(text);
  if (!urls.length) return <span className={className}>{text}</span>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  urls.forEach((url, i) => {
    const at = text.indexOf(url, cursor);
    if (at < 0) return;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <ExternalLink key={`${url}-${i}`} href={url} className="break-all text-teal underline">
        {url}
      </ExternalLink>,
    );
    cursor = at + url.length;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <span className={className}>{parts}</span>;
}
