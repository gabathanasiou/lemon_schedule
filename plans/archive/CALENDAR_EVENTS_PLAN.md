# Plan: Calendar Events mode + Events everywhere (roadmap items 45 & 46)

**Scope:** `docs/ROADMAP.md` items 45 (Calendar Events mode — day event cards +
Day Events modal) and 46 (Events everywhere — span-chip resize, shared
editors, Element Manager events, DatePicker → ui-kit, Rules-tab retirement).
Item 45 is implemented first (own commits + green suite), then item 46 as the
follow-up pass — 46 depends on 45's shared modal + chips.

---

## Decisions (confirmed with user)

1. **Sequencing**: 45 first, checkpoint (committed, full suite green), then 46.
2. **Spanning rule chips**: full Apple-month-view style — one chip per
   contiguous date run, stretched across day cells, wrapping across week rows.
   Requires the events-mode renderer to be a per-week sub-grid with an
   absolute chip-overlay layer (see §Events-mode renderer). NOT per-day
   fragments.
3. **Events-mode day context menu**: keep the per-day-type marking items AND
   append "Manage Events…" below. Strips mode keeps today's menu exactly.

---

## Foundations (existing code the plan builds on)

- `CalendarTab` (`src/components/CalendarTab.tsx`, ~1210 lines): strips grid
  (fixed `DAY_CELL_HEIGHT` 170px, render-window virtualization), day-header
  drag with call-time rotation, paint tool-belt, marquee selection, per-day
  context menu, `usePersistState` prefs `lemon_schedule_calendar_view`
  (inline `{displayField, showBreaks, showConflicts}` type, `updateCal`),
  `checkSection` violation map + `sceneViolationMap`, `nonShootEntryByDate`
  (`getNonShootEntryMap`), `useCalendarKeyboard`, `useCalendarDrag`, `useMarquee`.
- `TravelHoldModal` (`src/components/calendar/TravelHoldModal.tsx`, 262
  lines): status picker (dark chip trigger, `CategoryDropdown` +
  `EntityDropdown` rows) — becomes `DayEventsModal`; rows machinery is the
  item-39 infra and stays.
- Day-types/attachments infra (item 39): `NonShootDate.status` = type key,
  `lists` keyed by status key, `getDayTypeVisual` / `getDayTypeCode` /
  `getMarkableDayTypes`, `nonShootHelpers.ts` (`getTypeListGroups`,
  `getStatusesWithLists`, `isElementMarked`, `resolveElementName`,
  `NON_SHOOT_ALL`).
- Rules: `ProjectRule` union (`src/types.ts:135`), `describeRule` +
  `RULE_TYPE_META` (`src/components/rules/ruleMeta.tsx`), `RuleFormModal`
  (`src/components/rules/RuleFormModal.tsx` — standalone fixed overlay with
  `form.dates`; no pre-seed prop yet), `ADD_RULE`/`UPDATE_RULE`/`DELETE_RULE`
  (`src/store/actions/breakdown.ts`).
- `useMarquee` (`src/lib/useMarquee.tsx`) hard-coded to `[data-row-id]`
  targets — needs a selector param.
- Day manager: `DayTypesTab` (`src/components/calendar/DayTypesTab.tsx`)
  dates-only pane — item 46 wires event summaries in.
- Element Manager: `ElementManager.tsx` with header-portal slot (LinkManager
  pattern: `elements/LinkManagerModal.tsx` grouped-card modal).
- `DatePicker` (`src/components/DatePicker.tsx`, 116 lines, no store deps) —
  item 46 moves it into `@gabriel/ui-kit` (currently `github:gabathanasiou/ui-kit#v0.1.33`).

---

## Item 45 — Calendar Events mode

### 45.1 New pure module `src/lib/events.ts`

Unit-testable, no store/react deps (own `calendarUtils.ts`-style module).
Houses ALL event computation + permutation logic — this is the canonical
module; UI calls it, never re-derives.

