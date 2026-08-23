# Call Time Unification & dayMeta Removal

> **Status:** Approved — ready for execution  
> **Date:** 2026-07-14  
> **Goal:** Unify all call time storage on DAYBREAK rows, remove `dayMeta`, remove `SectionHeader` component

---

## 1. Problem Statement

Currently, call times are stored in TWO places:
1. `dayMeta[containerId].unitCall` — for the first section of each container
2. `ScheduleRow.daybreakCallTime` — for sections after a DAYBREAK row

This causes:
- Swap logic has special cases for section 0 vs others (CalendarTab:936-961)
- Reordering breaks because the two sources don't stay in sync
- SectionHeader component is a hacky workaround for the "first daybreak"
- Confusing mental model: is the call time on the container or the row?

---

## 2. Solution: Unified DAYBREAK Model

### Core Concept
Every section has a call time stored on the DAYBREAK row that ENDS it. This matches the current section-building semantics (DAYBREAK delimits/ends a section, no final push — rows after the last DAYBREAK are orphans, NOT a section).

The key change from current behavior: `daybreakRow.daybreakCallTime` is now interpreted as **this section's** call time (not the next section's). This eliminates the need for `dayMeta.unitCall`.

**Data model:**
- `daybreakRow.daybreakCallTime` = call time for the section that ENDS at this DAYBREAK
- Section 0 reads its call time from `sections[0].daybreakRow.daybreakCallTime` (the first DAYBREAK)
- Section N reads its call time from `sections[N].daybreakRow.daybreakCallTime`
- No `dayMeta.unitCall` — all call times live on DAYBREAK rows

**Synthetic first DAYBREAK (auto-inserted):**
- If a container's first row is NOT a DAYBREAK, a synthetic DAYBREAK is inserted at position 0
- This synthetic DAYBREAK carries the call time for Day 1 (default `'08:00'`)
- It is locked (not draggable), invisible as a footer (no "End of Day 0"), and renders only a "DAY #1" header
- Only visible when the container has other DAYBREAKs (otherwise no daybreak UI at all)

**Rendering:**
- First DAYBREAK: invisible (no "End of Day 0" footer), just "DAY #1" header
- Second+ DAYBREAKs: "End of Day N" footer + "DAY #N+1" header
- Rows after the last DAYBREAK: rendered as orphan rows (NOT a section, no day label)

**First DAYBREAK behavior:**
- Locked at position 0 (not draggable)
- Can't drop ribbons above it (acts as ceiling)
- Only visible when container has other DAYBREAKs

### What Gets Removed
- `DayMeta` interface from `types.ts`
- `dayMeta` field from `ScheduleVersion`
- `SectionHeader` component entirely
- All `dayMeta.unitCall` usage
- All `dayMeta.date` usage (dates computed from `productionStart`)

---

## 3. Implementation Plan

### Phase 1: Call Time Unification (this refactor)

#### 3.1 Type Changes (`src/types.ts`)
- [ ] Remove `DayMeta` interface (lines 61-65)
- [ ] Remove `dayMeta` field from `ScheduleVersion` (line 79)
- [ ] Keep `daybreakCallTime` on `ScheduleRow` (rename comes in Phase 2)
- [ ] Add `legacy?: boolean` to `ScheduleVersion` if not present (already there at line 82)

#### 3.2 Store Changes (`src/store.tsx`)
- [ ] Remove `dayMeta` from version creation (lines 252, 573)
- [ ] Delete `migrateDayMetaToNonShootDates` function entirely (lines 40-98) — no migration needed; legacy versions get a delete button instead
- [ ] Add legacy version detection: if loaded version has `dayMeta` field, set `version.legacy = true`
- [ ] Update `UPDATE_VERSION` action to not reference `dayMeta`
- [ ] Remove `DayMeta` import from `store.tsx` (cleanup after types.ts removal)

#### 3.3 Section Building Logic (`src/lib/useDaybreakSections.ts`)
- [ ] Keep current algorithm: DAYBREAK ENDS a section, no final push (rows after last DAYBREAK are orphans, not a section)
- [ ] `daybreakRow` remains the DAYBREAK that ENDS the section (unchanged from current)
- [ ] Ensure synthetic first DAYBREAK is inserted if first row is not a DAYBREAK (see §2)
- [ ] Call time interpretation changes: `sections[N].daybreakRow.daybreakCallTime` = **this** section's call time (NOT next section's)
- [ ] Date computation: use `productionStart` + `nonShootDates` (already done)

