const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");
const { randomUUID } = require("crypto");

function accountsPath() {
  const modern = path.join(app.getPath("userData"), "envision-mail-accounts.json");
  const legacy = path.join(app.getPath("userData"), "les-mail-accounts.json");
  const fromLesMail = path.join(app.getPath("appData"), "Les Mail", "les-mail-accounts.json");
  if (fs.existsSync(modern)) {
    try {
      const d = JSON.parse(fs.readFileSync(modern, "utf8"));
      if (Array.isArray(d.accounts) && d.accounts.length > 0) return modern;
    } catch {
      /* fall through and try legacy sources */
    }
  }
  for (const src of [legacy, fromLesMail]) {
    if (!fs.existsSync(src)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(src, "utf8"));
      if (!Array.isArray(d.accounts) || d.accounts.length === 0) continue;
      fs.mkdirSync(path.dirname(modern), { recursive: true });
      fs.copyFileSync(src, modern);
      return modern;
    } catch {
      return src;
    }
  }
  return modern;
}

function readRaw() {
  const file = accountsPath();
  if (!fs.existsSync(file)) return { accounts: [] };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { accounts: [] };
  }
}

function writeRaw(data) {
  fs.mkdirSync(path.dirname(accountsPath()), { recursive: true });
  fs.writeFileSync(accountsPath(), JSON.stringify(data, null, 2), "utf8");
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function findAccountByEmail(accountsList, email, exceptId) {
  const key = normalizeEmail(email);
  if (!key) return null;
  return accountsList.find((a) => normalizeEmail(a.email) === key && a.id !== exceptId) || null;
}

/** Keep one account per email address (prefer decryptable password, then first seen). */
function dedupeAccountsByEmail() {
  const data = readRaw();
  const unique = [];
  const bestByEmail = new Map();
  for (const account of data.accounts) {
    const key = normalizeEmail(account.email);
    if (!key) {
      unique.push(account);
      continue;
    }
    const prev = bestByEmail.get(key);
    if (!prev) {
      bestByEmail.set(key, account);
      unique.push(account);
      continue;
    }
    const prevPass = decryptSecret(prev.passwordEnc);
    const nextPass = decryptSecret(account.passwordEnc);
    if (!prevPass && nextPass) {
      const idx = unique.indexOf(prev);
      if (idx >= 0) unique[idx] = account;
      bestByEmail.set(key, account);
    }
  }
  const removed = data.accounts.length - unique.length;
  if (removed > 0) {
    data.accounts = unique;
    writeRaw(data);
  }
  return { removed, kept: unique.length };
}

function encryptSecret(plain) {
  if (!plain) return null;
  if (safeStorage.isEncryptionAvailable()) {
    return {
      enc: "safeStorage",
      value: safeStorage.encryptString(plain).toString("base64"),
    };
  }
  // Fallback (dev / rare environments) — still better than plaintext unmarked
  return { enc: "b64", value: Buffer.from(plain, "utf8").toString("base64") };
}

/**
 * Decrypt a stored secret. Les Mail blobs often fail under Envision Mail's
 * appId/keychain — never throw; return "" so SMTP/IMAP can ask for a new password.
 */
function decryptSecret(blob) {
  if (!blob || !blob.value) return "";
  try {
    if (blob.enc === "safeStorage" && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(blob.value, "base64"));
    }
    if (blob.enc === "b64") {
      return Buffer.from(blob.value, "base64").toString("utf8");
    }
  } catch (err) {
    console.warn("decryptSecret failed (re-enter app password)", err && err.message ? err.message : err);
  }
  return "";
}

/** Clear ciphertext that can no longer be decrypted (wrong app keychain). */
function clearUndecryptablePasswords() {
  const data = readRaw();
  let changed = 0;
  for (const account of data.accounts) {
    if (!account.passwordEnc?.value) continue;
    const plain = decryptSecret(account.passwordEnc);
    if (plain) continue;
    account.passwordEnc = null;
    account.needsPassword = true;
    account.lastError =
      "App password needs to be re-entered (encrypted under a previous app identity).";
    changed += 1;
  }
  if (changed) writeRaw(data);
  return changed;
}

function defaultBrandLetter(email, name) {
  const domain = String(email || "").split("@")[1] || "";
  const fromDomain = domain.replace(/\.(com|net|org|io|co|us|uk)$/i, "").charAt(0);
  const fromName = String(name || email || "?").charAt(0);
  return (fromDomain || fromName || "L").toUpperCase();
}

function defaultBrandColor(email) {
  // Stable pastel-ish brand hues from email hash (avoid purple bias cluster)
  const s = String(email || "les");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const palette = ["#0d9488", "#0891b2", "#2563eb", "#059669", "#c2410c", "#b45309", "#be123c", "#0f766e"];
  return palette[h % palette.length];
}

function isAuthErrorMessage(msg) {
  // Narrow on purpose — broad /login|auth/ matched network noise and kept App Password UI open
  return /authentication failed|invalid credentials|invalid user.*password|535|534|APPLICATION-SPECIFIC PASSWORD|safeStorage|ENEEDPASSWORD|password missing|re-enter|app password/i.test(
    String(msg || ""),
  );
}

