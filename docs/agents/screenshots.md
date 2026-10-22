# Scripted Screenshots for Design (joinUp)

Screenshots for the design agent are captured via automated scripts against the shared Dev environment. Do not browse or explore the app to capture or refresh these.

## Storage & Folder Layout

All screenshots are stored under `docs/design-screens/`:
- `docs/design-screens/INDEX.md` — Catalog of all screens with routes, sources, themes, and capture status.
- `docs/design-screens/web/<feature>/<screen-id>-<light|dark>.png`
- `docs/design-screens/mobile/<feature>/<screen-id>-<light|dark>.png`

Web screen IDs include the viewport (e.g. `profile-desktop`, `profile-mobile`).

## How to Run

### Web (Playwright)
```bash
cd next_app && npm run screens:web
# Filter by screen id or feature:
cd next_app && npm run screens:web -- --grep <screen-id|feature>
# Regenerate INDEX.md table without capturing:
cd next_app && npm run screens:web -- --index-only
```
- Targets `BASE_URL`, defaulting to the Dev preview (`https://join-up-app-git-dev-yair-klausners-projects.vercel.app`).
- Uses Clerk test keys in the shell or `server/.env.maestro` (`CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY`: `sk_test_...` / `pk_test_...`).
- Does not start a local web server.

### Mobile (Maestro)
```bash
cd mobile_app && npm run screens:mobile
# Filter by feature:
cd mobile_app && npm run screens:mobile -- --feature <profile|match-results|tournaments>
```
- Runs Maestro flows under `mobile_app/.maestro/screenshots/`.
- Requires an Android device/emulator with the Dev API build.
- Seeded users (`adult-a`, `adult-b`, `minor-c`, `organizer-o`) have no password; the flow inputs code `424242` when `sign-in-code` is visible, otherwise expects an existing session.

## `INDEX.md` Format

`docs/design-screens/INDEX.md` tracks the status of all screens in the following table format:

| screen id | platform | route/screen | source file | theme | last captured (sha, date) |
| --- | --- | --- | --- | --- | --- |
| profile-desktop | web | /profile | next_app/src/app/profile/page.tsx | light | <sha> <date> |
| profile-desktop | web | /profile | next_app/src/app/profile/page.tsx | dark | <sha> <date> |

## Stale-File Rule (Mandatory)

- A screenshot row is valid only when `last captured` contains a commit SHA and date (`<sha> <date>`).
- **On Failure or Stale**: If a screen capture fails or becomes obsolete, delete the PNG file or mark the row as `failed` or `stale`. Never leave an outdated or broken screenshot in `docs/design-screens/`.
- Any un-captured row is marked `not yet`.

## How to Add a Screen

1. **Web**: Add a `ScreenDef` to `next_app/e2e/screenshots/screens.ts` specifying `id`, `feature`, `route`, `user`, and `source` component.
2. **Mobile**: Add a Maestro flow under `mobile_app/.maestro/screenshots/` (e.g. `<feature>.yaml`).
3. Add corresponding rows to `docs/design-screens/INDEX.md`.
4. Run the screenshot runner and commit both the captured images and the updated `INDEX.md`.
