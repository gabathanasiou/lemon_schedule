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
In `App.tsx`, the main header (`bg-zinc-950`) contains top-level navigation tabs: Breakdown, Schedule, Calendar, Rules, Reports. These use a bottom-anchored pattern:
- Container: `flex items-end gap-1 self-end -mb-2` — breaks through the header's `py-2` padding to sit at the bottom edge
- Active tab: `bg-white text-zinc-900 rounded-t-md` — white background touching DOWN into the content below
- Inactive tab: `text-zinc-400 hover:text-zinc-200`

### MiniTab Component (`src/components/MiniTab.tsx`)
A reusable sub-tab bar used in Breakdown, Schedule, and Reports tabs. It's the **inverse** of the top-level tabs — tabs touch UP toward the dark app header above:

| Prop | Type | Description |
|---|---|---|
| `tabs` | `{ id, label }[]` | Tab items |
| `activeTab` | `string` | Currently active tab id |
| `onChange` | `(id: string) => void` | Tab switch handler |
| `rightContent` | `ReactNode` | Controls rendered on the right side of the bar |
| `theme` | `'light' \| 'dark'` | `light` (default): white bar with `bg-zinc-950` active tab. `dark`: `bg-zinc-900` bar for dark content areas |

**Inverted padding pattern** (mirrors top-level tabs):
- Bar: `pt-2 pb-2` — breathing room for right-side controls
- Tab container: `self-start items-start -mt-2` — negates top padding so tabs touch the top edge
- Active tab: `bg-zinc-950 text-white rounded-b-md` — dark, merges with app header above
- Inactive tab: theme-dependent hover highlight
- Right controls: centered vertically via parent's `items-center`

**Usages:**
- `BreakdownTab` — `theme="light"` (default), tabs: Scene Breakdown / Elements / Sheet. Controls sent via `rightContent` or portaled into the bar
- `ScheduleTab` — `theme="light"` when on Stripboard, `theme="dark"` when in Ribbon Designer
- `ReportsTab` — `theme="dark"`, tabs: Day Out of Days / Element Breakdown

### Tab Design Philosophy
Two complementary tab patterns that fit together seamlessly:
- **Top-level tabs** → touch DOWN (white → white content)
- **MiniTabs** → touch UP (dark → dark header)

Both use padding-ignoring container margins to let tabs reach edges while keeping controls comfortably spaced.

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
- `useProject()` hook returns `{ state, dispatch, currentProjectId }`.
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

## Types (`src/types.ts`)
- `Scene`: `{ id, sceneNumber, pageCount, pageCountDecimal, scriptDay, intExt, set, dayNight, description, cast, notes }`
- `ScheduleRow`: `{ id, type: 'SCENE'|'BREAK'|'NOTE', sceneId?, shootDay?, order, estimatedDuration? }`
- `ScheduleVersion`: `{ id, name, rows: ScheduleRow[], dayMeta: Record<number, ShootDayMeta> }`
- `Project`: `{ id, title, scenes: Scene[], versions: ScheduleVersion[], activeVersionId, rules: ProjectRule[], castMembers: CastMember[] }`

### Help Modal (`src/components/HelpModal.tsx`)

When adding any new keyboard shortcut, control, or interaction to the schedule stripboard, you MUST update `HelpModal.tsx` to document it. The modal is organized by category sections using `<Section>`, `<Row>`, and `<Kbd>` components. Use Unicode symbols for keyboard keys: `⌘` (Cmd), `⌥` (Opt/Alt), `⇧` (Shift), `⌫` (Delete/Backspace), `⏎` (Enter), `⎋` (Esc), `↹` (Tab).
