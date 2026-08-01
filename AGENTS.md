# Agent Context

## Build Commands
- `npm run dev` — start dev server (port 3000 by default)
- `npm run lint` — typecheck (`tsc --noEmit`) — **no ESLint or prettier configured**
- `npm run build` — production build
- `npm run preview` — preview production build
- **E2E tests:** `npx playwright test` (auto-starts dev server on port 3001; tests in `e2e/`)
- **`DISABLE_HMR=true`** — set in env to disable HMR/file watching (AI Studio sets this automatically)

## Project: Film Production Breakdown & Scheduling App
- React 19 + Vite 6 + Tailwind CSS v4 (`@tailwindcss/vite` plugin, not PostCSS)
- Multi-project storage via localStorage (project index key: `lemon_schedule_project_index`, per-project key: `lemon_schedule_project_v1_{id}`)
- State management: React Context + `useReducer` with undo/redo (past/future stacks)
- **Path alias:** `@/*` maps to project root (configured in both `tsconfig.json` and `vite.config.ts`)
- **Deployment base:** `base: '/lemon_schedule/'` in `vite.config.ts` — assets served under `/lemon_schedule/` prefix
- Tab-based UI: Breakdown (spreadsheet) + Schedule (drag-and-drop)

## Tab System

### Top-Level App Tabs
In `App.tsx`, the main header (`bg-zinc-950`) contains tabs: Breakdown, Schedule, Calendar, Design, Rules, Reports.

**Container**: `flex items-end gap-1 self-end border border-white/10 rounded p-0.5`
**Active tab**: `bg-white text-zinc-900 rounded px-3 py-1.5 text-xs font-semibold`
**Inactive tab**: `text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded px-3 py-1.5 text-xs font-semibold` (cloud: `hover:bg-blue-900/60`)
**Compact mode** (`< 900px`): tabs collapse into a dropdown button. **Shift+click**: pops out. **Right-click**: context menu.

### PageToolbar Component (`src/components/PageToolbar.tsx`)
A reusable page toolbar with optional sub-tabs. Used by all pages for their top toolbar bar. Supports horizontal scroll with fade indicators when content overflows.

| Prop | Type | Description |
|---|---|---|
| `tabs` | `{ id, label }[]` (optional) | Tab items. Omit for pages without sub-tabs. |
| `activeTab` | `string` (optional) | Currently active tab id |
| `onChange` | `(id: string) => void` (optional) | Tab switch handler |
| `children` | `ReactNode` (optional) | Content rendered between tabs and rightContent |
| `rightContent` | `ReactNode` (optional) | Controls rendered on the right side of the bar |
| `justify` | `'between' \| 'end' \| 'start'` | Flex justification. Default `'between'` |
| `theme` | `'light' \| 'dark'` | `light` (default): white bar with `bg-zinc-950` active tab. `dark`: `bg-zinc-900` bar |
| `onPopout` | `(tabId: string) => void` | Pop-out handler (fires from right-click or Shift+click) |
| `shiftHeld` | `boolean` | Whether Shift key is currently held |

**Active tab**: `bg-zinc-950 text-white rounded px-3 py-1.5` (cloud projects: `bg-blue-950 text-blue-50`). Dark theme uses same active bg.
**Inactive tab**: `text-zinc-500 hover:text-zinc-900` (dark: `text-zinc-500 hover:text-zinc-300`).
**Scroll**: Tab buttons use `shrink-0 whitespace-nowrap`. When content overflows, the entire toolbar scrolls horizontally with hidden scrollbar and fade indicators at the edges (12px gradient mask).
**Right-click**: shows context menu "Open in New Window" (gated behind `!IS_COARSE`).
**Shift+click**: pops out the clicked sub-tab.

**Usages:**
- `BreakdownTab` — `theme="light"`, tabs: Sheet / Element Manager / Glide Breakdown
- `DesignTab` — `theme="dark"`, tabs: Ribbon Designer / Colors
- `ReportsTab` — `theme="dark"`, tabs: Day Out of Days / Element Breakdown
- `ScheduleTab` — `theme="light" justify="end"`, no tabs, toolbar controls as children
- `CalendarTab` — two instances: `theme="light" justify="between"` (month nav + right controls) and `theme="light" justify="start"` (tool selector)

### PageToolbar Header Portal Pattern

When a child component needs toolbar controls inside the PageToolbar's `rightContent`, use the portal pattern:

1. **Parent** provides a `<div ref={el => portalRef.current = el}>` in `rightContent`
2. **Child** accepts `headerTarget?: HTMLElement | null`, renders via `createPortal(headerContent, headerTarget)` — falls back to inline rendering when `headerTarget` is null

