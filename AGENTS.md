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

### Store (`src/store.tsx`)
- `useProject()` hook returns `{ state, dispatch, currentProjectId }`.
- `state.present` is the active `Project`, `state.past/future` for undo/redo.
- Actions: `UPDATE_PROJECT`, `NEW_VERSION`, `DELETE_VERSION`, `RENAME_VERSION`, `SET_ACTIVE_VERSION`, `ADD_SCENE`, `UPDATE_SCENE`, `DELETE_SCENE`, `UNDO`, `REDO`, etc.

### Types (`src/types.ts`)
- `Scene`: `{ id, sceneNumber, pageCount, pageCountDecimal, scriptDay, intExt, set, dayNight, description, cast, notes }`
- `ScheduleRow`: `{ id, type: 'SCENE'|'BREAK'|'NOTE', sceneId?, shootDay?, order, estimatedDuration? }`
- `ScheduleVersion`: `{ id, name, rows: ScheduleRow[], dayMeta: Record<number, ShootDayMeta> }`
- `Project`: `{ id, title, scenes: Scene[], versions: ScheduleVersion[], activeVersionId }`
