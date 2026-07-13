# Agent Context

## Build Commands
- `npm run dev -- --port=3000` — start dev server
- `npm run lint` — typecheck (`tsc --noEmit`)
- `npm run build` — production build
- `npm run preview` — preview production build

## Project: Film Production Breakdown & Scheduling App
- Multi-project storage via localStorage (project index key: `lemon_schedule_project_index`, per-project key: `lemon_schedule_project_v1_{id}`)
- State management: Zustand store with undo/redo (past/future stacks)
- Tab-based UI: Breakdown (spreadsheet) + Schedule (drag-and-drop)

## Tab System

### Top-Level App Tabs
In `App.tsx`, the main header (`bg-zinc-950`) contains top-level navigation tabs: Breakdown, Schedule, Calendar, Design, Rules, Reports.

**Container**: `flex items-end gap-1 self-end border border-white/10 rounded p-0.5` — sits at the bottom of the header with a subtle white border.

**Active tab**: `bg-white text-zinc-900 rounded px-3 py-1.5 text-xs font-semibold` — white background, dark text.

**Inactive tab**: `text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded px-3 py-1.5 text-xs font-semibold` — muted text with hover highlight (cloud projects: `hover:bg-blue-900/60`).

**Compact mode** (`window.innerWidth < 900`): tabs collapse into a single dropdown button styled like an active tab (`bg-white text-zinc-900`), opening a DropdownMenu with all tab options + Open in New Window actions (via `rightAction` prop).

**Shift+click**: pops out the clicked tab. **Right-click**: context menu with "Open in New Window". Tabs also show "Open in New Window" items in the compact dropdown.

### MiniTab Component (`src/components/MiniTab.tsx`)
A reusable sub-tab bar used in Breakdown, Design, and Reports tabs.

| Prop | Type | Description |
|---|---|---|
| `tabs` | `{ id, label }[]` | Tab items |
| `activeTab` | `string` | Currently active tab id |
| `onChange` | `(id: string) => void` | Tab switch handler |
| `rightContent` | `ReactNode` | Controls rendered on the right side of the bar |
| `theme` | `'light' \| 'dark'` | `light` (default): white bar with `bg-zinc-950` active tab. `dark`: `bg-zinc-900` bar |
| `onPopout` | `(tabId: string) => void` | Pop-out handler (fires from right-click or Shift+click) |
| `shiftHeld` | `boolean` | Whether Shift key is currently held |

**Active tab**: `bg-zinc-950 text-white rounded px-3 py-1.5` (cloud projects: `bg-blue-950 text-blue-50`). Dark theme uses same active bg.
**Inactive tab**: `text-zinc-500 hover:text-zinc-900` (dark: `text-zinc-500 hover:text-zinc-300`).
**Bar**: `px-3 pt-2 pb-2 border-b shrink-0` with theme-dependent bg/border.
**Truncation**: tab buttons use `truncate max-w-[160px]` — labels overflow with ellipsis.
**Right-click**: shows context menu "Open in New Window" (gated behind `!IS_COARSE`).
**Shift+click**: pops out the clicked sub-tab.

**Usages:**
- `BreakdownTab` — `theme="light"`, tabs: Sheet / Element Manager / Glide Breakdown
- `DesignTab` — `theme="dark"`, tabs: Ribbon Designer / Colors
- `ReportsTab` — `theme="dark"`, tabs: Day Out of Days / Element Breakdown

### MiniTab Header Portal Pattern
When a child component rendered below a MiniTab bar needs to place toolbar controls (dropdowns, buttons) **inside** the MiniTab's `rightContent` area, use the portal pattern:

1. **Parent** (`BreakdownTab.tsx`) provides a portal div in `rightContent`:
   ```tsx
   const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

   <MiniTab
     rightContent={
       <>
         {/* direct controls for Scene Breakdown when subTab === 'scenes' */}
         <div
           ref={el => { portalTargetRef.current = el; setPortalTarget(el); }}
           className={subTab === 'scenes' ? 'hidden' : 'flex items-center gap-2'}
         />
       </>
     }
   />
   ```

2. **Child component** accepts `headerTarget?: HTMLElement | null`, renders toolbar via `createPortal`:
   ```tsx
   import { createPortal } from 'react-dom';

   const headerContent = (<div className="flex items-center justify-end gap-1">...</div>);

   return (
     <div>
       {headerTarget ? createPortal(headerContent, headerTarget) : (
         <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white shrink-0">
           {headerContent}
         </div>
       )}
       {/* component body */}
     </div>
   );
   ```

3. **Parent passes** `headerTarget={portalTarget}` to the child.

**Components using this pattern:** `ElementManager`, `SceneSheet`, `GlideBreakdownTab`, `ColorsTab`, `RibbonTab`.

**Why:** When `headerTarget` is null (component used standalone), the toolbar renders inline. When portaled, it sits in the MiniTab bar, avoiding a redundant second toolbar below.

### Cloud Project Coloring (MiniTab & Portaled Controls)

When the active project is a Google Drive cloud project, the app header switches to `bg-blue-950` (from `bg-zinc-950`). All `theme="light"` MiniTab-related elements that visually attach to the header must follow suit:

