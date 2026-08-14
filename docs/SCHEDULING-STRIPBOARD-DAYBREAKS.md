# Scheduling, Stripboard & Daybreaks — Agent Manual

Status: **read this before touching anything in the schedule.** Covers how days are
defined, how the stripboard orders rows, how call times/dates derive, and the
invariants that must never be broken. The AGENTS.md "Daybreak Model" section is
the short version of this file.

## 1. Mental model (3 bullets)

1. A schedule is a **flat ordered list of rows** (`version.rows`). DAYBREAK rows
   split that list into **sections** — a section = the content between two
   DAYBREAK rows = one production day.
2. **Days are never stored.** Day numbers, dates, call times, totals are all
   *derived* on every render by `computeRowData()` (`src/lib/daybreakUtils.ts:112`),
   memoized per dispatch by `useDaybreakSections()` (`src/lib/useDaybreakSections.ts`).
   The Calendar tab consumes exactly these derived maps — that's why stripboard
   and calendar can never drift.
3. Every version always has exactly one **pinned DAYBREAK** at
   `containerId: 1, order: 0` (`pinned: true`). It is NOT a production day — it's
   an anchor that hosts the "START OF DAY 1" call-time control.

## 2. Source of truth vs derived data

**Stored (the only persisted inputs):**
- `version.rows` — the flat row array; the **positions of DAYBREAK rows are the
  source of truth for the day structure**.
- `version.productionStart` (`YYYY-MM-DD`) — where the date cursor starts.
- `version.nonShootDates` — dates the cursor skips (hold/travel/holiday).
- Each DAYBREAK row's own `daybreakCallTime` — the call-time base for the section
  **below** it (the one user-editable day input).

**Derived (never stored, never cached outside `computeRowData`):**
- `sectionDateMap` (sectionIndex → ISO date), `sectionLabelMap` (→ "Day N"),
  `sectionSums` (total/pages/shoot/break/endTime), per-row `computedCallTime`,
  `computedElapsed`, `daybreakLabel`, `daybreakDate`, `hasNextDaybreak`
  (`daybreakUtils.ts:118-124, 269`).

**Rule: never write a derived day map to state or localStorage.** If a new feature
"needs" a stored day map, it's wrong — derive it from `useDaybreakSections()`.

## 3. Row types & containers

- `RowType = 'SCENE' | 'BREAK' | 'NOTE' | 'DAYBREAK'` (`src/types.ts:3`).
- `ScheduleRow` shape at `src/types.ts:34-61`. `ScheduleVersion` at `:73-82`.
- `containerId`: `null` = Boneyard, `1` = Stripboard, `-1` = Clipboard.
  Use `getContainerBlock(row)` (`src/lib/containers.ts:5`) — never raw checks.
- **Days are NOT containerIds.** `containerId` is just an ordering bucket
  (everything scheduled lives in container 1). Sections are defined by DAYBREAK
  rows. Never add more stripboard containers.

## 4. The daybreak system

### 4.1 Pinned daybreak (section 0)

- Guaranteed by `ensurePinnedDaybreak` (`src/store/rows.ts:4-28`), which runs
  inside `UPDATE_VERSION` (`src/store/actions/schedule.ts:150-160`) and on `LOAD`
  via `ensureAllScenesHaveRows` (`rows.ts:30-55`).
- NOT draggable/deletable, insertion above it is blocked (index bumped to 1),
  footer suppressed, doesn't consume a calendar date, excluded from
  `productionSections` (`useDaybreakSections.ts:43-45`).
- Its "START OF DAY 1" header (rendered only when ≥1 other DAYBREAK exists)
  edits the pinned row's `daybreakCallTime` — the base for the first production
  day.

### 4.2 Two visual rows per DAYBREAK

Every non-pinned DAYBREAK renders as **two** visual rows in
`SortableRowDaybreak.tsx` (`src/components/ribbon/SortableRowDaybreak.tsx`):

| Visual row | Style | Contents |
|---|---|---|
| "End of Day N" footer | white (`getDayFooterColors`, `sceneColors.ts:142`) | label, date, end time (call column), EST shoot + break, total pages — the sums of the section **above** |
| "START OF DAY N+1" header | dark (`getDayHeaderColors`, `sceneColors.ts:138`) | `CellInput` bound to the daybreak's **own** `daybreakCallTime`, next day's date | 

