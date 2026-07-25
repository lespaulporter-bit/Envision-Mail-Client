export function isDesktop() {
  return typeof window !== "undefined" && Boolean(window.lesMail?.isDesktop);
}

export function desktopApi() {
  if (!isDesktop()) return null;
  return window.lesMail;
}
