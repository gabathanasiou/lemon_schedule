---
description: Run a full roadmap sprint — spawn parallel feature workers, collect decisions, review, merge, curate docs, update the roadmap. Usage: /roadmap-sprint <item> [item...]
---

# Roadmap sprint: $ARGUMENTS

Execute the full orchestration pipeline (see the `orchestrator` agent):

1. **Batch & spawn**: group the requested items by file overlap (see the
   disjointness gate in `spawn-feature`), spawn one worker per disjoint group.
2. **Decisions**: poll `.opencode/decisions/`; relay blocking questions to the
   user (question tool), write answers back, resume workers
   (`opencode run --continue --dir <worktree>`).
3. **Review**: when each branch is pushed, dispatch `code-reviewer` on
   `git diff main...feat/<item>`; surface blocking issues and the worker's
   assumptions to the user.
4. **Verify SERIALIZED**: `npm run lint` per branch, then the playwright suite
   one branch at a time (ports 3001/4173 — never parallel test runs).
5. **Merge** each approved branch into main; remove the worktree + branch.
6. **Docs**: dispatch `docs-curator` with the architecture reports, then
   confirm ROADMAP.md statuses are flipped.
7. Final report to the user: merged items, docs updated, anything deferred.
