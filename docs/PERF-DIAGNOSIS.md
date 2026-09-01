# Performance & Memory Diagnosis — IT'S A WONDERFUL LIFE (146 scenes, 219 rows)

Date: 2026-08-03 · Branch: `diagnosis/perf-memory-leaks`

## Methodology

- **Static audit**: every `addEventListener` / `setInterval` / `setTimeout` / `requestAnimationFrame` /
  `ResizeObserver` / module cache in `src/` checked for cleanup and boundedness.
- **Dynamic harness** (kept in repo): `e2e/perf-diagnosis.spec.ts` +
  `playwright.perf.config.ts` — runs realistic workflows against the seeded
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

## Optimisation list — status as of 2026-08-03 (all merged to main)

1. **Fix the context re-render storm** — ✅ DONE (`opt/context-split`, 85ae1c7)
   - Provider value wrapped in `useMemo` (`provider.tsx`).
   - `useProject()` removed from `SortableRowContent`/`SortableRowScene`/
     `EntityDropdown`; palette, castMembers, breakdownElements, categories,
     dispatch and the row's own `scene` arrive via props; `EntityDropdown`'s
     context fallback replaced by explicit `items` (all callers pass them).
   - `computeRowData` now caches computed rows in a WeakMap keyed by the raw row
     with a computed-field fingerprint, so unchanged rows keep object identity
     across dispatches and the row memo actually hits.
   - New `UPDATE_ROW` action (single-row update without rebuilding row arrays).
   - `SortableContext items` keyed by id-sequence instead of array identity
     (dnd-kit re-renders every useSortable consumer when items changes).
   - Measured: 1 keystroke now **3 ms script, 0 row re-renders** (was ~100 ms
     with the whole stripboard re-rendering). Prod A/B (Town, edit+undo churn,
     2 runs each, same harness): **5 536/5 607 ms -> 3 322/3 325 ms (1.67x)**.
   - Dev-mode harness: edit churn 5 611 -> ~3 325 ms, tab-switch 1 471 -> ~900 ms,
     nav 1 356 -> ~415 ms.

2. **Buffer stripboard cell edits** — ✅ ALREADY DONE (verified, no change needed)
   `CellInput` keeps `localVal` state and dispatches only on blur
   (`CellInput.tsx:166`), so typing never dispatches per character. Confirmed by
   probe: a keystroke is 3 ms / 0 renders; the commit on blur is the only
   dispatch. The original doc claim was wrong.

3. **Cheap per-render wins in row components** — ✅ DONE (part of 85ae1c7)
   Row identity stability + per-row `scene` prop means rows only re-render when
   their own data changed; `entityItemsMap`/`castItems` stay memoized per row
   and only recompute when their inputs change.

4. **Drag / navigation cost** — ✅ MEASURED, no change needed
   Prod profile of a full drag gesture: ~50 ms script total (dnd-kit collision +
   ghost + drop reorder). Arrow-key nav: ~10 ms/key in prod (was never
   context-bound). An RAF-coalescing experiment for `insertBeforeId` showed no
   measurable win (React's Object.is bail already covers identical values) and
   was reverted.

5. **Cloud save debounce / delta sync** — ⏸ SKIPPED by request (cloud unchanged)

6. **Clipboard (-1) rows never pruned** — ⏸ SKIPPED (design decision: repeated
   Cut accumulates until Paste-all; changing to single-buffer semantics needs a
   product decision)

7. **localStorage save** — ✅ VERIFIED FINE: `JSON.stringify` of Town is ~0.3 ms;
   500 ms debounce stands.

8. **Minor cleanups** — ✅ DONE (`opt/cleanups`, c9bc8a2)
   - Removed `window.__dumpSchedule` / `__dumpSectionTotals` debug helpers.
   - `device.ts` 2 s poll interval now skips while the page is hidden and is
     cleared on `pagehide` (keeps background tabs idle on iPad).

9. **Follow-up ideas (not started)**
   - Selector-style `useProjectSelector(fn)` to keep shell components
     (AppHeader, SaveIndicator…) from re-rendering on every dispatch — the
     remaining ~20 ms per commit is mostly the provider -> App -> shell chain.

## Follow-up: stripboard drop storm + row virtualization (2026-08-04, `fix/stripboard-perf-regression`)

### Bug 1 — every drag drop re-rendered the whole stripboard (270 rows)

`handleDragEnd` rebuilt the rows array with `activeVersion.rows.map(r => ({ ...r }))`,
spreading **every** row into a new object. The `computeRowData` WeakMap is keyed by
the raw row object, so a full copy = a full cache miss = fresh `ComputedRow` for every
row = `React.memo` fails on `row` identity for all 269 rows → ~270 row renders,
~480 ms script per drop (measured with the `top-bottom-drag` harness: `renders=270,
compute.misses=269, dispatch=[UPDATE_VERSION]`).

Fix (`useScheduleDrag` + `useStripboardContextMenu`):
- Day swap: conditional `map` — only rows whose `containerId` changes get new objects.
- Row drops: **fractional midpoint orders** (`insertionOrder` in `daybreakUtils.ts`) —
  the moved row gets `(prevOrder + nextOrder) / 2`, **no renumbering**, so every
  untouched row keeps its object identity. Only rows whose computed call times
  actually shifted re-render (the WeakMap fingerprint decides).
- Paste: same midpoint orders, no renumber.
- `renumberRows` (identity-preserving densify) for the rare bulk paths
  (context-menu add/delete, digit-buffer day move, delete-all-daybreaks).
- Legacy data with non-dense orders (Town: `0, 3, 4, 5…`) is why order==index
  renumbering could never preserve identity — midpoint orders sidestep it entirely.

Result: top drop 269 renders → 37 (only rows with genuinely changed call times);
in-section drops ~9 ms.

### Bug 2 — every project is one container, so the day-level render window never virtualized

All rows live in `containerId: 1` (sections = daybreak groups), so ScheduleTab's
day-windowing mounts **all 269 rows always** — the whole ribbon stayed laid out and
painted, which is what made typing/dragging laggy on iPad Safari.

Fix (`StripBlock` + `src/lib/virtualChunk.ts` + `index.css`):
- Rows are wrapped in `.cv-chunk` groups (12 rows) with
  `content-visibility: auto; contain-intrinsic-size: auto 516px` — offscreen chunks
  skip layout/paint; the remembered intrinsic size keeps scroll metrics right.
- `applyChunkVisibility` runs from the scroller's `onScroll` (inside
  `updateRenderWindow`) and force-renders chunks within a 1.5×-viewport buffer
  (`cv-visible`) so fast scrolling never flashes white. `useChunkResize` re-applies
  on window resize (iPad keyboard).
- **IntersectionObserver + rootMargin does NOT work here**: a skipped
  `content-visibility: auto` element reports `isIntersecting: false` even inside
  the rootMargin (verified in Chrome), so the buffer must be scroll-driven.
- Focus/selection render their chunk by definition (they're inside the buffer).

### Bug 3 — pre-existing, unchanged by Aug 3 (verified by A/B against f0b1179)

Per-keystroke typing costs ~2.3 ms/char of main-thread task regardless of position
(identical top vs bottom when the bottom row is visible); the Aug 3 refactor made
toggle/blur faster, not slower. The keyboard-detection heuristic does not fire while
typing in stripboard cells (CellInput's `stopPropagation` blocks the window
keydown listener) — 0 state flips measured.

## How to re-run

```bash
npx playwright test --config=playwright.perf.config.ts      # dev server :3001
npx playwright test --config=playwright.perf-prod.config.ts # prod preview :4173
```