- **Card model** (one discriminated union, sorted for render):
  - `{ kind: 'status', statusKey }` — one per date, visual via `getDayTypeVisual`.
  - `{ kind: 'attachment', status, category, keys, label }` — one per
    list group (`getTypeListGroups`); sorted: status order (registry order),
    category order cast-first, then element name (`resolveElementName`).
  - `{ kind: 'flag' }` — the day's `violations` (when non-empty).
  - `{ kind: 'rulechip', rule, dates }` — one per contiguous run, NOT per rule
    (see `computeRuleRuns`).
- **`computeRuleRuns(rule)`**: split `rule.dates` into contiguous runs (ISO
  date adjacency = +1 day; wrap across month/week boundaries is automatic
  since runs are pure date sequences). Non-consecutive dates → separate
  chips. Chip label via `describeRule`.
- **`computeDayEvents(project, dateKey, entry, violations, rules)`** —
  assembles the above; respects a filter predicate for the events filter.
- **`applyDatePermutation(version, mapping)`** (day drag in events mode):
  `NonShootDate` entries exchange `.date` per the mapping AND every rule's
  `dates` get the same transposition/cycle (`A↔B` swap; cyclic shift for
  insert-move). A rule covering both involved dates stays; one covering only
  one follows the day — chips on day A after the drag are exactly the chips
  it had before. No `DATE_RESTRICTION` floor issue (dates exchanged, never
  deleted).
- **`moveRuleRun(rule, runDates, targetDate)`** (chip-body drag): adds target
  to `rule.dates`, removes the run's original dates. `DATE_RESTRICTION` floors
  at 1 date — last-date drag-away blocked (tooltip explains); date-optional
  types (MAX_HOURS/TIME_WINDOW) drop to "every day" when the last date of the
  last run leaves.
- **`moveNonShootDate(list, fromDate, toDate)`** — swap semantics with an
  existing entry (`NonShootDate` on the target date).
- **Invariant trap**: the section date cursor skips statused dates —
  event/date swaps shift section dates. Section dates derive via
  `daybreakUtils`/`useDaybreakSections` cursor logic (never re-derived;
  pinned daybreak respected) — swaps only touch `nonShootDates` + rule
  `dates`, and the cursor recomputes automatically.

### 45.2 CalendarTab renderer + prefs

- Extend `calSettings`:
  `{displayField, showBreaks, showConflicts, viewMode: 'strips' | 'events',
  eventsFilter}` — same `lemon_schedule_calendar_view` key, `eventsFilter`
  persisted as arrays (never Sets); `updateCal` handles partials.
- **Segmented `Strips | Events`** control in the calendar toolbar (next to
  the View menu; `PageToolbar` light). In events mode: paint-tool row hidden
  (cards are the surface), `Filter` control appears (see 45.3).
- **Events-mode renderer** (only when `viewMode === 'events'`): replace the
  single `grid-cols-7` month grid with **per-week sub-grids** — each week
  row = a `relative` container holding its own 7-col grid of `EventDayCell`s
  PLUS an absolute chip-overlay layer. Spanning chips position from cell
  rects (measured, cached per month/week) and clamp across week boundaries.
  Keep `data-cal-month` + `estimateMonthHeight` virtualization contract
  (events cells use a fitted default height estimate; measured heights
  update as today).
- **`EventDayCell`** (extract shared header/status visuals from `DayCell` —
  day type badge, code, header colors `getDayHeaderColors`, violations flag):
  renders status card, attachment cards, flag card, per-day chips
  (spanning chips live in the overlay layer instead), and an "add event"
  affordance on empty days. Card click → DayEventsModal; card hover/selected
  states for drag + marquee.

### 45.3 Filter

- Toolbar `Filter` DropdownMenu (same recipe as the View menu): checkbox
  groups — **Day statuses** (per existing day type incl. custom), **Attachments**,
  **Flags/Conflicts**, **Rules** (per rule type). Hidden kinds drop their
  cards from every day; empty days keep the add affordance. Persisted in
  `eventsFilter`.

