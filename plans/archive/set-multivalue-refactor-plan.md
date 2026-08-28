# multiValue Refactor — Implementation Plan

## Overview

Add a `multiValue: boolean` property to category definitions. Replace every `if (category === 'set')` special-case with `if (!isMultiValue(category))`. Fix the 3 broken registration paths. Enable custom categories to be single-value via a UI toggle.

Cast's special treatment (IDs, `castMembers[]`, `displayMode="id"`) is orthogonal — it's about identity, not value cardinality. Cast stays `multiValue: true` and its `isCast` branches remain untouched.

Set's uppercase behavior (forced `.toUpperCase()` on set names) is also orthogonal — it's about display normalization, not value cardinality. It stays set-specific for now. Can be generalized later with an `uppercase: boolean` property if needed.

---

## Step 1 — Type & Category Definition

### `src/lib/categories.ts`

Add `multiValue: boolean` to every entry in `ELEMENT_CATEGORIES`:

```ts
export const ELEMENT_CATEGORIES: { key: string; label: string; multiValue: boolean }[] = [
  { key: 'cast', label: 'Cast', multiValue: true },
  { key: 'set', label: 'Sets', multiValue: false },
  { key: 'props', label: 'Props', multiValue: true },
  { key: 'backgroundActors', label: 'Background Actors', multiValue: true },
  // ... all others: multiValue: true
];
```

Add helper functions:

```ts
const MULTI_VALUE_OVERRIDES: Record<string, boolean> = {};

export function isMultiValue(category: string, customCategories?: CustomCategoryDef[]): boolean {
  const builtin = ELEMENT_CATEGORIES.find(c => c.key === category);
  if (builtin) return builtin.multiValue;
  if (customCategories) {
    const custom = customCategories.find(c => c.key === category);
    if (custom) return custom.multiValue ?? true;
  }
  return MULTI_VALUE_OVERRIDES[category] ?? true;
}

export function getFieldItems(field: string, value: string): string[] {
  if (!value || !value.trim()) return [];
  if (!isMultiValue(field)) return [value.trim()];
  return value.split(',').map(x => x.trim()).filter(Boolean);
}
```

`getFieldItems` is the single replacement for all scattered `val.split(',')` / `cat === 'set' ? [val] : val.split(',')` logic.

### `src/types.ts`

Add `multiValue` to `CustomCategoryDef`:

```ts
export interface CustomCategoryDef {
  key: string;
  label: string;
  icon: string;
  multiValue?: boolean;  // NEW — undefined = true (migration safety)
}
```

### Migration

`isMultiValue()` returns `true` for any category without an explicit `multiValue: false`. Existing custom categories (stored without the field) default to `true` — no behavior change for existing projects.

---

## Step 2 — Store Actions (`src/store.tsx`)

### `getElementsFromScenes` (line 988)

Replace the `if (category === 'set')` branch with `isMultiValue`:

```ts
export function getElementsFromScenes(scenes: Scene[], category: string): { id: string; name: string }[] {
  if (!isMultiValue(category)) {
    const map = new Map<string, string>();
    for (const s of scenes) {
      const val = normalizePunctuation((s as any)[category] as string).trim().toUpperCase();
      if (!val) continue;
      if (!map.has(val)) map.set(val, val);
    }
    return [...map.values()].sort().map(v => ({ id: v, name: v }));
  }
  const set = new Set<string>();
  for (const s of scenes) {
    const val = (s as any)[category] as string;
    if (!val) continue;
    for (const id of val.split(',').map(x => x.trim()).filter(Boolean)) set.add(id);
  }
  return [...set].sort().map(id => ({ id, name: id }));
}
```

Note: the uppercase + normalizePunctuation in the single-value branch is currently set-specific. For now it's fine — any single-value builtin category (just set) has this behavior. If custom single-value categories shouldn't be uppercased, we'd need to separate that. But keeping it as-is is safe for now since no custom single-value categories exist yet.

**Actually — reconsider:** The uppercase is set-specific, not single-value-specific. A custom "Special Notes" single-value field should NOT be forced uppercase. So the branch should be:

```ts
if (!isMultiValue(category)) {
  const map = new Map<string, string>();
  const isSet = category === 'set';
  for (const s of scenes) {
    const raw = ((s as any)[category] as string || '').trim();
    if (!raw) continue;
    const val = isSet ? normalizePunctuation(raw).toUpperCase() : raw;
    if (!map.has(val)) map.set(val, val);
  }
  return [...map.values()].sort().map(v => ({ id: v, name: v }));
}
```

This keeps uppercase as set-specific within the single-value branch.

### `UPDATE_ELEMENT` (line 705)

Replace `if (category === 'set')` with `if (!isMultiValue(category))`:

