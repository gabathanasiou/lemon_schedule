# Set Storage Audit — Multiple Sources of Truth

## Quick Summary

Sets share the same `breakdownElements['set']` database as all other element categories — the storage structure is correct. But **sets are not reliably registered into that database** across all import/edit paths, while every other element IS. This means `breakdownElements['set']` is often empty after import, and multiple components build EntityDropdown items by merging the (empty) database with values parsed from scenes — a fallback that masks the problem but breaks the Element Manager, reports, and other direct consumers of `breakdownElements`.

---

## 1. How Elements Are Stored

### Scene type (`src/types.ts:5-33`)

`Scene.set` is a **scalar string** (single value, uppercase). All other breakdown fields (props, stunts, etc.) are **CSV strings** (comma-separated names). Cast is a CSV of IDs.

```ts
set: string;            // single: "HOUSE"
stunts: string;         // CSV: "Fall, Fire, Wire Work"
props: string;          // CSV: "Gun, Badge, Coffee"
```

### Project type (`src/types.ts:202-225`)

All non-cast elements live in a single unified Record — NO separate `sets` array:

```ts
breakdownElements: Record<string, ProjectElement[]>; // e.g. { 'set': [...], 'props': [...], 'stunts': [...] }
```

Cast has both `castMembers[]` (first-class) and a mirrored copy in `breakdownElements['cast']`. Every other category lives ONLY in `breakdownElements`.

### Category registry (`src/lib/categories.ts:4-21`)

`'set'` sits alongside every other category in `ELEMENT_CATEGORIES`:

```ts
{ key: 'set', label: 'Sets' },
{ key: 'props', label: 'Props' },
{ key: 'stunts', label: 'Stunts' },
// ...
```

### Protected categories (`src/store.tsx:116`)

```ts
export const PROTECTED_CATEGORIES = new Set(['cast', 'set', 'notes']);
```

Sets cannot be hidden or deleted (like cast and notes).

---

## 2. The 3 Broken Registration Paths

Every element category should have its values auto-registered into `breakdownElements` via `ADD_ELEMENT` when scenes are created or edited. Sets fail to do this in 3 critical paths:

### Path 1: Screenplay Import (`src/lib/importScreenplay.ts:400`)

**Problem:** `'set'` is in `SCENE_FIELD_KEYS`, so it's explicitly excluded from element aggregation:

```ts
const SCENE_FIELD_KEYS = new Set(['notes', 'scriptDay', 'set', 'description']);

for (const ps of result.scenes) {
  for (const [cat, items] of Object.entries(ps.taggedElements)) {
    if (SCENE_FIELD_KEYS.has(cat)) continue;  // 'set' SKIPPED here
    // ... collect into allElements for bulk ADD_ELEMENT
  }
}
```

Set values are written directly to `scene.set` from the scene heading (line 447), but **no `ADD_ELEMENT` is ever dispatched for sets**. After a screenplay import, `breakdownElements['set']` is empty.

**Impact:** Element Manager shows zero sets. Reports show nothing. Only the dropdowns work because of the fallback merging (see §3).

### Path 2: Schedule View Editing (`src/components/SortableRow.tsx:84`)

**Problem:** Set is explicitly skipped from the auto-registration loop:

```ts
for (const [key, val] of Object.entries(processed)) {
  if (key === 'id') continue;
  if (typeof val === 'string' && val.trim() && (ENTITY_KEYS.has(key) || key.startsWith('_cat_'))) {
    if (key === 'set') continue;  // <-- SET SKIPPED
    // ... existingNames check, ADD_ELEMENT dispatch
  }
}
```

Instead, a separate codepath (lines 74-79, 97-99) handles set's case normalization:

```ts
if (typeof processed.set === 'string') {
  oldSet = scene.set;
  processed.set = processed.set.toUpperCase();
  if (processed.set !== oldSet) setCapitalized = true;
}
// ...
if (setCapitalized && oldSet && oldSet.toUpperCase() === processed.set) {
  dispatch({ type: 'UPDATE_ELEMENT', payload: { category: 'set', id: oldSet, updates: { id: processed.set, name: processed.set } } });
}
```

This only dispatches `UPDATE_ELEMENT` (a rename) when the value changes case — it **never dispatches `ADD_ELEMENT`** for a genuinely new set. Editing a set in the schedule view that isn't already in `breakdownElements` does **not** add it to the database.

**Impact:** Typing a new set name in the schedule stripboard creates the scene reference but doesn't register the set in the master database.

### Path 3: BreakdownTab & SceneSheet

**Problem:** Set IS included in the registration loops (via `allBreakdownCategories` which starts with `'set'`), but the value is incorrectly split by comma:

```ts
// BreakdownTab.tsx:443, 491, 554
const items = val.split(',').map((x: string) => x.trim()).filter(Boolean);

// SceneSheet.tsx:167
for (const item of v.split(',').map((x: string) => x.trim()).filter(Boolean)) {
```