Components using this: `ElementManager`, `SceneSheet`, `GlideBreakdownTab`, `ColorsTab`, `RibbonTab`.

### Cloud Project Coloring (PageToolbar & Portaled Controls)
When the active project is a Google Drive cloud project, the app header switches to `bg-blue-950`. All `theme="light"` PageToolbar elements must follow: active tab `bg-blue-950`, buttons `bg-blue-950 hover:bg-blue-900`. Import `useIsCloudProject` from `'../store'` and derive classes conditionally. `theme="dark"` PageToolbars unaffected.

## UI Component Library (`src/components/`)

### Shared Primitives (use these instead of raw HTML)

#### `DropdownMenu`
Click-to-toggle dropdown built on `@radix-ui/react-dropdown-menu`. Escape key close and positioning handled by Radix.
```tsx
import DropdownMenu from './components/DropdownMenu';
const [open, setOpen] = useState(false);
<DropdownMenu open={open} onClose={() => setOpen(false)} width="w-48" align="right"
  trigger={<button onClick={() => setOpen(p => !p)}>Label</button>}>
  {/* children */}
</DropdownMenu>
```

#### `DropdownItem`
Standard menu item button with icon support and variant styling (`"default" | "danger"`).

#### `DropdownDivider`
Thin horizontal separator line.

#### `DropdownSubmenu`
Submenu component for nested dropdown menus, built on Radix UI.

#### `CellInput`
Inline-editable text input/textarea. Used in schedule view for editing scene/break/note text. Handles auto-focus, Enter to confirm, Escape to cancel.

#### `Modal` + `ModalFooter` (`src/components/Modal.tsx`)
Resizable/draggable modal built on `@radix-ui/react-dialog`. Supports portal targeting for popout windows.
```tsx
import Modal, { ModalFooter } from './components/Modal';
<Modal open={isOpen} onClose={close} title="Title" icon={<Icon />} width="max-w-3xl"
  footer={<ModalFooter><button>Cancel</button><button>Action</button></ModalFooter>}>
  {/* body */}
</Modal>
```

**Modal body design rules** — follow these for every new Modal:

1. **Padding wrapper**: Always wrap body content in `<div className="p-6 space-y-5">` for consistent internal padding. The Modal shell does NOT apply padding itself.
2. **Description text**: Use `<p className="text-xs text-zinc-400 leading-relaxed">` for any explanatory paragraph.
3. **Labeled rows**: Each setting/field row uses `<div className="flex items-center justify-between py-1">`. Label: `<span className="text-xs text-zinc-300">`. Subdued counts/annotations: `<span className="text-zinc-500">`.
4. **Segmented toggle buttons** (binary choice): Selected button: `bg-white text-zinc-900`. Default button: `text-zinc-500 hover:text-zinc-300`. Container: `<div className="flex border border-zinc-700 rounded p-0.5">`. Button: `px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer`. No gap between buttons — they sit flush.
5. **Footer buttons**: Cancel: `px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors`. Confirm/action: `px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors`.

Reference: existing Color Picker modal in `ScheduleTab.tsx`.

#### `ContextMenu` (`src/components/ContextMenu.tsx`)
Fixed-position context menu for right-click/long-press. Exports `ContextMenu`, `ContextMenuItem`, `ContextMenuDivider`. White theme, viewport-aware positioning.

#### `EntityDropdown` (`src/components/EntityDropdown.tsx`)
Multi/single-select dropdown for entities with `{ id, name }`. Used for cast, props, items, shoot days — any entity type.

**Multi mode** (default): Input IS the comma-separated value. Type IDs directly ("1, 2, JOHN") — matching items highlight as checked in the full list. Click to toggle, Enter/Tab/blur to commit.

**Single mode**: Search-then-select. Type to filter, click one item → immediately commits.

```tsx
import { EntityDropdown, EntityItem } from './components/EntityDropdown';

// Simple — defaults to store castMembers
<EntityDropdown value="1, 2, 3" onChange={val => updateScene({cast: val})} className="text-right w-full" readOnly={!textEditingEnabled} />

// Cell editor (always open + auto-focused)
<EntityDropdown value="1, 2, 3" onChange={handleChange} positioning="relative" defaultOpen autoFocus />
```

#### Creating a new entity dropdown (Props, Items, etc.)
The `EntityDropdown` component accepts an `items` prop — pass any `{ id: string, name: string }[]` to create a dropdown for a new entity type without writing a new component. For custom display/search/sort, use `renderItem`, `filterItem`, `sortItems`, and `searchFields` props. For a fully custom dropdown, copy the pattern from `EntityDropdown.tsx` — it uses shared hooks from `src/lib/dropdown.ts` (`useDropdown`, `useOpenHandler`, `sortCastMembers`).