| Element | Normal (zinc) | Cloud (blue) |
|---|---|---|
| MiniTab active tab | `bg-zinc-950` | `bg-blue-950` |
| Primary action buttons in header (`+New`, `+Add Scene`, `Save`) | `bg-zinc-900 hover:bg-zinc-800` | `bg-blue-950 hover:bg-blue-900` |

**How:** Import `useIsCloudProject` from `'../store'` and derive the button class:
```tsx
import { useIsCloudProject } from '../store';
const isCloud = useIsCloudProject();

<button className={isCloud
  ? "bg-blue-950 text-white hover:bg-blue-900 ..."
  : "bg-zinc-900 text-white hover:bg-zinc-800 ..."
}>+ Add</button>
```

This only applies to `theme="light"` MiniTabs. `theme="dark"` MiniTabs and controls on dark pages are unaffected.

## UI Component Library (`src/components/`)

### Shared Primitives (use these instead of raw HTML)

#### `DropdownMenu`
Click-to-toggle dropdown with backdrop, escape key close, and positioning.
```tsx
import DropdownMenu from './components/DropdownMenu';

// State management is caller's responsibility
const [open, setOpen] = useState(false);

<DropdownMenu
  open={open}
  onClose={() => setOpen(false)}
  width="w-48"           // optional tailwind width
  align="right"          // "left" | "right" (default "right")
  trigger={
    <button onClick={() => setOpen(p => !p)}>
      Menu Label
    </button>
  }
>
  {/* children */}
</DropdownMenu>
```

#### `DropdownItem`
Standard menu item button with icon support and variant styling.
```tsx
import DropdownItem from './components/DropdownItem';

<DropdownItem
  onClick={handler}
  icon={<Icon className="w-3.5 h-3.5" />}
  variant="default"      // "default" | "danger"
  disabled={false}
>
  Label
</DropdownItem>
```

#### `DropdownDivider`
Thin horizontal separator line.
```tsx
import DropdownDivider from './components/DropdownDivider';

<DropdownDivider />
```

#### `CellInput`
Inline-editable text input/textarea. Used in schedule view for editing scene/break/note text. Handles auto-focus, Enter to confirm, Escape to cancel.

#### `EntityDropdown` (`src/components/EntityDropdown.tsx`)
Multi/single-select dropdown for entities with `{ id, name }`. Used for cast, props, items, shoot days — any entity type.

**Multi mode** (default): Input IS the comma-separated value. Type IDs directly ("1, 2, JOHN") — matching items highlight as checked in the full list. Click to toggle, Enter/Tab/blur to commit.

**Single mode**: Search-then-select. Type to filter, click one item → immediately commits.

```tsx
import { EntityDropdown, EntityItem } from './components/EntityDropdown';
```

```tsx
// Simple — defaults to store castMembers
<EntityDropdown
  value="1, 2, 3"
  onChange={val => updateScene({cast: val})}
  className="text-right w-full"
  readOnly={!textEditingEnabled}
/>

// Cell editor (always open + auto-focused)
<EntityDropdown
  value="1, 2, 3"
  onChange={handleChange}
  positioning="relative"
  defaultOpen
  autoFocus
/>

// Standalone (bordered input, fixed positioning) — for forms
<EntityDropdown
  value={castIds.join(', ')}
  onChange={val => setCastIds(val.split(',').map(x => x.trim()).filter(Boolean))}
  items={entities}         // custom entity list (override store)
  positioning="fixed"
  standalone
  mode="single"            // "single" | "multi" (default)
  showSceneCounts          // show badge next to each item
  scenes={scenes}
  placeholder="Search..."
  searchFields={['id', 'name']}
  renderItem={(item, selected) => <div>...</div>}
  sortItems={(items, selectedIds) => [...]}
  filterItem={(item, query) => boolean}
/>
```

#### Creating a new entity dropdown (Props, Items, etc.)
The `EntityDropdown` component accepts an `items` prop — pass any `{ id: string, name: string }[]` to create a dropdown for a new entity type without writing a new component. For custom display/search/sort, use `renderItem`, `filterItem`, `sortItems`, and `searchFields` props. For a fully custom dropdown, copy the pattern from `EntityDropdown.tsx` — it uses shared hooks from `src/lib/dropdown.ts` (`useDropdown`, `useOpenHandler`, `sortCastMembers`).

Utility classes exported from EntityDropdown.tsx: `DD_ITEM_CLASS(active)`, `DD_PANEL_CLASS(positioning)`, `DD_INPUT_CLASS(standalone)`.

### Entity Selection
Whenever a UI needs the user to select items from a list (days, set pieces, props, cast members, etc.), use the `EntityDropdown` component. It handles multi/single-select, search filtering, custom display, and click-to-toggle in one shared component. Do not hand-roll checkboxes, tag inputs, or custom dropdowns — `EntityDropdown` with `items`/`renderItem`/`mode` covers every case cleanly.

**Deriving `mode`:** Always use `isMultiValue(category, customCategories?)` from `src/lib/categories.ts` instead of hardcoding `mode="multi"` or `mode="single"`. The `multiValue` boolean on each category definition (built-in or custom) is the single source of truth:
```tsx
<EntityDropdown mode={isMultiValue(field, project.customCategories) ? 'multi' : 'single'} ... />
```

