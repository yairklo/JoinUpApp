# Maestro E2E tests

Full rationale: [`docs/qa/maestro-e2e-plan.md`](../../docs/qa/maestro-e2e-plan.md).

## Prerequisites (once)
1. [Maestro CLI](https://docs.maestro.dev/getting-started/installing-maestro) (+ Java 17) on PATH, Android SDK, an emulator (API 34).
2. A **Clerk development instance** for E2E (email + password, email-code verification enabled). Use its `pk_test_…` / `sk_test_…` keys.
3. A test backend: `server/` pointed at a throwaway Postgres and that Clerk instance, fields seeded
   (`cd server && node scripts/importFieldsFromCsv.js ../weplay_courts_export.csv`), listening on `:3005`.

## Run
```bash
cd mobile_app
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx npm run e2e:build:android   # -> maestro/.artifacts/app-e2e.apk
npm run e2e:smoke                                                         # install APK + run tag "smoke"
node maestro/scripts/run.mjs --flow maestro/flows/01-sign-up.yaml         # one flow
```
Reports: `maestro/.reports/` (JUnit + debug output). CI: `.github/workflows/mobile-e2e.yml`.

## Writing a flow
* New file `flows/NN-name.yaml` with `appId`, `name`, `tags` (`smoke` only for release-gate flows, plus one domain tag).
* Start with `runScript: ../scripts/gen-run-data.js` and `runFlow: ../subflows/common/launch-clean.yaml`; sign up through
  `subflows/auth/sign-up.yaml` (`env: EMAIL, PASSWORD`). Never reuse accounts between flows.
* Select by `id:` (a `testID`). Add the `testID` in the component (`<screen>-<element>`, kebab-case); don't match translated
  text. Generated data (`output.gameTitle`, `output.chatMessage`) is the only text you match.
* Use `extendedWaitUntil` with a timeout instead of sleeps; move repeated steps into `subflows/<domain>/`.
* Add the flow to `executionOrder` in `config.yaml`. Use `maestro studio` to inspect the view hierarchy.

## testID registry
* Auth: `sign-in-email|password|submit|to-sign-up`, `sign-up-email|password|terms-checkbox|submit|code|verify`, `age-gate-birthdate|terms-checkbox|continue`
* Nav: `tab-fields|search|home|chats|friends`, `header-profile`, `profile-sign-out`
* Games: `home-create-game`, `new-game-title|field-<i>|submit`, `game-card-<id>`, `game-join-button`, `game-open-chat`
* Chat: `chat-input`, `chat-send`
