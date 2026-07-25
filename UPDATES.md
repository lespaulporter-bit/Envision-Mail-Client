# Envision Mail updates

## 2.6.0
- Automatic update check every **60 days**; downloads newer versions when the update feed has them.
- Settings → About shows last/next check and **Check for updates now**.
- Update feed: `https://updates.envisiondms.com/envision-mail` (override with `ENVISION_MAIL_UPDATE_URL`).

2.5.0
- **Critical:** App data (collections, mail cache, signatures, settings) now saves to a durable file in Application Support — no longer wiped when the app updates or restarts.
- Fixed random localhost port that made browser storage look empty every launch.
- Restored Les Mail threads/collections/contacts/signatures into Envision Mail.
- Previously read mail visible in MoneyBox $; SMTP send errors clarified; Sent read-receipt ✓.

## 2.4.0
- Previously read mail tabs; legacy accountId visibility; SMTP send fixes; Sent receipt checks.

## 2.3.0
- Removed HEY branding; renamed borrowed feature labels; teal CTAs.
