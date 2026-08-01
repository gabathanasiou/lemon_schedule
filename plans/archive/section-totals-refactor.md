# Section Totals Refactor — Single Source of Truth

## Problem

Three independent computation paths walk the same `containerRows` to produce overlapping data, relying on `sectionIndex` staying in sync by accident:

| Computation | Output | Location |
|---|---|---|
| `splitSections()` | `ProductionDay[]` (row groups per daybreak) | `useDaybreakSections.ts:21` |
| Date/label builders | `sectionDateMap`, `sectionLabelMap` | `useDaybreakSections.ts:33-56` |
| `computeRowData()` | `ComputedRow[]` + `SectionSums` (totals) | `useDaybreakSections.ts:110` |

Additionally, all computed section properties are accessed as `(row as any).sectionTotal` throughout `SortableRibbon.tsx`, `StripBlock.tsx`, and `PrintSchedule.tsx` — no type safety.

## Goal

**Single pass through rows produces everything.** `useDaybreakSections()` calls `computeRowData()` once and derives all return values from the result. No more parallel computation, no more `as any` casts.

## New Architecture

```
computeRowData(rows, scenes, startDate, nonShootSet, callTimeBase)
  │
  ├─ computedRows: ComputedRow[]     (existing)
  ├─ sections: SectionInfo[]         (NEW — replaces productionDays)
  │   ├─ index, rows[], daybreakRow?
  │   ├─ date, label, chronoDay
  │   ├─ isPinned
  │   └─ sums: SectionSums          (section totals)
  ├─ sectionDateMap: Map<number, string>    (backward compat)
  ├─ sectionLabelMap: Map<number, string>   (backward compat)
  └─ sectionSums: Map<number, SectionSums>  (existing)
```

### New `SectionInfo` type

```ts
interface SectionInfo {
  index: number;
  rows: ScheduleRow[];
  daybreakRow?: ScheduleRow;
  date: string;
  label: string;
  chronoDay: number;
  isPinned: boolean;
  sums: SectionSums;
}
```

### Inline `splitSections` into `computeRowData`

The walk computes section groups, dates, labels, chrono days, and totals simultaneously:

1. At each non-DAYBREAK row: accumulate EST, pages, break into current section
2. At each DAYBREAK: close section
   - Compute `SectionInfo` (row group, date from date map, label from section index, chrono from pinned-awareness)
   - Save `SectionSums` (total, shoot, break, pages, endTime)
   - Reset accumulators
   - Advance date if not pinned
3. After loop: close trailing section

### Derive backward-compat maps in `useDaybreakSections`

From the single `sections: SectionInfo[]` array:
- `productionDays` = sections (same shape: `{ index, rows, daybreakRow }`)
- `sectionDateMap` = `new Map(sections.map(s => [s.index, s.date]))`
- `sectionLabelMap` = `new Map(sections.map(s => [s.index, s.label]))`
- `chronoDayMap` = `new Map(sections.map(s => [s.index, s.chronoDay]))`
- `nextSectionDateMap`, `sceneToSection`, `daybreakRowToSection` — derived as before from section data

## Implementation Steps

### Step 1: Rewrite `computeRowData` in `src/lib/daybreakUtils.ts`

- Add `SectionInfo` type export
- New signature: `computeRowData(rows, scenes, startDate, nonShootSet, callTimeBase?)`
- Inline section splitting, date advancement, labeling, and counting
- Return `{ computedRows, sections, sectionDateMap, sectionLabelMap, sectionSums }`
- Add `console.debug` logging at each DAYBREAK with section totals
- Keep `ComputedRow` and `SectionSums` unchanged

### Step 2: Refactor `src/lib/useDaybreakSections.ts`

- Call `computeRowData` once with `containerRows`, scenes, `startDate`, `nonShootSet`, `callTimeBase`
- Derive all return values from the single result
- Remove `splitSections` call (now inlined in `computeRowData`)
- Remove standalone date/label map builders
- Return shape unchanged for 8+ downstream consumers

### Step 3: Update `DaySection` in `src/components/PrintSchedule.tsx`

- In `DaySection` (line 131): update call to new `computeRowData` signature
  - Pass `rows`, `scenes`, `dateStr`, new `Set()` (no non-shoot dates in print), `callTime`
  - Extract `sectionSums.get(0)` as before
- Import `ComputedRow`, replace `(r as any).sectionTotal` etc. (lines 385-389)

### Step 4: Remove `(row as any)` in `src/components/SortableRibbon.tsx`

- Import `ComputedRow` from `daybreakUtils`
- Update `row` prop type to include `ComputedRow` fields
- Replace all `(row as any).sectionTotal / sectionPages / sectionShoot / sectionBreak / sectionEndTime / hasNextDaybreak`
- ~10 replacement sites

### Step 5: Clean types in `src/components/StripBlock.tsx`

- Use `ComputedRow` for computed row references
- Remove `as ScheduleRow` cast at line 209

### Step 6: Add `window.__dumpSectionTotals` in `src/store.tsx`

- Debug utility that calls `computeRowData` with current version's rows
- Logs per-section breakdown: label, EST, pages, break, total

### Step 7: Typecheck & verify

- `npm run lint` must pass
- Live stripboard: daybreak footers show correct EST / pages / break
- Print: day footers show correct totals
- No console errors

## Files Changed

| File | Change |
|---|---|
| `src/lib/daybreakUtils.ts` | Rewrite `computeRowData`, add `SectionInfo`, inline `splitSections` |
| `src/lib/useDaybreakSections.ts` | Single `computeRowData` call, derive everything from it |
| `src/components/PrintSchedule.tsx` | Update `DaySection` call, remove `as any` casts |
| `src/components/SortableRibbon.tsx` | Import `ComputedRow`, replace `as any` (~10 sites) |
| `src/components/StripBlock.tsx` | Use `ComputedRow` type, remove `as any` casts |
| `src/store.tsx` | Add `__dumpSectionTotals` debug utility |

## Backward Compatibility

- `ProductionDay` shape unchanged (`{ index, rows, daybreakRow }`) — all 8+ consumers of `useDaybreakSections` see the same interface
- `ComputedRow` and `SectionSums` shapes unchanged
- `sectionDateMap`, `sectionLabelMap`, `chronoDayMap`, etc. still returned
- Print `DaySection` uses `sectionSums.get(0)` as before
