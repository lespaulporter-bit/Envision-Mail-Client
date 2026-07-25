const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");
const { randomUUID } = require("crypto");

function accountsPath() {
  return path.join(app.getPath("userData"), "les-mail-accounts.json");
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

function decryptSecret(blob) {
  if (!blob || !blob.value) return "";
  if (blob.enc === "safeStorage" && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(blob.value, "base64"));
  }
  if (blob.enc === "b64") {
    return Buffer.from(blob.value, "base64").toString("utf8");
  }
  return "";
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

function publicAccount(account) {
  const { passwordEnc: _p, ...rest } = account;
  return {
    ...rest,
    hasPassword: Boolean(_p?.value),
    brandColor: account.brandColor || defaultBrandColor(account.email),
    brandLetter: account.brandLetter || defaultBrandLetter(account.email, account.name),
    brandLogoDataUrl: account.brandLogoDataUrl || null,
  };
}

function listAccounts() {
  return readRaw().accounts.map(publicAccount);
}

function getAccountSecret(id) {
  const account = readRaw().accounts.find((a) => a.id === id);
  if (!account) return null;
  return {
    ...account,
    password: decryptSecret(account.passwordEnc),
  };
}

function upsertAccount(input) {
  const data = readRaw();
  const now = new Date().toISOString();
  let account = data.accounts.find((a) => a.id === input.id);

  if (!account) {
    account = {
      id: input.id || randomUUID(),
      createdAt: now,
    };
    data.accounts.push(account);
  }

  account.name = input.name || account.name || input.email;
  account.email = String(input.email || account.email || "").trim();
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
};