Utility classes exported from EntityDropdown.tsx: `DD_ITEM_CLASS(active)`, `DD_PANEL_CLASS(positioning)`, `DD_INPUT_CLASS(standalone)`.

### Entity Selection
Use `EntityDropdown` for all entity selection. Derive `mode` via `isMultiValue(field, project.customCategories)` from `src/lib/categories.ts` — never hardcode. Extract field values via `getFieldItems(field, value)` — never raw `val.split(',')`.

### EntityDropdown Sort Order
Default sorting via `sortCastMembers()` in `src/lib/dropdown.ts`:
- Cast (`displayMode="id"`): numeric by ID; commit auto-sorts IDs numerically
- Non-cast (`displayMode="name"`): selected in text-box order, non-selected alphabetical
- Search-active: query matches first → selected first → numeric ID tiebreaker

### Dropdown Cell Editor Pattern (`onExit`)

When using `EntityDropdown` or `AutocompleteDropdown` as a cell editor, **always separate `onChange` from `exitEditMode`** using the `onExit` prop. This prevents the editor from unmounting on every commit, allowing the user to reopen the dropdown by clicking the input again.

```tsx
// WRONG — exitEditMode on every commit unmounts the editor:
<EntityDropdown onChange={val => { onChange({ value: val }); exitEditMode(); }} />

// CORRECT — onChange updates cell value, onExit handles edit mode exit:
<EntityDropdown onChange={val => onChange({ value: val })} onExit={() => exitEditMode()} />
```

Both `EntityDropdown` and `AutocompleteDropdown` compare committed vs original value. If unchanged, `onChange` is skipped. In both cases, `onExit?.()` fires, triggering `exitEditMode()`. Used in `BreakdownTab.tsx` for all editors.

### Category `multiValue` Property
Each category (built-in via `ELEMENT_CATEGORIES` in `src/lib/categories.ts`, custom via `CustomCategoryDef.multiValue?`) has a `multiValue: boolean`. Only `set` is `multiValue: false` by default. Custom categories can toggle this in the Element Manager's Create/Edit Category modal. When adding a new built-in single-value category, set `multiValue: false` in `ELEMENT_CATEGORIES` — no other code changes needed.

### Categories Registry (`src/lib/categories.ts`)
`ELEMENT_CATEGORIES` is the central registry for all breakdown categories. Each entry defines `key`, `label`, `multiValue`, and optional `fdxFallbacks` for import mapping. Helpers: `isMultiValue(key, customCategories?)`, `getFieldItems(key, value)`, `buildCSVLabelToKeyMap()`. To add a new built-in category, add an entry to `ELEMENT_CATEGORIES` — no other code changes needed unless the category needs custom rendering.

### Key Patterns
- **Click-to-toggle** (NOT hover): All menus use React state + backdrop div for closing.
- **Lucide icons**: Always `w-3.5 h-3.5` in menus and buttons. Use `className="shrink-0"` to prevent icon squishing.
- **Dark theme**: Zinc palette. Menus use `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-50`.
- **No CSS `group-hover` menus**: They're unreliable on touch and inconsistent. Use click-to-toggle everywhere.

### Colors (Scene Stripboard)
Scene row colors map `intExt` + `dayNight` to backgrounds via `SCENE_COLOR_FALLBACKS` in `ribbonUtils.ts`. The `sceneStyle()` function is imported from there. Actual hex values:
- INT DAY → white (`#ffffff`)
- EXT DAY → green (`#d7da50`)
- INT NIGHT → dark green (`#41a31a`)
- EXT NIGHT → blue (`#005c93`)
- INT MORNING → pink (`#ff9ca2`)
- EXT MORNING → pink (`#ff9ca2`) — same as INT MORNING
- INT EVENING → amber (`#ff9d25`)
- EXT EVENING → amber (`#ff9d25`) — same as INT EVENING

Text color: white for INT NIGHT / EXT NIGHT, black for all others.

### Print System
- Print uses `window.print()` on the main window (no iframe).
- `PrintSchedule` renders full-page with `@page { size: landscape; margin: 10mm 8mm; }`.
- Responsive to `afterprint` event to restore normal UI after print/cancel.
- Two-row scene layout: info row + description row (color-coded, no borders).
- Inline `<style>` tag for print CSS (since the page is replaced by print component).