Since `set` is defined as a single-value field (see §1), and set names typically don't contain commas, this "works" in practice — the split produces a one-element array. But it's architecturally inconsistent with how set is treated everywhere else (as a single unsplit value).

**Impact:** Minor. This path actually DOES register sets via `ADD_ELEMENT` (unlike paths 1 and 2), but uses the wrong splitting logic.

---

## 3. The Fallback That Masks the Problem

Because the database is often empty, multiple components don't trust it alone — they build EntityDropdown items by **merging** `breakdownElements['set']` (the database) with values parsed from scene fields:

### `SortableRow.tsx:552-570` — `entityItemsMap`

```ts
const entityItemsMap = useMemo(() => {
  const map: Record<string, { id: string; name: string }[]> = {};
  for (const field of ENTITY_FIELDS) {
    const sceneValues = [...new Set(scenes.map(s => ((s as any)[field] as string) || '')
      .filter(Boolean).flatMap(v => v.split(',').map(x => x.trim())))] as string[];
    const stored = state.present.breakdownElements?.[field] || [];
    const seen = new Set<string>();
    const items: { id: string; name: string }[] = [];
    for (const e of stored) { /* add stored elements */ }
    for (const v of sceneValues) { /* fallback: add values from scenes */ }
    map[field] = items;
  }
  return map;
}, [scenes, state.present.breakdownElements]);
```

This merges both sources — database + scene-parsed values. So the dropdown works even when `breakdownElements['set']` is empty.

### `BreakdownTab.tsx:204-223` — `SetEditor`

```ts
const setItems = useMemo(() => {
  const sets = new Map<string, string>();
  for (const s of scenes) { const v = s.set.trim().toUpperCase(); if (v) sets.set(v, v); }        // from scenes
  for (const e of project.breakdownElements?.['set'] || []) { const v = e.name.toUpperCase(); ... } // from database
  return [...sets.entries()].map(([id, name]) => ({ id, name })).sort(...);
}, [scenes, project.breakdownElements]);
```

Same dual-source pattern.

### `SceneSheet.tsx:184-227` — `breakdownItems`

Same merging pattern — scans scenes AND database for each category.

### Components that DON'T merge (broken)

- **Element Manager** (`ElementManager.tsx`): reads `breakdownElements` directly → sets are empty/incomplete
- **Reports** (`ReportsTab.tsx:104`, `ElementBreakdownView.tsx:19-22`, `DoodsTab.tsx:67`): read `breakdownElements` directly → sets are empty
- **Print reports** (`print/DoodDialog.tsx:117,129`, `print/ElementBreakdown.tsx:46-49`): read `breakdownElements` directly → sets are empty

---

## 4. Store Actions — Where Set IS Special-Cased

### `ADD_ELEMENT` (`src/store.tsx:635-657`)

**No set special-case.** Uses generic dedup: `dedupKey = element.id || element.name.toLowerCase()`. Cast is special-cased (also mirrors to `castMembers[]`), but set flows through the generic path. This is correct and doesn't need changes.

### `UPDATE_ELEMENT` (`src/store.tsx:705`)

**Set IS special-cased.** When renaming a set element, it replaces the entire `scene.set` field (scalar — one scene, one value):

```ts
if (category === 'set') {
  const oldUpper = old.name.toUpperCase();
  newScenes = state.present.scenes.map(scene => {
    if (scene.set.toUpperCase() !== oldUpper) return scene;
    return { ...scene, set: updates.name! };
  });
}
```

vs multi-value categories where it surgically swaps one token in a CSV list:

```ts
const items = val.split(',').map(x => x.trim());
const idx = items.findIndex(x => x.toLowerCase() === oldLower);
items[idx] = updates.name!;
return { ...scene, [category]: items.join(', ') };
```

This is correct — set is scalar, so replace the whole field. Doesn't need changes.

### `DELETE_ELEMENT` (`src/store.tsx:735-764`)

**No set special-case.** Uses generic CSV-split filter to remove from all scene fields. Since set names don't contain commas, splitting on comma yields a one-element array and the filter works. Doesn't need changes.

### `getElementsFromScenes` (`src/store.tsx:988-1005`)

**Set IS special-cased.** Normalizes + uppercases + treats as single-value:

```ts
if (category === 'set') {
  const map = new Map<string, string>();
  for (const s of scenes) {
    const val = normalizePunctuation(s.set).trim().toUpperCase();
    if (!val) continue;
    if (!map.has(val)) map.set(val, val);
  }
  return [...map.values()].sort().map(v => ({ id: v, name: v }));
}
```

vs CSV split for everything else. This is correct.

---

## 5. Complete Registration Path Matrix