**Extracting field values:** Use `getFieldItems(field, value)` instead of raw `val.split(',')`. It returns `[value.trim()]` for single-value categories (e.g. `set`) and `value.split(',').map(...)` for multi-value categories. Never write `category === 'set' ? [val] : val.split(',')` — use the helper.

```tsx
import { getFieldItems, isMultiValue } from '../lib/categories';
const items = getFieldItems(category, fieldValue);
```

### EntityDropdown Sort Order

Default sorting is handled by `sortCastMembers()` in `src/lib/dropdown.ts`. The function receives a `displayMode` parameter:

| Mode | `displayMode` | Selected items | Non-selected items |
|---|---|---|---|
| Cast | `'id'` | Numeric by ID (`parseInt` then `localeCompare`) | Numeric by ID |
| Non-cast | `'name'` | Preserved in text-box order (`currentIds` index) | Alphabetical by name |

**Commit sorting:** When the drop-down commits (blur/Enter/Tab) in `displayMode="id"` multi mode, cast IDs are auto-sorted numerically (e.g. `"1, 4, 2"` → `"1, 2, 4"`). This is handled by `sortAndJoin()` in `EntityDropdown.tsx`.

**Search-active:** When the user is actively typing a partial query (no exact match), a separate inline comparator runs (query matches first → selected first → numeric ID tiebreaker). This path is unaffected by `displayMode`. When the last comma-separated segment exactly matches an existing item, the search path is bypassed and the default sort is used.

### Dropdown Cell Editor Pattern (`onExit`)

When using `EntityDropdown` or `AutocompleteDropdown` as a cell editor in the Breakdown spreadsheet, **always separate `onChange` from `exitEditMode`** using the `onExit` prop. This prevents the editor from unmounting on every commit, allowing the user to reopen the dropdown by clicking the input again.

```tsx
// WRONG — exitEditMode on every commit unmounts the editor, blocking re-entry:
<EntityDropdown
  onChange={val => { onChange({ value: val }); exitEditMode(); }}
/>

// CORRECT — onChange updates cell value, onExit handles edit mode exit:
<EntityDropdown
  onChange={val => onChange({ value: val })}
  onExit={() => exitEditMode()}
/>
```

**How it works:** Both `EntityDropdown` and `AutocompleteDropdown` compare the committed value with the original `value` prop. If unchanged, `onChange` is skipped entirely (no cell re-render, no unmount). If changed, `onChange` fires to update the cell. In both cases, `onExit?.()` is called, which triggers `exitEditMode()`. The result: Enter/Tab/Escape on the same value leaves the cell cleanly, and clicking the input reopens the dropdown instantly.

This pattern is used in `BreakdownTab.tsx` for all editors: CastEditor, SetEditor, generic breakdown editors, IntExtEditor, and DayNightEditor.

### Category `multiValue` Property
Each category (built-in via `ELEMENT_CATEGORIES` in `src/lib/categories.ts`, custom via `CustomCategoryDef.multiValue?`) has a `multiValue: boolean`. Only `set` is `multiValue: false` by default. Custom categories can toggle this in the Element Manager's Create/Edit Category modal. When adding a new built-in single-value category, set `multiValue: false` in `ELEMENT_CATEGORIES` — no other code changes needed.

### Key Patterns
- **Click-to-toggle** (NOT hover): All menus use React state + backdrop div for closing.
- **Lucide icons**: Always `w-3.5 h-3.5` in menus and buttons. Use `className="shrink-0"` to prevent icon squishing.
- **Dark theme**: Zinc palette. Menus use `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-50`.
- **No CSS `group-hover` menus**: They're unreliable on touch and inconsistent. Use click-to-toggle everywhere.

### Colors (Scene Stripboard)
Scene row colors map `intExt` + `dayNight` to backgrounds in `sceneStyle()` (PrintSchedule.tsx). Valid combos:
- INT DAY → white
- EXT DAY → green (`#bdd857`)
- INT NIGHT → dark green (`#67832e`)
- EXT NIGHT → blue (`#2148a7`)
- INT MORNING → peach (`#efbea0`)
- EXT MORNING → pink (`#e88aa5`)
- INT EVENING → amber (`#e29926`)
- EXT EVENING → orange (`#ce7d21`)

### Print System
- Print uses `window.print()` on the main window (no iframe).
- `PrintSchedule` renders full-page with `@page { size: landscape; margin: 10mm 8mm; }`.
- Responsive to `afterprint` event to restore normal UI after print/cancel.
- Two-row scene layout: info row + description row (color-coded, no borders).
- Inline `<style>` tag for print CSS (since the page is replaced by print component).

### Rules Engine (`src/lib/rulesEngine.ts`)
- `checkDay()` evaluates rules per shoot day; `checkAllDays()` returns a Map of day→violations.
- Five `ProjectRule` types:
  - `MAX_HOURS` – limit cast member's total hours per day
  - `DATE_RESTRICTION` – block cast on a specific date
  - `TIME_WINDOW` – restrict cast to specific hours
  - `CAST_CONFLICT` – flag when groups A and B are both scheduled on the same day
  - `CAST_SCENE_FLAG` – flag scenes containing specific cast members
