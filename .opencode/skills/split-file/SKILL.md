---
name: split-file
description: Split or extract a monolithic file (component, hook, reducer, lib module) into focused modules. Use when asked to "split X", "extract Y", "break up", "decompose", or "refactor into modules", or when a file approaches ~700 lines. Encodes the extraction workflow proven across this repo's 15 refactor branches, including the pitfalls.
---

# Splitting a Monolithic File

Mechanical move, NOT rewrite: relocate code verbatim, zero behavior changes.
Verify with `npm run lint` (tsc) after every step and `npx playwright test` at
the end. Commit one revertible unit per extraction.

## 1. Analyze first

- List module-level declarations (components, helpers, constants, types) and
  the main component's JSX sections with line ranges.
- Identify self-contained chunks: presentational JSX, pure logic, cohesive
  groups (e.g. row-type branches, modals, clipboard handlers).
- Check for ALREADY-EXISTING shared code in `src/lib/` and `src/components/*/`
  (useStripboardContextMenu, sceneFactory, daybreakUtils, DropdownPanel,
  ribbonUtils re-exports, schedule/calendar/print hooks). Reuse before moving.

## 2. Choose the extraction pattern

| Pattern | When | How |
|---|---|---|
| **Component file** | Presentational JSX chunk | New file in the area's folder (`schedule/`, `calendar/`, `ribbon/`, `print/`, `rules/`, `elements/`). Props in; no store hooks unless the chunk owns state. |
| **Shared context object** | 15–30 props (row renderers, print parts) | One `RowRenderCtx`/`PrintRowCtx`-style interface; parent computes closures/memos, children receive `{ row, ctx }`. Parent keeps the `React.memo` comparator — children re-render only when it allows. |
| **Config-object hook** | Logic that owns state + effects (keyboard, drag, sort) | `useX(config)` where config bundles the state, setters, and refs the parent still owns. Pass refs as params — never import them. |
| **Pure lib function** | Testable logic (paste planner, sort comparator, scene factory) | `src/lib/` module; component becomes a thin dispatcher. |
| **Barrel re-export** | Existing imports must keep working (store/, lib/import/, ribbonUtils) | New modules hold the code; original file (or `index.ts`) re-exports everything. |

## 3. The move

- **Move code verbatim.** Copy the exact body; adjust only variable scope
  (`ctx.x`, `config.x`, prop names). If a chunk needs more than trivial edits
  to move, it stays put.
- **Composition root keeps state/refs.** Extract JSX + pure logic only.
- **Hooks order**: call the new hook AFTER every dependency it needs is
  declared; earlier closures over it are fine (they run post-render), but the
  hook call itself must come after its arguments exist.
- **Memo boundary**: if the parent uses a hand-rolled propsEqual, keep ALL
  hooks and the memo there; children are plain components.

## 4. Pitfalls (all hit for real in this repo)

- **Never remove blocks with index arithmetic** (`start = index("A"); end = index("B")` where B may precede A — silently duplicates the file). Use exact unique-string anchors with `assert anchor in src`, or the Edit tool.
- **`key` on default-exported components inside `.map()`** can fail typecheck (`Property 'key' does not exist`). Wrap in `<React.Fragment key={...}>` instead.
- **Watch indentation** when anchoring JSX — the first `return (` after a block may be INSIDE the chunk being removed. Anchor on unique comment lines or full element openers.
- **Destructured prop types widen to `string`** on big component interfaces — type helper options loosely (`'x' | 'y' | string`) or cast at the call site, don't fight it.
- **Barrel re-exports**: types need `export type` (isolatedModules); values can't re-export a locally-declared interface — export it from the source module.
- **Unused imports after extraction**: verify with grep counts, remove them; the lint passes anyway (noUnusedLocals off) so do it manually.
- **Dead code**: if an unused function/import is discovered during analysis, remove it in the same commit (verified with grep).

## 5. Verify & commit

1. `npm run lint` — must be clean.
2. `npx playwright test` — full suite (16 tests) at meaningful milestones and ALWAYS before claiming done.
3. Add a focused smoke test when the extraction touched a user-facing surface
   (see `e2e/seeded-smoke.spec.ts` patterns: `openSeededProject(page)`, stub
   `window.print`, right-click menus via `force: true`).
4. Commit with a message stating before/after line counts:
   `refactor: extract X from Y (N -> M lines)`.
5. Never edit `AGENTS.md` structure docs after — update them when the
   File Layout section becomes stale.
