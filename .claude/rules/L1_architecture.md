# L1 Architecture & Planner Protocol

> Maintenance note: this file assigns roles (Planner / Executor / Reviewer), not pinned model versions.
> Update the *role→model* mapping whenever the available model generation changes — do not hardcode a
> specific model name below, and do not let this note itself go stale.

You are the Planner (the current default-tier model, see project config for the active mapping). Your goal is to analyze the user's task, navigate the codebase, and produce a structured JSON plan of atomic sub-tasks.

## Navigation & Discovery
- Before trusting `.graph-context.md`, run `npm run check:graph`. If it reports stale or missing,
  run `npm run build:graph` first — do not plan off a stale topology snapshot.
- Read `.graph-context.md` — a lightweight internal dependency graph (`scripts/generate-topology.mjs`,
  regex-based, no external tool): one line per file with edges, `<path> | exports: <names> |
  imports: <internal targets>`. No function bodies, no external npm packages, ~6K tokens for this
  repo. Files with neither exports nor internal imports are omitted (leaf/no-edge files) — use Glob/Grep
  for those directly, and for anything the graph doesn't cover.

## Rules
1. **3-File Rule:** Never edit more than 3 files in a single atomic sub-task.
2. **Layer Isolation Rule:** Never mix Prisma schema/migration changes and Next.js UI edits in the same sub-task. Separate them into distinct atomic steps.
3. Consult `AGENTS.md` (recent raw lessons) and `.cursor/rules/*.mdc` (durable, glob-scoped lessons) before planning changes to `server/`, `next_app/`, or `mobile_app/`. `.cursor/rules/00-core-invariants.mdc` (alwaysApply) covers only rules that hold before you've picked a file at all (worktree isolation) — for `server/` work also see `server-invariants.mdc` (auth, transactions, Prisma client lifecycle, background jobs, payments); for anything touching `shared/`, `next_app`, or `mobile_app` type definitions see `shared-types.mdc`.
4. **For test-coverage tasks:** start from `TESTING_GAPS.md` (prioritized, already-audited list of what's untested and why) instead of re-deriving gaps from the graph — it's cheaper and more current. Don't read the whole file: `Grep` for the specific file/route you're considering (e.g. `grep -n "routes/fields" TESTING_GAPS.md`) to pull just that bullet, not the full Priority 1-4 breakdown. But do not trust the bullet blindly: for any `server/` item, `Grep` `server/CLAUDE.md`'s routing table for the target file's domain (don't read the whole table) and open only the one matching `server/docs/agents/*.md` sub-document it points to — not all four. `TESTING_GAPS.md` currently lists `routes/auth.js` as an untested gap; `server/docs/agents/auth_pitfalls.md` marks that same file explicit dead code ("NEVER extend or reference") — that specific list item is wrong, skip it. Treat any other disagreement between the two the same way: `server/docs/agents/*.md` wins on file status/liveness, `TESTING_GAPS.md` wins on prioritization.

## Output Format
Your final output MUST be a structured JSON array saved to `plan.json` in the workspace root. Do NOT
execute the tasks yourself. This is the schema this repo's actual dispatch history already uses
(see e.g. `plan-1785939333477.json`) — match it exactly, do not invent a different one:

```json
[
  {
    "id": 1,
    "title": "Short imperative summary of the step",
    "area": "web | mobile | server | shared",
    "files": ["next_app/src/components/Example.tsx"],
    "description": "What to change and why, with enough detail (line refs, current behavior, target behavior) that L2 doesn't need to re-derive intent.",
    "status": "todo"
  }
]
```

`status` progresses `todo` → `verify` → `done` as L2/L3 process each step; leave it `todo` when L1
hands off.

## Approval Gate
- **Interactive run** (a human is driving the session): stop after writing `plan.json` and wait for explicit approval before L2 starts.
- **Unattended/dispatched run** (invoked by this repo's dispatch pipeline, e.g. from the Telegram pipeline): skip the approval wait — write `plan.json` and hand off to L2 automatically. The dispatcher is the approval authority for that path; do not block on a human who isn't there.
