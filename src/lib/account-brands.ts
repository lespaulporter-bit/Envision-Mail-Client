"use client";

import { desktopApi } from "@/lib/desktop";

export type AccountBrand = {
  email: string;
  name?: string;
  brandColor?: string | null;
  brandLetter?: string | null;
  brandLogoDataUrl?: string | null;
};

let cache: AccountBrand[] = [];
let loadedAt = 0;

export async function loadAccountBrands(force = false): Promise<AccountBrand[]> {
  const api = desktopApi();
  if (!api) return cache;
  if (!force && cache.length && Date.now() - loadedAt < 15_000) return cache;
  try {
    const list = await api.listAccounts();
    cache = list.map((a) => ({
      email: String(a.email || "").toLowerCase(),
      name: a.name,
      brandColor: a.brandColor,
      brandLetter: a.brandLetter,
      brandLogoDataUrl: a.brandLogoDataUrl || null,
    }));
    loadedAt = Date.now();
  } catch {
    /* keep prior cache */
  }
  return cache;
}

export function brandForEmail(email: string | null | undefined): AccountBrand | null {
  const key = String(email || "")
    .toLowerCase()
    .trim();
  if (!key) return null;
  return cache.find((b) => b.email === key) || null;
}

export function invalidateAccountBrands() {
  loadedAt = 0;
}
