# Maestro E2E plan for `mobile_app`

Status: approach + 4 smoke flows implemented and executed locally. All four smoke flows passed on a
Windows host against the local E2E backend and an Android 34 emulator — see [Verification status](#verification-status).
CI with only the listed env vars is still unrun.

## 1. What we learned about the app

| Area | Finding | Consequence for tests |
| --- | --- | --- |
| Stack | Expo SDK 54 / RN 0.81 (new arch), expo-router, NativeWind, Hebrew-first UI (RTL, `t('key','עברית')` fallbacks), runtime EN/HE toggle | Never match app chrome by visible text; use `testID` (Maestro `id:`). Only user-generated text (game title, chat message) is matched by text. |
| Auth | **Clerk** (`@clerk/clerk-expo`): email + password with **email-code verification**, plus OAuth buttons. `AuthGuard` in `app/_layout.tsx` redirects. Server verifies Clerk JWTs and calls Clerk's backend API (`server/utils/auth.js`). | Real e-mail/SMS/OAuth cannot be automated → use a **Clerk development instance**: any address containing `+clerk_test` is a test address, no mail is sent and the code is always `424242`. Production (`pk_live_…`) does not support this and must never be used (it would create real accounts). |
| Onboarding | After first sign-in `AgeGate` (full-screen overlay) needs a birth date (native Android date dialog) + terms checkbox | Part of the shared `auth/sign-up` subflow. The dialog opens on 2008-01-01 (adult), so only "OK" is tapped. |
| Navigation | Bottom tabs fields / search / home / chats / friends; `game/new`, `game/[id]`, `chat/[id]`, `user/profile` (sign-out) | testIDs on tabs (`tab-*`) and key controls. |
| Data | Games are created via REST from the form; the form needs ≥ 1 **field** from the DB (`new-game-field-0`) | The test DB must be seeded with fields (`server/scripts/importFieldsFromCsv.js` + `weplay_courts_export.csv`). |
| Builds | `eas.json` profiles all bake in the **live** API + live Clerk key. `runtimeVersion` uses the fingerprint policy (`fingerprint.config.js`). | E2E needs its own build against a test backend + Clerk dev key. No new EAS profile (it would diverge silently); `npm run e2e:build:android` does a local `expo prebuild` + `assembleRelease` with env overrides. `maestro/`, npm scripts and testIDs are JS/non-native, so they do **not** change the OTA runtime fingerprint. |
| Existing hooks | Only ~23 `accessibilityLabel`s (translated → unusable) and no `testID`s | We add `testID`s only (no behaviour change). |
| Cleartext | Release Android builds block `http://`; the emulator reaches the host at `10.0.2.2` over http | `build-android.mjs` patches `usesCleartextTraffic` into the *generated* (gitignored) manifest only. |

## 2. Deterministic environment

**Backend** — never staging/production; a throwaway one per run:
* Local: `server/` on a local Postgres (Docker) or a Neon *branch*, `npx prisma migrate deploy`, import the fields CSV, `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY` of the **E2E Clerk dev instance**, `npm run dev` (port 3005).
* CI: Postgres service container + the same steps (`.github/workflows/mobile-e2e.yml`).

**Users** — created *by the flows* through the real sign-up screen with unique
`e2e-<a|b>-<runId>+clerk_test@example.com` addresses (`maestro/scripts/gen-run-data.js`). No seeded password and no
API reset endpoint needed; every flow starts with `launchApp: clearState`. Games get a unique title
(`E2E Game <runId>`), so runs never collide even on a shared DB. Leftover users/games in the dev Clerk
instance / E2E DB are harmless; clean them periodically (Clerk bulk delete / DB reset).

**Time** — the new-game form defaults to "today, next full hour" and rejects past times, so runs between
~23:00–00:00 (device local time) can fail. Run the gate outside that window; later improvement: a date-picker subflow.

**Blockers removed** — no real SMS/e-mail (`+clerk_test`), OAuth unused, Sentry DSN blanked in the E2E build, maps/push not touched by the 4 flows.

## 3. Layout & conventions

```
mobile_app/maestro/
  config.yaml            workspace config (flows glob, execution order)
  flows/                 ONLY runnable tests: NN-name.yaml, each tagged
  subflows/<domain>/     reusable steps: auth/sign-up, auth/sign-out, game/create, common/launch-clean
  scripts/               gen-run-data.js (Maestro JS), run.mjs (runner), build-android.mjs
  README.md              how to write flows + testID registry
  .artifacts/ .reports/  gitignored (APK, JUnit + debug output)
```

* **testID naming**: kebab-case `<screen>-<element>` (`sign-up-email`, `new-game-submit`, `chat-send`); tabs `tab-<name>`; list items `<entity>-card-<id>` or `<screen>-<entity>-<index>`. Add IDs in the component, never change styling/logic. IDs are a contract: rename = update flows in the same PR.
* Flows are self-contained (own user, clean state, no cross-flow state) so they can run in any order or shard.
* Shared steps live in `subflows/`, parameterised with `env:`; flows read generated data from `output.*`.
* `extendedWaitUntil` with explicit timeouts for network transitions; no fixed sleeps.
* Locale-independent: only `id:` selectors and OS ids (`android:id/button1`); generated ASCII text is the one text exception.

## 4. Running

* **Local (Windows 11)**: install Maestro (Java 17+, `maestro` on PATH), start an AVD (API 34, Google APIs), start the E2E backend, build once with `npm run e2e:build:android` (Android SDK + `pk_test_` key in `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`), then `npm run e2e:smoke`. One flow: `node maestro/scripts/run.mjs --flow maestro/flows/01-sign-up.yaml`. `maestro studio` for authoring.
* **CI**: `.github/workflows/mobile-e2e.yml` on `ubuntu-latest`: Postgres + server + APK build + `reactivecircus/android-emulator-runner` + Maestro. Triggered manually or by pushing a tag `mobile-release-*`. Secrets: `E2E_CLERK_SECRET_KEY`, `E2E_CLERK_PUBLISHABLE_KEY`. JUnit report + server log are uploaded. Release procedure: tag → green gate → `eas build`/submit.
* EAS Workflows / Maestro Cloud are alternatives if emulator-in-Actions is slow/flaky; flows stay unchanged.

## 5. Scaling plan

1. **Tags**: every flow has `smoke` (release gate, < 10 min) or `full`, plus a domain tag (`auth`, `game`, `chat`, later `friends`, `profile`, `fields`). `npm run e2e:smoke` = gate; `npm run e2e` = everything; `maestro test maestro/ --include-tags=chat` = one domain.
2. **Subflows** grow into a vocabulary: `auth/sign-in`, `game/join`, `friends/add`, `common/open-tab`; ≤ ~15 steps each, parameterised.
3. **Second actor**: flows needing two users (join, cross-user chat, friend requests) currently sign A out and B in on one device. Later: API-seeded data (Clerk Backend API + `POST /api/games`, a `maestro/scripts/seed.mjs`) or two emulators, once runtime matters.
4. **Sharding**: flows are independent → `maestro test --shard-split N` / parallel emulators.
5. **iOS**: testIDs are cross-platform; add a macOS-runner simulator job and replace `android:id/button1` with a platform `when:` branch.
6. **Reporting**: JUnit is emitted; add failure screenshots (`--debug-output` is on) and a notification step.
7. **Flake budget**: a flow retried > 1× or failing > 2 % over 20 runs gets fixed or quarantined (tag `quarantine`, excluded in CI).

## Verification status

Ran on a Windows host against the local E2E backend (Docker Postgres `:5544`, API `:3005`), an Android 34
emulator (`e2e34`, `Asia/Jerusalem`), and an x86_64 release APK. All four smoke flows passed
(JUnit under `mobile_app/maestro/.reports/`, device `e2e34`):

| Flow | Result | Time |
| --- | --- | --- |
| Sign up a new user | PASS | 1m 43s |
| Create a game | PASS | 2m 48s |
| Join a game created by another user | PASS | 4m 54s |
| Send a chat message in a game chat | PASS | 3m 14s |

Confirmed on that run: the organizer is a participant of their own game (`game-open-chat`); booking tomorrow at 12:00
and opening `home-date-1` shows the game to the second user; `android:id/button1` dismisses the date dialog and the
join-success alert; the release build + cleartext patch works on Windows. The release socket client must keep
`http://10.0.2.2` / localhost on http, or chat sends fail while REST still works. CI with only the listed env vars
is still unrun.