- Violations are displayed as red `<Flag>` icons on day headers and individual scene strips in both Schedule and Calendar views.

### Rules UI (`src/components/rules/`)
- `ruleMeta.tsx` – `RuleType` union, `RULE_TYPE_META` (icons/colors), `describeRule()`, `getRuleGroupKey()`, `getRuleSearchText()`, `RuleFormState`/`blankRuleForm()`/`formFromRule()`
- `RuleCard.tsx` – card display with type badge, description, edit/delete buttons
- `RuleFormFields.tsx` – field components for each rule type: `MaxHoursFields`, `DateRestrictionFields`, `TimeWindowFields`, `CastConflictFields`, `CastSceneFlagFields`
- `RuleFormModal.tsx` – modal for creating/editing rules with type selector grid, cast autocomplete, and type-specific fields
- `RulesTab.tsx` – grouped rule list with search, type filter bar, collapse/expand by cast group

### Store (`src/store.tsx`)
- `useProject()` hook returns `{ state, dispatch, currentProjectId, projectList, readOnly, ... }`.
- `useIsCloudProject()` hook returns `boolean` — true when the current project has a `driveFileId` (Google Drive/cloud). Used by MiniTab and portaled header controls to switch from `bg-zinc-950` / `bg-zinc-900` to `bg-blue-950` / `bg-blue-900` or to `bg-blue-900` (matching the blue app header).
- `state.present` is the active `Project`, `state.past/future` for undo/redo.
- Actions: `UPDATE_PROJECT`, `NEW_VERSION`, `DELETE_VERSION`, `RENAME_VERSION`, `SET_ACTIVE_VERSION`, `ADD_SCENE`, `UPDATE_SCENE`, `DELETE_SCENE`, `UNDO`, `REDO`, etc.
- **Batching:** For bulk operations that dispatch many actions (import, paste), wrap in `BATCH_START` / `BATCH_COMMIT` to make the entire operation one undoable unit:
  ```ts
  dispatch({ type: 'BATCH_START' });
  // ... many dispatches ...
  dispatch({ type: 'BATCH_COMMIT' });
  ```
  Supports nesting — only the outermost commit pushes to undo history. `MERGE_ELEMENTS` is already atomic (single action, single undo entry).

#### Drag Ghost Rendering (DayBlock.tsx)
- Ghost rows for `day-{day}` appear **before** the SortableContext (consolidated single location).
- Ghost rows for `end-{day}` appear **after** the SortableContext, above the footer.
- In-row insertion ghosts appear inside the `.map()` via `showGhosts && insertBeforeId === r.id`.
- Always use `showGhosts` (component-level: `activeRowId && activeDragRows.length > 0`) — never declare `isRowGhostTarget` inside `.map()` scope and reference it outside.

### Collision Detection (ScheduleTab.tsx)
- Custom collision detection is `useCallback` with empty deps, reading `activeDragIds` via `activeDragIdsRef.current` (stable ref) to correctly filter dragging rows from droppable containers.
- `handleDragOver` sets `insertBeforeId` to distinguish beginning (`day-{day}`), end (`end-{day}`), and row-insertion targets.

### Ribbon Cell Styling (single source of truth: `src/lib/ribbonUtils.ts`)

All ribbon cells MUST use `getRibbonCellBaseStyle(cell, cellPadding?)` from `ribbonUtils.ts`. Never hardcode padding, font, or text styling on ribbon cells.

| Rule | Value |
|---|---|---|
| Scene cell vertical padding | `cellPadding ?? 6` px |
| Note/break banner vertical padding | `getNoteBreakPad(cellPadding, ribbonRowCount)` — **matches total scene height** |
| Horizontal padding | `6px` (fixed) |
| Banner pad formula | `cellPadding * N + 6 * (N - 1)` where `N = ribbonRowCount` — accounts for content line-height (≈12px per row) |
| Shared helper | `getNoteBreakPad(cellPadding, rowCount)` in `src/lib/ribbonUtils.ts` |
| Usage | `\`${getNoteBreakPad(cellPadding ?? 6, ribbon?.length || 1)}px 6px\`` for inline; `'--note-row-py': \`${getNoteBreakPad(...)}px\`` for CSS vars |

`cellPadding` is stored per `RibbonDesign` (`cellPadding?: number`, default 6), editable in the ribbon designer toolbar ("Pad:" input, 0–24px). The store action is `SET_RIBBON_CELL_PADDING`.

`edgePadding` is stored per `RibbonDesign` (`edgePadding?: number`, default 2), editable in the ribbon designer toolbar ("Edge:" input, 0–12px). The store action is `SET_RIBBON_EDGE_PADDING`. Applied as `paddingTop`/`paddingBottom` on the outer scene ribbon container (not on individual cells or between rows).

Rendering locations that must pass both `cellPadding` and `edgePadding`:
- `SortableRow.tsx` (prop `cellPadding`, passed from `ScheduleTab` → `DayBlock` → `SortableRow` and `UnscheduledBlock` → `SortableRow`)
- `PrintSchedule.tsx` → `DaySection` (prop `cellPadding`, passed from `App.tsx`)
- `PrintDialog.tsx` (resolved from selected ribbon design)
- `RibbonTab.tsx` (from `activeDesign.cellPadding`)

