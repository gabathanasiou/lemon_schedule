# Plan: Integrate Ribbon Designer into Main App

**Branch:** `feature/ribbon-designer` from `main`

---

## Requirements

1. **Style match**: Ribbon designer matches the main app's dark zinc theme, component patterns (DropdownMenu, EntityDropdown), icon sizing (w-3.5 h-3.5), click-to-toggle menus, consistent borders/shadows
2. **Live preview with dummy data**: Preview uses a static `SAMPLE` object with realistic values per field key (e.g. `sceneNumber: "5"`, `set: "KITCHEN"`), rendered exactly like SortableRow/PrintSchedule would render it
3. **Print match**: PrintSchedule renders columns from the active ribbon with prefix/suffix, exact same widths
4. **Prefix/suffix everywhere**: SortableRow, PrintSchedule, drag ghosts, and preview all render `{prefix}{value}{suffix}` inline as a single truncation unit
5. **Drag ghosts match ribbon**: `StackedGhosts` and drop zones render columns matching the active ribbon layout
6. **Edit mode still works**: Inline CellInput/EntityDropdown within dynamic ribbon columns
7. **Per-project, not per-version**: Ribbon designs live on `Project`, shared across all schedule versions
8. **Full undo/redo**: Via main store (UNDO/REDO dispatches)
9. **Commit after each step**

---

## Data Model (`src/types.ts`)

```ts
interface RibbonCell {
  id: string;
  field: string;          // 'sceneNumber' | 'set' | 'cast' | '' for spacer | 'text'
  width: number;          // percentage of row
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
  prefix?: string;
  suffix?: string;
  textContent?: string;   // for 'text' type static cells
}

interface RibbonRow {
  id: string;
  name: string;
  cells: RibbonCell[];
}

interface RibbonDesign {
  id: string;
  name: string;
  rows: RibbonRow[];
  createdAt: number;
}
```

Extend `Project`:
```ts
ribbonDesigns: RibbonDesign[];
activeRibbonId: string;   // '' = use default hardcoded 8-col layout
```

---

## Store Actions (`src/store.tsx`)

5 new actions added to the `Action` union:

| Action | Payload | Effect |
|--------|----------|--------|
| `ADD_RIBBON_DESIGN` | `{ name: string; cloneFromId?: string }` | Create blank or clone from existing |
| `UPDATE_RIBBON_DESIGN` | `{ id: string; rows: RibbonRow[] }` | Update a design's rows |
| `DELETE_RIBBON_DESIGN` | `string` (id) | Remove design, clear active if needed |
| `RENAME_RIBBON_DESIGN` | `{ id: string; name: string }` | Rename a design |
| `SET_ACTIVE_RIBBON` | `string` (id, or '' for default) | Switch which ribbon is active |