### 45.4 DayEventsModal (evolve TravelHoldModal)

- Rename/evolve `TravelHoldModal` → `DayEventsModal` (title "Day Events —
  <date>"): existing status picker + any-category attachment rows machinery
  untouched; add:
  - read-only **Conflicts** section (that day's `violations`)
  - **Rules** section — rules whose `dates` include this date; edit → opens
    `RuleFormModal` (initial = rule); "Add rule" → `RuleFormModal` pre-seeded
    with this date — requires a new optional `preseedDates` prop on
    `RuleFormModal` (seeds `form.dates` + `datesMode: 'specific'`).
  - **Event-type filter inside the modal body** (same checkbox groups;
    collapses sections by kind — per-open state, not persisted).
  - Save paths: `UPDATE_VERSION` nonShootDates + `ADD_RULE`/`UPDATE_RULE`
    (one undo entry via `BATCH_START`/`BATCH_COMMIT` when a modal save touches
    both).
- Entry points: card click, empty-day add, day double-click, existing
  tooltip buttons (shared with strips), context menu (see 45.5).
- Both modes keep the same entry points (strips mode opens the upgraded
  modal too — one editor).

### 45.5 Context menu

- Events mode day right-click: per-day-type items stay (marking parity) +
  `ContextMenuDivider` + "Manage Events…" (opens DayEventsModal). Strips mode
  unchanged.

### 45.6 Selection + drag

- **`useMarquee` parameter**: accept a target selector (`[data-row-id]`
  default; events mode passes `[data-event-key]`) — strips mode behavior
  unchanged (regression-guarded).
- **Events-mode selection**: mode-local `selectedEventKeys` state (cards +
  chips), own per-container cursor per AGENTS.md §Container Model;
  shift+click ranges, `Cmd+A` (mode scope), arrow-key navigation — extend
  `useCalendarKeyboard` (or a small `useEventsKeyboard`) gated by `viewMode`.
- **`useEventsDrag`** (new hook, mirrors `useCalendarDrag` structure,
  dnd-kit with `data-date-key` targeting):
  - single card drag → another day: moves the date's `NonShootDate`
    (swap with existing via `moveNonShootDate`);
  - rule-chip body drag → another date: `moveRuleRun`;
  - day-header drag in events mode: `applyDatePermutation` (swap/insert
    cyclic shift) — strips mode keeps today's swap+call-time behavior
    (regression-guarded);
  - **batch drag** of a multi-selection: attachment cards merge into the
    target day's `lists` per category (with `isMultiValue`-aware list merge),
    a status card replaces the target's status, rule chips each remap via the
    chip-drag rule. Clipboard copy/paste of events is NOT included (explicitly
    out of item 45 scope).
- Day cell droppables: `day-{dateKey}` targets in events mode carry
  `{ type: 'DAY_EVENTS', date }` so collision/drop logic is mode-scoped.

### 45.7 Verify (item 45)

- `e2e/calendar-events.spec.ts` (seeded project): mode toggle persists;
  sorted cards render (status/attachments/flags/rule); spanning chips
  collapse consecutive runs and cross week boundaries (bridge-read
  `rule.dates`); filter hides/shows cards per event type (view + modal);
  modal edits status + attachments + rules; multi-select via
  marquee/shift+click/Cmd+A/arrows; batch drag merges/replaces per collision
  rules; chip-body drag mutates `dates`; events-mode day swap swaps events +
  re-maps rule dates but NOT strips; strips-mode day swap regression
  unchanged (`calendar-travel-hold.spec.ts` + `day-types.spec.ts` are the
  guards).
- `npm run lint` + `npx playwright test` (full) before done; `RULES` entry
  in `scripts/smart-test.mjs` for `src/lib/events.ts` + calendar events specs.

---

## Item 46 — Events everywhere

### 46.1 Span chip edge-resize (Apple-style)

- Hovering a spanning (or single) rule chip shows edge grab targets; edge-drag
  adds/removes dates from `rule.dates` one day at a time — extending/shrinking
  the run, across week boundaries (reuse `computeRuleRuns`).
- Edge rules: `DATE_RESTRICTION` floors at 1 date; `TIME_WINDOW`/`MAX_HOURS`
  shrink-to-zero → becomes every-day (chip disappears, tooltip explains).
- Hit-region disambiguation in `useEventsDrag`: chip edges vs chip body vs
  card vs day-header chrome (edge = small inset bar, measured from pointer
  position relative to chip rect).

### 46.2 Shared editor shell

- Extract the DayEventsModal into ONE component that renders in day-centric
  AND element-centric contexts (AGENTS.md Rules 1/4 — no second copy). The
  element-centric mode shows the element's dates + per-date open of the day
  editor (pre-attached).

### 46.3 Element Manager events

- "Events" action per element (LinkManager pattern:
  `elements/LinkManagerModal.tsx` grouped-card modal, header slot; buffered
  rows untouched): per element, lists every date it appears on (attachment in
  any `lists` category or covered by a rule — `isElementMarked` + cast-rule
  scan) + "Add event on a date" (DatePicker → shared day editor pre-attached).

### 46.4 DayTypesTab pane events

- Selected day type's dates list gains event summaries (attachments/conflicts)
  and opens the shared day editor per date (currently dates-only rows).

### 46.5 DatePicker → ui-kit

- Move `src/components/DatePicker.tsx` (116 lines, no store deps — verified)
  into `@gabriel/ui-kit`, tag bump (`v0.1.34`), app consumes the kit export;
  DESIGN-LANGUAGE primitive-row entry (per AGENTS.md §UI Primitives).

### 46.6 Rules-tab retirement

- TRACKED, NOT in scope: remove the tab only after the events UI edits every
  rule type (incl. a global/no-date surface for `CAST_CONFLICT`,
  `CAST_SCENE_FLAG`, every-day `MAX_HOURS`/`TIME_WINDOW`).

### 46.7 Verify (item 46)

- `e2e/events-everywhere.spec.ts`: chip edge-resize grows/shrinks runs across
  weeks; floor + every-day transitions; disambiguation between chip drag
  modes; Element Manager events modal lists/appends dates; DayTypesTab pane
  opens the shared editor; DatePicker renders from the kit export.
- lint + full suite; `RULES` updates.

---

## Docs updates (both items)

- `AGENTS.md` §Calendar Events / Events everywhere (canonical module pointer
  `src/lib/events.ts`, day-status outline, chip semantics).
- `docs/DESIGN-LANGUAGE.md`: event cards, spanning chips, segmented
  `Strips | Events` toggle, DatePicker primitive (46).
- `docs/ROADMAP.md`: 45 → `[x]` ("Done: ..." one-liner), then 46 → `[x]`;
  `docs/ROADMAP-ARCHIVE.md` index refreshed on each close.
- `scripts/smart-test.mjs` RULES rows for `src/lib/events.ts` +
  `src/components/calendar/**` events specs.

## Risks / watch items

- Spanning-chip geometry (per-week overlay) is the riskiest rendering piece —
  keep the strips grid path fully intact; events renderer is additive.
- Date permutation × statused-date cursor invariant — only touch
  `nonShootDates` + rule `dates`; section dates recompute via
  `useDaybreakSections`.
- `useMarquee` generalization must not alter strips-mode marquee.
- `RuleFormModal` pre-seed lands as an optional prop — RulesTab call sites
  untouched.
- `eventsFilter` persistence shape: arrays only (Set not serializable).
- CalendarTab is already 1210 lines — events mode state/UI should extract
  into `src/components/calendar/events/` components + `useEvents*` hooks to
  keep the composition root from growing toward a monolith.