```ts
} else if (!isCast && updates.name && updates.name !== old.name) {
  if (!isMultiValue(category)) {
    const oldUpper = old.name.toUpperCase();
    newScenes = state.present.scenes.map(scene => {
      const val = (scene as any)[category] as string;
      if (!val || val.toUpperCase() !== oldUpper) return scene;
      return { ...scene, [category]: updates.name! };
    });
  } else {
    // existing CSV-token-swap branch (unchanged)
  }
}
```

Note: The generic `(scene as any)[category]` replaces the hardcoded `scene.set` — works for any single-value field (builtin or custom `_cat_*`).

### `DELETE_ELEMENT` (line 735)

Currently uses generic CSV-split filter for all categories (including set). Replace with `getFieldItems`:

```ts
const items = getFieldItems(category, val).filter(x => x.toLowerCase() !== matchLower);
return { ...scene, [category]: items.join(', ') };
```

For single-value categories, `getFieldItems` returns `[val]`, filter removes it, result is `''`. For multi-value, same as before. No `if (category === 'set')` needed.

### `UPDATE_ELEMENT` auto-populate branch (line 662-672)

When `breakdownElements[category]` is empty, it auto-populates from scenes. Currently uses CSV split for all. Replace with `getFieldItems`:

```ts
for (const item of getFieldItems(category, val)) ids.add(item);
```

---

## Step 3 — Fix Broken Registration Paths

### `src/lib/importScreenplay.ts` (line 400-476)

**Problem:** `'set'` is in `SCENE_FIELD_KEYS`, so it's excluded from `ADD_ELEMENT`.

**Fix:** Remove `'set'` from `SCENE_FIELD_KEYS` and let it flow through the generic element aggregation. But `set` doesn't come from `taggedElements` — it comes from the scene heading (`ps.set`). So we need to add set registration explicitly.

Two options:
- **Option A:** Remove `'set'` from `SCENE_FIELD_KEYS`, and add `ps.set` into `allElements` manually.
- **Option B:** Keep `SCENE_FIELD_KEYS` as-is, and add a separate set-registration loop after scene creation.

**Go with Option B** — less disruptive, clearer intent:

```ts
// After the existing allElements registration loop (line 421):

const importedSets = new Set<string>();
for (const ps of result.scenes) {
  const setName = (breakdownFields.set || ps.set || '').toUpperCase().trim();
  if (setName) importedSets.add(setName);
}
for (const name of importedSets) {
  dispatch({ type: 'ADD_ELEMENT', payload: { category: 'set', element: { id: name, name } } });
}
```

This should be placed AFTER the `allElements` loop (line 421) and BEFORE the scene creation loop (line 423). Or after scene creation — order doesn't matter since `ADD_ELEMENT` and `ADD_SCENE` are independent.

**Wait — actually, for generality:** If we want custom single-value categories to also be registered during import, we need a more general approach. But for now, `set` is the only single-value category that can come from screenplay import (custom categories are created from FDX tags, which are multi-value). So Option B is sufficient.

### `src/components/SortableRow.tsx` (line 71-100)

**Problem:** `if (key === 'set') continue;` skips set from auto-register.

**Fix:** Remove the skip. Use `getFieldItems` instead of `val.split(',')`:

```ts
const updateScene = (updates: Partial<Scene>) => {
  if (!scene) return;
  const processed = { ...updates } as Record<string, any>;
  let setCapitalized = false;
  let oldSet = '';
  if (typeof processed.set === 'string') {
    oldSet = scene.set;
    processed.set = processed.set.toUpperCase();
    if (processed.set !== oldSet) setCapitalized = true;
  }
  for (const [key, val] of Object.entries(processed)) {
    if (key === 'id') continue;
    if (typeof val === 'string' && val.trim() && (ENTITY_KEYS.has(key) || key.startsWith('_cat_'))) {
      // REMOVED: if (key === 'set') continue;
      const existing = state.present.breakdownElements?.[key] || [];
      const existingNames = new Set(existing.map(e => (key === 'cast' ? e.id : (e.name || e.id)).toUpperCase()));
      const items = getFieldItems(key, val);  // CHANGED: was val.split(',').map(...)
      for (const item of items) {
        if (!existingNames.has(item.toUpperCase())) {
          dispatch({ type: 'ADD_ELEMENT', payload: { category: key, element: { id: item, name: item } } });
        }
      }
    }
  }
  dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...processed } });
  if (setCapitalized && oldSet && oldSet.toUpperCase() === processed.set) {
    dispatch({ type: 'UPDATE_ELEMENT', payload: { category: 'set', id: oldSet, updates: { id: processed.set, name: processed.set } } });
  }
};
```