### Rules Engine (`src/lib/rulesEngine.ts`)
- `checkDay()` evaluates rules per shoot day; `checkAllDays()` returns a Map of day→violations; `checkSection()` evaluates a section of rows.
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
- `RulesTab.tsx` (in `src/components/`, not `rules/`) – grouped rule list with search, type filter bar, collapse/expand by cast group

### Import/Export (`src/lib/importScreenplay.ts`)
- Supports three formats: **CSV** (via PapaParse), **FDX** (Final Draft XML), and **Fountain** (via fountain-js)
- `commitImport()` wraps all dispatches in `BATCH_START`/`BATCH_COMMIT` for single undo entry
- CSV column mapping uses `buildCSVLabelToKeyMap()` with fallbacks for custom categories and FDX category names
- `exportBreakdownCSV()` exports all visible columns with proper escaping

### Store (`src/store.tsx`)
- `useProject()` hook returns `{ state, dispatch, currentProjectId, projectList, readOnly, initialized, createProject, openProject, deleteProject, renameProject, duplicateProject, importProjectFromData, ... }`.
- `useIsCloudProject()` hook returns `boolean` — true when the current project has a `driveFileId` (Google Drive/cloud). Used by PageToolbar and portaled header controls to switch from `bg-zinc-950` / `bg-zinc-900` to `bg-blue-950` / `bg-blue-900` or to `bg-blue-900` (matching the blue app header).
- `state.present` is the active `Project`, `state.past/future` for undo/redo.
- Actions: `UPDATE_PROJECT`, `NEW_VERSION`, `DELETE_VERSION`, `RENAME_VERSION`, `SET_ACTIVE_VERSION`, `ADD_SCENE`, `UPDATE_SCENE`, `DELETE_SCENE`, `UNDO`, `REDO`, etc.
- **Batching:** For bulk operations that dispatch many actions (import, paste), wrap in `BATCH_START` / `BATCH_COMMIT` to make the entire operation one undoable unit:
  ```ts
  dispatch({ type: 'BATCH_START' });
  // ... many dispatches ...
  dispatch({ type: 'BATCH_COMMIT' });
  ```
  Supports nesting — only the outermost commit pushes to undo history. `MERGE_ELEMENTS` is already atomic (single action, single undo entry).

- **Scene→Row Invariant:** Every scene in `project.scenes` always has a corresponding `ScheduleRow` in every version's `rows` array. `NEW_VERSION` seeds rows for all scenes. `ADD_SCENE` / `RESTORE_SCENE` / `IMPORT_SCENES` push rows to all versions. `DELETE_SCENE` removes them. `LOAD` runs `ensureAllScenesHaveRows()` to fill missing rows on existing projects. There are no ghost/synthetic rows — `activeVersion.rows` is the single source of truth for all row lookups.

#### Drag Ghost Rendering (DayBlock.tsx)
- Ghost rows for `day-{day}` appear **before** the SortableContext (consolidated single location).
- Ghost rows for `end-{day}` appear **after** the SortableContext, above the footer.
- In-row insertion ghosts appear inside the `.map()` via `showGhosts && insertBeforeId === r.id`.
- Always use `showGhosts` (component-level: `activeRowId && activeDragRows.length > 0`) — never declare `isRowGhostTarget` inside `.map()` scope and reference it outside.

### Collision Detection (ScheduleTab.tsx)
- Custom collision detection is `useCallback` with empty deps, reading `activeDragIds` via `activeDragIdsRef.current` (stable ref) to correctly filter dragging rows from droppable containers.
- `handleDragOver` sets `insertBeforeId` to distinguish beginning (`day-{day}`), end (`end-{day}`), and row-insertion targets.

### Ribbon Cell Styling (single source of truth: `src/lib/ribbonUtils.ts`)

All ribbon cells MUST use `getRibbonCellBaseStyle(cell, cellPaddingV?, cellPaddingH?, span?)` from `ribbonUtils.ts`. Never hardcode padding, font, or text styling on ribbon cells.

| Rule | Value |
|---|---|---|
| Scene cell vertical padding | `cellPaddingV ?? 3` px |
| Scene cell horizontal padding | `cellPaddingH ?? 3` px |
| Note/break banner vertical padding | `getNoteBreakPad(cellPaddingV, ribbonRowCount)` — **matches total scene height** |
| Banner pad formula | `cellPaddingV * N + 6 * (N - 1)` where `N = ribbonRowCount` — accounts for content line-height (≈12px per row) |
| Shared helper | `getNoteBreakPad(cellPaddingV, rowCount)` in `src/lib/ribbonUtils.ts` |

