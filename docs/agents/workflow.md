# Multi-Agent Workflow & Orchestration (joinUp)

This guide documents the orchestration patterns, branching model, review requirements, and wave execution protocols for agent pairs working on joinUp.

## 1. Branching Model & Integration Branches

- **Main Branch (`main`)**: The production branch.
  - **NEVER push directly to `main`**.
  - **NEVER force-push to `main`**.
  - Merge to `main` only on Yair's explicit approval.
- **Integration Branches (e.g. `feat/results-tournaments`)**:
  - Major multi-agent efforts use a shared integration branch.
  - All sub-task branches target this integration branch.
  - Squash-merging completed sub-task PRs into the integration branch is **pre-approved**.
- **Dev Branch (`Dev`)**:
  - Tracks the shared Dev deployment (Coolify dev API + Vercel Preview).
  - Deployed by non-force merging the integration branch into `origin/Dev` in a temporary worktree or branch. See [`docs/agents/dev-env.md`](dev-env.md).

## 2. Worktree Isolation & Parallel Waves

To prevent concurrent agents from colliding or corrupting shared working copies:
- **Never work in the shared main checkout**. Always create an isolated `git worktree` (e.g. `.claude/worktrees/agent-*` or a task-specific directory).
- Commit early and often within your worktree.
- Check `git status` before committing to avoid staging accidental files or concurrent deletions.
- When organizing work across multiple agents (waves), partition file ownership cleanly:
  - For example, shell agents editing shared layouts/nav (home, header, profile) must not overlap with agents editing deep sub-views.
  - Run independent sub-tasks in parallel waves, with subsequent waves depending on the previous wave's squash-merge into the integration branch.

## 3. Code Review Protocol

- **Separate Reviewer Mandatory**: Every PR or non-trivial change must be reviewed by a **separate agent**, never the author agent who wrote the code.
- **L1 Fast Path Exception**: Trivial, low-risk changes flagged by `pipeline-triage.mjs` (see `.claude/rules/L1_architecture.md`) are exempt from separate review.
- **Review Scope**:
  - Verification of invariants in `.cursor/rules/*.mdc`.
  - Type checking (`cd next_app && npm run build`).
  - Unit/integration test verification (`cd server && npm test`).
  - Checking that no production secrets or un-scrubbed data paths are introduced.

## 4. Handoff to Design Agent (Opus)

When changes require a visual/design review pass by the dedicated design agent:
- The design agent is run manually by the user using an expensive high-tier model.
- **Do NOT ask the design agent to explore, install, or run the app**.
- Pre-capture all necessary screenshots using automated scripts against the Dev environment.
- Commit the images under `docs/design-screens/` with a complete `INDEX.md` mapping screens to routes and source files.
- See [`docs/agents/screenshots.md`](screenshots.md) for full instructions.
