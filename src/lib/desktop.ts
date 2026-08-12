export function isDesktop() {
  return typeof window !== "undefined" && Boolean(window.lesMail?.isDesktop);
}

export function desktopApi() {
  if (!isDesktop()) return null;
  return window.lesMail;
}

/** Electron process.platform when running in the desktop app. */
export function desktopPlatform(): string | null {
  return desktopApi()?.platform ?? null;
}

export function isMacDesktop() {
  return desktopPlatform() === "darwin";
}

export function isWindowsDesktop() {
  return desktopPlatform() === "win32";
}

/** "this Mac" / "this PC" / "this computer" for user-facing copy. */
export function thisComputerLabel() {
  if (isMacDesktop()) return "this Mac";
  if (isWindowsDesktop()) return "this PC";
  return "this computer";
}

/** Modifier key for send shortcuts — ⌘ on Mac, Ctrl on Windows/Linux/web. */
export function modKeyLabel() {
  if (isMacDesktop()) return "⌘";
  return "Ctrl";
}

/** Placeholder hint for send-on-Enter shortcuts. */
export function sendShortcutHint() {
  return isMacDesktop() ? "⌘Enter to send" : "Ctrl+Enter to send";
}
