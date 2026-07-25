"use client";

import { wallpaperPool, type WallpaperTheme } from "@/lib/wallpapers";
import { useHeyStore } from "@/lib/store";
import { useEffect, useMemo, useState } from "react";

export function WallpaperBackground() {
  const wallpaper = useHeyStore((s) => s.settings.wallpaper || "none");
  const rotateMinutes = useHeyStore((s) => s.settings.wallpaperRotateMinutes || 8);
  const pool = useMemo(() => wallpaperPool(wallpaper as WallpaperTheme), [wallpaper]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [wallpaper]);

  useEffect(() => {
    if (pool.length < 2) return;
    const ms = Math.max(1, rotateMinutes) * 60_000;
    const t = setInterval(() => setIndex((i) => (i + 1) % pool.length), ms);
    return () => clearInterval(t);
  }, [pool, rotateMinutes]);

  if (!pool.length) return null;
  const url = pool[index % pool.length];

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 bg-cover bg-center transition-[background-image] duration-1000"
        style={{ backgroundImage: `url(${url})` }}
      />
      <div className="absolute inset-0 bg-white/72 backdrop-blur-[1.5px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(247,244,255,0.55),transparent_55%)]" />
    </div>
  );
}
