---
name: orchestrate-roadmap
description: Run parallel feature workers on roadmap items using git worktrees + headless opencode runs, with the decisions hand-off channel, serialized verification, and the docs-curator loop. Use when the user says "roadmap sprint", "spawn feature workers", "orchestrate subagents", "parallel agents", "worktree", or asks to implement several roadmap items at once.
---

# Orchestrating Roadmap Sprints

The repo's workflow for running several `docs/ROADMAP.md` items at once on one
machine: one orchestrator (you), N feature workers in isolated git worktrees,
read-only reviewers, and a docs curator. Agents + commands already exist:

- `.opencode/agent/orchestrator.md` (primary) — the orchestrator contract.
- `.opencode/agent/feature-worker.md` (subagent) — docs-first worker contract
  (READ FIRST list, repo rules, never edits docs, files reports).
- `.opencode/agent/code-reviewer.md` (subagent, read-only) — diff reviews.
- `.opencode/agent/docs-curator.md` (subagent) — the ONLY doc writer; loads the
  `write-agent-docs` skill.
- `.opencode/command/spawn-feature.md` / `.opencode/command/roadmap-sprint.md`
  — the pipeline commands.

## The pipeline

1. **Disjointness gate first** — the reports designer couples these shared
   files: `src/components/reports/blockControls.tsx`, `src/lib/reportBlocks.ts`,
   `src/types.ts` (ReportBlock), `src/components/reports/ReportBlockView.tsx`,
   `src/components/reports/ReportDesignerCanvas.tsx`, `src/lib/reportData.ts`,
   `src/lib/ribbonUtils.ts`. Two workers may NEVER touch the same file —
   merge them into one worker instead. (e.g. roadmap 23+24 share
   `ReportDesignerCanvas.tsx` → one worker.)
2. **Spawn** per disjoint group (see `spawn-feature`):
   `git worktree add ../lemon_schedule-wt/<item> -b feat/<item>` + symlink
   `node_modules` + `.env`, then (with `OPENCODE_SERVER_PASSWORD` exported so
   the attach authenticates):
   `nohup opencode run --attach http://localhost:4096 --dir <worktree> --agent feature-worker --auto --title "roadmap <item> — <roadmap heading>" "<item text verbatim>" >> .opencode/logs/worker-<item>.log 2>&1 &`
   Workers attach to the web server, so the phone streams their progress live.
   Session titles derive from the roadmap heading (identifiable on the phone).
3. **Decisions hand-off** (workers can't prompt): blocking questions →
   `.opencode/decisions/<item>.md` → orchestrator relays via the question tool
   → answer written to the file → worker resumed with
   `opencode run --continue --dir <worktree> "Answer: <answer> — resume"`.
   Judgment calls → worker records the assumption in its report; surface for
   veto at review.
4. **Review** — dispatch `code-reviewer` (parallel-safe, read-only) on
   `git diff main...feat/<item>`.
5. **Verify SERIALIZED** — `npm run lint` per branch; playwright suite ONE
   branch at a time (dev servers fight over ports 3001/4173). Never two test
   runs concurrently.
6. **Merge** each branch; then cleanup via `/cleanup-worker <item>`
   (hub stop → worktree remove --force → branch delete local+remote).
7. **Docs loop** — dispatch `docs-curator` with each `.opencode/reports/<item>.md`
   (what changed / invariants touched / docs needed / assumptions /
   verification). Flip `docs/ROADMAP.md` statuses. Workers never edit docs.

## Phone access (answering workers from your phone)

- Web server: auto-started from `~/.zshrc` guard → `.opencode/scripts/start-web.sh`
  (`opencode web --port 4096 --mdns`). Phone: `http://opencode.local:4096`,
  user `opencode`, password in `.env` (`OPENCODE_SERVER_PASSWORD`).
- **iOS push (ntfy)**: the watcher (`watch-workers.sh`) pushes worker events to
  `ntfy.sh/<NTFY_TOPIC>` (topic in `.env`, gitignored). iOS: install the "ntfy"
  app → subscribe to that topic → worker-done/blocked events ping the phone.
- The web UI lists this project's sessions; the orchestrator session is where
  questions are asked — the user answers there.
- **Live streaming requires ONE server process**: the web UI only receives
  real-time events for sessions running through ITS server. A standalone TUI
  is a separate process (shared storage, no cross-process push) — the phone
  would show stale content until refresh. The orchestrator TUI MUST run
  attached to the web server: `opencode attach http://localhost:4096` (see
  `.opencode/scripts/tui.sh` — `-c` continues, `-s <id>` resumes).
- Server logs: `.opencode/logs/web.log`. Manual start: run the script.
- launchd does NOT work for this (macOS TCC blocks ~/Documents for
  launchd-spawned processes — diagnosed); the terminal guard inherits the
  terminal's access instead. Upgrade path if true login-time start is wanted:
  grant Full Disk Access to `/opt/homebrew/bin/opencode`, then a LaunchAgent.

## Worktree conventions

- Paths: `../lemon_schedule-wt/<item>` (sibling of the repo), branch
  `feat/<item>`.
- `node_modules` + `.env` are symlinked from the main tree (gitignored, not
  shared automatically).
- Logs: `.opencode/logs/worker-<item>.log`; reports:
  `.opencode/reports/<item>.md`; decisions: `.opencode/decisions/<item>.md`.

## Pitfalls learned

- Never parallel two workers on a shared file — merge conflicts will eat the
  win.
- Never run playwright twice concurrently (port 3001/4173 collisions).
- Workers that edit docs themselves break the docs-curator contract — the
  feature-worker prompt forbids it; enforce.
- The web server and TUI sessions share storage: sessions appear on the phone
  once the project is added in the web UI (one-time: add project →
  `/Users/gabrielathanasiou/Documents/Software Apps/lemon_schedule`).
- "Phone needs a refresh to see changes" = the TUI is a separate process from
  the web server. Fix: run the TUI via `tui.sh` (attach). iOS Safari also
  suspends background tabs — after a long background period a refresh may
  still be needed (Safari behavior, not the server).
