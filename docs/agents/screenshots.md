# Automated Screenshots & Design Assets (joinUp)

This guide documents the screenshot capture workflow, storage conventions, and indexing required before handing visual inspection tasks to the design agent.

## Core Rule: Scripted, Never Interactive

Frontier models (such as Claude Opus) running design reviews must **never** be tasked with exploring the app, installing dependencies, or taking screenshots interactively. Capturing screens in an interactive session burns excessive tokens and leads to flaky results.

**Always script or pre-capture screenshots** against the shared Dev environment (`https://join-up-app-git-dev-yair-klausners-projects.vercel.app` and `https://joinup-dev-api.duckdns.org`) using Playwright or Maestro before engaging the design agent.

## Directory Layout

All captured screens are committed into `docs/design-screens/` organized by feature or workflow topic:

```
docs/design-screens/
  └── <feature-or-topic>/
      ├── INDEX.md
      ├── web-<screen-name>-<theme>.png
      └── mobile-<screen-name>.png
```

## `INDEX.md` Format

Each topic directory must contain an `INDEX.md` file cataloging the captured assets with links to source code and routes:

```markdown
# Screen Index: <Feature or Flow Name>

| Screen Name | File | Route | Source Component | Auth / User State |
|---|---|---|---|---|
| Tournament Overview | `web-overview-dark.png` | `/tournaments/[id]?tab=overview` | `next_app/src/components/tournaments/shell/TournamentPage.tsx` | `organizer-o` (creator) |
| Match Results Modal | `web-result-modal-dark.png` | `/games/[id]` | `next_app/src/components/results/MatchResultDialog.tsx` | `adult-a` (player) |
| Mobile Home Feed | `mobile-home.png` | `/(tabs)/home` | `mobile_app/app/(tabs)/home.tsx` | `adult-b` |
```

## Screenshot Scripts

### Web (Playwright)

Use Playwright scripts running against the Dev deployment (or local build with test seed). Capture full pages or specific components:

```bash
cd e2e
BASE_URL=https://join-up-app-git-dev-yair-klausners-projects.vercel.app \
API_URL=https://joinup-dev-api.duckdns.org \
E2E_SKIP_WEBSERVER=1 \
npx playwright test tests/screenshots.spec.ts
```

In your test script:
```typescript
import { test } from '@playwright/test';
import { signIn } from './support/auth';

test('capture tournament page', async ({ page }) => {
  await signIn(page, 'organizer-o+clerk_test@example.com', '424242');
  await page.goto('/tournaments/seed_tournament_1');
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: '../docs/design-screens/tournaments/web-overview-dark.png',
    fullPage: true,
  });
});
```

### Mobile (Maestro)

In Maestro flows, use the `takeScreenshot` command:

```yaml
appId: com.joinup.app
---
- launchApp
- runFlow: subflows/auth/sign-in.yaml
- tapOn:
    id: "tab-home"
- takeScreenshot: ../docs/design-screens/home-refresh/mobile-home
```

## How to Request a Screen Review from the Design Agent

When asking the design agent for feedback or UI improvements:
1. Ensure the screenshot has been captured and committed under `docs/design-screens/<topic>/`.
2. Reference the exact file path and attach the relevant row from `INDEX.md`.
3. Provide the explicit component file paths that need editing.
4. Specify that the design agent should only review the provided images and edit the code directly without attempting to boot servers or explore the UI.
