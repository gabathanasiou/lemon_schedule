---
name: manage-roadmap
description: Add, triage, close, or archive items in docs/ROADMAP.md and docs/ROADMAP-ARCHIVE.md. Use when asked to "add a roadmap item", "close/archive roadmap N", "update the roadmap", or when a feature finishes and its roadmap entry must be retired. Enforces open-items-only, stable unique ids, and one-line archive rows so the two files stop drifting.
---

# Managing the Roadmap

Two files, one job each:

- `docs/ROADMAP.md` — the **live backlog**: open (`[ ]`) / in-progress (`[~]`) items only.
- `docs/ROADMAP-ARCHIVE.md` — the **completed index**: one grep-able line per done item.

The full "Done:" narrative is stored in **neither** file — it lives in git history
(the commit that flipped `[ ]`→`[x]`). `scripts/check-doc-budget.mjs` enforces the
contract from `npm run lint`, so drift fails the build instead of compounding.

## Invariants (MUST NOT)

1. **Never leave a completed (`[x]`) item in `docs/ROADMAP.md`.** Writing `[x]` means
   you retire it in the same change (Close-out below).
2. **Never renumber an item.** Ids are referenced from docs, commits and other items.
   One id = one item, forever.
3. **Never duplicate an id** in the archive. New item → next free number.
4. **Never keep the same narrative in both files.** On close the live section is
   deleted; the archive keeps one line.
5. **Never delete knowledge.** Before retiring, make sure the canonical
   `AGENTS.md` / `docs/*.md` section (or the archive row's pointers) holds what a
   future agent needs — the narrative is only a git-history backup.

## Adding an item (triage gate — all feature asks funnel here)

1. **Dedupe search, in order**: live `docs/ROADMAP.md` → `docs/ROADMAP-ARCHIVE.md` →
   `AGENTS.md` + `docs/*.md` → `git log --oneline --grep=<term>` → source code.
2. **Outcome**: matches **open** → run that item, don't add; **in-progress** → never
   implement in parallel; **done** → answer with the pointer, no new work; **overlaps
   several** → merge into ONE item; **nothing** → new item.
3. **Id**: `max(existing ids across ROADMAP ∪ ARCHIVE) + 1`. Never reuse a retired id.
4. **Relations**: add a `Relations:` line (`depends on` / `merges` / `supersedes` /
   `blocked by`) when the item touches another.
5. **Shape**: request → approach/files → verify steps → relations. Terse, executable.

## Close-out (when an item ships — all steps in ONE commit)

1. Flip `[ ]`→`[x]` in `docs/ROADMAP.md`.
2. Add ONE row to `docs/ROADMAP-ARCHIVE.md`:
   `| <id> | <short title> | <knowledge / code pointers> |`
   Pointers = the canonical doc section (`AGENTS.md §X` / `docs/*.md`) + key `src/`
   path(s) + the e2e spec. **Verify each cited path exists before committing.**
3. Delete the full item section from `docs/ROADMAP.md` (git preserves the narrative;
   the archive row is the fast pointer).
4. `npm run lint` — the roadmap check must pass.

## Recovering a retired narrative

`git log -S "<unique phrase>"`, `git log --all -- docs/ROADMAP.md`, or
`git log --grep="roadmap <id>"`.

## Verification (deterministic)

`npm run lint` (→ `scripts/check-doc-budget.mjs`) **fails** when:

- `docs/ROADMAP.md` still contains any `[x]` item, or
- `docs/ROADMAP-ARCHIVE.md` has duplicate ids.

It also warns when a `docs/*.md` manual is oversized or lacks a read-first/Status line.