### View Mode (`src/lib/persist.ts`)

Shared `useViewMode()` hook returns `[mode, setMode, maxWidth]`. Persisted to localStorage (`lemon_schedule_view_mode`), default `'portrait'`.

| Mode | `maxWidth` | Button label |
|---|---|---|
| `'portrait'` | `730px` | A4 |
| `'landscape'` | `1060px` | A4L |
| `'full'` | `null` | Full |

Applied on the content wrapper in both `RibbonTab.tsx` and `ScheduleTab.tsx` via `style={{ maxWidth: viewWidth || undefined, ... }}`. Toggle rendered in both toolbars as a segmented button group.

### Cell Borders (`src/lib/persist.ts`, `src/lib/ribbonUtils.ts`)

Global view setting for interior cell borders in scene ribbons. Persisted to localStorage (`lemon_schedule_cell_borders`), default `'none'`.

| Type | Values |
|---|---|
| `CellBorders` | `'none'` \| `'vertical'` \| `'horizontal'` \| `'both'` |

**`useCellBorders()`** hook (`src/lib/persist.ts`) returns `[mode, setMode]`. Persisted via `useState` + `useCallback` + `localStorage`.

**`getCellBorderProps(borders, textColor, isLastInRow, isLastRow)`** helper (`src/lib/ribbonUtils.ts`) returns CSS props:
- Vertical/Both + not last cell → `{ borderRight: '1px solid {textColor}' }`
- Horizontal/Both + not last row → `{ borderBottom: '1px solid {textColor}' }`
- Always one-sided (right/bottom only) → no doubling between stacked rows or adjacent cells

**Usages:**
- `ScheduleTab.tsx` — View dropdown submenu "Cell Borders" with None/Vertical/Horizontal/Both; passed through `DayBlock`/`UnscheduledBlock` → `SortableRow`
- `SortableRow.tsx:renderCellFlex` — applies `getCellBorderProps` to each scene cell using `rowStyle.color`
- `RibbonTab.tsx` — Live Preview section applies borders with `useCellBorders()`
- `PrintDialog.tsx` — Cell Borders selector in print dialog, defaults to current `useCellBorders()` value; saved in `PrintOptions.cellBorders`; applied in preview
- `PrintSchedule.tsx` — accepts `cellBorders` prop, applies in `renderSceneCellFlex` using scene's resolved text color
- `App.tsx` — passes `printOptions.cellBorders` to `<PrintSchedule>`

### Cast Member Handling

Cast members use **IDs as references** (`e.id`), stored in `castMembers[]`. Every other breakdown element uses **names as references** (`e.name`).

The scene field `scene.cast` holds comma-separated IDs (e.g. `"1, 2, 3"`). All other entity fields hold comma-separated names.

When checking if an element already exists:
- **Cast** (`key === 'cast'`) → compare by `e.id`
- **All other categories** → compare by `e.name || e.id`

This rule applies to `SortableRow.tsx:updateScene` (the auto-register check), `store.tsx:ADD_ELEMENT` (deduplication), and EntityDropdown's `displayMode` (always use `"id"` for cast).

## Glide Breakdown Tab (`src/components/BreakdownTabGlide.tsx`)

Canvas-based spreadsheet using `@glideapps/glide-data-grid` v6.0.4-alpha24. Renders as the "Glide Breakdown" MiniTab under the Breakdown tab.

### Column Indexing & `rowMarkerOffset`

Glide internally shifts column indices by `+1` when row markers are present (`rowMarkerOffset = 1`). The grid passes **adjusted** (0-based) indices to most callbacks, but **NOT** to `provideEditor`:

| Callback | Receives | Adjustment needed? |
|---|---|---|
| `getCellContent([col, row])` | 0-based data index | No (Glide wraps via `getMangledCellContent`) |
| `onCellEdited([col, row])` | 0-based data index | No (Glide wraps via `mangledOnCellsEdited`) |
| `onCellClicked`, `onCellContextMenu` | 0-based data index | No (Glide adjusts via `adjustedCol = col - rowMarkerOffset`) |
| `provideEditor(cell.location)` | Raw internal index (includes marker) | **Yes — `const dataCol = col - 1`** |

**Always use `COLUMNS[col].key`** to identify columns by key, never by hardcoded index.

### Column Structure

```tsx
const FIXED_COLS = [
  { key: 'actions', label: '', width: IS_COARSE ? 48 : 36 },  // delete icon column
  { key: 'sceneNumber', label: 'Scene #', width: 60 },
  // ... 9 more fixed columns
];

const COLUMNS = [...FIXED_COLS, ...dynamicCategories];
```

- `actions` column (index 0): drawn via `drawCell` canvas callback (Trash2 SVG), `readonly + allowOverlay: false` prevents editing, click handled in `onCellClicked` to delete row
- Column widths are persisted per-project in `localStorage` (`lemon_schedule_glide_cols_{id}`), editable via column resize drag (Glide native `onColumnResize`)
- `freezeColumns={1}` freezes the first data column (actions — delete icon)
- `glideColumns` maps `COLUMNS` to Glide's `GridColumn[]`; the `actions` column uses `themeOverride: { textDark: '#ef4444' }` for red color

