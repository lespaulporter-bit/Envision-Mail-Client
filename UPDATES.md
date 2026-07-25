# Envision Mail updates

## 2.6.2
- Compose: sticky **Send via SMTP** bar; floating docks no longer cover send/dropdowns.
- One account per email address (reject duplicates; auto-dedupe).
- Controlled template/snippet/signature dropdowns so they open reliably in Electron.

## 2.6.1
- Fix SMTP send crash when Les Mail app passwords cannot be decrypted under Envision Mail’s keychain (`safeStorage.decryptString`).
- Clear undecryptable secrets and prompt to paste a new app password — mail data is never wiped.
- Auto-updates use GitHub Releases (`lespaulporter-bit/Envision-Mail-Client`).
- Railway project **Envision Mail Client** hosts status/release pointer only (no user data).

## 2.6.0
- Automatic update check every **60 days**; downloads newer versions when the update feed has them.
- Settings → About shows last/next check and **Check for updates now**.

## 2.5.0
- **Critical:** App data (collections, mail cache, signatures, settings) now saves to a durable file in Application Support — no longer wiped when the app updates or restarts.
- Fixed random localhost port that made browser storage look empty every launch.
- Restored Les Mail threads/collections/contacts/signatures into Envision Mail.
- Previously read mail visible in MoneyBox $; SMTP send errors clarified; Sent read-receipt ✓.

## 2.4.0
- Previously read mail tabs; legacy accountId visibility; SMTP send fixes; Sent receipt checks.

## 2.3.0
- Removed HEY branding; renamed borrowed feature labels; teal CTAs.
