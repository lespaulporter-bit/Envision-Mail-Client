const fs = require("fs");
const path = require("path");
const { app } = require("electron");

/**
 * One-time migration from Les Mail → Envision Mail userData.
 * Copies IMAP/SMTP accounts (incl. encrypted app passwords) and, when safe,
 * copies Chromium Local Storage so MoneyBox / mail cache / settings survive.
 */
function migrateFromLesMail() {
  const destRoot = app.getPath("userData");
  const srcRoot = path.join(app.getPath("appData"), "Les Mail");
  const marker = path.join(destRoot, ".migrated-from-les-mail");
  const result = { accounts: false, localStorage: false, skipped: false, reason: "" };

  if (!fs.existsSync(srcRoot)) {
    result.skipped = true;
    result.reason = "no-les-mail-folder";
    return result;
  }

  try {
    fs.mkdirSync(destRoot, { recursive: true });
  } catch {
    /* ignore */
  }

  // --- Accounts ---
  const destAccounts = path.join(destRoot, "envision-mail-accounts.json");
  const destLegacy = path.join(destRoot, "les-mail-accounts.json");
  const srcAccounts = path.join(srcRoot, "les-mail-accounts.json");
  const srcModern = path.join(srcRoot, "envision-mail-accounts.json");

  const destHasAccounts = (() => {
    for (const f of [destAccounts, destLegacy]) {
      if (!fs.existsSync(f)) continue;
      try {
        const d = JSON.parse(fs.readFileSync(f, "utf8"));
        if (Array.isArray(d.accounts) && d.accounts.length > 0) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  })();

  if (!destHasAccounts) {
    const src = fs.existsSync(srcModern) ? srcModern : fs.existsSync(srcAccounts) ? srcAccounts : null;
    if (src) {
      try {
        fs.copyFileSync(src, destAccounts);
        result.accounts = true;
      } catch (err) {
        result.reason = `accounts-copy-failed: ${err.message}`;
      }
    }
  }

  // --- Local Storage (only if we haven't migrated before and dest looks unused) ---
  if (fs.existsSync(marker)) {
    return result;
  }

  const srcLs = path.join(srcRoot, "Local Storage", "leveldb");
  const destLs = path.join(destRoot, "Local Storage", "leveldb");
  const destLsExists = fs.existsSync(destLs) && fs.readdirSync(destLs).length > 0;
  // Prefer copying when dest has no prior Les/Envision persist (fresh Chromium LS is tiny)
  const destLooksFresh = !destLsExists || fs.readdirSync(destLs).length <= 6;

  if (fs.existsSync(srcLs) && destLooksFresh) {
    try {
      fs.mkdirSync(path.dirname(destLs), { recursive: true });
      // Clear fresh empty LS so Les Mail keys land cleanly
      if (fs.existsSync(destLs)) {
        for (const name of fs.readdirSync(destLs)) {
          fs.rmSync(path.join(destLs, name), { force: true, recursive: true });
        }
      } else {
        fs.mkdirSync(destLs, { recursive: true });
      }
      for (const name of fs.readdirSync(srcLs)) {
        fs.cpSync(path.join(srcLs, name), path.join(destLs, name), { recursive: true });
      }
      result.localStorage = true;
    } catch (err) {
      result.reason = (result.reason ? result.reason + "; " : "") + `ls-copy-failed: ${err.message}`;
    }
  }

  try {
    fs.writeFileSync(
      marker,
      JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2),
      "utf8",
    );
  } catch {
    /* ignore */
  }

  return result;
}

module.exports = { migrateFromLesMail };
