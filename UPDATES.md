# Envision Mail updates

## 2.6.6
- Fix auto-update 404 / Invalid URL: feed is now GitHub Releases `…/releases/latest/download` (not the dead envisiondms CDN).

## 2.6.5
- **Spam Central**: renamed from Spam Corps; button is **Block & report** (local + IMAP spam when possible).
- **Calendar**: agenda view, week/day time grid, search, calendar toggles, edit/duplicate, all-day, location, countdowns, click-to-create slots.
- **Updates**: stop using dead `updates.envisiondms.com` feed (404); use GitHub Releases and auto-migrate stale feed URLs.

## 2.6.4
- Upload an account **avatar / logo** to replace initials (e.g. “LP”) in threads; also used in outgoing mail.
- Contacts can upload a photo/logo too.
- Hide app-password setup once an account is verified and working (returns on auth failure or **Update app password…**).

## 2.6.3
- Hide app-password / test / auto-detect UI once an account is verified and working.
- Show those controls again only when auth fails or the user chooses **Update app password…**.

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