The `setCapitalized`/`UPDATE_ELEMENT` block stays — it handles renaming existing lowercase entries to uppercase when only casing changes. The generic loop's case-insensitive check (`existingNames.has(item.toUpperCase())`) prevents duplicate `ADD_ELEMENT` when the set already exists in a different case.

### `src/components/BreakdownTab.tsx` (lines 443, 491, 554)

Replace `val.split(',').map((x: string) => x.trim()).filter(Boolean)` with `getFieldItems(category, val)` in 3 locations:

**Line 443** (handleChange — new rows from paste):
```ts
const items = getFieldItems(category, val);
```

**Line 491** (handleChange — existing row edits):
```ts
const newItems = getFieldItems(colDef.key, newVal)
  .filter(v => isCast ? !existingSet.has(v) : !existingSet.has(v.toLowerCase()));
```

**Line 554** (handleImport — CSV import):
```ts
const items = getFieldItems(category, val);
```

### `src/components/SceneSheet.tsx` (line 167)

Replace `v.split(',').map((x: string) => x.trim()).filter(Boolean)` with `getFieldItems(cat, v)`:

```ts
for (const item of getFieldItems(cat, v)) {
```

---

## Step 4 — EntityDropdown Mode Derivation

### `src/components/SortableRow.tsx`

Replace `mode={field === 'set' ? 'single' : 'multi'}` with `mode={isMultiValue(field) ? 'multi' : 'single'}`:

- **Line 515** (ribbon cells):
  ```tsx
  mode={isMultiValue(field) ? 'multi' : 'single'}
  ```

- **Line 690** (same pattern, another location):
  ```tsx
  mode={isMultiValue(field) ? 'multi' : 'single'}
  ```

- **Line 832** (non-compact set EntityDropdown) — this one is specifically for set, using `mode="single"`. It should become:
  ```tsx
  mode={isMultiValue('set') ? 'multi' : 'single'}
  ```
  Or better, since this is a dedicated set editor, just keep `mode="single"` — it's explicit and clear.

### `src/components/BreakdownTab.tsx`

**SetEditor** (line 210): Already uses `mode="single"` explicitly. Keep as-is — it's a dedicated set editor.

**Generic breakdown editors** (line 249-300): These are built per-category. Add `isMultiValue` check:

```ts
const editor = breakdownEditors.get(key);
// In the EntityDropdown:
mode={isMultiValue(key) ? 'multi' : 'single'}
```

### `src/components/SceneSheet.tsx`

**Line 355**: Set EntityDropdown uses `mode="single"` — keep as-is (dedicated set field).

**Other breakdown categories**: If they use a generic loop, derive mode from `isMultiValue`.

---

## Step 5 — Element Manager UI (`src/components/ElementManager.tsx`)

### `countOccurrences` (line 46-58)

Replace `cat === 'set' ? [val.trim()] : val.split(',')` with `getFieldItems`:

```ts
const items = getFieldItems(cat, val);
```

### `isSet` flag (line 98)

Currently: `const isSet = category === 'set';`

Used at line 539 for uppercasing the name input: `renderInput(..., isCast || isSet)`.

This should become a check for whether the category should be uppercased. Since uppercase is set-specific (not single-value-specific), keep `isSet`:

```ts
const isSet = category === 'set';
```

This is correct — only set forces uppercase in the Element Manager. A custom single-value "Special Notes" category would not force uppercase.

### `loadCategoryElements` (line 13-35)

Already calls `getElementsFromScenes` which will be updated in Step 2. No additional changes needed here.

---

## Step 6 — Reports & Print

### `src/components/ElementBreakdownView.tsx` (line 14-25)

Replace `if (category === 'set') { return [scene.set.trim()]; }` with `getFieldItems`:

```ts
export function getElementValues(scene: Scene, category: string): string[] {
  const val = (scene as any)[category] as string;
  if (!val) return [];
  return getFieldItems(category, val);
}
```

### `src/components/DoodsTab.tsx` (line 67)

Replace the `if (category === 'set')` special-case with `getFieldItems`:

```ts
const items = getFieldItems(category, val);
```

### `src/components/print/ElementBreakdown.tsx` (line 46-49)

Replace the CSV-split with `getFieldItems`:

```ts
const items = getFieldItems(category, val);
```

### `src/components/print/DoodDialog.tsx` (lines 117, 129)

These read from `breakdownElements` directly (not from scenes). No change needed — they already work correctly once `breakdownElements['set']` is populated.

### `src/components/ReportsTab.tsx` (line 104)

Same — reads from `breakdownElements`. No change needed.

---

## Step 7 — Custom Category UI Toggle

### `src/components/ElementManager.tsx` — "Add Category" modal

Add a toggle in the create custom category modal (around line 589):