**Section model (unchanged structure):**
```typescript
interface DaybreakSection {
  index: number;
  rows: ScheduleRow[];
  daybreakRow?: ScheduleRow; // The DAYBREAK that ENDS this section (unchanged)
}
```

**Algorithm (mostly unchanged — keep current, add synthetic first DAYBREAK):**
```
// Ensure synthetic first DAYBREAK exists
if first row in container is not DAYBREAK:
  insert synthetic DAYBREAK at position 0 with daybreakCallTime = '08:00'

// Build sections (DAYBREAK ends section, NO final push — same as current)
let currentRows = []
let sectionIndex = 0
for each row in container:
  if row.type === 'DAYBREAK':
    push { index: sectionIndex, rows: currentRows, daybreakRow: row }
    currentRows = []
    sectionIndex++
  else:
    currentRows.push(row)
// NO final push — rows after last DAYBREAK are orphans, not a section
```

**Call time reading (new — unified, no special case):**
```typescript
// Every section reads its call time from its OWN daybreakRow
function getSectionCallTime(section: DaybreakSection): string {
  return section.daybreakRow?.daybreakCallTime || '08:00';
}
// No more: section 0 reads dayMeta.unitCall, section N reads sections[N-1].daybreakRow
```

#### 3.4 StripBlock Changes (`src/components/StripBlock.tsx`)
- [ ] Remove `SectionHeader` import and usage (lines 7, 326-342)
- [ ] Remove `meta` prop (no more `dayMeta`)
- [ ] Remove `updateMeta` function (lines 167-179)
- [ ] Update call time computation: read from first DAYBREAK's `daybreakCallTime`
- [ ] Update `computedRows` logic:
  - First DAYBREAK: mark as `isFirstDaybreak = true`
  - Compute call times starting from first DAYBREAK's `daybreakCallTime`
- [ ] Update violation checking to use DAYBREAK call times

**Call time computation:**
```typescript
// Call time for a section = its daybreakRow.daybreakCallTime (the DAYBREAK that ENDS it)
// Walk rows, track current section base time
let sectionBaseTime = '08:00'; // default for rows before first DAYBREAK (orphan zone)
let pendingCallTime: string | null = null; // call time from upcoming DAYBREAK applies to CURRENT section

for (const row of rows) {
  if (row.type === 'DAYBREAK') {
    // This DAYBREAK ENDS the current section
    // Its daybreakCallTime IS this section's call time
    sectionBaseTime = row.daybreakCallTime || '08:00';
    // ... compute section totals using sectionBaseTime
  }
  // ... compute row call times based on sectionBaseTime
}
// Note: the first synthetic DAYBREAK's daybreakCallTime sets the base for section 0
```

#### 3.5 SortableRibbon Changes (`src/components/SortableRibbon.tsx`)
- [ ] Remove `SectionHeader` import and usage (lines 17, 647-661, 701-713)
- [ ] Update DAYBREAK rendering:
  - If `isFirstDaybreak`: render only "DAY #1" header (no "End of Day" footer)
  - Else: render "End of Day N" footer + "DAY #N+1" header
- [ ] Update `hasNextDaybreak` logic to work with new model
- [ ] Pass `isFirstDaybreak` prop from StripBlock

**Rendering logic:**
```typescript
if (row.type === 'DAYBREAK') {
  if (isFirstDaybreak) {
    // Only render "DAY #1" header
    return <DayHeader dayLabel="DAY #1" callTime={row.daybreakCallTime} ... />;
  } else {
    // Render "End of Day N" footer
    return <DayFooter ... />;
  }
}
```

#### 3.6 Drag-and-Drop Changes
- [ ] **StripBlock.tsx**: First DAYBREAK is NOT in `SortableContext` (locked)
- [ ] **StripBlock.tsx**: Can't drop above first DAYBREAK (it's the ceiling)
- [ ] **ScheduleTab.tsx**: Update collision detection to handle locked first DAYBREAK
- [ ] **ScheduleTab.tsx**: Update `handleDragOver` to prevent drops before first DAYBREAK

**Implementation:**
```typescript
// In StripBlock
const firstDaybreak = rows.find(r => r.type === 'DAYBREAK');
const draggableRows = firstDaybreak ? rows.slice(1) : rows; // Skip first DAYBREAK

<SortableContext items={draggableRows.map(r => r.id)} ...>
  {firstDaybreak && <LockedFirstDaybreak row={firstDaybreak} ... />}
  {draggableRows.map(row => <SortableRibbon row={row} ... />)}
</SortableContext>
```

