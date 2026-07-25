# Les Mail 4.1

LesBox email + calendar with real IMAP/SMTP, auto-detect for hosted domains (Stackmail/20i), Teams invites, read receipts, scenic backgrounds, templates, and auto-fetch.

## Installers

| File | Use |
|---|---|
| `release/Les Mail-4.1.0-mac-arm64.dmg` | Apple Silicon (M1–M5) |
| `release/Les Mail-4.1.0-mac-x64.dmg` | Intel Mac |
| `release/Les Mail-4.1.0-mac-*.zip` | Zip fallback |
| `release/Les Mail-4.1.0-win-x64-Setup.exe` | Windows |
| `release/Uninstall Les Mail.command` | One-click Mac uninstall |

```bash
npm install
npm run pack:mac
npm run pack:win
```

## Connect envisiondms / hosted mail

1. Settings → Email accounts  
2. Enter your email + password  
3. Click **Auto-detect from email** (fills `imap.stackmail.com` / `smtp.stackmail.com` for Stackmail/20i)  
4. **Test connection** → **Save account** → Sync  

## Highlights

- **LesBox** email triage
- Auto-detect IMAP/SMTP from your domain (Stackmail, Gmail, Outlook, iCloud…)
- Clear IMAP/SMTP errors (no more opaque “Command failed”)
- Email templates + snippets + signatures as dropdowns in compose & replies
- Unlimited accounts + signature templates with images
- Calendar Teams links + email .ics invites
- Read receipts
- Rotating backgrounds: ocean / forests / stars
- Easy uninstall
