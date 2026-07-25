const { Resolver } = require("dns").promises;

const resolver = new Resolver();
resolver.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]);

/** Known provider hints from MX / domain → IMAP/SMTP settings */
const MX_HINTS = [
  {
    match: /stackmail\.com|stackcp\.com|20i\.com/i,
    provider: "stackmail",
    label: "Stackmail / 20i hosting",
    imapHost: "imap.stackmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.stackmail.com",
    smtpPort: 465,
    smtpSecure: true,
    hint: "Use your full email as username. Password is your mailbox password from the hosting panel.",
  },
  {
    match: /google\.com|googlemail\.com|gmail-smtp/i,
    provider: "gmail",
    label: "Gmail / Google Workspace",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    hint: "Use an App Password if 2FA is on.",
  },
  {
    match: /outlook\.com|office365|protection\.outlook|microsoft/i,
    provider: "outlook",
    label: "Outlook / Microsoft 365",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    hint: "May need an app password or IMAP enabled by your admin.",
  },
  {
    match: /yahoodns\.net|yahoo\.com/i,
    provider: "yahoo",
    label: "Yahoo Mail",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    smtpSecure: true,
    hint: "Generate an app password in Yahoo Account Security.",
  },
  {
    match: /aol\.com|aim\.com/i,
    provider: "aol",
    label: "AOL Mail",
    imapHost: "imap.aol.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.aol.com",
    smtpPort: 465,
    smtpSecure: true,
    hint: "Generate an AOL app password, then paste it into Les Mail.",
  },
  {
    match: /icloud|me\.com|apple/i,
    provider: "icloud",
    label: "iCloud Mail",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecure: false,
    hint: "Use an app-specific password from appleid.apple.com.",
  },
  {
    match: /messagingengine\.com|fastmail/i,
    provider: "fastmail",
    label: "Fastmail",
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.fastmail.com",
    smtpPort: 465,
    smtpSecure: true,
    hint: "Use a Fastmail app password.",
  },
];

function domainFromEmail(email) {
  const at = String(email || "").trim().toLowerCase().split("@");
  return at.length === 2 ? at[1] : "";
}

function fallbackForDomain(domain) {
  return {
    provider: "custom",
    label: `Custom (${domain})`,
    imapHost: `mail.${domain}`,
    imapPort: 993,
    imapSecure: true,
    smtpHost: `mail.${domain}`,
    smtpPort: 465,
    smtpSecure: true,
    hint: `Try mail.${domain} or imap.${domain} / smtp.${domain}. Username is usually your full email.`,
    candidates: [
      { imapHost: `imap.${domain}`, smtpHost: `smtp.${domain}` },
      { imapHost: `mail.${domain}`, smtpHost: `mail.${domain}` },
      { imapHost: domain, smtpHost: domain },
    ],
  };
}

/**
 * Suggest IMAP/SMTP settings from an email address (MX lookup + known hosts).
 */
async function discoverMailSettings(email) {
  const domain = domainFromEmail(email);
  if (!domain) {
    return { ok: false, error: "Enter a valid email address first." };
  }

  let mxHosts = [];
  try {
    const records = await resolver.resolveMx(domain);
    mxHosts = (records || [])
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange.toLowerCase());
  } catch {
    try {
      const records = await require("dns").promises.resolveMx(domain);
      mxHosts = (records || [])
        .sort((a, b) => a.priority - b.priority)
        .map((r) => r.exchange.toLowerCase());
    } catch {
      mxHosts = [];
    }
  }

  for (const mx of mxHosts) {
    for (const hint of MX_HINTS) {
      if (hint.match.test(mx)) {
        const { match: _m, ...rest } = hint;
        return {
          ok: true,
          discovered: true,
          mx: mxHosts,
          ...rest,
          username: String(email).trim(),
        };
      }
    }
  }

  // Direct domain keyword checks (no MX)
  const blob = `${domain} ${mxHosts.join(" ")}`;
  for (const hint of MX_HINTS) {
    if (hint.match.test(blob)) {
      const { match: _m, ...rest } = hint;
      return {
        ok: true,
        discovered: true,
        mx: mxHosts,
        ...rest,
        username: String(email).trim(),
      };
    }
  }

  return {
    ok: true,
    discovered: false,
    mx: mxHosts,
    ...fallbackForDomain(domain),
    username: String(email).trim(),
  };
}

module.exports = { discoverMailSettings, domainFromEmail };
