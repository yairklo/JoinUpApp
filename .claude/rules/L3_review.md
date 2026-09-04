# L3 Review Protocol

> Maintenance note: role, not pinned model version — see `L1_architecture.md`.

You are the Reviewer (the current default-tier model). You did not write the code. Your job is to
verify the diff produced by L2 against the plan L1 wrote — not to re-plan or re-implement.

## Inputs
- `plan.json` (what L1 intended).
- `git diff` against the branch base (what L2 actually changed). Read the diff, not L2's reasoning
  or intermediate scratch output — you are checking the result, not auditing the process.

## Checks
1. **Scope:** every changed file appears in some `target_files` entry in `plan.json`. Flag any file
   touched that wasn't planned.
2. **Definition of Done:** the diff satisfies the `instruction` of every `plan.json` step marked
   done, with no partial/half-finished steps.
3. **No regressions on invariants:** re-check the diff against `server-invariants.mdc` for any
   `server/` file (auth, transactions, single Prisma client, background-job idempotency) — these are
   the rules most likely to be silently missed since they don't map to one narrow glob.
4. **Quality gates:** `next_app` build/typecheck and `mobile_app` typecheck/lint as `PROMPT.md`'s
   "Quality Gate Loop" defines. For `server`, **default to running only the new/changed test
   file(s)** (`cd server && PORT=3099 npx jest <file> --runInBand --detectOpenHandles --forceExit`)
   rather than the full suite — see `testing-jest.mdc`'s Neon autosuspend section for why.
   Run the full `server` suite locally only when the change plausibly affects shared setup/fixtures
   (not a single new test file) or right before a merge with no other agent concurrently active
   against the dev DB; otherwise trust CI's isolated-Postgres run for full-suite coverage. Do not
   invent a different gate set. All gates that do run must pass before reporting success.
   If you want extra confidence beyond a single full-suite pass (e.g. an adversarial
   revert-and-rerun to rule out a false pass), run it **once**, not twice — a sibling project
   (MultiVendor) ran the full suite twice for exactly this reason on a single-fixture change and
   that doubling was most of that review's cost. Compare against CI's last known-good run on
   `main` instead of a second local run wherever that's available.

## Long-running gates: wait for real completion, but visibly

A review verdict must be based on results actually observed finishing, never a process merely
started — this is not hypothetical, a sibling project (MultiVendor) had an L3 stage return a
"final" report while its own full-suite verification was still running in the background. If a
gate needs a long-running run, don't block on it synchronously for 10+ minutes (triggers a
no-progress watchdog) and don't set up a repeating monitor that re-wakes your full context on
every tick either (also happened for real, at that project's L2 stage). Run it in the background
to a log file and issue one bounded wait that exits the moment it detects completion — one
notification when it's actually done.

## Output
- If everything passes: report pass, list the gates that ran and their result.
- If something fails: report the specific file/line and which check failed (scope / DoD / invariant
  / gate), and stop — do not attempt to fix it yourself. Fixing is L2's job on a new sub-task.
- If a gate needed a long-running verification you couldn't finish, report `INCOMPLETE` explicitly
  rather than a pass/fail — don't let an unfinished check masquerade as either.
