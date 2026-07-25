export type WallpaperTheme = "none" | "ocean" | "forest" | "stars" | "rotate";

export const WALLPAPERS: Record<Exclude<WallpaperTheme, "none" | "rotate">, string[]> = {
  ocean: [
    "https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&q=80&auto=format",
  ],
  forest: [
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1511497584788-876760111969?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=1920&q=80&auto=format",
  ],
  stars: [
    "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1464802686167-b939a694ab8d?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1502134249126-9f3755a50d40?w=1920&q=80&auto=format",
    "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1920&q=80&auto=format",
  ],
};

export function wallpaperPool(theme: WallpaperTheme): string[] {
  if (theme === "none") return [];
  if (theme === "rotate") {
    return [...WALLPAPERS.ocean, ...WALLPAPERS.forest, ...WALLPAPERS.stars];
  }
  return WALLPAPERS[theme] || [];
}
