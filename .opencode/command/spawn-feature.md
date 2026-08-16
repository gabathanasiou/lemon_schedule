---
description: Spawn a feature worker for a roadmap item in an isolated git worktree. Usage: /spawn-feature <item>
---

# Spawn feature worker: roadmap item $1

Read the item text verbatim from `docs/ROADMAP.md` (item $1), then:

1. **Disjointness gate**: verify no OTHER running worker touches the shared
   files (`blockControls.tsx`, `reportBlocks.ts`, `types.ts` ReportBlock,
   `ReportBlockView.tsx`, `ReportDesignerCanvas.tsx`, `reportData.ts`,
   `ribbonUtils.ts`). If it overlaps a running worker — do not spawn.
2. **Worktree**: `git worktree add ../lemon_schedule-wt/$1 -b feat/$1` from the
   repo root, then symlink `node_modules` and `.env` from the main tree so the
   worker has deps without a fresh install.
3. **Spawn headlessly** (run with `OPENCODE_SERVER_PASSWORD` exported from
   `.env` — workers attach to the web server so they stream live to the
   phone). Derive the session title from the roadmap heading so sessions are
   identifiable on the phone:
   `TITLE=$(grep -m1 "^## $1\." docs/ROADMAP.md | sed 's/^## //')`
   `nohup opencode run --attach http://localhost:4096 --dir ../lemon_schedule-wt/$1 --agent feature-worker --auto --title "roadmap $1 — $TITLE" "<the roadmap item text verbatim, plus: implement exactly this, follow feature-worker.md, push when done>" >> .opencode/logs/worker-$1.log 2>&1 &`
4. Report: worktree path, branch name, log path, PID. Tell the user they can
   watch progress on the phone (http://opencode.local:4096) and that worker
   questions land via the decisions channel.
