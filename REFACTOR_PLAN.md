# Day-Break-Driven Scheduling Refactor Plan

> **Branch**: `day-breaks-v3`
> **Date**: 2026-06-29
> **Target**: Move from static-date working days to a flow-based day-break system, inspired by Movie Magic Scheduling / StudioBinder.

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Current System Summary](#2-current-system-summary)
3. [New Architecture](#3-new-architecture)
4. [Data Model Changes](#4-data-model-changes)
5. [Date Derivation Utility](#5-date-derivation-utility)
6. [Store Changes](#6-store-changes)
7. [Stripboard Refactor](#7-stripboard-refactor)
8. [Calendar Refactor](#8-calendar-refactor)
9. [Other Files to Update](#9-other-files-to-update)
10. [Migration Strategy](#10-migration-strategy)
11. [Implementation Phases](#11-implementation-phases)
12. [Risks & Tradeoffs](#12-risks--tradeoffs)
13. [File-by-File Effort Estimate](#13-file-by-file-effort-estimate)
14. [Open Questions for Future](#14-open-questions-for-future)
15. [User-Confirmed Design Decisions](#15-user-confirmed-design-decisions)

---

## 1. Overview & Goals

### Current System (What Exists Now)

- Each working day has a **static date** stored in `ScheduleVersion.dayMeta[N].date`.
- The **Calendar tab** is used to paint calendar dates as "working" / "hold" / "travel" / "holiday" using toolbar tools.
- The **stripboard** renders days sorted by their stored date order and displays `DAY #N` headers.
- There is **no weekend detection**, no recurring-off-day logic, and no "day break" concept (`BREAK` rows are intra-day lunch-style breaks, not between days).
- Dates are permanently tied to specific dayMeta entries; changing a day's date requires manually dragging in the calendar or re-painting.

### Target System (Movie Magic / StudioBinder-Style)

- The stripboard flows top-to-bottom: **DAY_BREAK rows** define working day groups. Everything between two consecutive day breaks is one shooting day.
- A **production start date** sets when Day 1 begins on the calendar.
- Working-day dates are **always derived** from: start date + day sequence position, skipping explicitly marked **days off**.
- The **Calendar** becomes a management tool for:
  - Setting the production start date
  - Marking holidays, custom days off, and auto-weekends (default ON: Sat + Sun)
  - Viewing derived working-day assignments
  - Inserting working days at specific calendar positions (right-click)
- **Adding a day break** in the stripboard creates a new working day at the next available calendar date (skipping days off). All scenes below the break flow into the new day.
- **Calendar right-click → "Insert working day"** inserts a day break at that calendar position, automatically shifting all subsequent working days forward.
- Existing functionality (drag-and-drop, undo/redo, reports, rules engine, print) must continue working without regression.

---

## 2. Current System Summary

### Data Model

| Entity | File | Key Fields |
|---|---|---|
| `ScheduleRow` | `src/types.ts:35-55` | `id, type ('SCENE' \| 'BREAK' \| 'NOTE'), shootDay (number \| null \| -1), order, sceneId?, estimatedDuration?, breakLabel?, ...` |
| `ShootDayMeta` | `src/types.ts:57-64` | `shootDay, unitCall, date (YYYY-MM-DD), status? ('work' \| 'hold' \| 'travel' \| 'holiday'), castIds?` |
| `ScheduleVersion` | `src/types.ts:66-73` | `id, name, rows: ScheduleRow[], dayMeta: Record<number, ShootDayMeta>` |
| `Project` | `src/types.ts:203-226` | `scenes, versions, activeVersionId, rules, castMembers` |

### Key Sentinels

- `ScheduleRow.shootDay === null` → unscheduled (boneyard sidebar)
- `ScheduleRow.shootDay === -1` → clipboard / cut buffer
- `ScheduleRow.shootDay >= 1` → assigned to that dayMeta key
- `ShootDayMeta.date` is **user-assigned** (painted in calendar), stored as `"YYYY-MM-DD"`
- A calendar date with **no** `dayMeta` entry = "day off" / non-working (absence-based, not explicit)

### How Dates Flow

```
Scene → ScheduleRow.shootDay → dayMeta[N].date → Calendar cell
                                dayMeta[N].status → badge/color
```

### Calendar Working-Day Creation

`TOGGLE_WORKING_DAY` (store.tsx:542-567): looks for an existing dayMeta entry by `date`. If not found, creates one with `shootDay = max(existing keys) + 1`. Shoot day IDs are monotonic, never renumbered. Gaps can form (e.g., deleting day 3 leaves keys {1, 2, 4, 5...}).

### Stripboard Day Rendering

- `existingDays` (ScheduleTab.tsx:656-662): `dayMeta` keys sorted by `.date` → iteration order for DayBlock.
- `chronoDayMap` (ScheduleTab.tsx:664-672): maps `shootDay → chronologicalDayNumber` (only work-status days, sorted by date). This is the displayed "DAY #N".
- Same `chronoDayMap` recomputed independently in: `CalendarTab`, `PrintSchedule`, `DoodsTab`, `Dood.tsx`, `SceneSheet`.

### Right-Click Context Menu (Stripboard)

- ScheduleTab.tsx:1260-1274 captures `[data-row-id]` and stores `{ x, y, rowId, shootDay }`.
- Menu items (lines 1361-1428): Cut/Paste, "Add Note Below", "Add Break Below", Duplicate (ghost scene), Duplicate Note/Break, Change Color, Remove Ribbon, Delete.
- No "Day Break" option exists.

### Calendar Interactions

- Tool palette: Select / Work / Hold / Travel / Holiday / Eraser.
- Click/double-click dates → set status; right-click → context menu for status changes.
- Drag scenes between calendar cells; drag whole day headers to swap dates.

---

## 3. New Architecture

### Core Concept

```
Stripboard Rows Array:
  [Scene A (Day 1)] → [Scene B (Day 1)] → [DAY_BREAK] → [Scene C (Day 2)] → [Scene D (Day 2)] → [DAY_BREAK] → [Scene E (Day 3)]

Day Groups (derived from break positions):
  Day 1 = [Scene A, Scene B]
  Day 2 = [Scene C, Scene D]
  Day 3 = [Scene E]

Calendar Dates (derived from start date + groups, skipping days off):
  startDate = 2026-06-29 (Monday)
  Day 1 → 2026-06-29 (Mon)
  Day 2 → 2026-06-30 (Tue)
  Day 3 → 2026-07-01 (Wed)
  (weekend July 4-5 automatically skipped if autoWeekends ON)
```

### Day Break Row

- A new `RowType`: `'DAY_BREAK'`.
- Sits in `version.rows` between scene groups.
- Renders as a visible **separator/banner**, styled like the current day footer (`"End of Day N · DATE"`).
- Functions as both footer for the previous day AND the implicit header for the next day group.
- View toggle: **Full** (day headers + day break footers) vs **Compact** (footers only, like Movie Magic's banner-only style).
- Supports right-click (remove, re-position) and drag (move break position to adjust group boundaries).
- `shootDay` on a DAY_BREAK row = the day number it **ends** (e.g., break after Day 3 group has implicit `shootDay: 3`).

### Derived Dates (Hybrid Approach)

For minimal disruption, we use a **hybrid** model:
1. `ShootDayMeta.date` is **no longer user-editable** and removed from all mutation forms.
2. After every scheduling change (day break add/remove/move, start date change, days off change), a derivation utility recomputes all dates and **writes them into `dayMeta[N].date`**.
3. All existing readers (CalendarTab derived maps, DayBlock header, rules engine, DOOD, print) continue reading `dayMeta[N].date` without changes.
4. The derivation math is centralized in `src/lib/scheduling.ts`.

This preserves backward compatibility at the reader level while making the behavioral shift on the mutation side.

---

## 4. Data Model Changes

### 4.1 `src/types.ts`

```typescript
// New RowType
type RowType = 'SCENE' | 'BREAK' | 'NOTE' | 'DAY_BREAK';

// New types for production calendar configuration
interface DayOffEntry {
  date: string;                       // "YYYY-MM-DD"
  type: 'weekend' | 'holiday' | 'custom';
  label?: string;                     // e.g. "Christmas Day", "Company Move Day"
}

interface ProductionCalendar {
  startDate: string | null;           // "YYYY-MM-DD", null = not set
  daysOff: Record<string, DayOffEntry>;  // date key → entry
  autoWeekends: boolean;              // default: true
  weekendDays: number[];              // default: [0, 6] = Sun, Sat (0 = Sunday per JS Date.getDay())
}

type StripViewMode = 'full' | 'compact';

// Modified ScheduleVersion
interface ScheduleVersion {
  // ... existing fields ...
  calendar: ProductionCalendar;       // NEW: per-version production calendar
  stripView: StripViewMode;           // NEW: 'full' (default) | 'compact'
}

// ShootDayMeta.date becomes derived (read-only to user, auto-managed)
// TSDoc updated: "Derived — do not edit directly. Set via calendar daysOff / startDate."
interface ShootDayMeta {
  shootDay: number;
  unitCall: string;
  date: string;                       // NOW: auto-derived, not user-editable
  order?: number;
  status?: 'work' | 'hold' | 'travel' | 'holiday';
  castIds?: string;
}
```

### 4.2 Migration Trigger

- Detect legacy projects by absence of `version.calendar` field.
- On load, run migration (see Section 10).

---

## 5. Date Derivation Utility

### 5.1 New File: `src/lib/scheduling.ts`

Centralized, pure functions. No React, no date library (native `Date`).

```typescript
// ---------- Helpers ----------

/** Format native Date → "YYYY-MM-DD" */
function formatDateKey(date: Date): string;

/** Parse "YYYY-MM-DD" → Date (local midnight) */
function parseDateKey(str: string): Date;

/** Is a date a weekend based on configured weekend days? */
function isWeekend(date: Date, weekendDays: number[]): boolean;

/** Is a date in the daysOff map? */
function isInDaysOff(dateKey: string, daysOff: Record<string, DayOffEntry>): boolean;

/** Full off-day check: daysOff map OR (autoWeekends AND weekend) */
function isOffDay(
  date: Date,
  calendar: ProductionCalendar
): boolean;

// ---------- Core Derivation ----------

/**
 * Derive calendar dates for N working days.
 * Returns Map<dayNumber, dateString>.
 * Day numbering is 1-based (Day 1, Day 2, ...).
 */
function deriveDayDates(
  calendar: ProductionCalendar,
  numberOfDays: number
): Map<number, string>;

/**
 * Get the next available working date after a given date.
 * Skips all off days. Returns "YYYY-MM-DD" or null if no start date.
 */
function getNextAvailableDate(
  afterDate: string,
  calendar: ProductionCalendar
): string | null;

// ---------- Day Group Computation ----------

/**
 * Partition scheduled rows (shootDay: positive) into day groups
 * separated by DAY_BREAK rows. Returns array of groups, each group = rows[].
 * Group index (0-based) + 1 = day number.
 */
function computeDayGroups(rows: ScheduleRow[]): ScheduleRow[][];

/**
 * Given rows with DAY_BREAK separators, nudge `shootDay` on every scene
 * row to match its group index. DAY_BREAK rows get the group they end.
 * Unscheduled rows (shootDay: null) are untouched.
 * Returns a new rows array (non-mutating).
 */
function deriveShootDays(rows: ScheduleRow[]): ScheduleRow[];

/**
 * Recompute all dayMeta[N].date values from the current calendar config
 * and the number of day groups present in the version's rows.
 * Also creates dayMeta entries for new groups and prunes stale ones,
 * preserving unitCall, status, and castIds where groups are re-matched.
 * Returns a new dayMeta record.
 */
function recomputeVersionDates(
  dayMeta: Record<number, ShootDayMeta>,
  rows: ScheduleRow[],
  calendar: ProductionCalendar
): Record<number, ShootDayMeta>;

// ---------- Calendar View Helpers ----------

/**
 * Builds enriched day entries for a calendar month grid:
 * [{ date: "YYYY-MM-DD", isOff: boolean, offLabel?: string, dayNumber?: number }]
 */
function getCalendarMonthDays(
  year: number,
  month: number,
  calendar: ProductionCalendar,
  derivedDates: Map<number, string>
): CalendarDayEntry[];

/**
 * Inverse of deriveDayDates: given a date, find which day number
 * it maps to. Returns undefined if the date is not a working day.
 */
function getDayNumberForDate(
  date: string,
  derivedDates: Map<number, string>
): number | undefined;
```

### 5.2 Algorithm: `deriveDayDates`

```
cursor = new Date(calendar.startDate)
if startDate is null → return empty Map (no production calendar configured)

result = new Map()
dayNumber = 1
while dayNumber <= numberOfDays:
  if not isOffDay(cursor, calendar):
    result.set(dayNumber, formatDateKey(cursor))
    dayNumber++
  cursor.setDate(cursor.getDate() + 1)
return result
```

### 5.3 Algorithm: `computeDayGroups`

```
groups = [[]]
currentGroupIndex = 0
for each row in rows (filtered to shootDay: positive + DAY_BREAK, ordered by row.order):
  if row.type === 'DAY_BREAK':
    groups[++currentGroupIndex] = []
  else:
    groups[currentGroupIndex].push(row)
return groups
```

### 5.4 Algorithm: `deriveShootDays`

```
newRows = deepClone(rows)
groups = computeDayGroups(rows)
for each row in newRows:
  if row.type === 'DAY_BREAK':
    // Find which group this break ends
    row.shootDay = findGroupContainingBreak(rows, row) + 1
  else if row.shootDay !== null && row.shootDay !== -1:
    // Assign based on group
    row.shootDay = findGroupForRow(groups, row.id) + 1
return newRows
```

---

## 6. Store Changes

### 6.1 New Actions

| Action | Payload | Description |
|---|---|---|
| `ADD_DAY_BREAK` | `{ versionId, afterRowId }` | Inserts a DAY_BREAK row after `afterRowId`. Splits current day group in two. Runs `deriveShootDays` + `recomputeVersionDates`. |
| `REMOVE_DAY_BREAK` | `{ versionId, breakRowId }` | Removes a DAY_BREAK row. Merges two adjacent day groups. Runs `deriveShootDays` + `recomputeVersionDates`. |
| `INSERT_WORKING_DAY` | `{ versionId, date }` | Inserts a DAY_BREAK at the stripboard position corresponding to `date` in the derivation. If `date` is after all working days, appends at end. Removes `date` from `daysOff` if present. Runs derivation. |
| `SET_PRODUCTION_START` | `{ versionId, date }` | Sets `calendar.startDate`. Recomputes all working-day dates. |
| `SET_DAYS_OFF` | `{ versionId, date, entry }` | Adds or removes a `DayOffEntry` for a date. Explicit entry overrides auto-weekend for that date. Recomputes dates. |
| `TOGGLE_AUTO_WEEKENDS` | `{ versionId, value }` | Toggles `autoWeekends`. Recomputes dates. |
| `SET_WEEKEND_DAYS` | `{ versionId, days }` | Customize which weekdays are weekends (e.g., `[0, 6]` for Sat-Sun or `[5, 6]` for Fri-Sat). Recomputes dates. |
| `SET_STRIP_VIEW` | `{ versionId, mode }` | Sets `stripView` to `'full'` or `'compact'`. No derivation needed. |

Each scheduling-mutating action wraps the mutation in `BATCH_START`/`BATCH_COMMIT`, updates the version, and calls the shared `applySchedulingDerivation` helper.

### 6.2 Shared Helper: `applySchedulingDerivation`

```typescript
function applySchedulingDerivation(state: State, versionId: string): State {
  const version = findVersion(state.present, versionId);
  if (!version) return state;
  
  const newRows = deriveShootDays(version.rows);
  const newDayMeta = recomputeVersionDates(version.dayMeta, newRows, version.calendar);
  
  return updateVersion(state, versionId, {
    rows: newRows,
    dayMeta: newDayMeta,
    updatedAt: Date.now(),
  });
}
```

Called after every action that changes rows, day breaks, or calendar config.

### 6.3 Modified Existing Actions

- **`UPDATE_VERSION`**: When `rows` is included in the partial, also run derivation after the merge (ensure `shootDay` stays consistent with DAY_BREAK positions).
- **`UPDATE_DAY_META`**: Disallow setting `date` (derived now). Still handle `unitCall`, `status`, `castIds`.
- **`DELETE_DAY`**: Now removes the corresponding DAY_BREAK row (if any) and merges the adjacent groups. If no DAY_BREAK exists (legacy migration gap), still removes dayMeta + unschedules rows.
- **`UNSCHEDULE_DAY`**: Removes the DAY_BREAK marking that day's end. Rows flow into next/previous group. Remaining break adjusts.
- **`NEW_VERSION` (clone)**: Now clones `calendar` and `stripView`. Previously only `dayMeta` was preserved via clone (`{ 1: { ... } }`).
- **`TOGGLE_WORKING_DAY`**: Deprecated. Calendar no longer paints working days directly. Replaced by `SET_DAYS_OFF` + `INSERT_WORKING_DAY`. Keep as fallback for legacy (maps to `SET_DAYS_OFF` removal).

### 6.4 Action: `ADD_DAY_BREAK` Detail

```
1. Find the version.
2. Find the target row (afterRowId) and its current day group.
3. Insert a new DAY_BREAK row at order = targetRow.order + 0.5:
   { id: generateUUID(), type: 'DAY_BREAK', order, shootDay: undefined }
4. Assign the new break's shootDay to the current group's day number (derived later).
5. All scene rows below this break re-group into the new day group (day number + 1).
6. All subsequent day groups increment day number by 1.
7. Re-sort rows by order, fill gaps, call deriveShootDays.
8. Call recomputeVersionDates to backfill dayMeta[N].date for all groups.
9. Dispatch UPDATE_VERSION with new rows + new dayMeta.
```

### 6.5 Action: `INSERT_WORKING_DAY` Detail

```
1. Derive current dates: derivedDates = deriveDayDates(calendar, numberOfGroups).
2. Find the insertion point:
   a. If `date` is past all derived dates → append at end (new DAY_BREAK after last group).
   b. If `date` is between day N's derived date and day N+1's derived date → insert after day N.
   c. If `date` matches an existing working day → no-op or insert adjacent.
3. If `date` was in daysOff, remove it.
4. Create DAY_BREAK row at the appropriate position.
5. All subsequent groups re-derive with one extra slot.
6. Run derivation + update.
```

### 6.6 Migration (App-Level, on localStorage Load)

Detect legacy: `!version.calendar` on any version in the loaded project.

```typescript
function migrateVersionToDayBreaks(version: ScheduleVersion): ScheduleVersion {
  // 1. Collect all working day groups, ordered by existing date
  const dayEntries = Object.entries(version.dayMeta)
    .filter(([, meta]) => meta.date && (!meta.status || meta.status === 'work'))
    .sort(([, a], [, b]) => (a.date || '').localeCompare(b.date || ''));
  
  // 2. Set calendar config
  const startDate = dayEntries[0]?.[1]?.date || null;
  const autoWeekends = detectWeekendSkips(dayEntries); // heuristic
  const calendar: ProductionCalendar = {
    startDate,
    daysOff: {},
    autoWeekends,
    weekendDays: [0, 6],
  };
  
  // 3. Get version rows sorted by order
  const sortedRows = [...version.rows].sort((a, b) => a.order - b.order);
  
  // 4. Group rows by shootDay, ordered by dayEntries chronology
  const shootDayOrder = dayEntries.map(([k]) => Number(k));
  const newRows: ScheduleRow[] = [];
  
  for (let i = 0; i < shootDayOrder.length; i++) {
    const dayNum = shootDayOrder[i];
    const dayRows = sortedRows.filter(r => r.shootDay === dayNum).sort((a, b) => a.order - b.order);
    newRows.push(...dayRows);
    if (i < shootDayOrder.length - 1) {
      // Insert DAY_BREAK between groups
      newRows.push({
        id: generateUUID(),
        type: 'DAY_BREAK' as RowType,
        order: (dayRows[dayRows.length - 1]?.order || 0) + 0.5,
        shootDay: undefined as any,
      });
    }
  }
  
  // 5. Re-assign shootDay via derivation
  const derivedRows = deriveShootDays(newRows);
  const newDayMeta = recomputeVersionDates(version.dayMeta, derivedRows, calendar);
  
  return {
    ...version,
    rows: derivedRows,
    dayMeta: newDayMeta,
    calendar,
    stripView: 'full',
  };
}

function detectWeekendSkips(dayEntries: [string, ShootDayMeta][]): boolean {
  // If any working day is a Saturday or Sunday, autoWeekends = false.
  // Otherwise (all work days are Mon-Fri), autoWeekends = true.
  for (const [, meta] of dayEntries) {
    if (!meta.date) continue;
    const d = new Date(meta.date + 'T00:00:00');
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) return false;
  }
  return true;
}
```

---

## 7. Stripboard Refactor

### 7.1 `ScheduleTab.tsx`

#### Day Groups Derivation (replaces `existingDays` + `chronoDayMap`)

```typescript
// OLD (lines 656-672):
const existingDays = useMemo(() => {
  return Object.keys(dayMeta).map(Number)
    .filter(k => dayMeta[k]?.date)
    .sort((a, b) => (dayMeta[a]?.date || '').localeCompare(dayMeta[b]?.date || ''));
}, [dayMeta]);

// NEW:
const dayGroups = useMemo(() => computeDayGroups(augmentedRows), [augmentedRows]);
const existingDays = dayGroups.map((_, i) => i + 1);
const derivedDates = useMemo(() => {
  const calendar = activeVersion?.calendar;
  if (!calendar?.startDate) return new Map();
  return deriveDayDates(calendar, dayGroups.length);
}, [activeVersion?.calendar, dayGroups.length]);
// chronoDayMap is now: existingDays.map(d => [d, d]) (day group index = day number)
```

#### Context Menu Additions

In `handleContextMenuAction` (line ~683):
```typescript
case 'add_day_break': {
  // Insert DAY_BREAK after contextRow at order = row.order + 0.5
  dispatch({ type: 'ADD_DAY_BREAK', versionId: activeVersion.id, afterRowId: context.rowId });
  close();
  break;
}
case 'remove_day_break': {
  dispatch({ type: 'REMOVE_DAY_BREAK', versionId: activeVersion.id, breakRowId: context.rowId });
  close();
  break;
}
```

In context menu JSX (line ~1361):
```tsx
{/* After "Add Break Below", add: */}
<ContextMenuItem onClick={() => handleContextMenuAction('add_day_break')}>
  <SeparatorHorizontal className="w-3.5 h-3.5" />
  Add Day Break Below
</ContextMenuItem>

{/* When right-clicking a DAY_BREAK row, show: */}
{context.rowId && row?.type === 'DAY_BREAK' && (
  <>
    <ContextMenuDivider />
    <ContextMenuItem onClick={() => handleContextMenuAction('remove_day_break')} variant="danger">
      <Trash2 className="w-3.5 h-3.5" />
      Remove Day Break
    </ContextMenuItem>
  </>
)}
```

#### Drag Handling for DAY_BREAK

- DAY_BREAK rows are naturally sortable (they're in the `SortableContext` of their enclosing group).
- `handleDragEnd`: treat DAY_BREAK drag the same as scene drag — compute new position, derive shootDays, run derivation.
- No special `DAY`-type drag (that branch was already dead code for the stripboard; keep dead for now).

#### Digit Buffer Assignment

- Already assigns to chronoDay. With day-group-index = day number, mapping stays 1:1. No change needed.

### 7.2 `DayBlock.tsx`

#### Props Changes

```typescript
interface DayBlockProps {
  // ... existing ...
  stripView: StripViewMode;   // NEW: 'full' | 'compact'
  isLastGroup: boolean;       // NEW: has no trailing DAY_BREAK (last day)
  dayBreakRow: ScheduleRow | null;  // NEW: the DAY_BREAK row ending this group (if not last)
}
```

#### Header in Compact Mode

```tsx
// Current (line ~219-272): always renders day header table row
// NEW: conditionally hide header in compact mode
{stripView === 'full' && (
  <DayHeader dayInt={dayInt} meta={meta} chronoDay={chronoDay} ... />
)}
```

#### Footer / Day Break Banner

- In `'full'` mode: footer rendered as today (with day break styling difference).
- In `'compact'` mode: if not last group, the DAY_BREAK row renders inline as a colored banner separator at the bottom of the day block. The day block renders no header — the previous group's day break banner IS the visual header for the next group.
- The DAY_BREAK row is rendered by `SortableRow` (see 7.3) but appears at the end of the day block in the rows array ordering.

### 7.3 `SortableRow.tsx`

#### DAY_BREAK Row Variant

```tsx
if (row.type === 'DAY_BREAK') {
  const derivedDate = dayMeta[row.shootDay]?.date;
  return (
    <div
      data-row-id={row.id}
      data-shoot-day={row.shootDay}
      className={cn(
        'day-break-banner flex items-center justify-between px-3 py-1 text-xs font-medium',
        'bg-zinc-800 text-zinc-300 border-t border-b border-zinc-700',
        isDragging && 'opacity-50',
      )}
      style={node.listeners ? {} : undefined}
      {...node.attributes}
      {...node.listeners}
    >
      <span>END OF DAY {row.shootDay}</span>
      <span className="text-zinc-500">{formatDateLong(derivedDate)}</span>
      <span className="text-zinc-500">
        {/* calculated total pages/time for the day above */}
      </span>
    </div>
  );
}
```

- No scene info, no call time, not inline-editable (V1).
- `useSortable` wraps it normally → drag to reorder.
- Context menu captured by `data-row-id` → "Remove Day Break".

### 7.4 `UnscheduledBlock.tsx`

- No structural change. Unscheduled rows (`shootDay: null`) stay in sidebar, unaffected by DAY_BREAK rows.
- "Add Day Break Below" context menu item should NOT appear in boneyard (filtered out when `shootDay === null`).

### 7.5 View Toggle

In `App.tsx` or ScheduleTab header toolbar:
- Segmented button: `Full` | `Compact`.
- Dispatches `SET_STRIP_VIEW`.
- Updated help text in tooltip.

---

## 8. Calendar Refactor

### 8.1 New Primary Purpose

The calendar is now a **calendar management panel**, not a working-day painting tool:
- Set/view production start date
- Mark days off (holidays, custom, auto-weekends on by default)
- See which dates are assigned to each working day (derived from stripboard)
- Insert working days at specific dates
- Rearrange scenes between day cells (drag-and-drop preserved)
- Hold/travel/holiday status days

### 8.2 New UI Elements

**Calendar header** (replaces/existing alongside current toolbar):
```
[Start: 2026-06-29 📅]  [✓ Auto Weekends]  [Sat-Sun ▾]
```

- **Start date input**: Native `<input type="date" />` or date picker.
- **Auto-weekends toggle**: Checkbox or switch.
- **Weekend days selector**: Small dropdown for "Sat-Sun", "Fri-Sat", etc.

**Calendar grid cells**:
- **Day off cell**: Small badge `WEEKEND`, `HOLIDAY: Christmas`, or `OFF`.
- **Start date cell**: `START` badge.
- **Working day cell**: Shows `DAY #N · derivedDate` + scene cards (as today).

### 8.3 Right-Click Context Menu

```tsx
{/* Empty/unassigned date: */}
<ContextMenuItem onClick={() => dispatch({ type: 'INSERT_WORKING_DAY', versionId, date })}>
  <Plus className="w-3.5 h-3.5" />
  Insert Working Day Here
</ContextMenuItem>
<ContextMenuItem onClick={() => handleToggleDayOff(date, { type: 'custom' })}>
  <CalendarOff className="w-3.5 h-3.5" />
  Mark as Day Off
</ContextMenuItem>
<ContextMenuItem onClick={() => openHolidayModal(date)}>
  <TreePine className="w-3.5 h-3.5" />
  Mark as Holiday...
</ContextMenuItem>
<ContextMenuDivider />
<ContextMenuItem onClick={() => dispatch({ type: 'SET_PRODUCTION_START', versionId, date })}>
  <Play className="w-3.5 h-3.5" />
  Set as Production Start
</ContextMenuItem>

{/* Working day cell: */}
<ContextMenuItem onClick={() => dispatch({ type: 'INSERT_WORKING_DAY', versionId, date })}>
  Insert Day Before This
</ContextMenuItem>
<ContextMenuItem onClick={() => handleSetStatus(date, 'hold')}>
  <Pause className="w-3.5 h-3.5" />
  Set as Hold Day
</ContextMenuItem>
<ContextMenuItem onClick={() => handleSetStatus(date, 'travel')}>
  <Truck className="w-3.5 h-3.5" />
  Set as Travel Day
</ContextMenuItem>
<ContextMenuItem onClick={() => handleRemoveWorkingDay(date)} variant="danger">
  Remove Working Day
</ContextMenuItem>
```

### 8.4 Derived Dates in Calendar

```typescript
const derivedDates = useMemo(() => {
  const cal = activeVersion?.calendar;
  if (!cal?.startDate) return new Map<number, string>();
  const groups = computeDayGroups(augmentedRows);
  return deriveDayDates(cal, groups.length);
}, [activeVersion?.calendar, augmentedRows]);

const dateToDayMap = useMemo(() => {
  const map = new Map<string, number>();
  derivedDates.forEach((date, day) => map.set(date, day));
  return map;
}, [derivedDates]);
```

Each calendar cell checks `dateToDayMap.get(cellDate)` → if found, working day N → render day header + scenes. If not, off day → render off badge.

### 8.5 Drag-and-Drop

Preserved as-is from current implementation. Scene cards dropped on a calendar day cell = reassign to that day group (move in stripboard). Whole-day drag (re-date) removed — dates are derived, not drag-adjustable.

### 8.6 Status Days (Hold/Travel/Holiday)

- Hold/Travel/Holiday days occupy a calendar slot.
- They are created via `UPDATE_DAY_META` setting `status`.
- In the stripboard, they render as the current "status day" banner (DayBlock.tsx:190-217) — dashed border, no scenes.
- In the calendar, they show a colored badge matching their status.
- They occupy a derived-date slot (counted in `dayGroups` as a day-alike entry).
- Removing the status back to `'work'` restores scene display.

---

## 9. Other Files to Update

| File | Scope | Notes |
|---|---|---|
| `src/lib/utils.ts` | Low | Add `addDays(dateStr, n)` helper |
| `src/lib/rulesEngine.ts` | Low | Reads `dayMeta[N].date` — already backfilled by derivation, no change needed |
| `src/lib/ribbonUtils.ts` | Low | No change (cell rendering unchanged) |
| `src/lib/persist.ts` | Low | No change (calendar UI prefs are in store, not localStorage) |
| `src/components/PrintSchedule.tsx` | Low | Replace inline `chronoDayMap` with imported `deriveDayDates` |
| `src/components/DoodsTab.tsx` | Low | Replace inline `chronoDayMap` |
| `src/components/print/Dood.tsx` | Low | Replace inline `chronoDayMap` |
| `src/components/SceneSheet.tsx` | Low | Replace inline `chronoDayMap` |
| `src/components/HelpModal.tsx` | Low | Add "Day Breaks" section (keyboard shortcuts, right-click, compact mode) |
| `src/App.tsx` | Medium | Strip view toggle in calendar options; calendar header controls |
| `AGENTS.md` | Low | Document new scheduling architecture, day breaks, derivation utility |

---

## 10. Migration Strategy

### Detection

On project load (`store.tsx`), check each version for `version.calendar` field:
- Present → already migrated, skip.
- Absent → run `migrateVersionToDayBreaks()`.

### Migration Algorithm (see Section 6.6 for full code)

1. Sort `dayMeta` work entries by `.date` chronologically.
2. Set `calendar.startDate` = earliest date.
3. Auto-detect `autoWeekends`: if any working day is a weekend, set `false`; else `true`.
4. Insert `DAY_BREAK` rows between day groups at `order = lastRowInGroup.order + 0.5`.
5. Reassign `shootDay` via `deriveShootDays`.
6. Recomput `dayMeta[N].date` via `recomputeVersionDates`.
7. Set `stripView = 'full'` (current appearance).
8. Handle gaps (non-sequential dates) by detecting gaps and adding `daysOff` entries to maintain the derivation match.

### Edge Cases

- **Projects with hold/travel days**: These are non-work-status dayMeta entries. Should have no scene rows (already unscheduled by store side-effect). Represent as status-day placeholders in the new model. Derivation counts them as a slot but displays as status badge.
- **Projects with no scenes assigned**: Day 1 has an empty dayMeta entry. Derivation produces a single Day 1 date. No DAY_BREAK rows (only 1 group).
- **Projects with gaps in shootDay IDs**: ShootDay IDs (1, 2, 4) → migration day groups derived from date order, not ID order. This might renumber groups differently, but the new model is group-index based anyway.

### Schema Versioning

- Keep localStorage key as `lemon_schedule_project_v1_{id}` (existing).
- Use field presence (`version.calendar`) as migration trigger (existing pattern from `src/store.tsx:74-95`).
- After migration, write-back stores `calendar` field, so re-load skips migration.

---

## 11. Implementation Phases

### Phase 1: Foundation (No UI Change)

**Goal**: All plumbing works, no visual difference.

1. **Types**: Add `DAY_BREAK` to `RowType`, add `ProductionCalendar`, `DayOffEntry`, `StripViewMode`.
2. **`src/lib/scheduling.ts`**: Implement all derivation functions + unit tests.
3. **Store migration**: Implement `migrateVersionToDayBreaks()` + run on load.
4. **Store actions**: Implement `ADD_DAY_BREAK`, `REMOVE_DAY_BREAK`, `INSERT_WORKING_DAY`, `SET_PRODUCTION_START`, `SET_DAYS_OFF`, `TOGGLE_AUTO_WEEKENDS`, `SET_WEEKEND_DAYS`, `SET_STRIP_VIEW`.
5. **`applySchedulingDerivation`**: Wire into existing actions (`UPDATE_VERSION`, `UPDATE_DAY_META`, `DELETE_DAY`, `UNSCHEDULE_DAY`, `NEW_VERSION`).
6. **Verify**: Existing app works identically post-migration. Undo/redo works. All existing features intact.

### Phase 2: Stripboard Day Breaks

**Goal**: Users can add, remove, and move day breaks in the stripboard.

1. **Context menu**: Add "Add Day Break Below" and "Remove Day Break" items to `ScheduleTab.tsx`.
2. **SortableRow DAY_BREAK variant**: Render DAY_BREAK banner row.
3. **DayBlock compact mode**: Conditionally hide header when `stripView='compact'`. Footer styled as day break.
4. **View toggle**: Add Full/Compact segmented button to Schedule header toolbar + `App.tsx`.
5. **Drag**: Ensure DAY_BREAK rows play nicely with existing DnD (sortable, context-sensitive drag-end).
6. **Manual testing**: Create/edit/delete day breaks; verify days split/merge correctly; verify dates derive correctly.

### Phase 3: Calendar Refactor

**Goal**: Calendar shows derived days, manages days off, inserts working days.

1. **Rewrite `CalendarTab.tsx`**: Replace tool palette with start-date picker, auto-weekends toggle, weekend-days selector.
2. **Days off rendering**: Show off-day badges on calendar cells.
3. **Derived date display**: Working day cells show `DAY #N · date`.
4. **Right-click context menu**: Replace current menu with new options.
5. **Drag-and-drop**: Preserve scene-card DnD between calendar cells. Remove day-header drag.
6. **Manual testing**: Set start date, add holidays, toggle weekends, insert days, verify stripboard updates.

### Phase 4: Downstream & Polish

**Goal**: Everything integrates cleanly.

1. **PrintSchedule, DoodsTab, SceneSheet, Dood**: Replace inline `chronoDayMap` with imported `deriveDayDates`.
2. **HelpModal**: Add "Day Breaks" section.
3. **AGENTS.md**: Document new architecture.
4. **Edge cases**: Empty calendar, no start date, all days off, only one day, max groups.
5. **Regression**: Full manual regression pass (drag, keyboard, cut/paste, rules, reports, print, ribbon).

### Phase 5 (Future): Boneyard / Unscheduled Redesign

- Move unscheduled strips outside day blocks in calendar view.
- Not in scope for V1.

---

## 12. Risks & Tradeoffs

### Risks

| Risk | Mitigation |
|---|---|
| **Undo/redo breaks after derivation** | All dispatching goes through `BATCH_START`/`BATCH_COMMIT`. Derivation called inside the same batch. Undo restores previous rows + dayMeta + calendar atomically. |
| **Migration produces wrong dates** | Pre-compute derived dates and compare with original stored dates. If mismatch exists (user had non-sequential dates), add appropriate `daysOff` entries to bridge the gap. |
| **Performance of derivation** | Derivation runs per scheduling mutation. Typical project size (50–200 scenes, 10–30 days) → negligible. Memoize in React components via `useMemo`. |
| **Hold/travel day breaking derivation** | Status days occupy a derived slot. Handle by counting them as a "group" (with no scene rows). Shows as status banner in stripboard, badge in calendar. |
| **DAY_BREAK drag between groups** | SortableContext groups are per-DayBlock. Moving a DAY_BREAK from Day 2's block to Day 3's block means dragging across groups → handle in `handleDragEnd` with inter-group positioning (existing crossing-sections logic). |
| **Legacy clipboard (-1) vs DAY_BREAK** | Cut/paste works on all row types. DAY_BREAK rows in clipboard (`shootDay: -1`) render as banner too. Paste restores. Test cut+paste of breaks. |

### Tradeoffs

| Tradeoff | Rationale |
|---|---|
| **Hybrid derivation (dates derived but stored)** | Minimal downstream code changes. All 6+ places reading `dayMeta[N].date` continue unchanged. Only mutation side is rewritten. |
| **Keep `ScheduleRow.shootDay` as denormalized** | Cheaper than redesigning every consumer to check group index. Derivation keeps it consistent. |
| **Auto-weekends as default ON** | Matches Movie Magic defaults. Most productions don't work weekends. Users with Sat/Sun shoots toggle off. |
| **No horizontal stripboard** | Keeps layout refactor risk minimal. Vertical stacking continues to work in existing print pipeline. |
| **DAY_BREAK as row in array (not separate structure)** | Leverages existing rendering, DnD, context menu, and undo machinery. No new subsystem needed. |

---

## 13. File-by-File Effort Estimate

| File | Level | Scope |
|---|---|---|
| `src/types.ts` | Medium | New types, `RowType` union, `ProductionCalendar`, `StripViewMode` |
| `src/lib/scheduling.ts` | **New** (~200 lines) | All derivation utilities, date math, group computation |
| `src/store.tsx` | High | 8 new actions, migration logic, `applySchedulingDerivation`, version clone fix, deprecated action handling |
| `src/components/ScheduleTab.tsx` | High | Day groups from computeDayGroups, context menu additions (2 items), DAY_BREAK drag handling, view toggle |
| `src/components/DayBlock.tsx` | Medium | Compact-header toggle, day-break footer rendering |
| `src/components/SortableRow.tsx` | Medium | DAY_BREAK row variant (banner, no inline edit) |
| `src/components/CalendarTab.tsx` | High | Full rewrite: start date, days off UI, derived dates, new context menu, preserved DnD |
| `src/components/UnscheduledBlock.tsx` | Low | Filter out DAY_BREAK context menu items in boneyard |
| `src/components/PrintSchedule.tsx` | Low | Replace inline chronoDayMap with deriveDayDates |
| `src/components/DoodsTab.tsx` | Low | Same |
| `src/components/print/Dood.tsx` | Low | Same |
| `src/components/SceneSheet.tsx` | Low | Same |
| `src/App.tsx` | Medium | Strip view toggle, calendar config controls |
| `src/components/HelpModal.tsx` | Low | Day Breaks section |
| `AGENTS.md` | Low | Architecture doc update |

**Total**: ~1200-1500 lines of new/modified code across 14 files (plus 1 new file).

---

## 14. Open Questions for Future

1. **Hold/Travel day representation**: Should status days live in `daysOff` or a separate "day annotations" record? V1 keeps on `dayMeta` with `status` (minimal disruption). Revisit in Phase 5.
2. **Multi-stripboard / bands**: Movie Magic allows multiple side-by-side bands (main unit, second unit). Out of scope for V1.
3. **Calendar day drag**: Should dragging a day in the calendar move its stripboard position (reorder day groups)? V1 keeps day-position immutable from calendar; adjust via stripboard.
4. **Auto day breaks by page count / duration**: StudioBinder auto-inserts day breaks every N pages or hours. Possible Phase 4 enhancement.
5. **Boneyard (Phase 5)**: Move unscheduled strips to calendar view "outside day blocks", inspired by Movie Magic's boneyard pattern.

---

## 15. User-Confirmed Design Decisions

From interactive Q&A during planning:

1. **Day break visibility**: Visible strip in stripboard, styled like day footer. View toggle: "full" (headers + break footers) vs "compact" (footers only, Movie Magic style).
2. **Date derivation model**: Always derived (if a holiday is added, all subsequent working days automatically shift forward).
3. **Stripboard layout**: Keep vertical stacking (no horizontal flow in V1).
4. **Calendar insert day**: Insert at calendar position (creates day break at the matching sequence slot, shifts subsequent days).