- `makeBlankProject()` gets a default `RibbonDesign` matching the current hardcoded layout (Row 1: Scene#/Call/Duration/I/E/Set/D/N/Cast/Pages, Row 2: spacer+Synopsis)
- `LOAD` action migrates old projects by adding `ribbonDesigns: [defaultDesign]` and `activeRibbonId: ''`
- Undo/redo works automatically since ribbon data lives in `Project` state

---

## Helper Library (`src/lib/ribbonUtils.ts` — NEW)

Extracted from the POC, adapted for main app:

- `ALL_FIELDS`: 26 field definitions with icon, category, defaultWidth, align, defaultSuffix
- `FIELD_MAP`, `CATEGORIES`: derived lookup objects
- `SAMPLE`: dummy data object with realistic values per field key for the live preview
- `normalizeCells(cells)`: redistribute widths to sum to 100%
- `getFieldValue(scene, field)`: maps field key to scene data (formats duration, intExt, dayNight)
- `renderCellText(scene, cell)`: returns `{prefix}{value}{suffix}` as a single string
- `getDefaultRibbon()`: returns the default 2-row design matching current hardcoded columns
- `formatDuration(minutes)`: internal helper (reuses logic from utils.ts)
- `cid()`: generate unique IDs

---

## Ribbon Designer Sub-Tab (`src/components/RibbonTab.tsx` — NEW)

Ported from the POC with key adaptations:

### Style matching the main app:
- Dark zinc theme (`bg-zinc-900/950` headers, `bg-zinc-800` sidebar, zinc borders)
- Uses main app component patterns: `DropdownMenu`/`DropdownItem` for context menus
- Icons at `w-3.5 h-3.5` with `shrink-0`
- Click-to-toggle menus (no hover menus)
- Active states in blue-600
- Row headers with zinc-400 labels, zinc-600 strong text
- Same `text-[11px]` / `text-xs` sizing as other tabs
- `CellInput` for editable fields where applicable

### Sub-tab within Schedule:
- A small mode switcher at the top of ScheduleTab: "Stripboard" / "Ribbons"
- Ribbons opens the designer

### Live Preview with Dummy Data:
- Uses the static `SAMPLE` object from ribbonUtils.ts
- Dummy values: sceneNumber "5", callTime "08:00", duration "150" → "2h 30m", intExt "INT", set "KITCHEN", dayNight "DAY", cast "1, 2, 4", pages "2 3/8", description "John makes breakfast..."
- Applies `sceneStyle()` coloring based on dummy `intExt`/`dayNight` (INT DAY = white row)
- Renders exactly like SortableRow/PrintSchedule: 8pt Helvetica, 3pt 1pt padding, 1px solid #000 borders, prefix/suffix inline, percentages for widths
- Two-row-per-scene layout (scene info row + description row with spacer from Row 2)

### Designer Canvas:
- Left sidebar palette (188px, categorized with colored accents, drag-to-assign fields)
- Toolbar above ribbon rows (Change field, Delete cell, Insert cell, Move left/right, Align, Wrap, Grid toggle)
- Ribbon rows rendered as flex containers with PrintSchedule column proportions
- Resize handles between cells (drag to adjust, Shift+drag to push all right cells)
- `+` button at end of each row (48px wide)
- Context menu (right-click/double-click) for Change field, prefix/suffix, Remove field, Delete cell
- Grid toggle shows/hides cell borders

### Design Management:
- Dropdown at top (matches version dropdown pattern from App.tsx)
- Create new, rename, duplicate, delete designs
- Active design indicator with checkmark
- Field counter badge

### Undo/Redo:
- Dispatches `UPDATE_RIBBON_DESIGN` to main store
- User can UNDO/REDO via main app shortcuts (Cmd+Z / Cmd+Shift+Z)
- No separate undo stack — all changes go through the Project state

---

## ScheduleTab Integration (`src/components/ScheduleTab.tsx`)

Add a sub-tab state:
```ts
const [scheduleSubTab, setScheduleSubTab] = useState<'stripboard' | 'ribbons'>('stripboard');
```

Small toggle buttons at the top:
```
[ Stripboard ] [ Ribbons ]
```

Stripboard → current view, with `activeRibbon` passed to `DayBlock`/`SortableRow`.
Ribbons → renders `<RibbonTab />`.

---

## SortableRow Integration (`src/components/SortableRow.tsx`)

**New prop:** `ribbon?: RibbonRow[]`

### When `ribbon` is provided:
- Iterate over `ribbon[0].cells` instead of hardcoded columns
- For each cell with a `field`, look up `scene[field]` via `getFieldValue()`
- Render `{prefix}{value}{suffix}` as a single text node
- Column widths: `flex: 0 0 {cell.width}%`
- Padding: `3pt 1pt` (scene row), `0 1pt 3pt 1pt` (desc row)
- `sceneStyle()` still applied for background colors
- Edit mode: `CellInput` renders inside the cell when `textEditingEnabled`
- Row 2 (description) rendered from `ribbon[1]` if present

### When `ribbon` is undefined:
- Falls back to current hardcoded 8-column layout (no change)

### CSS:
- Matches PrintSchedule: `font-family: Helvetica`, `font-size: 8pt`, `line-height: 1.1`, padding `3pt 1pt` / `0 1pt 3pt 1pt`

---

## DayBlock Integration (`src/components/DayBlock.tsx`)

### Drag Ghosts (`StackedGhosts`):
- Accept `ribbon?: RibbonRow[]` prop
- Ghost preview cells match the ribbon layout (same columns, widths, font size)
- Ghost renders `prefix + value + suffix` for each cell
- Same flex layout, same percentage widths

### Drop Zones:
- In-row insertion zones use the ribbon's column widths
- `+` cell at row end is 48px wide (matching ribbon designer)

---

## PrintSchedule Integration (`src/components/PrintSchedule.tsx`)

**New prop:** `ribbon?: RibbonRow[]`

### When `ribbon` is provided:
- `DaySection` renders columns from `ribbon[0].cells` (scene info) and `ribbon[1].cells` (description)
- Column widths: `width: ${cell.width}%`
- Borders use `--td-border-color: bgColor` trick
- Each cell renders `{prefix}{value}{suffix}` inline
- `field: 'text'` → renders `textContent`
- `field: ''` (spacer) → empty with alignment padding
- `sceneStyle()` still applies
- Description row uses `colSpan` after spacer

### When `ribbon` is undefined:
- Falls back to current hardcoded 8-column layout (no change)

---

## PrintDialog Update (`src/components/PrintDialog.tsx`)

- Add "Ribbon" section showing active ribbon name
- Dropdown to pick which ribbon design to use for printing
- Defaults to `project.activeRibbonId`

---

## File Changes Summary

| File | Change | Size |
|------|--------|------|
| `src/types.ts` | Add RibbonCell, RibbonRow, RibbonDesign, extend Project | Small |
| `src/store.tsx` | 5 new actions, reducer cases, makeBlankProject update, migration | Medium |
| `src/lib/ribbonUtils.ts` | **NEW** — field defs, helpers, defaults | Medium |
| `src/components/RibbonTab.tsx` | **NEW** — the designer, with live preview using dummy data | Large |
| `src/components/ScheduleTab.tsx` | Add sub-tab state, toggle, pass ribbon | Small |
| `src/components/SortableRow.tsx` | Accept ribbon?, dynamic columns with prefix/suffix | Medium |
| `src/components/DayBlock.tsx` | Pass ribbon, update StackedGhosts and drop zones | Medium |
| `src/components/PrintSchedule.tsx` | Accept ribbon?, dynamic columns, prefix/suffix | Medium |
| `src/components/PrintDialog.tsx` | Add ribbon selector dropdown | Small |
| `src/App.tsx` | Pass ribbon from project state to children | Small |
| `AGENTS.md` | Document ribbon patterns | Small |

---

## Commit Plan

| Step | Description | Commit Message |
|------|-------------|----------------|
| **0** | Create branch `feature/ribbon-designer` from `main` | `start ribbon designer feature branch` |
| **1** | Types + Store | `add ribbon types and store actions` |
| **2** | ribbonUtils.ts | `add ribbon field definitions and helpers` |
| **3** | RibbonTab.tsx | `add ribbon designer sub-tab component` |
| **4** | ScheduleTab sub-tab toggle | `add stripboard/ribbons sub-tab toggle to schedule` |
| **5** | SortableRow dynamic columns | `add dynamic ribbon column rendering to sortable rows` |
| **6** | DayBlock drag ghosts + drop zones | `match drag ghosts and drop zones to active ribbon` |
| **7** | PrintSchedule dynamic columns | `add ribbon-aware column rendering to print schedule` |
| **8** | PrintDialog ribbon selector | `add ribbon selector to print dialog` |
| **9** | Lint, typecheck, AGENTS.md | `finalize ribbon designer integration` |

Each step is a single atomic commit on `feature/ribbon-designer`.
