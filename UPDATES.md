# Envision Mail updates

## Railway
- Update service deploys via a minimal **Dockerfile** (Node 22) — no Electron/Next install on Railway. Fixes failed Nixpacks/Node 18 builds.

## 2.6.29
- **Move to Trash** on every mail surface — Screening, New Senders, MoneyBox, Spam, thread view, and list hover actions.
- Trash actually moves the conversation to Trash (local + IMAP); Delete forever stays only in Trash (and optional on Spam).

## 2.6.28
- **Newsstand → Screening**: new/unapproved senders land in Screening by default (not MoneyBox).
- **Allow → MoneyBox $ forever**: that email and all future mail from the sender go to MoneyBox automatically.
- Without Allow, mail stays in **Screening** forever; **New Senders** lists pending first-time senders for the same decision.
- Sync re-applies forever routing so allowed senders never drift back into Screening.

## 2.6.27
- **Unsubscribe in New Senders and Spam** — same silent unsubscribe + trash/block follow-up as reading an email.
- **Unsubscribe all with links** bulk action on New Senders and Spam.
- MoneyBox hover actions also offer Unsubscribe; shared control used across modules.

## 2.6.26
- **Snooze / On Hold badges update immediately** when you mark mail — sidebar counts stay in sync (and toast shows the new total).
- Fixed a bug that hid Snooze/On Hold counts when message bodies weren’t loaded yet, and that cleared those flags on reload.
- **Unsubscribe** always shows on inbound mail; stronger link detection.
- **Block forever** / **Unblock sender** on the email toolbar, Contacts, and Spam — undo accidental blocks anytime.
- Fixed Allow/Not-spam leaving mail stuck in Spam.

## 2.6.25
- **Unsubscribe** silently uses List-Unsubscribe / one-click / body links (HTTP or mailto), then shows **✓ Unsubscribed**.
- After a successful unsubscribe, choose **Trash all**, **Block all**, or **both** from that sender — or keep their mail.
- Stronger unsubscribe link detection in HTML and plain-text bodies; trash/block sync to IMAP when connected.

## 2.6.24
- When reading mail, **Previous emails from this person** shows other conversations with that sender.
- Expand any prior email to read the full thread, reply in place, open it, or **Link into this conversation**.
- Sync links replies via In-Reply-To / References (real conversation threading), not only matching subjects.

## 2.6.23
- **Strict account isolation**: Highlights, attachments, collections, workflows, search, and dock lists never show another inbox’s data.
- Opening cross-account items no longer shows the “belongs to another account” toast — those items are hidden instead.
- **Old mail / Search server** works for **every IMAP provider** (Gmail, Yahoo, AOL, custom) — All Mail/Archive when available, otherwise Inbox + Sent (+ common Archive folders).

## 2.6.22
- **Old mail**: MoneyBox has Search server + Load older batch so you can reach Gmail history beyond the recent sync window.
- **Search** runs against the mail server (Gmail All Mail when available) and downloads matches into this account.
- Recent sync window raised to **100** inbox messages (was 50).
- Search/older imports land in MoneyBox (not buried in New Senders).

## 2.6.21
- **Click a calendar date** to open a popup with **all events** for that day.
- From the day popup: edit or delete events, or **New event** with a quick form (title, times, location, notes).
- Month cells show “+N more” / “Click for all”; week/day headers and agenda dates open the same day sheet.
- Escape or backdrop click closes the popup.

## 2.6.20
- Calendar timezone clocks are **smaller and side-by-side** in one neat strip (easy ET ↔ PT comparison, less vertical space).
- Clocks sit next to the Calendar title; update on the minute.
- Dual-timezone settings won’t let primary and secondary be the same zone; event time hints no longer duplicate identical conversions.

## 2.6.19
- **App password UI stays hidden** when a Gmail/Yahoo/AOL account is already connected and working.
- Settings → Accounts opens your working address first (not a blank Gmail “Add” form with the purple App Password card).
- Only shows “App password required” after a real auth failure, missing secret, or when you click **Update app password…**.
- Heals stale “needs password” flags left by older builds / network errors that wrongly matched “login”.

## 2.6.18
- Fix main-process crash dialog (`read EHOSTUNREACH` / TLS) when the network or a mail host is briefly unreachable.
- Network blips are logged quietly — mail sync and update checks no longer pop the scary Electron error box.
- Hardened IMAP, updater, and unsubscribe HTTP sockets against late TLS errors.

## 2.6.17
- Calendar header shows a neat live clock for your **local timezone** by default.
- Optional second timezone (e.g. Eastern + Pacific) — pick both in Settings → General → Calendar timezones.
- When dual timezones are on, start/end times show both conversions above the time fields.

## 2.6.16
- New calendar events auto-fill **end time = start + 45 minutes** (proper AM/PM via system time picker).
- Changing start keeps the current duration, or uses the default when end wasn’t after start.
- Settings → Mail → **Calendar event defaults** for duration and default reminder.

## 2.6.15
- **Unsubscribe** on email view when a list has a List-Unsubscribe / unsubscribe link.
- One click runs silently in the background (one-click POST, HTTP, or mailto) — success shows a green ✓ **Unsubscribed**.
- Button only appears when an unsubscribe link is available.

## 2.6.14
- **Background mail sync no longer steals your screen** — editing templates, signatures, calendar events, compose, etc. stays put when mail checks run.
- Sync refreshes mail data in place; it does not jump to MoneyBox / New Senders or wipe in-progress form drafts.
- Quiet when nothing new arrives (no “Already up to date” toast spam on auto-check).

## 2.6.13
- **mailto: links stay in Envision Mail** — no longer hand off to Outlook (which was restoring unrelated draft text, including other people’s notes).
- New mail from a link or **Write** always starts **blank** (body never prefilled). Only To / Cc / Bcc / Subject come from the link when present.
- Compose **Discard** clears the draft. App can register as the system mailto handler.

## 2.6.12
- **Teams meetings**: no more fake join links. Creates meetings only via **Microsoft Teams installed on this computer**, signed in as **you**.
- If Teams isn’t installed, the option is disabled with clear guidance.
- Flow: Open Teams → create meeting with your account → paste the real Join link.

## 2.6.11
- **Fix Mac auto-update**: bypass broken ShipIt signature checks; download the real latest zip from GitHub and replace the app on Restart.
- Ignore stale pending zips (e.g. old 2.6.6 left in cache) — only install the matching latest version.
- About → Check for updates waits for download and offers **Restart & install**.
- **Windows installer** shipped again with this release (`EnvisionMail-*-win-x64-Setup.exe` + `latest.yml`).

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
