# Envision Mail Client

Desktop email + calendar for Envision DMS (Electron + Next.js static export).

**Repositories**
- GitHub: [lespaulporter-bit/Envision-Mail-Client](https://github.com/lespaulporter-bit/Envision-Mail-Client)
- Railway: project **Envision Mail Client** (public status / release pointer only)

## Data safety

Updates **never** overwrite user mail data. Accounts and app state live under Application Support (`envision-mail-state.json`, `envision-mail-accounts.json`) and are left intact across installs and auto-updates.

If you see “needs password” after migrating from Les Mail, paste a new app password in **Settings → Accounts** — mail history stays on the Mac.

## Installers

Build with `npm run pack:mac` / `npm run pack:win`. Published artifacts go to GitHub Releases for `electron-updater`.

| File | Use |
|---|---|
| `release/Envision Mail-*-mac-arm64.dmg` | Apple Silicon |
| `release/Envision Mail-*-win-x64-Setup.exe` | Windows |

## Dev

```bash
npm install
npm run dev:desktop
```