#### 3.7 ScheduleTab Changes (`src/components/ScheduleTab.tsx`)
- [ ] Remove `existingDays` derivation from `dayMeta` (lines 790-796)
- [ ] Derive `existingDays` from unique `containerId` values in rows
- [ ] Remove `shootViolations` logic that uses `dayMeta.unitCall` (lines 807-853)
- [ ] Update violation checking to read call times from DAYBREAK rows
- [ ] Remove any `dayMeta` references in context menu actions

**New `existingDays`:**
```typescript
const existingDays = useMemo(() => {
  const ids = new Set<number>();
  for (const r of activeVersion.rows) {
    if (r.containerId != null && r.containerId !== -1) {
      ids.add(r.containerId);
    }
  }
  return Array.from(ids).sort((a, b) => a - b);
}, [activeVersion.rows]);
```

#### 3.8 CalendarTab Changes (`src/components/CalendarTab.tsx`)
- [ ] Remove swap logic special case for section 0 (lines 936-961)
- [ ] Simplify swap: just swap `daybreakCallTime` values between DAYBREAK rows
- [ ] Remove `dayMeta` references in date handling (lines 367-381, 388)
- [ ] Update to use `productionStart` for all date computation

**Simplified swap (no special case for section 0):**
```typescript
// Each section's call time is on its OWN daybreakRow (the DAYBREAK that ENDS it)
// Swap: just swap daybreakCallTime between the two DAYBREAK rows
const daybreakA = blocks[sourceIdx].daybreakRow;
const daybreakB = blocks[targetIdx].daybreakRow;
if (daybreakA && daybreakB) {
  const temp = daybreakA.daybreakCallTime;
  daybreakA.daybreakCallTime = daybreakB.daybreakCallTime;
  daybreakB.daybreakCallTime = temp;
}
// No dayMeta update needed — call times are fully on DAYBREAK rows
```

#### 3.9 Print Component Changes
- [ ] **BreakdownSheet.tsx**: Remove `dayMeta` prop (line 34), remove from usage
- [ ] **Dood.tsx**: Remove `dayMeta` prop and all references (lines 108, 131-168, 209, 223, 247-248)
  - Compute dates from `productionStart` + `nonShootDates`
- [ ] **DoodDialog.tsx**: Remove `dayMeta` usage (line 37-38)
- [ ] **ElementBreakdown.tsx**: Remove `dayMeta` prop and `getDayDate` function (lines 34, 65-71)
  - Compute dates from `productionStart` + `nonShootDates`
- [ ] **PrintSchedule.tsx**: Update to read call times from DAYBREAK rows (line 882)

#### 3.10 App.tsx Changes
- [ ] Remove `dayMeta` passing to print components (lines 352-354, 424, 444, 462)
- [ ] Update legacy version detection: show error banner + delete button

**Legacy version UI:**
```typescript
{activeVersion?.legacy && (
  <div className="bg-red-900/20 border border-red-500 text-red-200 p-4 rounded">
    <p>This schedule version uses the old day model and cannot be edited.</p>
    <button onClick={() => dispatch({ type: 'DELETE_VERSION', payload: activeVersion.id })}>
      Delete Version
    </button>
  </div>
)}
```

#### 3.11 Context Menu Changes
- [ ] **StripboardContextMenuContent.tsx**: Remove any `dayMeta` references
- [ ] **useStripboardContextMenu.ts**: Update to use DAYBREAK call times

#### 3.12 Other Components
- [ ] **CalendarTab.tsx**: Remove `dayMeta` usage in date handling
- [ ] **SceneSheet.tsx**: Remove any `dayMeta` references (check if any)
- [ ] **ElementBreakdownView.tsx**: Remove `dayMeta` prop and usage

#### 3.13 Rules Engine (`src/lib/rulesEngine.ts`)

`checkDay()` and `checkAllDays()` are the only rules engine functions that reference `dayMeta` directly. They currently use:
- `dayMeta[containerId]?.date` — for date-restricted rule checks (`MAX_HOURS`, `DATE_RESTRICTION`, `TIME_WINDOW` with date filter)
- `dayMeta[containerId]?.unitCall` — for `TIME_WINDOW` computations (line 87)

`checkSection()` (line 185) is the correct pattern — it already accepts `sectionDate` and `sectionBaseTime` as direct parameters and does NOT reference `dayMeta` at all. All three consumers (`StripBlock`, `ScheduleTab`, `CalendarTab`) already import `checkSection` and pass `sectionBaseTime` directly.