### Inline Entity Editing (`provideEditor`)

Editors are rendered via Glide's overlay system. Pattern:

```tsx
const editor = (p: any) => {
  const { value, onChange, onFinishedEditing } = p;
  const latestRef = useRef(cellValue);

  const handleChange = (newVal: string) => {
    const next = { kind: GridCellKind.Text, data: newVal, ... };
    latestRef.current = next;
    onChange(next);
  };

  const handleClose = () => {
    onFinishedEditing(latestRef.current);
  };

  return <EntityDropdown value={...} onChange={handleChange} onExit={handleClose} ... />;
};
return editor;
```

**Critical:** `handleClose` MUST pass the latest value to `onFinishedEditing(latestRef.current)`. Calling `onFinishedEditing()` without arguments passes `undefined`, which Glide treats as **cancel** (discards changes). Use a `useRef` to track the last `onChange` value.

Single/select mode in EntityDropdown calls `onExit?.()` in `toggle()` — this correctly flows through `handleClose` → `onFinishedEditing(latestRef.current)` → commit.

### Repaint After Programmatic Mutations

Glide's canvas doesn't auto-repaint when data changes outside its edit flow (delete, paste, undo/redo). Two mechanisms:

1. **Bulk operations** (delete, paste, cut, clear): Build a `damageList: { cell: Item }[]` and call `gridRef.current?.updateCells(damageList)` wrapped in `setTimeout(0)` to ensure React re-renders first.

2. **Undo/redo**: A `useEffect` watching `scenes` triggers a full grid repaint:
   ```tsx
   useEffect(() => {
     const all = scenes.flatMap((_, r) => COLUMNS.map((_, c) => ({ cell: [c, r] })));
     setTimeout(() => gridRef.current?.updateCells(all), 0);
   }, [scenes, COLUMNS]);
   ```

### Batching for Undo/Redo

All bulk operations (`onDelete`, `handlePaste`, `handleCut`, `handleClear`) wrap their dispatches in `BATCH_START` / `BATCH_COMMIT` to produce a single undoable unit. Example:

```tsx
dispatch({ type: 'BATCH_START' });
for (...) { commitEdit(scene.id, colKey, val); }
dispatch({ type: 'BATCH_COMMIT' });
```

### Range Iteration — Off-By-One Gotcha

Glide's `Rectangle` uses **exclusive** upper bounds: `width`/`height` are counts, not inclusive ends. Always use `<` not `<=`:

```tsx
// CORRECT
for (let r = range.y; r < range.y + range.height; r++)
for (let c = range.x; c < range.x + range.width; c++)

// WRONG — includes one extra row and column
for (let r = range.y; r <= range.y + range.height; r++)
```

### Selection Handling

When row markers are clicked, Glide selects rows via `gridSelection.rows` but doesn't set `gridSelection.current.range`. Use a helper to resolve the effective range:

```tsx
const getEffectiveRange = () => {
  if (sel?.range) return sel.range;
  if (gridSelection.rows.length > 0)
    return { x: 0, y: firstSelected, width: COLUMNS.length, height: count };
  return null;
};
```

### Row Markers

```tsx
rowMarkers={{ kind: 'clickable-number', width: IS_COARSE ? 72 : 50, startIndex: 1, theme: { bgCell: '#fafafa' } }}
```

- Single tap → selects row + shows context menu
- Double tap → opens sheet page
- Right-click/long-press → context menu

### Smooth Scrolling

Glide defaults to cell-snapped scrolling. Enable smooth pixel-level scrolling:

```tsx
smoothScrollX  // default: false
smoothScrollY  // default: false
```

### Context Menu Positioning

Right-click events carry `bounds` (cell page coords) + `localEventX`/`localEventY` (offset from cell edge). Page position = `bounds.x + localEventX`, `bounds.y + localEventY`. Always call `e.preventDefault()` to suppress browser context menu.

### Custom Cell Drawing

Use `drawCell` callback for custom canvas rendering. Preload SVG icons via `new Image()` with a data URL:

```tsx
const drawCell = (args, draw) => {
  if (args.col === 0) {  // actions column
    draw(args);           // default background
    ctx.drawImage(img, x, y, size, size);
    return true;
  }
  return draw(args);
};
```

## Types (`src/types.ts`)
- `Scene`: `{ id, sceneNumber, pageCount, pageCountDecimal, scriptDay, intExt, set, dayNight, description, cast, notes }`
- `ScheduleRow`: `{ id, type: 'SCENE'|'BREAK'|'NOTE', sceneId?, shootDay?, order, estimatedDuration? }`
- `ScheduleVersion`: `{ id, name, rows: ScheduleRow[], dayMeta: Record<number, ShootDayMeta> }`
- `Project`: `{ id, title, scenes: Scene[], versions: ScheduleVersion[], activeVersionId, rules: ProjectRule[], castMembers: CastMember[] }`

### Help Modal (`src/components/HelpModal.tsx`)

