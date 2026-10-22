# Dev Environment Guide (joinUp)

The shared Dev environment is the live integration environment for joinUp. All testing and verification should happen here, not against local servers or production.

## Endpoints & URLs

- **Dev Web**: `https://join-up-app-git-dev-yair-klausners-projects.vercel.app` (Vercel Preview tracking the `Dev` branch)
- **Dev API**: `https://joinup-dev-api.duckdns.org` (Hosted on Coolify dev container)
- **Production**: `https://joinup-api.duckdns.org` / `https://joinup.co.il` — **NEVER TOUCH PROD**.

## Test Users & Authentication

Dev uses Clerk test keys (`pk_test_...` / `sk_test_...`). Test emails use the `+clerk_test` suffix, requiring no email delivery and using a fixed verification code.

- **OTP Code**: `424242`
- **Seeded Accounts** (see details in [`docs/dev-seed.md`](../dev-seed.md)):
  - `adult-a+clerk_test@example.com` — Adult player A
  - `adult-b+clerk_test@example.com` — Adult player B
  - `minor-c+clerk_test@example.com` — Minor player C (safety/privacy flows)
  - `organizer-o+clerk_test@example.com` — Organizer O (game & tournament organizer)

## Tournament Creation (`TOURNAMENT_CREATOR_IDS`)

On the Coolify dev API resource, tournament creation is restricted by default. To allow tournament creation during QA and testing:
- `TOURNAMENT_CREATOR_IDS` is configured in Coolify Dev environment variables containing `organizer-o` (or admin Clerk user IDs).
- Only users listed in `TOURNAMENT_CREATOR_IDS` or users with `isAdmin: true` can create tournaments.

## Vercel Ignored Build Step

Vercel is configured with an **Ignored Build Step** on the web project:
- Builds are skipped automatically if changes do **not** touch `next_app/` (e.g. `git diff --quiet HEAD^ HEAD next_app/`).
- Do not expect a Vercel build if a commit only modifies `server/`, `mobile_app/`, or `docs/`.
- If a web build is expected, verify in the Vercel dashboard that the deployment reaches **READY** status. (Note: `npm run lint` passing locally is NOT a substitute for `npm run build` or Vercel readiness).

## Deploy to Dev: Merge Commands

Deploying to the shared Dev environment means performing a clean, non-force merge of the current integration branch (e.g. `feat/results-tournaments`) into `origin/Dev`.

Run these commands from a temporary branch or worktree:

```bash
# 1. Fetch latest remote branches
git fetch origin Dev <integration-branch>

# 2. Checkout a clean temporary branch tracking origin/Dev
git checkout -b temp-dev-merge origin/Dev

# 3. Merge the integration branch without fast-forward
git merge --no-ff <integration-branch> -m "merge: <integration-branch> into Dev"

# 4. Push to origin Dev (NEVER use --force)
git push origin temp-dev-merge:Dev

# 5. Clean up temporary branch
git checkout <integration-branch>
git branch -D temp-dev-merge
```

### Deploy Rules
1. **Never push directly or force-push to `main`**. Merging to `main` happens only with Yair's explicit approval.
2. **Never force-push to `Dev`**.
3. **Confirm Vercel READY**: After pushing to `Dev`, monitor Vercel until the deployment status is `READY`.
