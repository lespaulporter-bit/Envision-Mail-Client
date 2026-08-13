<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Cloud Agents use [Builds](https://cursor.com/docs/cloud-agent/builds): `install` in `.cursor/environment.json` (`npm ci`) runs while creating a Build so `node_modules` is ready before the session starts.

- Prefer `npx tsc --noEmit`, `npm run lint`, and `npm run build:web` to verify changes. Do not run `npm run pack:mac` / `pack:win` / `pack:release` in the Cloud VM — those need macOS/Windows desktop packaging.
- Web UI: `npm run dev` (port 3000). Desktop Electron flows (`dev:desktop`, installers, auto-update) are for local Mac/Windows only.
- Never wipe live dealership/user data, never auto-mint webhooks, and do not change Garage View without explicit approval (see workspace user rules).
- Commit and push to `main` when the user asks to ship; do not wait on PR merges unless they explicitly request a PR.