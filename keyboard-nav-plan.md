# Schedule & Calendar Keyboard Navigation Plan

## Bug Fix: Shift+Up/Down in Boneyard (ScheduleTab)

**File:** `src/components/ScheduleTab.tsx:389`

**Root cause:** The anchor index condition is wrong:
```js
const anchorIdx = (anchor && (!isBoneyard && !anchor.startsWith('empty-'))) ? shiftFlat.indexOf(anchor) : -1;
```
When `isBoneyard` is `true`, `(!isBoneyard && ...)` is always `false`, so `anchorIdx` is always `-1`. This triggers the fallback branch which sets selection to `shiftFlat[0]` (top of boneyard) instead of extending from the anchor.

**Fix:** Change the condition to:
```js
const anchorIdx = (anchor && (isBoneyard || !anchor.startsWith('empty-'))) ? shiftFlat.indexOf(anchor) : -1;
```
- Non-boneyard: anchor must not start with `'empty-'` (unchanged behavior)
- Boneyard: anchor just needs to exist (no empty- filtering needed)

---

## Feature: Cmd+A Select All (ScheduleTab)

**File:** `src/components/ScheduleTab.tsx` — add to the keyboard handler `useEffect` block (~line 271)

**Logic:**
1. Check `Cmd+A` (or `Ctrl+A`) is pressed, not in text editing mode, not focused on an editable input
2. Determine context: if current selection is in boneyard (or `boneyardLastIdRef` is set and no stripboard selection), select all boneyard rows; otherwise select all stripboard rows
3. Set `selectedRowIds` to the full flat list and update `lastClickedId` to the first item

```ts
if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
  e.preventDefault();
  const isBoneyard = Array.from(selectedRowIds).some(id => {
    const row = activeVersion.rows.find(r => r.id === id);
    return row && (row.containerId === null || row.containerId === -1);
  }) || (selectedRowIds.size === 0 && boneyardLastIdRef.current !== null);
  const ids = isBoneyard ? boneyardFlatRef.current : flatRowIdsRef.current.filter(id => !id.startsWith('empty-'));
  if (ids.length > 0) {
    setSelectedRowIds(new Set(ids));
    setLastClickedId(ids[0]);
  }
}
```

---

## Feature: Calendar Tab Boneyard Keyboard Navigation

**File:** `src/components/CalendarTab.tsx`

Currently the Calendar tab has **no keyboard navigation** for the boneyard sidebar. Only Escape to deselect exists (line 1059).

### Changes needed:

1. **Add refs for boneyard flat IDs and last-clicked tracking:**
   ```ts
   const boneyardFlatRef = useRef<string[]>([]);
   boneyardFlatRef.current = boneyardRows.map(r => r.id);
   const lastClickedIdRef = useRef(lastClickedId);
   lastClickedIdRef.current = lastClickedId;
   ```

2. **Add a new `useEffect` keyboard handler** for Arrow Up/Down, Shift+Arrow Up/Down, and Cmd+A, scoped to the boneyard rows:

   **Arrow Up/Down (no shift):**
   - Move single selection up/down through `boneyardFlatRef.current`
   - If nothing selected, select the first boneyard row
   - Scroll selected row into view

   **Shift+Arrow Up/Down:**
   - Extend selection from anchor (`lastClickedIdRef.current`) using the same range logic as ScheduleTab
   - If no anchor, select from first item to current

   **Cmd+A:**
   - Select all boneyard rows
   - Set `lastClickedId` to first row

   **Tab key:**
   - Not needed — Calendar tab doesn't have stripboard focus toggle

3. **Add `data-row-id` attributes** to the `SceneCard` components in `BoneyardSidebar` (line 335) if not already present, for `scrollIntoView` targeting.

4. **`scrollToRow` helper** — already exists in CalendarTab at line 678.

---

## Feature: Boneyard Sort Parity with Schedule Header Sort

**Problem:** The schedule header Sort dropdown supports many criteria (Scene Number, Script Day, Page Count, Duration, INT/EXT, Day/Night, all custom categories). The boneyard Sort dropdown only supports 4 (Scene Number, Script Day, Page Count, Set/Location).

### Schedule header sort options (source of truth)

`ScheduleTab.tsx:1591-1601`:
- Scene Number
- Script Day
- Page Count
- Duration
- INT / EXT
- Day / Night
- All ELEMENT_CATEGORIES + custom categories

### Boneyard sort — current options

`BoneyardBlock.tsx:281-303` and `CalendarTab.tsx:314-318`:
- Scene Number
- Script Day
- Page Count (Longest)
- Set / Location

### Changes needed

#### 1. `BoneyardBlock.tsx` — extend `sortBoneyard` function (line 151)

Change the criterion type from `'scene_number' | 'script_day' | 'page_count' | 'set_name'` to `string`. Add new sort cases to the comparator:

```ts
if (criterion === 'duration') {
  return (b.estimatedDuration || 0) - (a.estimatedDuration || 0);
}
if (criterion === 'int_ext') {
  return (sceneA?.intExt || '').localeCompare(sceneB?.intExt || '');
}
if (criterion === 'day_night') {
  return (sceneA?.dayNight || '').localeCompare(sceneB?.dayNight || '');
}
// Fallback: treat criterion as a scene field (set, props, cast, custom categories, etc.)
const valA = String((sceneA as any)?.[criterion] ?? '');
const valB = String((sceneB as any)?.[criterion] ?? '');
return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
```

#### 2. `BoneyardBlock.tsx` — update sort dropdown menu (line 279-305)

Add all the same menu items as the schedule header, in the same order. Replace the hardcoded 4-item menu with:

- Scene Number
- Script Day
- Page Count
- Duration
- _(divider)_
- INT / EXT
- Day / Night
- _(divider)_
- All ELEMENT_CATEGORIES + custom categories (derived from `state.present.customCategories` and `ELEMENT_CATEGORIES`, matching `sortCategories` in ScheduleTab)

The BoneyardBlock already calls `useProject()` (line 64), so it has access to `state.present.customCategories`. Import `ELEMENT_CATEGORIES` from `../lib/categories`.

#### 3. `CalendarTab.tsx` — extend `sortBoneyard` callback (line 708)

Same logic as above — change the criterion type to `string`, add duration, int_ext, day_night, and fallback field sorting.

#### 4. `CalendarTab.tsx` — update `BoneyardSidebar` sort dropdown (line 305-322)

- Change the `onSort` prop type from the 4-literal union to `string`
- Add the same menu items as the updated BoneyardBlock dropdown
- Pass `sortCategories` (derived from ELEMENT_CATEGORIES + custom categories) to BoneyardSidebar as a new prop, or derive it inside BoneyardSidebar

---

## Summary of Files Changed

| File | Change |
|---|---|
| `src/components/ScheduleTab.tsx` | Fix line 389 anchor condition; add Cmd+A handler |
| `src/components/CalendarTab.tsx` | Add boneyard refs + Arrow Up/Down, Shift+Arrow, Cmd+A keyboard handler; extend `sortBoneyard` + `BoneyardSidebar` sort dropdown |
| `src/components/BoneyardBlock.tsx` | Extend `sortBoneyard` to support all criteria; update sort dropdown to match schedule header |
