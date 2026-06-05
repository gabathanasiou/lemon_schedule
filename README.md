# Lemon Schedule

A film production breakdown and scheduling app. Break down scripts into scenes, build shoot schedules with drag-and-drop, and manage the production calendar — all in your browser with local-first storage.

## Features

- **Breakdown** — Spreadsheet editor for scene-by-script breakdown (scene number, page count, INT/EXT, day/night, set, description, cast, notes). CSV export and JSON import/export.
- **Schedule Stripboard** — Drag-and-drop stripboard with sortable days. Scenes are color-coded by INT/EXT + day/night (8 color pairs). Add breaks and notes between scenes. Unscheduled sidebar for unassigned rows.
- **Calendar** — Monthly calendar view with scenes on their scheduled dates. Drag to reschedule between days. Toggle working days on/off.
- **Rules Engine** — Per-cast-member rules (max hours, date restrictions, time windows). Violations flagged visually in schedule and calendar.
- **Versions** — Multiple named schedule versions per project. Clone, rename, delete with trash (30-day expiry).
- **Print** — Professional landscape stripboard print with color-coded scene blocks, day headers, and optional cast list pages.
- **Undo/Redo** — Full history via `Cmd+Z` / `Cmd+Shift+Z` (up to 50 states).
- **Storage** — All data in localStorage by default. Optional File System Access API for persistent folder storage with auto-save.

## Tech Stack

| Layer | |
|---|---|
| **Framework** | React 19 |
| **Language** | TypeScript |
| **Build** | Vite 6 |
| **Styling** | Tailwind CSS v4 |
| **State** | Zustand + useReducer with undo/redo |
| **Drag & Drop** | @dnd-kit |
| **Icons** | Lucide React |
| **Spreadsheet** | react-spreadsheet |

## Getting Started

```bash
npm install
npm run dev -- --port=3000
```

## Scripts

| Command | |
|---|---|
| `npm run dev` | Start dev server |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
