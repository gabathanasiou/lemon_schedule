# Schedule & Calendar Performance — Optimization Plan

Status: **Partially applied**. This document records the measured diagnosis and the
remaining levers, so future optimization work can pick up where this branch left off.

## Background

The Schedule tab (stripboard) takes a moment to load when a project has many scenes.
Measured with the real project **"Town - Jason.lemon"** (175 scenes, 270 rows, 33
daybreaks, 62 note/break banners, 21 cast, 2 rules):

| Environment | Schedule tab mount | Blocking script |
|---|---|---|
| Production build | ~400 ms | ~161 ms (one long task) |
| Dev (`npm run dev`) | ~800 ms | ~550 ms |
| Calendar tab (prod) | ~65 ms | — (has month-block virtualization) |

Diagnostic setup: dev server / `vite preview` on a spare port (never :3000), project
injected into localStorage (`lemon_schedule_project_index` +
`lemon_schedule_project_v1_{id}`), opened via Project Manager. Measurement via
Playwright: wall clock from tab click to `[data-row-id]` appearing, Long Task API,
CDP `Profiler` CPU profile, and temporary render-count instrumentation.

## Root causes (measured)

1. **No virtualization on the stripboard.** All 270 rows / ~6,800 DOM nodes are
   created and committed on mount, regardless of scroll position. This is the
   ~161 ms blocking task in prod.
2. **Dev is ~2x prod.** React `StrictMode` (main.tsx) double-renders every mount
   (renderCount 4 in dev vs 1 in prod — StrictMode accounts for 2), and dev-mode
   JSX/style machinery (`jsxDEV`, `setValueForStyle`) inflates element creation.
3. **Micro-costs (fixed on this branch, see "Applied"):** per-cell `scenes.findIndex`
   + per-cell scene object spread in `SortableRibbon` cell renderers; slow
   `toLocaleDateString`/`toLocaleString` per day header / next-day label.
4. **Dev-only mystery re-render:** one extra App-level re-render ~450 ms after the
   Schedule tab mounts (present only under StrictMode; prod is a single clean render).

## Applied (commit b2f68b3)

- `SortableRibbon.tsx`: resolved scene (including `sheetNumber`, computed with a
  single `findIndex`) is built once per row in a `useMemo` instead of per cell —
  removes ~2,700 array scans + object spreads per render pass.
- `StripBlock.tsx`: module-level cache for `toLocaleDateString` output per ISO date
  (`nextDateCache`).
- `CalendarTab.tsx`: cache for day-header date formatting per `dateKey`
  (`fullDateCache`).

## Remaining levers (ranked by impact)

### A. Stripboard row virtualization (biggest lever, ~2-3x mount improvement)

Render only the day blocks (or rows) near the viewport, like the calendar's
month-block approach.

- **Granularity:** day-block level first (`DayBlock`/`StripBlock` = one scroll unit),
  or row level for very long days.
- **Mechanics:** scroll-position-driven render window (like `CalendarTab`'s
  `updateRenderWindow` + `[data-cal-month]` offsetTop approach) OR
  `content-visibility: auto` on each day block (native skip of layout/paint; still
  creates React elements, so it helps layout more than script).
- **Complexity:** must keep dnd-kit droppables only for rendered blocks (acceptable —
  you can only drop where you can see), preserve drag ghosts, sticky day headers,
  scroll restoration, and marquee behavior. `@tanstack/react-virtual` is the standard
  library if row-level is desired (variable heights → measured estimates).
- **Target:** < 150 ms mount for the same project in prod; < 400 ms in dev.

### B. Remove React StrictMode (1-line dev-only change)

`src/main.tsx` — remove `<StrictMode>`. Halves all dev mount/render work and likely
eliminates the dev-only extra re-render (finding #4). Tradeoff: loses StrictMode's
double-render/effect warnings during development. Prod behavior is unaffected (verify
one manual pass after removal).

### C. Rules engine scene lookups

`checkSection` in `src/lib/rulesEngine.ts` does `scenes.find` per row per rule and
re-splits `scene.cast` repeatedly. With few rules this is cheap, but with many
cast-conflict / max-hours rules it grows to O(rules × rows × scenes). Fix when rules
count grows: build `Map<sceneId, Scene>` and per-day cast sets once per section.

### D. Memoization audit for ongoing re-renders

`StripBlock`/`DayBlock` are recreated on every ScheduleTab render. Verify props are
referentially stable (e.g., `violationMap` objects recreated per render defeat the
`SortableRibbon` memo compare). A dev-only `why-did-you-render` pass would surface
these.

### E. Calendar: week-level virtualization (if ever needed)

Calendar already virtualizes at month-block level (~65 ms mount). If very long
productions (12+ months) ever feel slow, virtualize at week-row level inside each
month block using the same scroll-window pattern.

## How to measure again

1. `npm run build && npm run preview -- --port 3005` (or `npm run dev` for dev numbers —
   use a port other than 3000).
2. Inject the test project into localStorage via Playwright, open it, click the
   Schedule tab.
3. Record: wall time from click to `[data-row-id]` visible, Long Task durations,
   CDP `Profiler` self-time top functions.
4. Instrument `renderCount` temporarily if render passes are suspected.

Tools worth using: React DevTools Profiler (per-component render cost),
Speedscope (speedscope.app) for CPU profiles, Perfetto (ui.perfetto.dev) for traces.

## Acceptance targets

- Schedule tab prod mount: < 150 ms wall for the 270-row test project.
- Schedule tab dev mount: < 400 ms wall.
- No regressions in: drag & drop (rows, days), ghost indicators, sticky day headers,
  scroll restoration, marquee selection, undo/redo.
