# Envision Mail updates

## 2.6.10
- Compose **To / Cc / Bcc** autocomplete from address book, recent recipients, and mail history.
- Keyboard: ↑↓ to move, Enter/Tab to pick, Esc to close.
- Remembers addresses you send to for next time.

## 2.6.9
- **Sometime this week**: checking a task removes it (no strikethrough leftovers).
- Unchecked tasks automatically **roll into the next week** and stay on the list.
- Carried-over tasks show a small “Rolled over” mark.

## 2.6.8
- Outlook-style **reminder popups**: dismiss or snooze 5 / 15 minutes.
- Set reminders from calendar events (editable lead time) and from email (5m / 15m / 1h).
- Calendar bump-due and event lead times surface on screen with OS notification when permitted.
- Fix MoneyBox duplicate “Bumped” + “Previously read” rows.

## 2.6.7
- Fix **Restart now** after an update downloads: unsigned Mac builds no longer fail ShipIt code-signature checks. Restart kills the running app, replaces `Envision Mail.app`, and relaunches.
- Settings → About: **Restart & install update** when a package is already downloaded.
- Update checks reuse the same updater instance (no orphan download path).

## 2.6.6
- Fix auto-update 404 / Invalid URL: feed is now GitHub Releases `…/releases/latest/download` (not the dead envisiondms CDN).
- Action tags after Snooze / Mute / On Hold / etc.; fix false dock badges.

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