`cellPaddingV` and `cellPaddingH` are stored per `RibbonDesign` (`cellPaddingV?: number`, `cellPaddingH?: number`, default 3 each), editable in the ribbon designer toolbar ("Pad:" input, 0–24px). The store actions are `SET_RIBBON_CELL_PADDING_V` and `SET_RIBBON_CELL_PADDING_H`.

`edgePadding` is stored per `RibbonDesign` (`edgePadding?: number`, default 3), editable in the ribbon designer toolbar ("Edge:" input, 0–12px). The store action is `SET_RIBBON_EDGE_PADDING`. Applied as `paddingTop`/`paddingBottom` on the outer scene ribbon container (not on individual cells or between rows).

Rendering locations that must pass `cellPaddingV`, `cellPaddingH`, and `edgePadding`:
- `SortableRibbon.tsx` (props, passed from `ScheduleTab` → `DayBlock` → `SortableRibbon` and `UnscheduledBlock` → `SortableRibbon`)
- `PrintSchedule.tsx` → `DaySection` (props, passed from `App.tsx`)
- `PrintDialog.tsx` (resolved from selected ribbon design)
- `RibbonTab.tsx` (from `activeDesign`)

### Ribbon Designer (`src/components/RibbonTab.tsx`)

The Ribbon Designer sub-tab (under Design) lets users create and manage ribbon designs for scene stripboard rendering. Key features:

- **Designs list**: Create/rename/delete/clone ribbon designs; active design stored as `activeRibbonId`
- **Live Preview**: Real-time preview of ribbon rendering with dummy scene data; respects `useViewMode()` and `useCellBorders()`
- **Column config**: Show/hide columns, reorder via drag-and-drop, set fixed/variable widths
- **Row config**: Add/remove ribbon rows, map each row to a scene field or expression
- **Cell padding**: `cellPaddingV`/`cellPaddingH` inputs (0–24px) and `edgePadding` (0–12px)
- **Expression editor**: Custom field expressions using scene properties (e.g., `scene.sceneNumber`, `scene.intExt`)

All ribbon designs are stored in `project.ribbonDesigns[]` and rendered via `getRibbonCellBaseStyle()` from `src/lib/ribbonUtils.ts`.

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
- `ScheduleTab.tsx` — View dropdown submenu "Cell Borders" with None/Vertical/Horizontal/Both; passed through `DayBlock`/`UnscheduledBlock` → `SortableRibbon`
- `SortableRibbon.tsx:renderCellFlex` — applies `getCellBorderProps` to each scene cell using `rowStyle.color`
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

This rule applies to `SortableRibbon.tsx:updateScene` (the auto-register check), `store.tsx:ADD_ELEMENT` (deduplication), and EntityDropdown's `displayMode` (always use `"id"` for cast).

## Glide Breakdown Tab (`src/components/BreakdownTabGlide.tsx`)

Canvas-based spreadsheet using `@glideapps/glide-data-grid` v6.0.4-alpha24. Renders as the "Glide Breakdown" sub-tab under the Breakdown tab.

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

`FIXED_COLS` includes `actions` (index 0, delete icon via `drawCell` canvas callback) plus 10 fixed data columns. `COLUMNS = [...FIXED_COLS, ...dynamicCategories]`.

- Column widths persisted per-project in `localStorage` (`lemon_schedule_glide_cols_{id}`)
- `freezeColumns={1}` freezes the actions column
- Actions column uses `themeOverride: { textDark: '#ef4444' }` for red color

### Inline Entity Editing (`provideEditor`)

Editors are rendered via Glide's overlay system. **Critical:** `handleClose` MUST pass the latest value to `onFinishedEditing(latestRef.current)`. Calling `onFinishedEditing()` without arguments passes `undefined`, which Glide treats as **cancel** (discards changes). Use a `useRef` to track the last `onChange` value.

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

When row markers are clicked, Glide selects rows via `gridSelection.rows` but doesn't set `gridSelection.current.range`. Use a helper to resolve the effective range (check `sel?.range` first, then synthesize from `gridSelection.rows`).

