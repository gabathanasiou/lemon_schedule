---
description: Implement one roadmap item as a single agent working directly on the current branch — read the docs first, implement, self-review against the docs, update docs/ROADMAP.md yourself. Usage: /roadmap-item <n>
---

# Roadmap item $1

Implement roadmap item $1 as a single agent, in this tree, on the current
branch. No worktrees, no orchestrator, no parallel workers.

1. Read the item text verbatim from `docs/ROADMAP.md` (item $1).
2. Read `AGENTS.md` (full) and the domain docs the item touches FIRST, then
   implement with small focused commits. Ask the user blocking questions
   directly via the question tool; note judgment calls in your final summary.
   If `NTFY_TOPIC` is set in `.env`, ping the phone via ntfy (curl) before
   asking a blocking question and when done (see feature-worker.md).
3. Run `npm run lint` after every change and `npx playwright test` at
   meaningful milestones.
4. **Self-review** before done: verify your diff against the documented
   invariants (canonical models in AGENTS.md/docs — no re-derivation), check
   for duplicated logic and monoliths.
5. **Update the docs yourself**: load the `write-agent-docs` skill, apply the
   `docs/*.md`/AGENTS.md updates your change calls for, and flip the item's
   `docs/ROADMAP.md` status `[ ]` → `[x]` with a one-line "Done:" note. Commit
   the docs with (or right after) the code.
6. Report: what you built, the docs you updated, anything to veto.