When adding any new keyboard shortcut, control, or interaction to the schedule stripboard, you MUST update `HelpModal.tsx` to document it. The modal is organized by category sections using `<Section>`, `<Row>`, and `<Kbd>` components. Use Unicode symbols for keyboard keys: `⌘` (Cmd), `⌥` (Opt/Alt), `⇧` (Shift), `⌫` (Delete/Backspace), `⏎` (Enter), `⎋` (Esc), `↹` (Tab).

## Pop-out Windows (`src/components/PopoutWindow.tsx`)

Multi-window support allowing tabs and sub-tabs to be opened in separate browser windows while sharing the same React state via `createPortal`. Desktop-only — gated behind `!IS_COARSE`.

### Architecture

- **`PopoutWindow`**: receives a pre-opened `Window` object (opened synchronously in the click handler to avoid popup blockers), copies styles from the parent document, renders children via `ReactDOM.createPortal` into the popup's body. The children share the same React tree → same Zustand store, same context, same event handlers.
- **`cascadePosition()`**: module-level function returning `{ left, top }` that increments 30px per call, wrapping every 10 windows. All `window.open()` calls use this for tiled positioning.
- **`PopoutPlaceholder`**: shown inline when the active tab/sub-tab is popped out, with a "Bring back" button.

### Top-Level Tab Pop-outs

**State** (in `App.tsx`):
- `poppedOutTabs: Set<string>` — which tabs are popped out
- `popoutWindowsRef: Map<string, Window>` — window handles opened synchronously on click
- `togglePopout(tabId)` — opens/closes popup. If popping out the active tab, auto-switches to next available
- `closePopout(tabId)` — cleanup

**Rendering**: 6 `<PopoutWindow>` components (one per tab), rendered at App level alongside main content. Each contains `<VersionToolbar>` + the tab's full component.

**How to add a new top-level tab with pop-out:**
1. Add the tab button in the header with onClick branching on `shiftHeld` (shift+click = popout, normal = switch)
2. Add `onContextMenu` handler → `setTabContextMenu({ tabId })`
3. Add a `<PopoutWindow>` wrapper rendering the tab's component with `<VersionToolbar>`
4. Pass the pop-out handler to child components that need cross-tab navigation (`onOpenSceneInPopout`, etc.)
5. Add the tab to the compact dropdown with `rightAction` for "Open in New Window"

### Sub-tab (MiniTab) Pop-outs

**State** (in `App.tsx`):
- `poppedOutSubTabs: Record<string, Set<string>>` — keyed by parent ID (`breakdown`, `design`, `reports`)
- `popoutSubWindowsRef: Map<string, Window>` — keyed `sub_{parentId}_{subTabId}`
- `toggleSubPopout(parentId, subTabId)` — opens/closes sub-tab popup. If popping out the active sub-tab, auto-switches to next available
- `closeSubPopout(parentId, subTabId)` — cleanup

**Rendering**: 7 `<PopoutWindow>` components (3 Breakdown + 2 Design + 2 Reports), rendered at App level. Each contains `<VersionToolbar>` + `<MiniTab>` (decorative, single tab) + the sub-component.

**State is lifted to App.tsx** — sub-tab popups survive tab switches. Closing a popped-out parent tab closes all its sub-tab popups.

**How to add a new sub-tab with pop-out:**
1. Add the sub-tab to the parent component's `MiniTab` tabs array
2. Add a `<PopoutWindow>` in App.tsx under `SUB-TAB POPOUT WINDOWS` rendering the sub-component with `<VersionToolbar>` and `<MiniTab>`
3. Add the sub-tab ID to the parent's `toggleSubPopout` auto-switch logic
4. The `<MiniTab>` in the popup is decorative (single tab, `onChange={() => {}}`)

### Shift+Click and Right-click Behavior

- **Shift+click** on any tab button → pops out that tab instead of switching (gated `!IS_COARSE`)
- **Right-click** on any tab button → context menu with "Open in New Window" (gated `!IS_COARSE`)
- **Shift+double-click** on scene strips (Schedule/Calendar/Glide) → opens sheet in popout window
- **Context menus** with "Open Sheet" items → when Shift is held during right-click, show "Open in New Window" instead. Shift tracking uses `useState` (reactive toggle while menu is open)
- **Shift+click** on SceneSheet header banner → opens Schedule in popout

### VersionToolbar (`src/components/VersionToolbar.tsx`)

Reusable toolbar rendered in every popup window:
- **SaveIndicator** — sync status dot
- **Project title** — editable input, calls `renameProject` from store
- **Tab name** — styled as a top-level tab indicator (`bg-white text-zinc-900 rounded`)
- **Undo/Redo** buttons — minimal, in `border border-white/10 rounded bg-white/5` container
- **Version selector** — dropdown for switching/renaming/duplicating versions

### Cross-tab Navigation When Target is Popped Out

Navigation handlers (`handleOpenSheet`, `handleOpenScene`, `handleOpenScheduleAtScene`) skip `setActiveTab()` when the target tab is in `poppedOutTabs`. State changes (sub-tab, sheet index, schedule target) still flow to the popup via shared React context.

### SceneSheet Per-Field Commit