**`checkDay`/`checkAllDays` are currently unused** — grep shows no call sites outside `rulesEngine.ts` itself. All components import `checkSection` instead. They can either be deleted (dead code) or refactored to match the `checkSection` pattern.

- [ ] Remove `DayMeta` from imports (line 1)
- [ ] Remove `dayMeta` parameter from `checkDay()` signature (line 25)
- [ ] Replace `dayMeta[containerId]?.date` with a `sectionDate` parameter (line 30)
- [ ] Replace `dayMeta[containerId]?.unitCall` with a `sectionBaseTime` parameter (line 87)
- [ ] Remove `dayMeta` parameter from `checkAllDays()` signature (line 353)
- [ ] Remove `Object.keys(dayMeta)` enumeration in `checkAllDays()` (line 358) — derive days from `rows` containerId values instead
- [ ] OR: delete `checkDay()` and `checkAllDays()` if confirmed dead code (no call sites)
- [ ] Run `npm run lint` — verify no errors

### Phase 2: Rename (separate refactor, after Phase 1 is stable)

- [ ] Rename `daybreakCallTime` → `dayCallTime` in `types.ts`
- [ ] Update all references across codebase (grep for `daybreakCallTime`)
- [ ] Update AGENTS.md documentation

---

## 4. File Change Summary

### Files to Modify
| File | Changes |
|---|---|
| `src/types.ts` | Remove `DayMeta`, remove `dayMeta` from `ScheduleVersion` |
| `src/store.tsx` | Remove `dayMeta` from version creation, add legacy detection |
| `src/lib/useDaybreakSections.ts` | Update section building to use DAYBREAK rows |
| `src/components/StripBlock.tsx` | Remove `SectionHeader`, update call time logic, lock first DAYBREAK |
| `src/components/SortableRibbon.tsx` | Remove `SectionHeader`, update DAYBREAK rendering |
| `src/components/ScheduleTab.tsx` | Update `existingDays`, remove `dayMeta` usage, update violations |
| `src/components/CalendarTab.tsx` | Simplify swap logic, remove `dayMeta` usage |
| `src/components/App.tsx` | Remove `dayMeta` passing, add legacy version UI |
| `src/components/print/*.tsx` | Remove `dayMeta` props, compute dates from `productionStart` |
| `src/components/ElementBreakdownView.tsx` | Remove `dayMeta` usage |
| `src/components/StripboardContextMenuContent.tsx` | Remove `dayMeta` references |
| `src/lib/useStripboardContextMenu.ts` | Update to use DAYBREAK call times |
| `src/lib/rulesEngine.ts` | Remove `DayMeta` import, remove `dayMeta` parameter from `checkDay`/`checkAllDays` (or delete if dead code), source call times from `sectionBaseTime` parameter like `checkSection` already does |

### Files to Delete
| File | Reason |
|---|---|
| `src/components/SectionHeader.tsx` | Replaced by DAYBREAK rendering |

---

## 5. Execution Order

**Batch 1: Types + Store** (foundation)
1. `src/types.ts` — remove `DayMeta`, `dayMeta`
2. `src/store.tsx` — remove `dayMeta` from creation, delete `migrateDayMetaToNonShootDates`, add legacy detection
3. `src/lib/rulesEngine.ts` — remove `DayMeta` import, remove `dayMeta` param from `checkDay`/`checkAllDays` (or delete if dead code)
4. Run `npm run lint` — should see errors in remaining components

**Batch 2: Core Logic** (section building)
1. `src/lib/useDaybreakSections.ts` — update section building
2. `src/components/StripBlock.tsx` — remove `SectionHeader`, update call times, lock first DAYBREAK
3. Run `npm run lint`

**Batch 3: Rendering** (DAYBREAK display)
1. `src/components/SortableRibbon.tsx` — remove `SectionHeader`, update DAYBREAK rendering
2. Run `npm run lint`

**Batch 4: Schedule Tab** (drag-drop, violations)
1. `src/components/ScheduleTab.tsx` — update `existingDays`, violations, context menu
2. Run `npm run lint`

**Batch 5: Calendar Tab** (swap logic)
1. `src/components/CalendarTab.tsx` — simplify swap, remove `dayMeta`
2. Run `npm run lint`

**Batch 6: Print Components**
1. All `src/components/print/*.tsx` — remove `dayMeta`, compute dates
2. Run `npm run lint`

