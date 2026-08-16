---
description: Clean up a finished worker — stop its dev server, remove its worktree and its branch (local + remote). Usage: /cleanup-worker <item>
---

# Cleanup worker $1

Run after the branch is merged (or when abandoning it):

1. **Stop its dev server** (if the hub is running):
   `curl -s -X POST http://localhost:3210/api/stop/$1`
   (or use the Stop button in the hub manager at http://localhost:3210).
2. **Remove the worktree** (from the main repo dir) — the hub's dev-config
   sync leaves `vite.config.ts`/`public/` dirty, so force is required:
   `git worktree remove ../lemon_schedule-wt/$1 --force`
3. **Delete the branch** (local, then remote):
   `git branch -D feat/$1 && git push origin --delete feat/$1`
4. Confirm the hub no longer lists it (worktrees are discovered dynamically —
   the item disappears on the next refresh).