To ensure edits appear live across windows, SceneSheet uses per-field store commits:
- **Dropdowns** (EntityDropdown, AutocompleteDropdown, CellInput) → dispatch to store immediately on change
- **Text inputs** → buffer keystrokes in local `edits` state, flush on blur via `commitTextEdits()`
- **Navigation** (`goTo`, `create`, `duplicate`) → flushes remaining text edits before changing scenes
- This matches GlideBreakdown's real-time edit pattern, avoiding the snapshot-and-batch delay

### Keyboard Shortcuts in Popups

The `PopoutWindow` component attaches `keydown` listeners in the popup window for `Cmd+Z` (undo) and `Cmd+Shift+Z` (redo), dispatching directly to the shared Zustand store.

### Mobile / iPad

`window.open()` on iOS Safari opens a new tab (not a separate window) with a separate JS context, breaking `createPortal`. Dragging tabs into Split View reloads the page. The entire pop-out feature is gated behind `!IS_COARSE` — no pop-out UI (icons, context menus, shift+click branches) appears on touch devices.

### Never hardcode secrets
- All API keys, Client IDs, tokens MUST come from `import.meta.env.VITE_*` — never write them as string literals in source files.
- `.env` files are gitignored (`.env*` except `.env.example`). Never commit a `.env` file.
- `.env.example` must only contain placeholder values (e.g. `YOUR_CLIENT_ID`) — never real secrets.
- `.playwright-cli/` is gitignored. Do not commit Playwright recordings.

### OAuth token handling
- The Google OAuth access token is stored in `useRef` + `sessionStorage` (survives page refresh, cleared on tab close). Never `localStorage`.
- The token is exposed via React Context as `useGoogleAuth().accessToken`. Only `store.tsx` and `ProjectManager.tsx` legitimately consume it for Drive API calls. Never pass it to components that don't need it.
- Never log the access token. In OAuth error handlers, log only `error?.message`, not the full error object.
- Never expose the token in URLs, DOM `data-*` attributes, or rendered output.

### Environment variables
- All client-side env vars MUST use the `VITE_` prefix (Vite requirement).
- Expected vars: `VITE_GOOGLE_CLIENT_ID` (Google Drive OAuth), `GEMINI_API_KEY` (AI Studio injects), `APP_URL` (AI Studio injects).
- Add new env vars to both `.env.example` and the `ImportMetaEnv` interface in `src/vite-env.d.ts`.
- The CI deploy workflow (`.github/workflows/deploy.yml`) must pass `VITE_GOOGLE_CLIENT_ID` from a GitHub repository secret.

### Dependencies
- Do not add `@google/genai`, `dotenv`, or `express` — they are unused in this SPA codebase.
- Before adding any new dependency, confirm it's imported in at least one source file.

### Google Drive OAuth Setup (one-time per developer/deployment)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create or select a project.
2. **APIs & Services → Library** → search "Google Drive API" → Enable.
3. **APIs & Services → OAuth consent screen**:
   - User Type: **Internal**
   - App name: "Lemon Schedule"
   - Add your email as developer contact
   - Scopes: add `drive.appdata` (non-sensitive scope, skip verification)
   - Save
4. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**:
   - Application type: **Web application**
   - Name: "Lemon Schedule Dev"
   - Authorized JavaScript origins: `http://localhost:3000` (add production URL too if deploying)
   - Create
5. Copy the Client ID → add to `.env` as `VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com`
6. If deploying via CI, add the same ID as a GitHub secret (`VITE_GOOGLE_CLIENT_ID`) in repo Settings → Secrets & Variables → Actions.

## Schedule Architecture: Daybreak Section Model

DAYBREAK rows split the stripboard into logical **sections**. Each daybreak renders two visual rows:

| Name | Role | Styling | Content |
|---|---|---|---|
| **`SectionFooter`** | Closes the section above it. Shows cumulative totals, end time, and date for the just-finished section. | White background (`#ffffff`) with dark text (`#18181b`). Rendered as `row-note` in non-ribbon mode, or a CSS grid in ribbon mode. | "End of Day #N", date, section pages, shoot time, break time, end time. |
| **`SectionHeader`** | Opens the section below it. Provides a call time input and day label for the upcoming section. | Dark palette background (`getDayHeaderColors`), rendered via shared `SectionHeader` component. | "DAY #N" or "START OF DAY #N", call time `CellInput`, date. |

### Shared `SectionHeader` component

`src/components/SectionHeader.tsx` — renders the **`SectionHeader`** in both ribbon and non-ribbon modes. A single source of truth; any style change applies everywhere.

**Used by:**
1. `SortableRow.tsx` — ribbon daybreak: shown when `hasNextDaybreak` after the "End of Day" grid row.
2. `SortableRow.tsx` — non-ribbon daybreak: shown when `hasNextDaybreak` below the "End of Day" table row.
3. `StripBlock.tsx` — top of each day block: shown only when at least one `DAYBREAK` row exists in the version. Provides the call time input for the day.

**Props:** `dayLabel`, `callTime`, `onCallTimeChange`, `dateStr?`, `palette?`, `isSelected?`, `ribbon?`, `colWidths?`, `cellPaddingV?`, `cellPaddingH?`. If `ribbon` is provided it renders the CSS grid variant; otherwise the `schedule-table` variant.
