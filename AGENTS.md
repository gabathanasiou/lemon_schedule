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

#### Drag Ghost Rendering (DayBlock.tsx)
- Ghost rows for `day-{day}` appear **before** the SortableContext (consolidated single location).
- Ghost rows for `end-{day}` appear **after** the SortableContext, above the footer.
- In-row insertion ghosts appear inside the `.map()` via `showGhosts && insertBeforeId === r.id`.
- Always use `showGhosts` (component-level: `activeRowId && activeDragRows.length > 0`) — never declare `isRowGhostTarget` inside `.map()` scope and reference it outside.

### Collision Detection (ScheduleTab.tsx)
- Custom collision detection is `useCallback` with empty deps, reading `activeDragIds` via `activeDragIdsRef.current` (stable ref) to correctly filter dragging rows from droppable containers.
- `handleDragOver` sets `insertBeforeId` to distinguish beginning (`day-{day}`), end (`end-{day}`), and row-insertion targets.

## Types (`src/types.ts`)
- `Scene`: `{ id, sceneNumber, pageCount, pageCountDecimal, scriptDay, intExt, set, dayNight, description, cast, notes }`
- `ScheduleRow`: `{ id, type: 'SCENE'|'BREAK'|'NOTE', sceneId?, shootDay?, order, estimatedDuration? }`
- `ScheduleVersion`: `{ id, name, rows: ScheduleRow[], dayMeta: Record<number, ShootDayMeta> }`
- `Project`: `{ id, title, scenes: Scene[], versions: ScheduleVersion[], activeVersionId, rules: ProjectRule[], castMembers: CastMember[] }`
