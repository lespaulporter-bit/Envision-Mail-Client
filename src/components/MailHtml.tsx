"use client";

import { desktopApi } from "@/lib/desktop";
import { linkifyHtml } from "@/lib/linkify-html";
import { isMailtoUrl } from "@/lib/mailto";
import { useMailStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useMemo, type MouseEvent } from "react";

type Props = {
  html: string;
  className?: string;
};

/** Render email HTML; mailto: links open a clean Envision compose (never Outlook / never body junk). */
export function MailHtml({ html, className }: Props) {
  const startCompose = useMailStore((s) => s.startCompose);
  const linked = useMemo(() => linkifyHtml(html), [html]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (isMailtoUrl(href)) {
      e.preventDefault();
      e.stopPropagation();
      startCompose(href);
      return;
    }
    const api = desktopApi();
    if (api && /^https?:/i.test(href)) {
      e.preventDefault();
      e.stopPropagation();
      void api.openExternal(href);
    }
  };

  return (
    <div
      className={cn("prose-mail", className)}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: linked }}
    />
  );
}