**Batch 7: App + Other**
1. `src/components/App.tsx` — remove `dayMeta` passing, add legacy UI
2. Other components as needed
3. Run `npm run lint`

**Batch 8: Delete SectionHeader**
1. Delete `src/components/SectionHeader.tsx`
2. Run `npm run lint` — should pass clean

**Batch 9: Verify**
1. Test: create new version, add DAYBREAKs, verify call times
2. Test: swap sections in calendar, verify call times swap correctly
3. Test: drag rows, verify first DAYBREAK is locked
4. Test: load old project with `dayMeta`, verify legacy banner appears
5. Test: print schedule, verify dates are correct

---

## 6. Edge Cases & Gotchas

### 6.1 First DAYBREAK & Orphan Rows
- A container's first DAYBREAK is the first row with `type === 'DAYBREAK'`
- If the first row is NOT a DAYBREAK, a synthetic DAYBREAK is inserted at position 0 (locked, carries Day 1 call time)
- If a container has no DAYBREAKs at all, no DAYBREAK UI is shown
- If a container has only one DAYBREAK, it's the first (and only) — no "End of Day" footer
- **Rows after the last DAYBREAK are orphans** — they are NOT included in any section (no final push in the section-building algorithm). They render as loose ribbons without a day label.

### 6.2 Call Time Defaults
- If a DAYBREAK has no `daybreakCallTime`, default to `'08:00'`
- This matches current behavior

### 6.3 Date Computation
- Dates are computed from `productionStart` + `nonShootDates`
- Each section gets the next available date (skipping non-shoot dates)
- This is already implemented in `useDaybreakSections.ts` — just need to ensure all places use it

### 6.4 Legacy Versions
- Versions with `dayMeta` field are marked as `legacy: true`
- Legacy versions are read-only (no editing)
- Show error banner with "Delete Version" button
- No migration — user must delete and recreate

### 6.5 Drag-and-Drop
- First DAYBREAK is NOT in `SortableContext` — it's locked
- Dropping above first DAYBREAK should be prevented
- Dropping on first DAYBREAK should be treated as dropping at position 0

### 6.6 Print System
- Print components need dates — compute from `productionStart`
- Call times come from DAYBREAK rows
- Need to pass `productionStart` and `nonShootDates` to print components

---

## 7. Testing Checklist

- [ ] Create new version — should have empty `dayMeta` (or no `dayMeta`)
- [ ] Add DAYBREAK to container — first DAYBREAK should be locked
- [ ] Edit first DAYBREAK call time — should update Day 1 call time
- [ ] Add second DAYBREAK — should show "End of Day 1" + "DAY #2" header
- [ ] Edit second DAYBREAK call time — should update Day 2 call time
- [ ] Swap sections in calendar — call times should swap correctly
- [ ] Drag rows between sections — should maintain correct call times
- [ ] Delete first DAYBREAK — should not be allowed (locked)
- [ ] Load old project with `dayMeta` — should show legacy banner
- [ ] Print schedule — dates should be correct, call times should be correct
- [ ] Rows after the last DAYBREAK — should render as orphan ribbons, no day label, not in any section
- [ ] Rules engine — create `TIME_WINDOW` rule, verify it uses DAYBREAK call times (not dayMeta.unitCall)
- [ ] Rules engine — create `MAX_HOURS` rule with date filter, verify date filtering works
- [ ] Rules engine — create `DATE_RESTRICTION` rule, verify it blocks correctly

---

## 8. Out of Scope

- Renaming `daybreakCallTime` → `dayCallTime` (Phase 2, separate refactor)
- Renaming `StripBlock` → `DayBlock` (separate refactor)
- Any other naming cleanups
- Migration of old versions (they become legacy, user deletes)

---

## 9. Success Criteria

1. `npm run lint` passes with no errors
2. All call times are stored on DAYBREAK rows (no `dayMeta.unitCall`)
3. `SectionHeader` component is deleted
4. First DAYBREAK is locked and not draggable
5. Swap logic in CalendarTab is simplified (no special case for section 0 — just swap `daybreakCallTime` between two DAYBREAK rows)
6. Dates are computed from `productionStart` (no `dayMeta.date`)
7. Legacy versions show error banner + delete button
8. All print components work without `dayMeta`
9. Rules engine (`rulesEngine.ts`) no longer imports or references `DayMeta` / `dayMeta`
10. `migrateDayMetaToNonShootDates` function is deleted from `store.tsx`

---

**End of Plan**
