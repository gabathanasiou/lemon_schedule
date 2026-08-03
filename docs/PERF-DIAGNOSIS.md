# Performance & Memory Diagnosis — Town - Jason (175 scenes, 270 rows)

Date: 2026-08-03 · Branch: `diagnosis/perf-memory-leaks`

## Methodology

- **Static audit**: every `addEventListener` / `setInterval` / `setTimeout` / `requestAnimationFrame` /
  `ResizeObserver` / module cache in `src/` checked for cleanup and boundedness.
- **Dynamic harness** (kept in repo): `e2e/perf-diagnosis.spec.ts` +
  `playwright.perf.config.ts` — runs realistic workflows against the seeded Town
  project, then measures:
  - JS heap **after forced GC** (`HeapProfiler.collectGarbage` + `Performance.getMetrics`)
  - **live DOM** via `document.querySelectorAll('*').length` (the CDP `Nodes`
    metric is a monotonic *counter* of created nodes — it does NOT measure live
    DOM and produces false "leak" signatures; do not use it for verdicts)
  - main-thread cost deltas (Script / Task / Layout / RecalcStyle) per workload
- **Manual tools for follow-up** (Chrome DevTools): Memory panel → heap snapshots
  (filter "Detached" for detached DOM trees), Allocation Timeline, Performance
  panel memory recording with forced GC. Refs: developer.chrome.com/docs/devtools/memory-problems,
  react.dev (memo/context), patterns from this repo's SceneSheet.

## Verdict: NO memory leak in normal workflows

| Round | Heap after GC (MB) | Live DOM nodes |
|---|---|---|
| baseline (Schedule) | 30.8 | 6 941 |
| tab-switch ×2 cycles | 34.7 | 6 941 |
| modals ×3 (print dialog, context menu) | 36.1 | 6 941 |
| edit + undo/redo churn | 41.5 | 6 941 |
| drags ×5 | 42.4 | 6 941 |
| glide cell edits | 22.3 | 93 (glide tab) |
| stripboard nav ×40 | 37.0 | 6 941 |
| 8s idle | 36.9 | 6 941 |

- Live DOM: **+0 nodes** across the whole session. Heap drift is noise + undo
  history; structural sharing keeps undo entries cheap (60 dispatches ≈ no
  measurable extra heap).
- All listeners/timers/RAFs audited have proper cleanup (useMarquee, FloatingTooltip,
  DurationKeypad, PopoutWindow, provider probe interval, auth refresh timer…).
- The earlier "possible leak" signature was a false positive from the CDP `Nodes`
  counter.

## CPU hotspots (the real problem) — measured on 1600×900 headless

| Workload | Main-thread script | Per unit |
|---|---|---|
| 1 keystroke + Enter on stripboard (Edit mode) | **622 ms** first, ~100 ms+ steady | every char dispatches |
| edit churn (16 keys + 32 undo/redo) | 5 611 ms | ~117 ms per dispatch |
| drag ×5 (8 move steps each) | 1 958 ms | ~390 ms per drag |
| stripboard arrow-key nav ×40 | 1 356 ms | ~34 ms per key |
| tab switch (mount/unmount) | 1 471 ms | ~245 ms per switch |
| glide cell edit | 198 ms | ~66 ms per edit (canvas is cheap) |
| 8s idle (permanent timers) | 9 ms | negligible |

### Root cause #1 — every dispatch re-renders the whole stripboard

`ProjectContext.Provider value={{...}}` is a fresh object literal per render
(`src/store/provider.tsx:746`). Every `dispatch` → provider re-render → context
identity change → **all ~40 `useProject()` consumers re-render**, and React.memo
does NOT block context changes. On the Schedule tab that means ~269
`SortableRowContent` (each calls `useProject()` at `SortableRibbon.tsx:76`) +
`StripBlock` + `BoneyardBlock` re-render per keystroke. `sortableRowPropsEqual`
memo only helps when the context hasn't changed (never mid-edit).

### Root cause #2 — per-keystroke dispatches

`CellInput`/`EntityDropdown`/`SelectDropdown` in the stripboard dispatch
`UPDATE_SCENE`/`UPDATE_VERSION` on every character. SceneSheet already buffers
per-field edits and commits on blur (`SceneSheet.tsx` — per AGENTS.md) — the
stripboard does not. 8 chars typed = 8 full-project re-renders.

### Root cause #3 — cloud save re-uploads the whole file

Drive sync (`googleDriveStorage.uploadJson`) sends the **entire project JSON** via
multipart PATCH on every 500 ms debounced save (`provider.tsx:305`). ~180 KB
(and growing) per pause in typing, plus JSON.stringify + localStorage write per
debounce.

## Optimisation list (ranked by expected impact)

1. **Fix the context re-render storm** (biggest win, ~10× on input latency)
   - `provider.tsx:746`: wrap the context value in `useMemo` (stabilizes
     `projectList`, `currentProjectId`, and the `useCallback` actions).
   - Move `useProject()` out of per-row components: `SortableRowContent`
     (`SortableRibbon.tsx:76`) should receive state via props from `StripBlock`
     (which already owns `project.scenes`, palette, categories). Then the
     existing `React.memo` + comparator actually works and only the edited row
     re-renders.
   - Long-term: selector hook (`useProjectSelector(fn)` with shallow compare) or
     split contexts (project data / list / actions). Actions are already stable
     `useCallback`s — only `state` churns.
2. **Buffer stripboard cell edits** — commit on blur/Enter like SceneSheet:
   local draft in `CellInput`, dispatch once per commit instead of per char.
   Removes ~8 dispatches per field edit (≈ 1 s of main-thread work on Town).
3. **Cheap per-render wins in `SortableRowContent`** — `entityItemsMap` rebuilds
   from all scenes (fine, memoized), but `computeMergeGroups`, `getFieldValue`
   per cell, and `getRibbonCellBaseStyle` run on every re-render of every row;
   memoize per (row, ribbon, colWidths) or precompute the merged ribbon layout
   once per ribbon design in `StripBlock`.
4. **Stripboard navigation** (~34 ms/key): reduce `onDragOver`/collision work
   during drags and debounce `insertBeforeId` updates; consider limiting
   re-render of droppable rows to the affected day.
5. **Cloud save**: raise debounce to ~2 s idle for Drive pushes, or delta-sync
   only changed sections instead of full-file PATCH. (Cost grows with project
   size; Town is already ~180 KB.)
6. **Clipboard container (-1) rows are never pruned** (`useStripboardContextMenu.ts:133`)
   — repeated Cut accumulates rows in state and on disk until Paste-all. If
   single-buffer semantics are desired, clear previous `containerId === -1` rows
   on the next Cut (currently a design decision, not a bug).
7. **Debounce localStorage save** already at 500 ms — `JSON.stringify(project)`
   measured ~1 ms for Town; acceptable. Revisit only for much larger projects.
8. **Minor cleanups** (no perf impact, hygiene):
   - Debug helpers leaked on `window`: `__dumpSchedule` (`provider.tsx:206`).
   - `device.ts:68` permanent 2 s `setInterval(resync)` — measured ~0.75 ms/s;
     gate on `document.visibilityState` to drop idle cost on iPad.

## How to re-run

```bash
npx playwright test --config=playwright.perf.config.ts   # needs ~/Downloads/Town - Jason.lemon
```

The harness prints per-round heap/live-DOM and per-workload CPU deltas, plus a
final verdict. To test a different seed: `LEMON_SEED_PATH=/path/to/project.lemon`.
