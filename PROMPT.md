# Cursor Task Execution Instruction

## Task Description
Product-confirmed feature request for the joinUp project only.
Stay strictly inside this repository. Do not touch other projects or system paths.

Upgrade the existing group/team management feature for a game in joinUp, implementing changes consistently across both the web frontend and the mobile app frontend. Requirements: (1) Game creator can set two schedule times per game — a lottery/draw time and a picking-phase start time — both editable later. (2) At the lottery time, the system automatically runs a randomized draw to assign a fixed rotating turn order among the game's existing managers (typically 2-4 per game); the manager who created the game can manually override/reorder this sequence. (3) At the picking-phase start time, the picking session opens automatically (no manual "start" action needed). (4) Build a manager-only live "team management" screen showing: real-time online/offline presence indicators for each manager, the current turn indicator, the pool of unassigned "bench" players (all players registered to the game not yet assigned to a team), and each team's picks as they happen live for all managers simultaneously (real-time sync required) — no time limit per pick. (5) If it's a manager's turn and they are offline, the game creator gets UI controls to either pick a player on that manager's behalf or wait (no skip/forfeit option should exist). (6) Add a group chat visible to all managers during the picking process (separate from/in addition to the existing private chat feature already in the app — do not modify existing private chat). (7) Implement a player swap/trade feature usable at any point (during or after the picking phase): any manager can propose swapping specific players with another manager's team, the trade only executes after the receiving manager explicitly approves it, and the affected players receive no notification about the swap — it's manager-only visibility. Ensure all real-time elements (presence, live picks, chat, trade proposals/approvals) sync properly across both web and mobile clients.

## Strict Instructions for Cursor / Antigravity Agent
1. **Branching:** Create and switch to a new feature branch before editing code:
   `git checkout -b feature/task-1785080202106`
2. **Autonomy:** Run in non-interactive/auto-approve mode. Do NOT prompt for permission on file edits or terminal commands.
3. **Verification & Completion:**
   - Execute tests/validations to confirm correct behavior.
   - Stage all changes, commit them with a clean descriptive message, and push the branch to the remote origin.
4. **Do not delete PROMPT.md or .cursorrules** until after commit (E2E verifies them).