The header input edits **this daybreak's own** `daybreakCallTime` — the daybreak
row is the source of truth for the call time of the day *below* it.
`StripBlock.tsx:174-178` (`updateDaybreakRow`) + `:252-259` (`nextDaybreakMap`).

### 4.3 How sections split

`splitSections(rows)` (`daybreakUtils.ts:96-110`) pushes `{ index, rows, daybreakRow }`
at every DAYBREAK. Layout invariant:

```
[DAYBREAK 0 pinned] [content] [DAYBREAK 1] [content] [DAYBREAK 2] [content] ...
 section 0            ^sec 0^  sec 1      ^sec 1^  sec 2      ^sec 2^
```

- `dayCounter` increments only on non-pinned daybreaks (`daybreakUtils.ts:161-164`).
- The **trailing section** (content after the last DAYBREAK) is finalized after
  the loop (`:258-267`) but has no closing daybreak, so no "End of Day" footer
  renders for it.
- Deleting a daybreak merges its day into the previous section; adding one
  splits. Everything re-derives on the next dispatch.

## 5. Call times

```
row.computedCallTime = addMinutesToTime(sectionBaseTime, sectionElapsed)
sectionBaseTime     = the daybreakCallTime of the DAYBREAK ABOVE the section
sectionElapsed      = accumulated duration within the section only
```

- `addMinutesToTime` wraps mod 24 (`src/lib/utils.ts:113`).
- `sectionEndTime` = `sectionBaseTime + sectionElapsed` at the daybreak
  (`daybreakUtils.ts:157`).
- Rules engine uses the same model: `checkSection(...)` (`src/lib/rulesEngine.ts`).
- Calendar day moves **swap the governing daybreaks' call times** so call times
  travel with content (`useCalendarDrag.ts:207-217`; pinned participates for
  section 1).

## 6. Dates & day numbering

- Date cursor starts at `productionStart`, **skips non-shoot dates**, advances
  +1 day per non-pinned daybreak; the pinned daybreak consumes no date
  (`daybreakUtils.ts:147-152`).
- Labels: `sectionLabelMap` = "Day 1", "Day 2", …; `chronoDay` 0 for pinned.
- Calendar = real months from `productionStart` to max `sectionDateMap`, with
  rows bucketed by `sectionDateMap` inverted (`CalendarTab.tsx:381-403`).
- `daybreakDate` on stored rows is legacy-only (`legacyMigration.ts`) — ignore
  it; the live date comes from `computeRowData`.

## 7. Insert position rules

Given `[pinned][content][DB][content][DB]...`:
- **Day has rows** → insert after the day's last row.
- **Empty day** → insert before the day's closing daybreak.
- **First production day empty** → insert after the pinned daybreak
  (`pinned.order + 0.5`).
- Same rule for drag-drop, context-menu add/paste, and Calendar day-body actions.

Prefer **fractional orders**: `insertionOrder(dayRows, insertIndex)` =
`(prev+next)/2` midpoint (`daybreakUtils.ts:303-310`). `renumberRows`
(`:281-294`) densifies while preserving object identity when already dense.

## 8. Mutation paths & hard invariants

**Only two row-mutation actions exist** (there are NO ADD_ROW/DELETE_ROW types):
- `UPDATE_ROW` — single-row patch (`reducer.ts:150`, handler `schedule.ts:162`).
- `UPDATE_VERSION` — replaces the whole `rows` array; **always re-runs
  `ensurePinnedDaybreak`** (`schedule.ts:150-160`).

All add/delete/move logic lives in helpers (`useStripboardContextMenu.ts`,
`useScheduleDrag.ts`, `useCalendarDrag.ts`, `useScheduleKeyboard.ts`,
`calendarUtils.ts`, `ScheduleTab.tsx`) that build a new array and dispatch.
Multi-dispatch flows wrap in `BATCH_START`/`BATCH_COMMIT` for one undo entry.

**MUST NOT (each one costs real bugs):**
1. **Never store derived day data** (maps, call times, totals) in state/localStorage.
2. **Never mutate a row object.** Rows are immutable; a changed row is a new
   object. `computeRowData` caches `ComputedRow`s in a WeakMap keyed by raw row +
   fingerprint (`daybreakUtils.ts:69-94`) — mutating breaks the cache and the
   memo contract.
