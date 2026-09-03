# Claude Routing Pointer

Welcome to the workspace. Follow these pointers for context:
1. **Architecture & Planning (L1)**: Read .claude/rules/L1_architecture.md.
2. **Execution & Implementation (L2)**: Read .claude/rules/L2_execution.md.
3. **Review (L3)**: Read .claude/rules/L3_review.md.
4. **Memory & Lessons**: Read AGENTS.md and .cursor/rules/.
5. **Current Task**: Check PROMPT.md and plan.json.

Use `.graph-context.md` (lightweight dependency graph, `npm run build:graph`) for high-level structure and `ast-grep`/Grep for targeted searches.

> [!WARNING]
> Creating branches and commits is fine. Do NOT push to `main` (directly or via merge/force-push) — pushes to `main` are owned by the external dispatcher (dispatch-task.js) / the user. Pushing a feature branch or opening a PR for review is fine; ask first if unsure.
