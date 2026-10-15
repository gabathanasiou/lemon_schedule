---
name: parallel-work
description: Worktree isolation for parallel roadmap agents, merging a finished branch into main, and flake triage. Use when asked to "work on another worktree", "another agent is working", "merge this branch", "resolve these conflicts", "bring it into main", or when a test fails that you didn't touch ("the suite is flaky", "was it me", "quarantine this test"). Encodes this repo's conflict recipes, the ff-only merge flow, and the retries → baseline → KNOWN-TEST-FAILURES → @quarantine ladder.
---

# Parallel work — worktrees, merges, flake triage

Default repo policy is one agent per item in the main tree (AGENTS.md §Roadmap
Work). The user overrides that when several items are in flight ("other agents
are working rn") — then you get a worktree. This skill is that flow, plus how to
land it in `main` without clobbering anyone, plus what to do when the suite
fails on someone else's test.

## 1. Set up the worktree

1. `tools.opencode.worktree_create({ name: "<item-slug>" })` → a worktree at
   `~/.local/share/opencode/worktree/<hash>/<item-slug>` on a **detached HEAD**.
2. In it: `git switch -c feature/<id>-<slug>` (branches off the repo's current
   HEAD — confirm with `git log -1` that you share the base you expect).
3. `tools.opencode.session_move({ directory })` — move the session so every
   later command runs inside the worktree. (Move it back when you finish.)
4. `npm ci` — a fresh worktree has **no `node_modules`** (~40s, cached).
   `.env` is NOT copied: the tree runs **without** the Supabase/presence
   config, which is how the seeded suite normally runs anyway.
5. `npm run lint` once before touching anything — a green baseline.

## 2. Verify before you ask for a merge

Rule 7 ladder (details: `docs/TESTING.md`):

- `npm run lint` always. `npm run test:smart` for feature-sized changes.
  **Full suite** (`npx playwright test`) for logic/store/behavior — the
  file-level diff is not the gate, the change class is.
- New feature → **extend the `RULES` table** in `scripts/smart-test.mjs`
  (a feature with no rule gets skipped by name; unmapped `src/` changes run
  canaries only and warn).
- **The e2e suite is capped (70 specs / 280 tests, `scripts/check-doc-budget.mjs`).**
  Do NOT add a spec file: extend an existing spec in the same area, push pure
  logic down to Vitest, or raise a cap consciously with a one-line reason.
- Visual-only work (CSS, labels, menu items) gets NO e2e — end with a numbered
  manual check for the user instead.

## 3. A test failed that you didn't touch

Work the ladder — never start by "fixing" the app:

1. Re-run the spec alone; try `--workers=1`. Parallel-load flake shows up here
   (`--repeat-each=3` at 2 workers vs 1 worker is a fast discriminator).
2. `npm run test:baseline -- e2e/<spec>.spec.ts` — a throwaway clean-HEAD
   worktree on an isolated port. Passes on HEAD → the failure is yours; fails →
   pre-existing/flaky. **Never** `git checkout` to compare.
3. Read `docs/KNOWN-TEST-FAILURES.md` — known flakes are documented there with
   their triage. If it matches, quote the entry and move on.
4. Triage like-for-like when unsure: run the SAME command on clean `main` in a
   throwaway worktree (`git worktree add --detach <tmp> main`, symlink
   `node_modules`, `PLAYWRIGHT_PORT=<free port>`).
5. Log what you learned: a dated line in `docs/KNOWN-TEST-FAILURES.md` with the
   evidence (symptom, the two comparisons, verdict). Triage knowledge dies with
   the session otherwise.
6. **Chronic flake** (recurs across runs, retries don't absorb): tag the test
   `@quarantine` per `docs/TESTING.md` — excluded from default runs, run with
   `npx playwright test --grep @quarantine`, and keep the doc entry. A
   quarantined test nobody fixes is debt with a name, so prefer a root-cause fix
   when the mechanism is understood (e.g. a deferred-click race under load).

Never paper over flake with sleeps or longer timeouts unless the timeout is
demonstrably the mechanism (the doc says when that was the case).

## 4. Merge into main

**Preflight — non-negotiable:** `git -C <main tree> status --short` must be
empty, and no peer worktree may hold uncommitted edits to files you touched.
Advancing `main` rewrites their checkout; their next commit then silently
reverts your work. Wait for them to commit instead.

1. In YOUR worktree: `git merge main` — resolve conflicts there, never in the
   main tree (a half-resolved main tree blocks everyone).
2. The three guaranteed conflicts, with recipes:

   | File | Recipe |
   | --- | --- |
   | `docs/ROADMAP.md` | Take main's side (`git checkout --theirs`), then re-apply YOUR section deletion (the archive keeps the row). |
   | `docs/ROADMAP-ARCHIVE.md` | Keep BOTH sides' rows — append-only, ids unique. Delete only the `<<<<<<<`/`=======`/`>>>>>>>` marker lines. |
   | `package.json` | Take main's version, then bump for your change after the merge (rule 8) in its own `chore:` commit if the work is user-visible. |

3. Component conflicts are often same-file auto-merges (`RibbonTab.tsx`,
   `ReportDesigner.tsx`, `docs/COLLABORATION.md` §9 …). Review them by hand:
   `git diff <your-old-tip> -- <file>` shows exactly what the peer added on top
   of your version — both intents must survive.
4. On the merged tree: `npm run lint` + unit tests + the FULL suite (merges mix
   behavior — a one-sided run is not evidence). Re-check the specs that cover
   the peer's surface too.
5. Commit the merge, then: `git -C <main> merge --ff-only <branch>`.
   Re-check `git -C <main> status --short` right before the ff — peers commit
   to main while you work; if main moved, repeat step 1.
6. Finish: `tools.opencode.worktree_remove({ directory })` (clean tree),
   `git branch -d <branch>` (safe: it is merged), move the session back to the
   main tree. Then the normal wrap-up — roadmap close (`manage-roadmap` skill),
   version bump, session rename to `✔ <id> — <title>`.

## 5. Non-negotiables

- Never resolve conflicts in `main`, never `git merge` a peer's branch, never
  `--abort` a merge you can resolve.
- Never `git commit -a` in the main tree (it would sweep up other agents'
  uncommitted work).
- Never remove a peer's worktree or branch.
- Never claim done on a red suite — the ladder in §3 exists so "not mine" is a
  proven statement, not a guess.