3. **Never rebuild the whole `rows` array by spreading every row on hot paths**
   (drag, paste, context-menu). Use fractional orders / `renumberRows` so
   untouched rows keep object identity, or every stripboard row re-renders.
4. **Never dispatch from per-row components.** Row components receive
   `dispatch` as props; `useProject()` in a row component re-renders all rows on
   every dispatch. (`StripBlock`/`SortableRibbon` are the composition layer.)
5. **Never bypass `ensurePinnedDaybreak`** — don't dispatch `UPDATE_VERSION`
   with rows lacking exactly one pinned DAYBREAK at `1/0`.
6. **Never insert above the pinned daybreak** — bump insert index to 1.
7. **Never add a stripboard containerId** — sections are DAYBREAK rows.
8. `SortableContext items` must be memoized by **id-sequence string**, not array
   identity (`StripBlock.tsx:272-273`).
9. Row identity contract: `computeRowData` reuses computed-row objects when
   computed fields match — unchanged rows keep identity across dispatches
   (this is what makes React.memo on rows work).

## 9. Worked example

Rows (containerId 1, sorted), `productionStart: 2026-08-17`, no non-shoot dates:

```
[0] DAYBREAK pinned  call 08:00     ← pinned (not a day)
[1] SCENE "INT. CAFE - DAY"       30m / 2pgs
[2] SCENE "EXT. STREET - DAY"     45m / 3pgs
[3] BREAK "LUNCH"                 60m
[4] DAYBREAK                       call 09:30   ← daybreak 1
[5] SCENE "INT. OFFICE - NIGHT"   20m / 1pg
[6] DAYBREAK                       call 08:00   ← daybreak 2 (trailing)
```

| Section | Opening daybreak (base) | Row call times | Date | Label |
|---|---|---|---|---|
| 0 | pinned 08:00 | — | 08-17 | — |
| 1 | pinned (08:00) | 08:00, 08:30, 09:15 | 08-18 | Day 1 |
| 2 | daybreak 1 (09:30) | 09:30 | 08-19 | Day 2 |
| 3 | daybreak 2 (08:00) | — | 08-20 | trailing, empty |

Rendered: pinned → "START OF DAY 1" (input edits pinned's 08:00).
Daybreak 1 → "End of Day 1" footer (EST 1:15 + 1:00 break, 5 pgs, end 10:15,
08-18) + "START OF DAY 2" (input edits 09:30 → base for Day 2).
Daybreak 2 → "End of Day 2" footer only (0:20, 1 pg, end 09:50, 08-19).

## 10. Common tasks (agent recipes)

- **Add a row to a day** → build the array with a fractional order
  (`insertionOrder`), dispatch `UPDATE_VERSION`. Context-menu path:
  `useStripboardContextMenu.ts:224-235`.
- **Edit a call time** → `UPDATE_VERSION` with one changed daybreak row
  (`StripBlock.tsx:174-178`) or `UPDATE_ROW`.
- **Delete a daybreak** → filter it from `rows` (pinned guarded), renumber,
  `UPDATE_VERSION` (`useStripboardContextMenu.ts:264-272`).
- **Move rows between days** → set `containerId` + fractional order
  (`useScheduleDrag.ts:84-208`; pinned guard at `:157-159`).
- **Calendar day swap** → `useCalendarDrag.ts:196-222` (exchanges content AND
  governing daybreak call times).
- **Auto daybreaks / Delete All** → `ScheduleTab.tsx:893-966` / `:690-704`.
- **Add banners per day** → `handleAddBanners` (`ScheduleTab.tsx:783-858`),
  middle position via `computeMiddleInsertIndex` (`daybreakUtils.ts:312-354`).
- **Verify a change didn't break the model** → see checklist below.

## 11. Verification checklist

After any schedule change, confirm:
1. `npm run lint` passes.
2. Exactly one pinned DAYBREAK at `containerId 1, order 0` per version
   (dispatch `UPDATE_VERSION` and it self-heals, but never ship rows that
   violate it).
3. Day numbers are contiguous ("Day 1", "Day 2", …) with no gaps, dates advance
   monotonically and skip non-shoot dates.
4. Row `order` values keep untouched rows' object identity (fractional inserts,
   no mass spreads on hot paths).
5. E2E: `npx playwright test` (stripboard/calendar/glide flows in
   `e2e/seeded-smoke.spec.ts`).
