# Day-Break-Driven Scheduling Refactor Plan

> **Branch**: `day-breaks-v3`
> **Date**: 2026-06-29
> **Target**: Move from static-date working days to a flow-based day-break system, inspired by Movie Magic Scheduling / StudioBinder.

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Current System Summary](#2-current-system-summary)
3. [New Architecture: Single Source of Truth](#3-new-architecture-single-source-of-truth)
4. [Data Model](#4-data-model)
5. [Date Derivation Utility](#5-date-derivation-utility)
6. [Store Changes](#6-store-changes)
7. [Stripboard Refactor](#7-stripboard-refactor)
8. [Calendar Refactor](#8-calendar-refactor)
9. [Scene States: Scheduled / Unscheduled / Boneyard](#9-scene-states-scheduled--unscheduled--boneyard)
10. [Downstream Files to Update](#10-downstream-files-to-update)
11. [Implementation Phases](#11-implementation-phases)
12. [Risks & Tradeoffs](#12-risks--tradeoffs)
13. [File-by-File Effort Estimate](#13-file-by-file-effort-estimate)
14. [Open Questions for Future](#14-open-questions-for-future)

---

## 1. Overview & Goals

### Current System

- Each working day has a **static date** stored in `ScheduleVersion.dayMeta[N].date`.
- The Calendar is used to paint dates as "working" / "hold" / "travel" / "holiday".
- The stripboard renders days sorted by stored date, displays `DAY #N` headers.
- No weekend detection, no recurring off-day logic, no day-break concept.
- Dates are permanently tied to dayMeta entries; changing a day's date requires manual calendar interaction.
- "Unscheduled" sidebar holds scenes not assigned to any day. No boneyard concept.

### Target System

- The stripboard flows top-to-bottom: **DAY_BREAK rows** separate working day groups.
- A **production start date** sets when Day 1 begins on the calendar.
- Working-day dates are **always derived** — never stored. Computed from start date + group count, skipping all static calendar entries (weekends, holidays, hold days, travel days).
- The **Calendar** manages the timeline: start date, days off, hold/travel days. These are **static and pinned** — they have explicit dates and never move.
- **Adding a day break** in the stripboard creates a new working day at the next available calendar date (skipping all static entries). Scenes below the break flow into the new day.
- **Calendar right-click → "Insert working day"** inserts a day break at the matching position. All subsequent working days shift forward automatically.
- **Converting a working day to a hold/travel/day-off** frees its date; derivation pushes the working day group to the next available slot, shifting all subsequent working days forward.
- **Three scene states**: Scheduled (in a day group), Unscheduled (end of stripboard, after last day break), Boneyard (removed from circulation, in sidebar).
- Existing functionality (drag-and-drop, undo/redo, reports, rules engine, print) continues working.

### Design Principles

1. **Single source of truth.** Calendar owns the timeline (when). Stripboard owns the schedule (what goes where). Dates are never stored — always computed.
2. **No duplicate logic.** One derivation utility. One day-group computation. All consumers import from the same module.
3. **No migration concerns.** Old projects load fine; the new model applies on load. No backward-compat layers or date-backfill heuristics.
4. **Clean types.** No overloaded fields. No sentinel values beyond what exists. Working days never have a stored date. Status days always have a stored date.

---

## 2. Current System Summary

### Data Model (before refactor)

| Entity | File | Key Fields |
|---|---|---|
| `ScheduleRow` | `src/types.ts:35-55` | `id, type ('SCENE' \| 'BREAK' \| 'NOTE'), shootDay, order, sceneId?, ...` |
| `ShootDayMeta` | `src/types.ts:57-64` | `shootDay, unitCall, date, status?, castIds?` |
| `ScheduleVersion` | `src/types.ts:66-73` | `id, name, rows, dayMeta: Record<number, ShootDayMeta>` |
| `Project` | `src/types.ts:203-226` | `scenes, versions, activeVersionId, rules, castMembers` |

### Key sentinels

- `shootDay === null` → unscheduled
- `shootDay === -1` → clipboard/cut buffer
- `shootDay >= 1` → assigned to that dayMeta key
- `dayMeta[N].date` is user-assigned, stored as `"YYYY-MM-DD"`

### How dates flow (current)

```
Scene → ScheduleRow.shootDay → dayMeta[N].date → Calendar cell
                                dayMeta[N].status → badge/color
```

### Calendar working-day creation

`TOGGLE_WORKING_DAY` (store.tsx:542-567): looks for existing dayMeta entry by date. If not found, creates one with `shootDay = max(existing keys) + 1`. ShootDay IDs are monotonic, never renumbered.

### Stripboard day rendering

- `existingDays` (ScheduleTab.tsx:656-662): dayMeta keys sorted by `.date`
- `chronoDayMap` (ScheduleTab.tsx:664-672): maps `shootDay → chronologicalDayNumber` (work-status days only, sorted by date)
- Same `chronoDayMap` recomputed independently in **6 places**: ScheduleTab, CalendarTab, PrintSchedule, DoodsTab, Dood.tsx, SceneSheet

### Right-click context menu (stripboard)

ScheduleTab.tsx:1260-1274 captures `[data-row-id]`; menu items (1361-1428): Cut/Paste, Add Note Below, Add Break Below, Duplicate, Change Color, Remove Ribbon, Delete. No "Day Break" option.

### Known fragilities

- `shootDay: -1` clipboard sentinel is untyped; leaks into "unscheduled" count in toolbar
- 6 independent `chronoDayMap` implementations can drift
- Dead code: stripboard has a `day-wrap-*` drag branch that no draggable registers
- Two separate code paths patch dayMeta: `UPDATE_DAY_META` (store) vs `DayBlock.updateMeta` (direct `UPDATE_VERSION`)
- No date utility module — all date math inline

---

## 3. New Architecture: Single Source of Truth

### Two categories of calendar entries

**Static days** (pinned to explicit dates, never move):
- Days off (auto-weekends, holidays, custom)
- Hold days
- Travel days
- All stored in the calendar with explicit dates — user places them, they stay

**Working days** (dynamic, always derived):
- Dates computed by flowing forward from start date, skipping all static entries
- Group membership defined by DAY_BREAK row positions in the stripboard
- Never have a stored date

### Sources of truth vs derived values

| Data | Source of truth | Stored or derived? |
|---|---|---|
| Production start date | `version.calendar.startDate` | **Stored** |
| Days off (weekends, holidays) | `version.calendar.daysOff` | **Stored** |
| Auto-weekends config | `version.calendar.autoWeekends` | **Stored** |
| Hold/travel days | `version.calendar.statusDays` | **Stored** (with explicit dates) |
| Day break positions | `version.rows` (DAY_BREAK rows) | **Stored** |
| Per-day unit call time | `version.dayMeta[N].unitCall` | **Stored** (working days only) |
| Boneyard flag | `version.rows[N].boneyard` | **Stored** |
| Which scenes on which day | DAY_BREAK group positions | **Derived** (recomputed every mutation) |
| Working-day dates | calendar + group count | **Derived** (never stored) |
| `ScheduleRow.shootDay` | DAY_BREAK positions | **Derived** (denormalized cache) |
| Stripboard render order | working dates + status day dates, merged | **Derived** |
| Day numbers (DAY #N) | group index | **Derived** |

### How dates flow (new)

```
calendar.startDate ─────┐
calendar.daysOff ───────┼──→ deriveDayDates() ──→ Map<dayNumber, dateString>
calendar.statusDays ────┤                         (skips all occupied dates)
calendar.autoWeekends ──┘
                                             ↓
rows[] with DAY_BREAK ──→ computeDayGroups() ──→ Map<dayNumber, rows[]>
                         deriveShootDays()  ──→ assigns shootDay to each row
                                             ↓
                         deriveStripboardLayout() ──→ interleaved render order
                             (working groups + status days, sorted by date)
```

### Visual example

```
DAY 1  · MON 29 JUN  · [Scenes 1-5]          ← working (derived date)
DAY 2  · TUE 30 JUN  · [Scenes 6-10]         ← working (derived date)
      · WED 01 JUL  · HOLD                   ← status (pinned date, not in rows[])
DAY 3  · THU 02 JUL  · [Scenes 11-15]        ← working (derived, skipped Wed)
      · FRI 03 JUL  · TRAVEL                 ← status (pinned date)
DAY 4  · MON 06 JUL  · [Scenes 16-20]        ← working (derived, skipped Fri + weekend)
      · SAT 04 JUL  · WEEKEND                ← day off (auto)
      · SUN 05 JUL  · WEEKEND                ← day off (auto)
─────────────────────────────────────────────
UNSCHEDULED: [Scene 21] [Scene 22]           ← after last DAY_BREAK, no day
```

### Converting a working day to a hold/travel day

```
BEFORE:                              AFTER:
DAY 1 · Mon 29 · [1-5]              DAY 1 · Mon 29 · [1-5]
DAY 2 · Tue 30 · [6-10]             DAY 2 · Tue 30 · [6-10]
DAY 3 · Wed 01 · [11-15]            · Wed 01 · TRAVEL          ← pinned
DAY 4 · Thu 02 · [16-20]            DAY 3 · Thu 02 · [11-15]   ← shifted
                                     DAY 4 · Fri 03 · [16-20]   ← shifted
```

Scenes stay attached to their **group** (defined by day break positions). Only dates shift. The calendar change alone pushed everything — no stripboard interaction needed.

### Edge case: all working days become occupied

If you convert the *only* working day to a travel day, the group still exists but has no available date. The stripboard shows the group with scenes but "No date available" in the header. Scenes are NOT auto-unscheduled — less destructive, user resolves manually.

---

## 4. Data Model

### 4.1 New types (`src/types.ts`)

```typescript
// ─── Row Types ───

type RowType = 'SCENE' | 'BREAK' | 'NOTE' | 'DAY_BREAK';

interface ScheduleRow {
  id: string;
  type: RowType;
  shootDay: number | null;      // derived cache; null = unscheduled, positive = group index
  order: number;
  boneyard?: boolean;            // true = in boneyard, removed from circulation

  // SCENE
  sceneId?: string;
  estimatedDuration?: number;
  descriptionOverride?: string;

  // BREAK (intra-day, e.g. LUNCH)
  breakLabel?: string;
  breakDuration?: number;
  isTimed?: boolean;

  // NOTE
  noteText?: string;
  noteColor?: string;
  noteTextColor?: string;
}

// ─── Production Calendar ───

interface DayOffEntry {
  date: string;                  // "YYYY-MM-DD"
  type: 'weekend' | 'holiday' | 'custom';
  label?: string;                // e.g. "Christmas Day"
}

interface StatusDayEntry {
  date: string;                  // pinned, never moves
  status: 'hold' | 'travel';
  castIds?: string;              // comma-separated cast IDs
  unitCall?: string;
  label?: string;
}

interface ProductionCalendar {
  startDate: string | null;                                     // "YYYY-MM-DD", null = not set
  daysOff: Record<string, DayOffEntry>;                          // keyed by date
  statusDays: Record<string, StatusDayEntry>;                    // keyed by date (hold/travel)
  autoWeekends: boolean;                                        // default: true
  weekendDays: number[];                                         // default: [0, 6] (Sun=0, Sat=6)
}

// ─── Stripboard View Mode ───

type StripViewMode = 'full' | 'compact';

// ─── Modified ScheduleVersion ───

interface ScheduleVersion {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  rows: ScheduleRow[];
  dayMeta: Record<number, ShootDayMeta>;   // keyed by day number (group index)
  calendar: ProductionCalendar;            // NEW
  stripView: StripViewMode;               // NEW: 'full' (default) | 'compact'
}

// ─── Simplified ShootDayMeta (working days only) ───

interface ShootDayMeta {
  unitCall: string;          // "HH:mm" call time
  // NO date. NO status. Working days only.
  // Status days live in calendar.statusDays with their own explicit dates.
}
```

### 4.2 What was removed from the model

| Removed | Why |
|---|---|
| `ShootDayMeta.date` | Working day dates are always derived. Status day dates live in `calendar.statusDays`. |
| `ShootDayMeta.status` | Hold/travel/holiday are now `calendar.statusDays` entries, not dayMeta fields. |
| `ShootDayMeta.castIds` | Hold/travel cast lists live on `StatusDayEntry.castIds`. |
| `ShootDayMeta.shootDay` | The key IS the day number. Redundant field. |

### 4.3 What `dayMeta` is now

`dayMeta` is a thin metadata record per working day group. Keyed by day number (group index from break positions). Only holds `unitCall`. Much simpler.

### 4.4 What dayMeta entries DON'T correspond to anymore

Hold/travel/holiday days. These are **NOT** dayMeta entries. They're `calendar.statusDays` entries with explicit dates. They don't consume a day number. Working day numbering skips over them.

---

## 5. Date Derivation Utility

### 5.1 New file: `src/lib/scheduling.ts`

Pure functions, no React, no date library (native `Date`).

```typescript
import type {
  ProductionCalendar, DayOffEntry, StatusDayEntry,
  ScheduleRow, ShootDayMeta, StripViewMode
} from '../types';

// ─── Date Helpers ───

export function formatDateKey(date: Date): string;
export function parseDateKey(str: string): Date;
export function isWeekend(date: Date, weekendDays: number[]): boolean;
export function addDays(dateStr: string, n: number): string;
export function isSameDate(a: string, b: string): boolean;

// ─── Off-Day Detection ───

export function isInDaysOff(dateKey: string, daysOff: Record<string, DayOffEntry>): boolean;

export function isStatusDay(dateKey: string, statusDays: Record<string, StatusDayEntry>): boolean;

export function getStatusDay(dateKey: string, statusDays: Record<string, StatusDayEntry>): StatusDayEntry | undefined;

/** Full occupied-date check: daysOff OR statusDays OR (autoWeekends AND weekend) */
export function isOccupiedDate(
  date: Date,
  calendar: ProductionCalendar
): { occupied: boolean; reason?: 'weekend' | 'holiday' | 'custom' | 'hold' | 'travel' };

// ─── Working Day Derivation ───

/**
 * Derive calendar dates for N working days.
 * Flows forward from startDate, skipping ALL occupied dates.
 * Returns Map<dayNumber (1-based), dateString>.
 */
export function deriveDayDates(
  calendar: ProductionCalendar,
  numberOfDays: number
): Map<number, string>;

/**
 * Get the next available (non-occupied) date after a given date.
 * Returns "YYYY-MM-DD" or null if no start date is set.
 */
export function getNextAvailableDate(
  afterDate: string,
  calendar: ProductionCalendar
): string | null;

// ─── Day Group Computation ───

/**
 * Partition rows into working day groups separated by DAY_BREAK rows.
 * Excludes: unscheduled (shootDay null), boneyard, clipboard (-1).
 * Returns array of groups. Group index (0-based) + 1 = day number.
 */
export function computeDayGroups(rows: ScheduleRow[]): ScheduleRow[][];

/**
 * Re-compute shootDay on every row from DAY_BREAK positions.
 * DAY_BREAK rows get shootDay of the group they end.
 * Unscheduled (null) and boneyard rows: shootDay stays null.
 * Clipboard (-1) rows: shootDay stays -1.
 * Returns new rows array (non-mutating).
 */
export function deriveShootDays(rows: ScheduleRow[]): ScheduleRow[];

/**
 * Recompute dayMeta from current groups.
 * Preserves unitCall for groups that persist.
 * Creates default entries for new groups.
 * Prunes stale entries for removed groups.
 * Returns new dayMeta record.
 */
export function recomputeDayMeta(
  dayMeta: Record<number, ShootDayMeta>,
  groupCount: number
): Record<number, ShootDayMeta>;

// ─── Stripboard Layout ───

export type StripboardItem =
  | { kind: 'working'; dayNumber: number; date: string; rows: ScheduleRow[] }
  | { kind: 'status'; date: string; entry: StatusDayEntry };

/**
 * Build the interleaved stripboard render order.
 * Combines working day groups (with derived dates) + status days (with pinned dates).
 * Sorts everything by date.
 * Unscheduled/boneyard rows are NOT included here (rendered separately).
 */
export function deriveStripboardLayout(
  rows: ScheduleRow[],
  calendar: ProductionCalendar
): StripboardItem[];

// ─── Calendar View Helpers ───

export interface CalendarDayEntry {
  date: string;
  isOff: boolean;
  offReason?: 'weekend' | 'holiday' | 'custom';
  offLabel?: string;
  statusEntry?: StatusDayEntry;
  workingDayNumber?: number;
}

/**
 * Build enriched entries for a calendar month grid.
 * Combines: auto-weekends, daysOff, statusDays, derived working dates.
 */
export function getCalendarMonthDays(
  year: number,
  month: number,
  calendar: ProductionCalendar,
  derivedDates: Map<number, string>
): CalendarDayEntry[];

/**
 * Inverse lookup: given a date, find which working day number it maps to.
 */
export function getDayNumberForDate(
  date: string,
  derivedDates: Map<number, string>
): number | undefined;
```

### 5.2 Algorithm: `deriveDayDates`

```
if startDate is null → return empty Map

cursor = parseDateKey(startDate)
result = new Map()
dayNumber = 1
while dayNumber <= numberOfDays:
  occupied = isOccupiedDate(cursor, calendar)
  if occupied:
    cursor = addDays(cursor, 1)    // skip — this date is held by a static entry
  else:
    result.set(dayNumber, formatDateKey(cursor))
    dayNumber++
    cursor = addDays(cursor, 1)
return result
```

### 5.3 Algorithm: `computeDayGroups`

```
groups = [[]]
currentGroup = 0
sortedRows = rows
  .filter(r => r.shootDay !== null && r.shootDay !== -1 && !r.boneyard)
  .sort((a, b) => a.order - b.order)

for each row in sortedRows:
  if row.type === 'DAY_BREAK':
    groups[++currentGroup] = []
  else:
    groups[currentGroup].push(row)
return groups
```

### 5.4 Algorithm: `deriveStripboardLayout`

```
groups = computeDayGroups(rows)
groupCount = groups.length
workingDates = deriveDayDates(calendar, groupCount)

items: StripboardItem[] = []

// Working day groups
for i in 0..groupCount-1:
  dayNumber = i + 1
  date = workingDates.get(dayNumber)
  if date:
    items.push({ kind: 'working', dayNumber, date, rows: groups[i] })
  else:
    items.push({ kind: 'working', dayNumber, date: null, rows: groups[i] })
    // Working day with no available date — renders "No date available"

// Status days
for each entry in calendar.statusDays:
  items.push({ kind: 'status', date: entry.date, entry })

// Sort by date. Items without dates sort last (working days with no date).
items.sort((a, b) => {
  if (!a.date) return 1
  if (!b.date) return -1
  return a.date.localeCompare(b.date)
})

return items
```

---

## 6. Store Changes

### 6.1 New actions

| Action | Payload | Effect |
|---|---|---|
| `ADD_DAY_BREAK` | `{ versionId, afterRowId }` | Inserts DAY_BREAK row after `afterRowId`. Splits current group. Runs `deriveShootDays` + `recomputeDayMeta`. |
| `REMOVE_DAY_BREAK` | `{ versionId, breakRowId }` | Removes DAY_BREAK row. Merges adjacent groups. Runs derivation. |
| `MOVE_DAY_BREAK` | `{ versionId, breakRowId, beforeRowId }` | Moves a DAY_BREAK to new position (drag). Runs derivation. |
| `INSERT_WORKING_DAY` | `{ versionId, date }` | Inserts a DAY_BREAK at the stripboard position corresponding to `date`. If `date` is occupied, frees it first (removes from daysOff/statusDays). Runs derivation. |
| `SET_PRODUCTION_START` | `{ versionId, date }` | Sets `calendar.startDate`. Runs derivation. |
| `SET_DAYS_OFF` | `{ versionId, date, entry? }` | Adds/removes a `DayOffEntry`. If removing, frees the date. Runs derivation. |
| `SET_STATUS_DAY` | `{ versionId, date, entry? }` | Adds/removes a `StatusDayEntry` (hold/travel). If removing, frees the date for working days. Runs derivation. |
| `SET_AUTO_WEEKENDS` | `{ versionId, value }` | Toggles `autoWeekends`. Runs derivation. |
| `SET_WEEKEND_DAYS` | `{ versionId, days }` | Customizes weekend days. Runs derivation. |
| `SET_STRIP_VIEW` | `{ versionId, mode }` | Sets `stripView`. No derivation needed. |
| `TOGGLE_BONEYARD` | `{ versionId, rowId }` | Toggles `boneyard` flag on a row. If boneyarding, sets `shootDay: null`. If un-boneyarding, row appears as unscheduled. |
| `CONVERT_WORKING_DAY` | `{ versionId, date, newType }` | Converts a working day to a hold/travel/day-off. Frees the date, creates the appropriate static entry. Working day group flows to next available slot. |

### 6.2 Shared helper: `applySchedulingDerivation`

```typescript
function applySchedulingDerivation(state: State, versionId: string): State {
  const version = findVersion(state.present, versionId);
  if (!version) return state;

  const newRows = deriveShootDays(version.rows);
  const groups = computeDayGroups(newRows);
  const newDayMeta = recomputeDayMeta(version.dayMeta, groups.length);

  return updateVersion(state, versionId, {
    rows: newRows,
    dayMeta: newDayMeta,
    updatedAt: Date.now(),
  });
}
```

Called after every action that changes rows, day breaks, or calendar config. Wrapped in `BATCH_START` / `BATCH_COMMIT` for undo atomicity.

### 6.3 Action details

#### `ADD_DAY_BREAK`

```
1. Find target row (afterRowId) and its current group.
2. Insert DAY_BREAK row at order = targetRow.order + 0.5:
   { id: generateUUID(), type: 'DAY_BREAK', order, shootDay: null }
3. All scene rows below (in same original group) re-group into new group.
4. All subsequent groups increment day number by 1.
5. Re-sort rows by order.
6. Call deriveShootDays → assigns correct shootDay to every row.
7. Call recomputeDayMeta → creates new dayMeta entry for new group, preserves existing.
8. Dispatch UPDATE_VERSION with new rows + new dayMeta (batched).
```

#### `INSERT_WORKING_DAY` (calendar right-click)

```
1. If `date` is in daysOff or statusDays → remove it (free the date).
2. Derive current working dates: workingDates = deriveDayDates(calendar, groupCount).
3. Find insertion point:
   a. If `date` is past all derived dates → append DAY_BREAK after last group.
   b. If `date` is between derived date of group N and group N+1 → insert after group N.
   c. If `date` matches an existing working day → insert adjacent (before or after).
4. Create DAY_BREAK row at appropriate position.
5. Run derivation + update.
```

#### `CONVERT_WORKING_DAY`

```
1. Identify the working day group that currently occupies `date`.
2. Choose action based on newType:
   - 'hold' or 'travel': create StatusDayEntry in calendar.statusDays with this date.
   - 'dayoff': create DayOffEntry in calendar.daysOff with this date.
3. The working day group that was on this date loses its date slot.
4. Derivation re-runs: the group flows to the next available date.
5. All subsequent working day groups shift forward automatically.
6. Scenes stay attached to their group — they just land on a later date.
```

#### `SET_STATUS_DAY` (add hold/travel day on empty calendar date)

```
1. Create StatusDayEntry with the pinned date.
2. This date is now occupied. Derivation skips it for working days.
3. If there were working days AFTER this date, they shift forward.
4. If there were working days ON this date (unlikely if it was empty), they shift to next slot.
```

#### `TOGGLE_BONEYARD`

```
1. Find the row.
2. If boneyarding (boneyard = true):
   - Set row.boneyard = true, row.shootDay = null
   - Row disappears from stripboard groups (filtered out by computeDayGroups)
   - Row appears in boneyard panel
3. If un-boneyarding (boneyard = false):
   - Set row.boneyard = false
   - Row appears as unscheduled (shootDay: null) at bottom of stripboard
   - User can drag it into a day group
4. Run derivation (shootDay on other rows may shift if group membership changes).
```

### 6.4 Modified existing actions

| Action | Change |
|---|---|
| `UPDATE_VERSION` | When `rows` included in partial, run `deriveShootDays` after merge. |
| `DELETE_DAY` | Remove corresponding DAY_BREAK row (merge groups) instead of clearing dayMeta. |
| `UNSCHEDULE_DAY` | Remove the DAY_BREAK that ends this group. Rows from that group merge into next group. |
| `NEW_VERSION` (clone) | Clone `calendar` and `stripView`. (Previously reset dayMeta.) |
| `TOGGLE_WORKING_DAY` | **Deprecated.** Calendar no longer paints working days. Replaced by `SET_DAYS_OFF`, `SET_STATUS_DAY`, `INSERT_WORKING_DAY`. |
| `UPDATE_DAY_META` | Only handles `unitCall`. No `date`, no `status`, no `castIds` (those moved to calendar). |

### 6.5 `recomputeDayMeta` detail

```
newMeta = {}
for i in 0..groupCount-1:
  dayNumber = i + 1
  if oldMeta[dayNumber]:
    newMeta[dayNumber] = { unitCall: oldMeta[dayNumber].unitCall }  // preserve call time
  else:
    newMeta[dayNumber] = { unitCall: '08:00' }  // default
return newMeta
```

Note: This may "lose" unitCall if groups are renumbered due to insertion/deletion in the middle. In V1, we accept this — unit call times reset to default when a day's position changes significantly. Future improvement: match by "relative position" or "scene content hash."

---

## 7. Stripboard Refactor

### 7.1 `ScheduleTab.tsx`

#### Day groups derivation (replaces `existingDays` + `chronoDayMap`)

```typescript
// OLD (lines 656-672): sort dayMeta keys by date, compute chronoDayMap independently
// NEW:
const dayGroups = useMemo(() => computeDayGroups(augmentedRows), [augmentedRows]);
const groupCount = dayGroups.length;
const derivedDates = useMemo(() => {
  const cal = activeVersion?.calendar;
  if (!cal?.startDate) return new Map();
  return deriveDayDates(cal, groupCount);
}, [activeVersion?.calendar, groupCount]);

// Stripboard layout = interleaved working days + status days, sorted by date
const stripboardLayout = useMemo(() => {
  const cal = activeVersion?.calendar;
  if (!cal) return [];
  return deriveStripboardLayout(augmentedRows, cal);
}, [augmentedRows, activeVersion?.calendar]);
```

#### Rendering from `stripboardLayout`

```tsx
{stripboardLayout.map(item => {
  if (item.kind === 'working') {
    return (
      <DayBlock
        key={`day-${item.dayNumber}`}
        dayInt={item.dayNumber}
        rows={item.rows}
        date={item.date}                    // derived, passed as prop
        meta={dayMeta[item.dayNumber]}
        stripView={stripView}
        isLastGroup={item.dayNumber === groupCount}
        // ... selection, drag, ribbon props
      />
    );
  } else {
    return (
      <StatusDayBlock
        key={`status-${item.date}`}
        entry={item.entry}
        date={item.date}
      />
    );
  }
})}

{/* Unscheduled zone (after last day break) */}
<UnscheduledZone rows={unscheduledRows} />

{/* Boneyard in sidebar */}
<BoneyardPanel rows={boneyardRows} />
```

#### Context menu additions

In `handleContextMenuAction`:
```typescript
case 'add_day_break': {
  dispatch({ type: 'ADD_DAY_BREAK', versionId, afterRowId: context.rowId });
  break;
}
case 'remove_day_break': {
  dispatch({ type: 'REMOVE_DAY_BREAK', versionId, breakRowId: context.rowId });
  break;
}
case 'send_to_boneyard': {
  dispatch({ type: 'TOGGLE_BONEYARD', versionId, rowId: context.rowId });
  break;
}
```

In context menu JSX:
```tsx
{/* After "Add Break Below", add: */}
<ContextMenuItem onClick={() => handleContextMenuAction('add_day_break')}>
  <SeparatorHorizontal className="w-3.5 h-3.5 shrink-0" />
  Add Day Break Below
</ContextMenuItem>

{/* When right-clicking a DAY_BREAK row: */}
{row?.type === 'DAY_BREAK' && (
  <>
    <ContextMenuDivider />
    <ContextMenuItem onClick={() => handleContextMenuAction('remove_day_break')} variant="danger">
      <Trash2 className="w-3.5 h-3.5 shrink-0" />
      Remove Day Break
    </ContextMenuItem>
  </>
)}

{/* On any scene row, add boneyard option: */}
<ContextMenuDivider />
<ContextMenuItem onClick={() => handleContextMenuAction('send_to_boneyard')}>
  <Archive className="w-3.5 h-3.5 shrink-0" />
  Send to Boneyard
</ContextMenuItem>
```

#### Drag handling for DAY_BREAK

- DAY_BREAK rows participate in `SortableContext` naturally (they're rows in the array).
- `handleDragEnd`: when active row is DAY_BREAK, compute new position, re-sort, run derivation.
- When scenes are dragged across a DAY_BREAK, they change groups — `deriveShootDays` re-assigns `shootDay` after the drag.

#### View toggle

In ScheduleTab header toolbar:
```tsx
<div className="flex items-center gap-1">
  <button
    className={cn('px-2 py-1 text-xs rounded', stripView === 'full' ? 'bg-zinc-700 text-white' : 'text-zinc-400')}
    onClick={() => dispatch({ type: 'SET_STRIP_VIEW', versionId, mode: 'full' })}
  >
    Full
  </button>
  <button
    className={cn('px-2 py-1 text-xs rounded', stripView === 'compact' ? 'bg-zinc-700 text-white' : 'text-zinc-400')}
    onClick={() => dispatch({ type: 'SET_STRIP_VIEW', versionId, mode: 'compact' })}
  >
    Compact
  </button>
</div>
```

### 7.2 `DayBlock.tsx`

#### Props changes

```typescript
interface DayBlockProps {
  dayInt: number;
  rows: ScheduleRow[];
  date: string | null;           // NEW: derived date (from parent), null = no date available
  meta?: ShootDayMeta;
  stripView: StripViewMode;      // NEW
  isLastGroup: boolean;          // NEW
  // ... existing selection, drag, ribbon props ...
}
```

#### Header in compact mode

```tsx
// Full mode: render day header table row (existing code, lines 219-272)
// Compact mode: hide header entirely — scenes start immediately
{stripView === 'full' && (
  <DayHeader dayInt={dayInt} date={date} meta={meta} ... />
)}
```

#### Date display (replaces `meta.date` read)

```tsx
// OLD: formatDateLong(meta.date)    (line 254)
// NEW: formatDateLong(date)         (date passed as prop)
```

#### Footer / day break styling

- In `'full'` mode: footer rendered as today (end-of-day banner).
- In `'compact'` mode: no header at top. The DAY_BREAK row at the end of the group renders as a colored banner separator. This banner IS the visual marker for the day.
- Last group (no trailing DAY_BREAK) renders a normal footer or nothing in compact mode.

### 7.3 New component: `StatusDayBlock.tsx`

Renders a hold/travel/holiday day as a slim banner between working day blocks.

```tsx
function StatusDayBlock({ entry, date }: { entry: StatusDayEntry; date: string }) {
  const statusConfig = {
    hold: { bg: 'bg-red-900/40', border: 'border-red-700', label: 'HOLD', icon: Pause },
    travel: { bg: 'bg-purple-900/40', border: 'border-purple-700', label: 'TRAVEL', icon: Truck },
  };
  const config = statusConfig[entry.status];

  return (
    <div className={cn('border-y border-dashed py-2 px-3', config.bg, config.border)}>
      <div className="flex items-center gap-2 text-xs font-medium">
        <config.icon className="w-3.5 h-3.5" />
        <span className={config.labelClass}>{config.label}</span>
        <span className="text-zinc-400">{formatDateLong(date)}</span>
        {entry.label && <span className="text-zinc-500">· {entry.label}</span>}
        {entry.castIds && <span className="text-zinc-500">· {formatCastNames(entry.castIds)}</span>}
      </div>
    </div>
  );
}
```

- Not a drop target (can't drop scenes on hold/travel days).
- Not draggable (pinned to date).
- Renders in stripboard via `deriveStripboardLayout` interleaving.

### 7.4 New component: `UnscheduledZone.tsx`

Replaces the role of showing unscheduled scenes at the end of the stripboard (previously in sidebar).

```tsx
function UnscheduledZone({ rows }: { rows: ScheduleRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="border-t-2 border-dashed border-zinc-700 mt-2 pt-2">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1 px-3">
        Unscheduled ({rows.length})
      </div>
      <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
        {rows.map(row => (
          <SortableRow key={row.id} row={row} isCompact />
        ))}
      </SortableContext>
    </div>
  );
}
```

- Scenes here have `shootDay: null` and `boneyard: false`.
- Draggable into any day group.
- No day header, no footer — just scene strips.

### 7.5 `SortableRow.tsx`

#### DAY_BREAK row variant

```tsx
if (row.type === 'DAY_BREAK') {
  const date = derivedDateForDay(row.shootDay);  // passed in or computed from parent
  return (
    <div
      ref={setNodeRef}
      data-row-id={row.id}
      data-shoot-day={row.shootDay}
      className={cn(
        'day-break-banner flex items-center justify-between px-3 py-1.5 text-xs font-medium',
        'bg-zinc-800 text-zinc-300 border-t-2 border-zinc-600',
        isDragging && 'opacity-50',
      )}
      style={style}
      {...attributes}
      {...listeners}
    >
      <span className="flex items-center gap-1.5">
        <SeparatorHorizontal className="w-3 h-3" />
        END OF DAY {row.shootDay}
      </span>
      {date && <span className="text-zinc-500">{formatDateLong(date)}</span>}
    </div>
  );
}
```

- No scene info, no call time, not inline-editable (V1).
- `useSortable` wraps it normally → drag to reorder.
- Context menu captured by `data-row-id`.

### 7.6 `BoneyardBlock.tsx` (renamed from `UnscheduledBlock.tsx`)

The current `UnscheduledBlock.tsx` becomes the **Boneyard** panel:
- Rename component and display label from "Unscheduled" to "Boneyard"
- Shows only rows where `boneyard: true`
- Same drag-and-drop out of boneyard (drag onto a day = un-boneyard + schedule)
- Same collapse/width persistence
- Header: "BONEYARD" label with count

Current unscheduled sidebar CSS/persistence keys retained (just renamed in UI).

---

## 8. Calendar Refactor

### 8.1 New primary purpose

The Calendar is a **timeline management panel**:
- Set/view production start date
- Mark days off (holidays, custom, auto-weekends)
- Place hold/travel days (static, pinned)
- See derived working-day assignments
- Insert working days at specific dates
- Rearrange scenes between day cells (drag-and-drop)
- View unscheduled + boneyard scenes in side panel

### 8.2 Calendar header controls

```
[Start: 2026-06-29 📅]  [✓ Auto Weekends]  [Sat-Sun ▾]  [Today]
```

- **Start date input**: Native `<input type="date" />`.
- **Auto-weekends toggle**: Checkbox/switch.
- **Weekend days selector**: Dropdown for "Sat-Sun", "Fri-Sat", "None", custom.
- **Today button**: Navigate to current month.

### 8.3 Calendar grid cells

Each cell derives its state from the calendar configuration:

```typescript
const calendarDays = useMemo(() => {
  const cal = activeVersion?.calendar;
  if (!cal) return [];
  return getCalendarMonthDays(year, month, cal, derivedDates);
}, [activeVersion?.calendar, year, month, derivedDates]);
```

Cell types:
| Cell state | Source | Visual |
|---|---|---|
| Working day | `derivedDates` inverse lookup | `DAY #N` header + scene cards |
| Hold day | `calendar.statusDays` | Red badge `HOLD` |
| Travel day | `calendar.statusDays` | Purple badge `TRAVEL` |
| Holiday | `calendar.daysOff[type='holiday']` | Green badge `HOLIDAY: label` |
| Weekend (auto) | `autoWeekends + weekendDays` | Gray `WEEKEND` |
| Custom day off | `calendar.daysOff[type='custom']` | Gray `OFF` |
| Start date | `calendar.startDate` | `START` badge |
| Free date | none of the above | Empty/interactive |

### 8.4 Right-click context menu (replaces current)

**Empty/free date:**
```
- Insert Working Day Here    → INSERT_WORKING_DAY
- Mark as Day Off            → SET_DAYS_OFF (custom)
- Mark as Holiday...         → SET_DAYS_OFF (holiday, with label input)
- Set as Hold Day            → SET_STATUS_DAY (hold)
- Set as Travel Day          → SET_STATUS_DAY (travel)
---
- Set as Production Start    → SET_PRODUCTION_START
```

**Working day cell:**
```
- Insert Working Day Before  → INSERT_WORKING_DAY (shift)
- Convert to Hold Day        → CONVERT_WORKING_DAY (hold)
- Convert to Travel Day      → CONVERT_WORKING_DAY (travel)
- Convert to Day Off        → CONVERT_WORKING_DAY (dayoff)
- Remove Working Day         → UNSCHEDULE_DAY (scenes → unscheduled)
---
- Add Scene Here             → open panel to pick unscheduled scene
```

**Status day cell (hold/travel):**
```
- Remove Hold/Travel Day     → SET_STATUS_DAY (remove, frees date)
- Edit Cast...               → open cast picker modal
```

**Day off cell (holiday/custom):**
```
- Remove Day Off             → SET_DAYS_OFF (remove, frees date)
- Edit Label...              → update label
```

### 8.5 Drag-and-drop

- **Scene cards**: drag between calendar day cells = reassign to that working day group. Internal stripboard position updates (moves past/before day breaks).
- **Day header drag**: **Disabled in V1.** Dates are derived, not draggable. To change which date a working day lands on, change the calendar config (start date, days off, status days).
- **From unscheduled/boneyard panel**: drag scene onto a calendar day cell = schedule into that group.

### 8.6 Calendar side panel: Unscheduled + Boneyard

One panel, two sections with different headers:

```tsx
<div className="calendar-sidebar">
  {/* Unscheduled section */}
  <div className="border-b border-zinc-800">
    <div className="px-3 py-2 text-xs uppercase tracking-wider text-zinc-500">
      Unscheduled ({unscheduledRows.length})
    </div>
    <div className="px-2 pb-2">
      {unscheduledRows.map(row => (
        <CalendarSceneCard key={row.id} row={row} draggable />
      ))}
    </div>
  </div>

  {/* Boneyard section */}
  <div>
    <div className="px-3 py-2 text-xs uppercase tracking-wider text-zinc-600">
      Boneyard ({boneyardRows.length})
    </div>
    <div className="px-2 pb-2">
      {boneyardRows.map(row => (
        <CalendarSceneCard key={row.id} row={row} draggable dimmed />
      ))}
    </div>
  </div>
</div>
```

- Both sections draggable onto calendar day cells.
- Boneyard scenes auto-un-boneyard (`boneyard = false`) when dragged onto a day.
- Unscheduled scenes just get `shootDay` assigned.
- Width persisted (existing key `lemon_schedule_calendar_sidebar_width`).

### 8.7 `TOGGLE_WORKING_DAY` deprecation

The current calendar "Work" tool (painting a date as a working day) is replaced by:
- Adding days off / hold / travel days creates static entries (pushes working days around)
- Inserting a working day creates a day break at the right position
- Working days are NEVER directly "painted" — they emerge from the stripboard day breaks flowing around static entries

The tool palette (Select / Work / Hold / Travel / Holiday / Eraser) is replaced by:
- **Select mode** (default) — click to select, drag to move
- **Day Off mode** — click dates to toggle day off
- **Hold mode** — click dates to toggle hold day
- **Travel mode** — click dates to toggle travel day
- **Eraser** — click any entry to remove it (day off, hold, travel, or working day)

---

## 9. Scene States: Scheduled / Unscheduled / Boneyard

### Three states

```
SCHEDULED
  └── shootDay: N (positive, derived from break position)
  └── boneyard: false/undefined
  └── Appears inside a DayBlock in the stripboard
  └── Has a derived calendar date
  └── Appears in DOOD, reports, print

UNSCHEDULED
  └── shootDay: null
  └── boneyard: false/undefined
  └── Appears at bottom of stripboard (UnscheduledZone)
  └── Appears in calendar side panel "Unscheduled" section
  └── Draggable into any day group
  └── Does NOT appear in DOOD (unless DOOD shows unscheduled — current behavior)

BONEYARD
  └── shootDay: null
  └── boneyard: true
  └── Appears in Boneyard sidebar (stripboard) + calendar side panel "Boneyard" section
  └── Does NOT appear in stripboard day groups
  └── Does NOT appear in DOOD or reports
  └── Draggable onto a day = un-boneyard + schedule
```

### Transitions

```
                  drag into day group
  UNSCHEDULED ───────────────────────→ SCHEDULED
       ←──────────────────────────────
            drag to unscheduled / unschedule action

  SCHEDULED ─── right-click → "Send to Boneyard" ──→ BONEYARD
  UNSCHEDULED ─── right-click → "Send to Boneyard" ──→ BONEYARD
  BONEYARD ─── drag onto day / right-click → "Retrieve" ──→ SCHEDULED or UNSCHEDULED
```

### Implementation

One new field on `ScheduleRow`:
```typescript
boneyard?: boolean;  // true = in boneyard, removed from circulation
```

- `computeDayGroups()` filters out `boneyard: true` rows (they don't participate in groups).
- `deriveShootDays()` leaves `boneyard` rows with `shootDay: null`.
- Stripboard renders boneyard rows only in the Boneyard panel (sidebar).
- Calendar renders boneyard rows only in the "Boneyard" section of the side panel.

### `TOGGLE_BONEYARD` action

```
If boneyarding:
  row.boneyard = true
  row.shootDay = null
  Row filtered out of groups, removed from stripboard, appears in boneyard panel

If un-boneyarding:
  row.boneyard = false
  Row appears as unscheduled (shootDay: null) at bottom of stripboard
  User can then drag into a day group
```

---

## 10. Downstream Files to Update

| File | Change | Detail |
|---|---|---|
| `src/lib/utils.ts` | Low | Add `addDays(dateStr, n)` helper (used by scheduling.ts) |
| `src/lib/rulesEngine.ts` | Medium | Accept `derivedDates: Map<number, string>` as parameter instead of reading `dayMeta[N].date`. Rules evaluate against derived dates. |
| `src/lib/ribbonUtils.ts` | Low | No change (cell rendering unchanged) |
| `src/lib/persist.ts` | Low | No change (UI prefs unchanged) |
| `src/components/PrintSchedule.tsx` | Medium | Replace inline `chronoDayMap` with imported `deriveDayDates`. Pass `derivedDates` to `DaySection`. Use `deriveStripboardLayout` for render order. |
| `src/components/DoodsTab.tsx` | Medium | Replace inline `chronoDayMap` with `deriveDayDates`. Pass derived dates. |
| `src/components/print/Dood.tsx` | Medium | Same as DoodsTab. |
| `src/components/SceneSheet.tsx` | Low | Replace inline `chronoDayMap` with `deriveDayDates`. |
| `src/components/HelpModal.tsx` | Low | Add "Day Breaks" section (right-click → Add Day Break, compact vs full, boneyard). |
| `src/App.tsx` | Medium | Strip view toggle state, calendar header controls, pass `derivedDates` to print. |
| `AGENTS.md` | Low | Document new scheduling architecture: day breaks, derivation utility, single source of truth, three scene states. |

### Rules engine changes (detail)

Current:
```typescript
function checkDay(shootDay, rules, scenes, rows, dayMeta) {
  const dayDate = dayMeta[shootDay]?.date;  // reads stored date
  // ...
}
```

New:
```typescript
function checkDay(
  shootDay: number,
  rules: ProjectRule[],
  scenes: Scene[],
  rows: ScheduleRow[],
  dayMeta: Record<number, ShootDayMeta>,
  derivedDates: Map<number, string>   // NEW parameter
) {
  const dayDate = derivedDates.get(shootDay);  // reads derived date
  const unitCall = dayMeta[shootDay]?.unitCall;
  // ...
}
```

Callers pass `derivedDates` from their memoized computation. Minimal change — one extra parameter.

---

## 11. Implementation Phases

### Phase 1: Foundation (No UI change)

**Goal**: All plumbing works, no visual difference.

1. **Types** (`src/types.ts`): Add `DAY_BREAK` to `RowType`, add `ProductionCalendar`, `DayOffEntry`, `StatusDayEntry`, `StripViewMode`, add `boneyard` to `ScheduleRow`, add `calendar` and `stripView` to `ScheduleVersion`, simplify `ShootDayMeta`.
2. **`src/lib/scheduling.ts`**: Implement all derivation functions. Test thoroughly.
3. **Store** (`src/store.tsx`): Implement all new actions, `applySchedulingDerivation`, wire into existing actions. Default `calendar` on new projects.
4. **Verify**: App compiles. Existing projects load (with default calendar — `startDate: null`, `autoWeekends: true`, empty `daysOff`/`statusDays`). No visual change yet — old dayMeta dates are ignored (since we no longer read them), but since `startDate` is null, no working dates are shown. This is expected — user sets start date manually.

### Phase 2: Stripboard Day Breaks

**Goal**: Users can add, remove, and move day breaks. Full/compact view toggle works.

1. **`ScheduleTab.tsx`**: Replace `existingDays`/`chronoDayMap` with `computeDayGroups`/`deriveDayDates`. Render from `deriveStripboardLayout`.
2. **Context menu**: Add "Add Day Break Below", "Remove Day Break", "Send to Boneyard" items.
3. **`SortableRow.tsx`**: DAY_BREAK row variant (banner separator).
4. **`DayBlock.tsx`**: Accept `date` prop (derived). Compact mode header toggle. Remove `meta.date` reads.
5. **`StatusDayBlock.tsx`**: New component for rendering hold/travel days interleaved in stripboard.
6. **`UnscheduledZone.tsx`**: New component for unscheduled scenes at bottom of stripboard.
7. **`BoneyardBlock.tsx`**: Rename from `UnscheduledBlock.tsx`. Show boneyard rows only.
8. **View toggle**: Full/Compact segmented button in Schedule header.
9. **Manual testing**: Create/edit/delete day breaks. Verify splits/merges. Verify dates derive correctly. Verify status days interleave. Verify unscheduled zone at bottom. Verify boneyard panel.

### Phase 3: Calendar Refactor

**Goal**: Calendar shows derived days, manages days off/hold/travel, inserts working days.

1. **Rewrite `CalendarTab.tsx`**: Replace tool palette with start-date picker, auto-weekends toggle, weekend-days selector.
2. **Days off rendering**: Auto-weekend badges, holiday badges, custom day-off badges on calendar cells.
3. **Status day rendering**: Hold/travel badges on calendar cells.
4. **Derived working day display**: `DAY #N · date` header on working day cells + scene cards.
5. **Right-click context menu**: New menu with insert/convert/mark options.
6. **Side panel**: Unscheduled + Boneyard sections with separate headers.
7. **Drag-and-drop**: Preserve scene-card DnD between cells. Remove day-header drag.
8. **Manual testing**: Set start date, add holidays, toggle weekends, insert days, convert working days to hold, verify stripboard updates automatically.

### Phase 4: Downstream & Polish

**Goal**: Everything integrates cleanly.

1. **`PrintSchedule.tsx`**: Replace `chronoDayMap` with `deriveDayDates`. Use `deriveStripboardLayout` for print order.
2. **`DoodsTab.tsx` + `print/Dood.tsx`**: Replace `chronoDayMap`.
3. **`SceneSheet.tsx`**: Replace `chronoDayMap`.
4. **`rulesEngine.ts`**: Accept `derivedDates` parameter. Update all callers.
5. **`HelpModal.tsx`**: Add "Day Breaks" section.
6. **`AGENTS.md`**: Document new architecture.
7. **Edge cases**: Empty calendar, no start date, all days occupied, single day, max groups, boneyard interactions.
8. **Regression**: Full manual regression pass (drag, keyboard, cut/paste, rules, reports, print, ribbon, undo/redo).

---

## 12. Risks & Tradeoffs

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Working day with no available date** (all dates occupied) | Medium | Stripboard shows the group with scenes + "No date available" header. Not destructive — user frees a date or removes a day break. |
| **Undo/redo consistency** | Medium | All mutations batched via `BATCH_START`/`BATCH_COMMIT`. Derivation runs inside batch. Undo restores complete pre-batch state. |
| **Performance of derivation** | Low | Derivation runs per mutation. 200 scenes × 30 days = negligible. `useMemo` in React components. |
| **`recomputeDayMeta` loses unitCall on renumber** | Low | V1 accepts: unitCall resets to default when a day's position changes. Future: match by scene content or relative position. |
| **Status days not in rows[] = can't drag in stripboard** | Low | Status days are not draggable in the stripboard (they're pinned). Edit via calendar only. This is the intended behavior. |
| **Existing projects lose dates on first load** | Expected | Old projects load with `startDate: null` → no working dates shown. User sets a start date and the schedule "flows" into place. No migration code needed — clean slate. |

### Tradeoffs

| Tradeoff | Rationale |
|---|---|
| **No stored dates on working days** | Eliminates drift entirely. One source of truth. Cost: every reader must compute or receive derived dates. |
| **`ScheduleRow.shootDay` kept as denormalized cache** | Removing it would require every drag handler, context menu, keyboard shortcut, and rules engine to recompute group membership from the full rows array on every access. Larger blast radius for no real cleanliness gain. Kept as a derived index — safe because `deriveShootDays` recomputes it on every mutation. |
| **Hold/travel days NOT in rows[]** | Keeps rows[] purely for working day scheduling. Status days are overlays rendered from `calendar.statusDays`. Prevents stored dates from re-entering the rows array. |
| **No migration code** | Old projects load with default calendar config. User sets start date manually. Simpler codebase, no fragile heuristics. |
| **Auto-weekends default ON** | Matches Movie Magic defaults. Most productions don't work weekends. Users with weekend shoots toggle off. |
| **Boneyard = simple boolean flag** | Minimal complexity. Same drag-and-drop machinery. Same context menu. Just a filter. |
| **Vertical stacking kept (no horizontal flow)** | Lower refactor risk. Existing print pipeline continues to work. |

---

## 13. File-by-File Effort Estimate

| File | Level | Scope |
|---|---|---|
| `src/types.ts` | Medium | New types: `DAY_BREAK`, `ProductionCalendar`, `DayOffEntry`, `StatusDayEntry`, `StripViewMode`, `boneyard` field, simplified `ShootDayMeta` |
| `src/lib/scheduling.ts` | **New** (~250 lines) | All derivation utilities, date math, group computation, stripboard layout |
| `src/store.tsx` | High | 12 new actions, `applySchedulingDerivation`, default calendar on new projects, modified existing actions |
| `src/components/ScheduleTab.tsx` | High | Day groups derivation, stripboard layout, context menu (3 new items), DAY_BREAK drag, view toggle |
| `src/components/DayBlock.tsx` | Medium | Accept `date` prop, compact mode header toggle, remove `meta.date` reads |
| `src/components/SortableRow.tsx` | Medium | DAY_BREAK row variant (banner separator) |
| `src/components/StatusDayBlock.tsx` | **New** (~60 lines) | Hold/travel day rendering between working day blocks |
| `src/components/UnscheduledZone.tsx` | **New** (~50 lines) | Unscheduled scenes at bottom of stripboard |
| `src/components/BoneyardBlock.tsx` | Low | Rename from UnscheduledBlock, filter for `boneyard: true` |
| `src/components/CalendarTab.tsx` | High | Full rewrite: start date, days off, status days, derived display, new context menu, side panel with unscheduled + boneyard |
| `src/components/PrintSchedule.tsx` | Medium | Replace `chronoDayMap`, use `deriveStripboardLayout` |
| `src/components/DoodsTab.tsx` | Medium | Replace `chronoDayMap` |
| `src/components/print/Dood.tsx` | Medium | Replace `chronoDayMap` |
| `src/components/SceneSheet.tsx` | Low | Replace `chronoDayMap` |
| `src/lib/rulesEngine.ts` | Low | Accept `derivedDates` parameter |
| `src/App.tsx` | Medium | Strip view toggle, calendar header controls |
| `src/components/HelpModal.tsx` | Low | Day Breaks section |
| `AGENTS.md` | Low | Architecture doc update |

**Total**: ~1500-1800 lines of new/modified code across 18 files (plus 3 new files).

---

## 14. Open Questions for Future

1. **Auto day breaks by page count / duration**: StudioBinder auto-inserts day breaks every N pages or hours. Possible Phase 4 enhancement — "Insert Day Breaks every N pages" action in the stripboard toolbar.
2. **Multi-stripboard / bands**: Movie Magic allows multiple side-by-side bands (main unit, second unit). Out of scope for V1.
3. **Calendar day drag**: Should dragging a day in the calendar move its stripboard position (reorder day groups)? V1 keeps day-position immutable from calendar; adjust via stripboard.
4. **`recomputeDayMeta` unitCall preservation**: V1 resets unitCall to default when a day's position changes. Future: match by scene content hash or relative position to preserve call times across reorders.
5. **Status day to working day conversion**: Converting a hold day back to a working day — does it create a new day break group or just free the date? V1: just frees the date (existing working days flow back). No new group created.
6. **Hotkeys for day breaks**: Keyboard shortcut to insert a day break at cursor position in the stripboard. Future enhancement.