### Row Markers
- `clickable-number`, `startIndex: 1`
- Single tap → selects row + context menu. Double tap → opens sheet. Right-click/long-press → context menu.

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
- `Scene`: 21 fields including `id`, `sceneNumber`, `pageCount`, `pageCountDecimal`, `scriptDay`, `intExt`, `set`, `dayNight`, `description`, `cast`, `notes`, `ghostOf`, plus entity arrays (`backgroundActors`, `stunts`, `vehicles`, `props`, `wardrobe`, `makeup`, `sfx`, `vfx`, `sound`, `music`, `animalsAndWranglers`, `weapons`, `greenery`, `artDept`)
- `ScheduleRow`: `type` is `'SCENE' | 'BREAK' | 'NOTE' | 'DAYBREAK'`. Row-type-specific fields: `sceneId?`, `estimatedDuration?`, `descriptionOverride?`, `breakLabel?`, `breakDuration?`, `isTimed?`, `noteText?`, `noteColor?`, `noteTextColor?`, `daybreakLabel?`, `daybreakCallTime?`, `daybreakDate?`
- `ScheduleVersion`: `{ id, name, createdAt, updatedAt, rows: ScheduleRow[], dayMeta: Record<number, DayMeta>, nonShootDates?, productionStart? }`
- `Project`: 21 fields including `id`, `title`, `draftNumber`, `scenes`, `versions`, `activeVersionId`, `rules`, `castMembers`, `customCategories`, `hiddenCategories`, `categoryLabels`, `breakdownElements`, `sceneRibbon`, `ribbonDesigns`, `activeRibbonId`, `colorPalette`, plus trash arrays (`trash`, `versionTrash`, `rulesTrash`, `colorRulesTrash`, `ribbonTrash`, `elementsTrash`, `categoryTrash`)

### Help Modal (`src/components/HelpModal.tsx`)

When adding any new keyboard shortcut, control, or interaction to the schedule stripboard, you MUST update `HelpModal.tsx` to document it. The modal is organized by category sections using `<Section>`, `<Row>`, and `<Kbd>` components. Use Unicode symbols for keyboard keys: `⌘` (Cmd), `⌥` (Opt/Alt), `⇧` (Shift), `⌫` (Delete/Backspace), `⏎` (Enter), `⎋` (Esc), `↹` (Tab).

## Pop-out Windows (`src/components/PopoutWindow.tsx`)

Multi-window support allowing tabs and sub-tabs to be opened in separate browser windows while sharing the same React state via `createPortal`. Desktop-only — gated behind `!IS_COARSE`.

### Architecture

- **`PopoutWindow`**: receives a pre-opened `Window` object (opened synchronously in the click handler to avoid popup blockers), copies styles from the parent document, renders children via `ReactDOM.createPortal` into the popup's body. The children share the same React tree → same context, same event handlers.
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

### Sub-tab (PageToolbar) Pop-outs

**State** (in `App.tsx`):
- `poppedOutSubTabs: Record<string, Set<string>>` — keyed by parent ID (`breakdown`, `design`, `reports`)
- `popoutSubWindowsRef: Map<string, Window>` — keyed `sub_{parentId}_{subTabId}`
- `toggleSubPopout(parentId, subTabId)` — opens/closes sub-tab popup. If popping out the active sub-tab, auto-switches to next available
- `closeSubPopout(parentId, subTabId)` — cleanup

**Rendering**: 7 `<PopoutWindow>` components (3 Breakdown + 2 Design + 2 Reports), rendered at App level. Each contains `<VersionToolbar>` + `<PageToolbar>` (decorative, single tab) + the sub-component.

**State is lifted to App.tsx** — sub-tab popups survive tab switches. Closing a popped-out parent tab closes all its sub-tab popups.

**How to add a new sub-tab with pop-out:**
1. Add the sub-tab to the parent component's `PageToolbar` tabs array
2. Add a `<PopoutWindow>` in App.tsx under `SUB-TAB POPOUT WINDOWS` rendering the sub-component with `<VersionToolbar>` and `<PageToolbar>`
3. Add the sub-tab ID to the parent's `toggleSubPopout` auto-switch logic
4. The `<PageToolbar>` in the popup is decorative (single tab, `onChange={() => {}}`)

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

The `PopoutWindow` component attaches `keydown` listeners in the popup window for `Cmd+Z` (undo) and `Cmd+Shift+Z` (redo), dispatching directly to the shared React store.

### Mobile / iPad

`window.open()` on iOS Safari opens a new tab (not a separate window) with a separate JS context, breaking `createPortal`. Dragging tabs into Split View reloads the page. The entire pop-out feature is gated behind `!IS_COARSE` — no pop-out UI (icons, context menus, shift+click branches) appears on touch devices.

### Never hardcode secrets
- All API keys, Client IDs, tokens MUST come from `import.meta.env.VITE_*` — never write them as string literals in source files.
- `.env` files are gitignored (`.env*` except `.env.example`). Never commit a `.env` file.
- `.env.example` must only contain placeholder values (e.g. `YOUR_CLIENT_ID`) — never real secrets.
- `.playwright-cli/` is gitignored. Do not commit Playwright recordings.