```tsx
<div>
  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
    Value Type
  </label>
  <div className="mt-1 flex gap-2">
    <button
      onClick={() => setNewCatMultiValue(true)}
      className={newCatMultiValue ? 'selected' : 'unselected'}
    >
      Multiple values (comma-separated)
    </button>
    <button
      onClick={() => setNewCatMultiValue(false)}
      className={!newCatMultiValue ? 'selected' : 'unselected'}
    >
      Single value
    </button>
  </div>
</div>
```

Add state: `const [newCatMultiValue, setNewCatMultiValue] = useState(true);`

Update `createCustomCategory()` (line 707-714):

```ts
function createCustomCategory() {
  if (!newCatName.trim()) return;
  const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const key = `_cat_${slug}`;
  dispatch({ type: 'ADD_CUSTOM_CATEGORY', payload: { key, label: newCatName.trim(), icon: newCatIcon, multiValue: newCatMultiValue } });
  setShowAddCustom(false);
  switchCategory(key);
}
```

### "Edit Category" modal

Same toggle, pre-populated from the category's current `multiValue` value. Dispatches `UPDATE_CUSTOM_CATEGORY` with the new `multiValue`.

### `src/store.tsx` — `ADD_CUSTOM_CATEGORY` (line 784)

Already passes the full `CustomCategoryDef` payload. No change needed — the `multiValue` field will be included automatically.

### `src/store.tsx` — `UPDATE_CUSTOM_CATEGORY` (line 801)

Already uses `{ ...c, ...updates }` — so passing `{ key, multiValue: false }` will update it. No change needed.

---

## Step 8 — Ribbon/Print Display

### `src/components/RibbonTab.tsx` (line 853)

Currently: `textTransform: c.field === 'set' ? 'uppercase' : 'none'`

This is uppercase-specific, not multiValue-specific. Keep as-is — set is the only field that's uppercased in the ribbon.

### `src/lib/ribbonUtils.ts`

Check if any field-value extraction uses CSV split. If so, replace with `getFieldItems`. (Need to verify during implementation.)

---

## Step 9 — Remaining `if (category === 'set')` Audit

After all above changes, search the codebase for remaining `=== 'set'` or `=== 'set'` references. Categorize each:

1. **Uppercase-related** (set forces `.toUpperCase()`) — leave as-is (set-specific display behavior)
2. **Protected category** (`PROTECTED_CATEGORIES`) — leave as-is (set is always protected)
3. **Column layout** (set has its own dedicated column in the spreadsheet) — leave as-is (UI layout decision)
4. **EntityDropdown dedicated set editors** — leave `mode="single"` as explicit (clearer than `isMultiValue('set')`)
5. **Scene heading parsing** (`parseSceneHeading` in importScreenplay) — leave as-is (screenplay-specific parsing)

---

## Implementation Order

1. **categories.ts** — add `multiValue` to `ELEMENT_CATEGORIES`, add `isMultiValue()` + `getFieldItems()`
2. **types.ts** — add `multiValue?` to `CustomCategoryDef`
3. **store.tsx** — update `getElementsFromScenes`, `UPDATE_ELEMENT`, `DELETE_ELEMENT`, auto-populate branch
4. **importScreenplay.ts** — add set registration loop
5. **SortableRow.tsx** — remove set skip, use `getFieldItems`, derive EntityDropdown mode
6. **BreakdownTab.tsx** — use `getFieldItems` in 3 locations, derive EntityDropdown mode
7. **SceneSheet.tsx** — use `getFieldItems`
8. **ElementManager.tsx** — use `getFieldItems` in `countOccurrences`, add multiValue toggle to create/edit modals
9. **ElementBreakdownView.tsx** — use `getFieldItems`
10. **DoodsTab.tsx** — use `getFieldItems`
11. **print/ElementBreakdown.tsx** — use `getFieldItems`
12. **Audit** — grep for remaining `=== 'set'` and classify each
13. **Test** — `npm run lint` + manual testing

## Testing Checklist

- [ ] Import screenplay → Element Manager → Sets tab shows all sets
- [ ] Import CSV → Element Manager → Sets tab shows all sets
- [ ] Paste into breakdown grid → Element Manager → Sets tab shows all sets
- [ ] Edit set in schedule stripboard → set appears in Element Manager
- [ ] Edit set in breakdown spreadsheet → set appears in Element Manager
- [ ] Edit set in scene sheet → set appears in Element Manager
- [ ] Rename set in Element Manager → all scenes update
- [ ] Delete set in Element Manager → removed from all scenes
- [ ] Reports (Element Breakdown, DOOD) show sets correctly
- [ ] Print reports show sets correctly
- [ ] Create custom category with "Single value" → EntityDropdown is single-select
- [ ] Create custom category with "Multiple values" → EntityDropdown is multi-select
- [ ] Existing projects (no `multiValue` on custom categories) → custom categories default to multi-value
- [ ] `npm run lint` passes
