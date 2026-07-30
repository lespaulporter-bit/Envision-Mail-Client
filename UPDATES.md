# Envision Mail updates

## 2.6.46
- **Teams, Zoom, and Meet links are now clickable everywhere an event shows up** — the day list, the day popup, agenda, Day Cover, and reminder pop-ups all get a **Join Teams meeting** button that opens the meeting in your browser (which hands off to the Teams or Zoom app).
- **A join link buried in an event's Notes or Location now works.** Mac Calendar events keep the Teams URL in the notes field, so those meetings were unreachable text before; Envision Mail now finds the link, labels it with the right service, and saves it on the event.
- The label follows the actual link, so a Teams meeting is no longer mislabeled because the Location field says "Zoom".
- Month and week event chips show a small camera icon when the event has a meeting link.
- URLs typed into event notes stay readable and clickable, and notes are no longer clipped to two lines in the day popup.
- **Links inside plain-text emails are clickable now** instead of printing as dead text; existing links in HTML mail are untouched, and all of them open in your browser rather than inside Envision Mail.
- Snippets show working links too.
- Pasting a join link into an event's Location or Notes is enough — invites and the attached `.ics` carry the same link the calendar shows.

## 2.6.45
- **Double-click an attachment to open it.** Images, PDFs, and text/CSV files open in a preview window inside Envision Mail; anything else opens in the Mac or Windows app you normally use for that file type.
- **Right-click an attachment to save it straight to your Desktop.** Duplicate names become `invoice (2).pdf` instead of overwriting the file already there.
- The preview window also has **Open with default app**, **Save to Desktop**, and **Save as…**; **Open** and **Save** buttons sit on every attachment row for anyone who prefers clicking, and Enter opens the focused attachment for keyboard users.
- Attachments in the **Attachments** view behave the same way, and still link back to their conversation.
- Mail lists now show a **paperclip** on conversations that carry files, and a collapsed message says how many attachments it's hiding.
- Attachment bytes are pulled from your mail server on demand — a filename check keeps a stale message ID from ever handing back the wrong file, and search results stored under All Mail resolve correctly.

## 2.6.44
- **Double-click any calendar date** to open a stable day popup showing every event already scheduled there, with **New event** ready below.
- Single-click still opens the same popup — nothing was taken away.
- Fixed double-clicking briefly opening and then closing the popup when the second click landed on the new overlay.
- The day popup now ignores search and hidden-calendar filters so an existing appointment can never disappear from the day’s schedule.
- Double-click works in month, week, day, and agenda date headers; event chips still open Edit without triggering the parent day action.

## 2.6.43
- The public MoneyBox $ preview now uses dealership customer messages: **“Can we meet at 1pm today?”**, **“How much for a down payment on Stock #4986?”**, and **“I’ll be by to bring payment at 5pm today.”**
- Longer customer subjects wrap cleanly while timestamps stay aligned.

## 2.6.42
- **Teams meetings from the day popup.** Clicking a day and adding an event now offers **Microsoft Teams meeting** — Teams opens on the date and time you picked, and you paste the real Join link back. (Desktop only; we never invent a join URL.)
- **Recipients in the day popup.** Add recipient emails right where you create the event instead of hunting for the full form.
- **Email notification when I save** — checked by default. Uncheck to add the event quietly; recipients get the invite and `.ics` automatically when it's checked.
- **Email recipients** button and a Join link now show on events inside the day popup, with "emailed / not emailed" status.
- Fixes: recipient addresses are validated and de-duplicated; RSVP replies are no longer reset to pending on every edit; a reminder set to **None** stays None; editing time or recipients clears a stale "invites sent" stamp; each recipient's `.ics` no longer lists everyone else's address; all-day invites use real all-day dates; invite emails escape HTML; editing a synced Mac event no longer turns it into a duplicate local copy.

## 2.6.41
- **New events follow your clock.** Opening Add event in the morning defaults Start/End to **AM**; after noon defaults to **PM** — no more jumping from 11 AM into 12 PM.
- Explicit **AM / PM** toggles under Start and End so you can flip the period without fighting the time spinner.
- Defaults round to the next 5-minute mark, but never cross noon or midnight silently.

## 2.6.40
- **You can always see what month you're on.** Calendar now shows a big **July 2026** heading above the grid, with ← / → on either side and **Today** beside it — the arrows used to move an invisible date.
- Week, day, and agenda views get the same heading: **Jul 26 – Aug 1, 2026**, **Thursday, July 30, 2026**, or the 14-day agenda range.
- **Weekday headers** (Sun–Sat) sit above the month grid.
- Spill-over days from the neighboring month are labeled **Jun 28**, **Aug 1** and sit on a greyer tile, so no date is ambiguous.
- Today's cell wears a **TODAY** pill, and **Today** highlights whenever you're looking at another month.
- Week and day column headers include the month (**Thu, Jul 30**) for weeks that straddle two months.

## 2.6.39
- **Easy Cleanup**: a new sidebar view that gathers lower-priority mail — Screening, New Senders, and Receipts from people you rarely email. Nothing moves until you select it.
- Filter, **Select all visible**, then **Move selected to Trash** (reversible — never a permanent delete). **Keep → MoneyBox $** protects a sender forever.
- MoneyBox $ and Reply Queue mail, On Hold, Snooze, Sent, Spam, Trash, and anyone you've emailed twice are excluded automatically.
- **Collapse / Expand** on every message header in an open email. Long threads open with just the newest message expanded; collapsed messages show a preview you can click to reopen.
- **Back** from an open email returns to the list you came from (including Easy Cleanup), and the sidebar keeps that list highlighted while you read.

## 2.6.38
- **Screening & New Senders**: **Reply Queue**, **Open**, and **Trash** — reply or delete without Allowing the sender into MoneyBox $.
- **Outlook-style multi-recipients**: paste comma-, semicolon-, or newline-separated addresses into To / Cc / Bcc — they all send.
- Address count on the field; Bcc-only send supported.

## 2.6.37
- **Day Cover** sits under All / Fresh / Previously read — above the Fresh list (not buried at the bottom).

## 2.6.36
- **Teams restored**: Create Microsoft Teams is always available in the desktop app again (2.6.35 hid it when detection lagged).
- **Open Teams** is more reliable on Mac (protocol + app launch fallbacks); works even before an event title is typed.
- Join link field stays **empty** — never auto-filled; Meet/example URLs are stripped.

## 2.6.35
- Meeting options only appear when **Microsoft Teams is installed** (ready on demand) — no Meet/Zoom prompts for users who aren’t set up.
- **Never auto-fill** a meeting URL; example links like `meet.google.com/abc-defg-hij` are rejected. Teams flow stays: Open Teams → create → paste the real Join link.

## 2.6.34
- **Countdown** now live-ticks to the event start (e.g. `02:14:37` or `3d 04h 12m`) — Calendar chips, event rows, and Day Cover.

## 2.6.33
- Calendar **New event** form loads **collapsed**; expand when you need it (time-slot click / Edit still opens it).

## 2.6.32
- Mail timestamps show **date and time** (e.g. Today · 9:10 AM, Jul 25 · 3:15 PM) — not time alone.
- Open message headers use the full date (e.g. Mon, Jul 27, 2026 · 9:10 AM).

## 2.6.31
- **Reply Queue** button on the email action bar — add mail to the queue (or open it if already queued).
- List hover actions use Reply Queue; toasts say “Added to Reply Queue.”
- Fixed the broken “Reply Queue queue” label near Send.

## 2.6.30
- Toasts and badges say **MoneyBox $** (never “lesbox”) when you move mail there — same friendly names for Screening, Receipts, etc.

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