### OAuth token handling
- The Google OAuth access token is stored in `useRef` + `sessionStorage` (survives page refresh, cleared on tab close). Never `localStorage`.
- The token is exposed via React Context as `useGoogleAuth().accessToken`. Consumers include `store.tsx`, `ProjectManager.tsx`, `App.tsx`, `GoogleSignIn.tsx`, and `SyncStatusIcon.tsx`. Never pass it to components that don't need it.
- Never log the access token. In OAuth error handlers, log only `error?.message`, not the full error object.
- Never expose the token in URLs, DOM `data-*` attributes, or rendered output.

### Environment variables
- Client-side env vars that Vite bundles MUST use the `VITE_` prefix (e.g. `VITE_GOOGLE_CLIENT_ID`). Some vars (like `GEMINI_API_KEY`, `APP_URL`) are injected by AI Studio at runtime and don't need the prefix.
- Expected vars: `VITE_GOOGLE_CLIENT_ID` (Google Drive OAuth), `GEMINI_API_KEY` (AI Studio injects), `APP_URL` (AI Studio injects).
- Add new Vite-bundled env vars to `.env.example`.

### Dependencies
- Do not add `@google/genai`, `dotenv`, or `express` — they are unused in this SPA codebase.
- Before adding any new dependency, confirm it's imported in at least one source file.

## Schedule Architecture: Daybreak Section Model

DAYBREAK rows split the stripboard into logical **sections**. Each daybreak renders up to two visual rows:

| Name | Role | Styling | Content |
|---|---|---|---|
| **`SectionFooter`** | Closes the section above it. Shows cumulative totals, end time, and date for the just-finished section. | White background (`#ffffff`) with dark text (`#18181b`). Rendered as `row-note` in non-ribbon mode, or a CSS grid in ribbon mode. | "End of Day #N", date, section pages, shoot time, break time, end time. |
| **`Next Day Header`** | Opens the section below it. Provides the call time input that governs the upcoming section. | Dark palette background (`getDayHeaderColors`). Shows when `hasNextDaybreak` is true. | "START OF DAY #N", call time `CellInput`, date. |

### Pinned Daybreak (Section 0)

Every blank schedule version starts with a **pinned** DAYBREAK row (`pinned: true`) at `containerId: 1, order: 0`. This is the default section 0 marker — it is not a production day.

| Rule | Behavior |
|---|---|
| **Visibility** | Only shown when at least one other (non-pinned) DAYBREAK exists in the version |
| **Draggable** | No — `useSortable({ disabled: true })` |
| **Deletable** | No — all delete/cut/boneyard paths skip pinned rows |
| **Insertion above** | Blocked — drag-end and paste shift `insertIndex` to 1 when day has a pinned daybreak at position 0 |
| **Footer** | Suppressed — `!row.pinned` guards on footer rendering |
| **Next-day header** | Shown when other daybreaks exist — displays "START OF DAY 1" with call time input |
| **Section 0 semantics** | Does not count as a production day; `sectionDateMap` does not advance the date for pinned sections; `sectionLabelMap` returns empty label for pinned sections; `productionSections` export excludes it |

### Call Time Model

The **daybreak above** a section is the source of truth for that section's base call time.

| Concept | Definition |
|---|---|
| **`sectionBaseTime`** | Set from the preceding daybreak's `daybreakCallTime` when a DAYBREAK row is processed in `computedRows` |
| **`computedCallTime`** | For each SCENE/BREAK/NOTE row: `sectionBaseTime + accumulated section elapsed` |
| **`nextDaybreakMap`** | Maps each daybreak row ID to its **own** `daybreakCallTime` — displayed in the "START OF DAY N" header. Editing this input updates the daybreak row's own `daybreakCallTime`, which governs the section below it. |
| **Calendar section swap** | When swapping day sections in the Calendar view, the `daybreakCallTime` values of the daybreaks **above** each section are exchanged (`blocks[N-1].daybreakRow.daybreakCallTime`), so call times travel with the content. The pinned daybreak participates in swaps involving section 1. |

### Container Model (`src/lib/containers.ts`)

The schedule has exactly three **container blocks**, identified by `containerId` on each `ScheduleRow`:

| Container | `containerId` | `ContainerBlock` | Purpose |
|---|---|---|---|
| Boneyard | `null` | `'boneyard'` | Unscheduled scenes sidebar |
| Stripboard | `1` (always) | `'stripboard'` | The single schedule container |
| Clipboard | `-1` | `'clipboard'` | Temporary cut buffer (invisible, pasted elsewhere) |