function publicAccount(account) {
  const { passwordEnc: _p, ...rest } = account;
  const hasCipher = Boolean(_p?.value);
  const canDecrypt = hasCipher ? Boolean(decryptSecret(_p)) : false;
  const hasSynced = Boolean(account.verifiedAt || account.lastSyncAt);
  // Missing secret always needs a password. A stale needsPassword flag only counts
  // when there is a real auth error, or the account has never synced successfully.
  const needsPassword =
    !canDecrypt ||
    (Boolean(account.needsPassword) && (!hasSynced || isAuthErrorMessage(account.lastError)));
  const authBroken = needsPassword;
  const verified = canDecrypt && !needsPassword && hasSynced;
  return {
    ...rest,
    hasPassword: canDecrypt,
    needsPassword,
    verified,
    authBroken,
    brandColor: account.brandColor || defaultBrandColor(account.email),
    brandLetter: account.brandLetter || defaultBrandLetter(account.email, account.name),
    brandLogoDataUrl: account.brandLogoDataUrl || null,
  };
}

/** Clear false-positive needsPassword from older builds so working accounts stay quiet */
function healStaleAuthFlags() {
  const data = readRaw();
  let changed = false;
  for (const account of data.accounts) {
    const hasCipher = Boolean(account.passwordEnc?.value);
    const canDecrypt = hasCipher ? Boolean(decryptSecret(account.passwordEnc)) : false;
    const hasSynced = Boolean(account.verifiedAt || account.lastSyncAt);
    if (!canDecrypt || !account.needsPassword) continue;
    if (hasSynced && !isAuthErrorMessage(account.lastError)) {
      account.needsPassword = false;
      changed = true;
    }
  }
  if (changed) writeRaw(data);
}

function listAccounts() {
  clearUndecryptablePasswords();
  dedupeAccountsByEmail();
  healStaleAuthFlags();
  return readRaw().accounts.map(publicAccount);
}

function getAccountSecret(id) {
  const account = readRaw().accounts.find((a) => a.id === id);
  if (!account) return null;
  const password = decryptSecret(account.passwordEnc);
  if (account.passwordEnc?.value && !password) {
    // One-shot cleanup so the next listAccounts shows needsPassword
    clearUndecryptablePasswords();
  }
  return {
    ...account,
    password,
  };
}

function upsertAccount(input) {
  const data = readRaw();
  const now = new Date().toISOString();
  const emailNorm = normalizeEmail(input.email);
  if (!emailNorm.includes("@")) {
    const err = new Error("Email address is required.");
    err.code = "EEMAIL";
    throw err;
  }

  let account = input.id ? data.accounts.find((a) => a.id === input.id) : null;
  const duplicate = findAccountByEmail(data.accounts, emailNorm, account?.id || null);
  if (duplicate) {
    const err = new Error(
      `An account for ${emailNorm} is already set up. You can only have one of each email address.`,
    );
    err.code = "EDUPLICATE";
    throw err;
  }

  if (!account) {
    account = {
      id: input.id || randomUUID(),
      createdAt: now,
    };
    data.accounts.push(account);
  }

  account.name = input.name || account.name || input.email;
  account.email = emailNorm;
  account.provider = input.provider || account.provider || "custom";
  account.imapHost = input.imapHost || account.imapHost;
  account.imapPort = Number(input.imapPort ?? account.imapPort ?? 993);
  account.imapSecure = input.imapSecure ?? account.imapSecure ?? true;
  account.smtpHost = input.smtpHost || account.smtpHost;
  account.smtpPort = Number(input.smtpPort ?? account.smtpPort ?? 465);
  account.smtpSecure = input.smtpSecure ?? account.smtpSecure ?? true;
  account.username = input.username || account.username || account.email;
  account.updatedAt = now;
  account.lastSyncAt = input.lastSyncAt ?? account.lastSyncAt ?? null;
  account.lastError = input.lastError ?? account.lastError ?? null;
  account.enabled = input.enabled ?? account.enabled ?? true;

  // Brand mark recipients see in HTML (letter avatar or uploaded logo)
  if (input.brandColor !== undefined) account.brandColor = String(input.brandColor || "").trim() || null;
  if (input.brandLetter !== undefined) {
    const letter = String(input.brandLetter || "")
      .trim()
      .slice(0, 2)
      .toUpperCase();
    account.brandLetter = letter || null;
  }
  if (input.brandLogoDataUrl !== undefined) {
    const raw = input.brandLogoDataUrl;
    account.brandLogoDataUrl =
      typeof raw === "string" && raw.startsWith("data:image/") && raw.length < 900_000 ? raw : null;
  }
  if (!account.brandColor) {
    account.brandColor = defaultBrandColor(account.email);
  }
  if (!account.brandLetter) {
    account.brandLetter = defaultBrandLetter(account.email, account.name);
  }

  if (input.password) {
    account.passwordEnc = encryptSecret(input.password);
    account.needsPassword = false;
    // New secret is not "verified" until Test/Sync succeeds
    account.verifiedAt = null;
    if (account.lastError && isAuthErrorMessage(account.lastError)) {
      account.lastError = null;
    }
  }
  if (input.verifiedAt !== undefined) account.verifiedAt = input.verifiedAt;
  if (input.markVerified) {
    account.verifiedAt = now;
    account.needsPassword = false;
    account.lastError = null;
  }

  writeRaw(data);
  return publicAccount(account);
}

function removeAccount(id) {
  const data = readRaw();
  data.accounts = data.accounts.filter((a) => a.id !== id);
  writeRaw(data);
  return true;
}

function touchAccount(id, patch = {}) {
  const data = readRaw();
  const account = data.accounts.find((a) => a.id === id);
  if (!account) return null;
  Object.assign(account, patch, { updatedAt: new Date().toISOString() });
  writeRaw(data);
  return publicAccount(account);
}

module.exports = {
  listAccounts,
  getAccountSecret,
  upsertAccount,
  removeAccount,
  touchAccount,
  accountsPath,
  clearUndecryptablePasswords,
  dedupeAccountsByEmail,
  normalizeEmail,
  findAccountByEmail,
};
