/**
 * Prevent transient network/TLS failures from surfacing as Electron's
 * "A JavaScript error occurred in the main process" dialog.
 * Register as early as possible in main.cjs.
 */

function isBenignNetworkError(err) {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || err || "");
  const errno = String(err.errno || "");
  const codes = new Set([
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EPIPE",
    "ECONNABORTED",
    "ERR_SOCKET_CONNECTION_TIMEOUT",
    "ERR_NETWORK_CHANGED",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
  ]);
  if (codes.has(code) || codes.has(errno)) return true;
  return /EHOSTUNREACH|ENETUNREACH|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network is unreachable|getaddrinfo|TLSWrap|Client network socket disconnected/i.test(
    msg,
  );
}

let installed = false;

function installSafeProcessHandlers() {
  if (installed) return;
  installed = true;

  process.on("uncaughtException", (err) => {
    if (isBenignNetworkError(err)) {
      console.warn("[envision-mail] ignored network error:", err.code || "", err.message || err);
      return;
    }
    console.error("[envision-mail] uncaughtException:", err);
    // Don't rethrow — keep the mail app alive; log for diagnostics.
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    if (isBenignNetworkError(err) || isBenignNetworkError(reason)) {
      console.warn("[envision-mail] ignored network rejection:", err.message);
      return;
    }
    console.error("[envision-mail] unhandledRejection:", reason);
  });
}

module.exports = { installSafeProcessHandlers, isBenignNetworkError };