| Path | File:Line | Set registered via `ADD_ELEMENT`? | Treatment |
|---|---|---|---|
| **Screenplay import** | `importScreenplay.ts:400-421` | **NO** — excluded by `SCENE_FIELD_KEYS` | Written to `scene.set` from heading only |
| **CSV import** | `BreakdownTab.tsx:506-569` | Yes, but split-by-comma | `split(',')` on single-value — works but wrong |
| **Grid paste (new rows)** | `BreakdownTab.tsx:407-454` | Yes, but split-by-comma | `split(',')` — works but wrong |
| **Grid edit (existing rows)** | `BreakdownTab.tsx:458-504` | Yes, but split-by-comma | `split(',')` — works but wrong |
| **SceneSheet save** | `SceneSheet.tsx:158-179` | Yes, but split-by-comma | `split(',')` — works but wrong |
| **Schedule view edit** | `SortableRow.tsx:71-100` | **NO** — explicit `continue` | Only `UPDATE_ELEMENT` for case-changes |
| **Element Manager save** | `ElementManager.tsx:220-254` | Yes, correctly (single-value) | `cat === 'set' ? [val.trim()] : val.split(',')` |

**Bottom line:** The Element Manager is the ONLY place that correctly treats set as single-value. Screenplay import and schedule editing never register sets. The spreadsheet paths register sets but use CSV-split (wrong, but happens to work).

---

## 6. The Fix Plan

### Goal

Make sets go through `ADD_ELEMENT` in every registration path — exactly like props/stunts/etc. — with the single difference being: set is single-value (`[val]`) not CSV-split (`val.split(',')`). The `mode="single"` on EntityDropdown is already correct.

### Step 1: Add shared helper — `src/lib/categories.ts`

```ts
export function getFieldItems(field: string, value: string): string[] {
  if (!value || !value.trim()) return [];
  if (field === 'set') return [value.trim()];
  return value.split(',').map(x => x.trim()).filter(Boolean);
}
```

Centralize the single-value vs CSV-split logic so all registration paths use the same helper instead of duplicating `val.split(',')` everywhere.

### Step 2: Fix screenplay import — `src/lib/importScreenplay.ts`

Collect unique set names during the scene creation loop and bulk-register via `ADD_ELEMENT` after all scenes are created:

```ts
const importedSets = new Set<string>();
for (const ps of result.scenes) {
  // ... existing breakdownFields, sceneBase setup ...
  const setName = (breakdownFields.set || ps.set || '').toUpperCase().trim();
  if (setName) importedSets.add(setName);
  dispatch({ type: 'ADD_SCENE', payload: sceneBase });
}
for (const name of importedSets) {
  dispatch({ type: 'ADD_ELEMENT', payload: { category: 'set', element: { id: name, name } } });
}
```

### Step 3: Fix schedule view — `src/components/SortableRow.tsx`

- **Remove** `if (key === 'set') continue;` (line 84) — set enters the generic auto-register loop
- **Replace** `val.split(',').map(x => x.trim()).filter(Boolean)` (line 88) with `getFieldItems(key, val)`
- **Keep** the `setCapitalized`/`UPDATE_ELEMENT` case-rename logic (lines 74-79, 97-99) — handles renaming existing lowercase set entries to uppercase when case changes. The generic loop's case-insensitive check (`existingNames.has(item.toUpperCase())`) prevents duplicate `ADD_ELEMENT` dispatches in this scenario.

### Step 4: Fix breakdown spreadsheet — `src/components/BreakdownTab.tsx`

Three locations to replace `val.split(',')` with `getFieldItems(category, val)`:
- Line 443: duplicate-new-scene branch (phase 1)
- Line 491: edit-existing-scene branch (phase 2)
- Line 554: CSV import branch

### Step 5: Fix scene sheet — `src/components/SceneSheet.tsx`

One location:
- Line 167: replace `v.split(',').map(...)` with `getFieldItems(cat, v)`

### Step 6: (Optional) Remove fallback merging

Once `breakdownElements['set']` is reliably populated, the dual-source fallback in `entityItemsMap` (SortableRow), `SetEditor` (BreakdownTab), and `breakdownItems` (SceneSheet) could be simplified to just use `breakdownElements['set']` directly. However, keeping the fallback provides a safety net for legacy data — safer to leave it for now.

### Not changing (already correct)

| Component | Why |
|---|---|
| `store.tsx` `ADD_ELEMENT` (635) | Generic dedup works for set |
| `store.tsx` `UPDATE_ELEMENT` (705) | Correct scalar replace for set scenes |
| `store.tsx` `DELETE_ELEMENT` (735) | Works for single-value set |
| `store.tsx` `getElementsFromScenes` (988) | Correct set special-case |
| `ElementManager.tsx` | Already treats set as single-value |
| All `EntityDropdown` `mode="single"` usages | Already correct |
| `ElementBreakdownView.tsx` (19) | Already special-cases set as single-value |
| `DoodsTab.tsx` (67) | Already special-cases set |
| `RibbonTab.tsx` (853) | Already uppercases set text |