**Key rules:**
- **Never add more stripboard containers.** The stripboard is `containerId: 1` — no `containerId: 2, 3, ...` day blocks. Sections within the stripboard are managed via DAYBREAK rows, not separate containerIds.
- **Navigation is container-based.** Tab, Arrow keys, Cmd+A, Shift+click, and Select All all scope to the user's current container and respect each container's independent last-selected cursor.

**API (`src/lib/containers.ts`):**
- `getContainerBlock(row)` — returns `ContainerBlock` for any row. **Use this instead of raw `containerId` checks.**
- `getContainerBlockForId(id, rows)` — lookup by row ID.
- `isInBoneyard(id, rows)` — convenience check.

**Refs in `ScheduleTab.tsx`:**
- `containerIdsRef` — `Record<ContainerBlock, string[]>` with pre-filtered per-container ID lists. The `stripboard` list **already excludes `empty-` placeholders and pinned rows** — consumers don't need their own filters.
- `lastSelectedRef` — `Record<ContainerBlock, string | null>` tracking each container's independent last-selected cursor. Updated in the `selectedRowIds` effect.

**Adding a 4th container:**
1. Add the `containerId` value
2. Add a case to `getContainerBlock()` in `src/lib/containers.ts`
3. Add an entry to `ContainerIds` type and `makeEmptyContainerIds()`
4. Add entries to `containerIdsRef` and `lastSelectedRef` in `ScheduleTab.tsx`

### Calendar Day Body Context Menu (`CalendarTab.tsx`)

Right-clicking empty space in a Calendar day opens a minimal context menu: Paste Below, Add Note Below, Add Break Below.

**Target computation**: `bodyTargetRowId` — last row in the section's `rows`, or the row just before the closing daybreak for empty sections (matching drag-drop position).

**Rendered inline** in `CalendarTab`, not via `StripboardContextMenuContent` — avoids exposing row-specific items like Duplicate/Delete.

**`contextMenuBodyTarget`** state gates both the menu rendering and guards `StripboardContextMenuContent` from showing for body clicks.

`handleContextMenuAction` and `pasteClipboard` work unmodified since they target the real row ID. |

**Insert position rules** (derived from the DAYBREAK section layout, see above):

```
[DAYBREAK 0 pinned] [content 1] [DAYBREAK 1] [content 2] [DAYBREAK 2] ...
```

- **Day has rows**: target = last row → insert after it (end of section) ✅
- **Day is empty**: target = row just before the closing daybreak → insert after it (beginning of empty section) ✅
- **First production day empty**: target = pinned daybreak → insert after it ✅

Same logic applies to drag-drop in Calendar (`handleDragEnd`) and context menu paste/add.

### Auto Banners Button (ScheduleTab)

The **Auto Banners** dropdown (next to Auto Day Breaks) adds a NOTE or BREAK banner into **every production day** at once, or bulk-deletes banners.

| Item | Behavior |
|---|---|
| **Add Banners…** | Opens `AddBannerModal` (`src/components/AddBannerModal.tsx`): sectioned layout (Banner / Placement). Banner section: NOTE/BREAK type toggle, Label input (auto-uppercased; BREAK defaults to `LUNCH`, NOTE empty), duration (default 30m, type `1h 49m` directly — `CellInput` on mouse / `DurationKeypad` on touch via `useLastPointerType`, in a bordered field box; pages field carries a `pgs` suffix). NOTE type also shows Background/Text Color pickers (defaults `#591b1b`/`#ffffff`, matching the Edit Banner modal). Placement section: Top (after the opening daybreak), Bottom (before the closing daybreak), or Middle (split by ribbons count, or after a required specific duration/pages value). All duration/pages fields store raw text, normalize to canonical format on blur, and clear when unparseable; "Add Banners" is disabled while any field is empty or holds invalid text. |
| **Delete All Notes… / Delete All Breaks…** | Danger-confirmed removal of scheduled banners only (`containerId != null`), renumbering all rows; mirrors `handleDeleteAllDaybreaks`. |

- **Insertion logic** (`handleAddBanners` in `ScheduleTab.tsx`): iterates `sections` from `useDaybreakSections`, skips pinned sections, computes per-day insertion index via the opening daybreak (`sections[i-1].daybreakRow`) / closing daybreak (`sections[i].daybreakRow`) / `computeMiddleInsertIndex` helper, then splices banner rows (`NOTE` → `noteText` (from config label) + `estimatedDuration`, `BREAK` → `breakLabel` (from config label, default `LUNCH`) + `breakDuration`) into the sorted stripboard rows, renumbers `order`, dispatches a single batched `UPDATE_VERSION`.
- **Disabled state**: the trigger is disabled when the version has no non-pinned DAYBREAK rows (i.e. no daybreak-defined days).

|
