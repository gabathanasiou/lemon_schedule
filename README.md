# Lemon Schedule

A **film production breakdown & scheduling app** that runs entirely in the browser with local-first storage. Break down scripts scene-by-scene, build shoot schedules on a drag-and-drop stripboard organized by day sections, manage the production calendar, and print professional schedules — with optional Google Drive sync.

## Features

### Breakdown
- **Scene Sheet** — per-scene form (scene number, page count, INT/EXT, day/night, set, synopsis, cast, notes) matching the print layout.
- **Glide Breakdown** — fast canvas spreadsheet over every breakdown category with inline dropdown editing, copy/paste, cut, and multi-select.
- **Element Manager** — maintain cast, sets, props, wardrobe, and custom categories; merge duplicates, auto-register elements found in scenes, save/revert with change tracking.
- **Import** — screenplays via **FDX** (Final Draft), **Fountain**, or **CSV** (script breakdown sheets), with automatic category mapping and unknown-category handling.
- **Export** — full breakdown to CSV.

### Schedule Stripboard
- **Day sections** — the stripboard is split into days by **Day Break** separators; each day gets its own call time, running clock, and totals (pages, shoot time, breaks, end time).
- **Drag & drop** — reorder scenes within a day, move rows between days, drag whole days, multi-select + drag, drop to the unscheduled **Boneyard**.
- **Banners** — note/break ribbons with colors, placed at top/middle/bottom of every day at once, or auto-split by duration/pages.
- **Auto Day Breaks** — split the stripboard into days automatically by duration or page-count thresholds.
- **Ribbon Designer** — design the stripboard row layout itself: columns, fields, prefixes/suffixes, alignment, overflow, merges, padding; live preview with sample data.
- **Keyboard workflow** — arrows, shift-range select, Cmd+A select-all, Tab between stripboard/boneyard, digit buffer to jump rows to a section, inline editing mode.

### Calendar
- Monthly production calendar with scenes on their scheduled dates, day sections labeled, holds/travel/day-offs, and drag-to-reschedule.
- **Auto Day Off** — bulk-mark weekdays as non-shoot.
- **DOODs** (Day Out of Days) report with per-cast-member availability grid.

### Rules Engine
- Per-cast rules: **max hours**, **date restrictions**, **time windows**, **cast conflicts**, **scene flags**. Violations appear as red flags on day headers and scene strips in both Schedule and Calendar.

### Versions & Trash
- Multiple named schedule versions per project (clone, rename, delete) — all trash (scenes, versions, rules, elements, categories, ribbon designs, color rules) expires after 30 days.

### Color Rules
- Override scene strip colors with conditional rules (e.g. "all Stills Unit scenes blue"), plus a customizable INT/EXT × day/night color matrix.

### Print
- Landscape stripboard print with color-coded scene rows, day headers/footers with totals, optional cast list, page numbers, and export-date.
- Also prints: **Scene Breakdown** sheets and **Element Breakdown** sheets.

### Power features
- **Pop-out windows** — open any tab or sub-tab in its own browser window (desktop), sharing live state.
- **Google Drive sync** — optional cloud storage with offline detection and auto-reconnect.
- **Undo/Redo** — full history (`Cmd+Z` / `Cmd+Shift+Z`, 50 states), batched for bulk operations.
- **Local-first** — everything persists to localStorage instantly; no server required.

## Tech Stack

| Layer | |
|---|---|
| **Framework** | React 19 |
| **Language** | TypeScript |
| **Build** | Vite 6 (deploy base `/lemon_schedule/`) |
| **Styling** | Tailwind CSS v4 |
| **State** | React Context + `useReducer` with undo/redo stacks |
| **Drag & Drop** | @dnd-kit |
| **Spreadsheet** | @glideapps/glide-data-grid |
| **Dialogs/Menus** | Radix UI |
| **Icons** | Lucide React |
| **Parsing** | PapaParse (CSV), fountain-js (Fountain), DOMParser (FDX) |
| **Cloud** | Google Drive API |

## Getting Started

```bash
npm install
npm run dev          # http://localhost:3000
```

No backend, no database — data lives in your browser's localStorage. Sign in with Google Drive (File → Sign in) to sync projects to the cloud.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server (port 3000) |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npx playwright test` | E2E suite (auto-starts dev server on 3001) |

## E2E Testing

The Playwright suite includes smoke tests that load a real production project ("Town - Jason") from `~/Downloads/Town - Jason.lemon` (override with `LEMON_SEED_PATH`) to exercise the stripboard, calendar, glide breakdown, ribbon designer, and print flow with real data.

## Data & Storage

- **Local projects**: stored per-project under `lemon_schedule_project_v1_{id}`; project index in `lemon_schedule_project_index`.
- **Cloud projects** (Google Drive): stored in Drive app data, indexed separately, and excluded from the local index.
- **Trash**: every deleted entity type has its own trash array with 30-day expiry, restorable from the Trash dialog.

## Import Formats

| Format | Notes |
|---|---|
| **FDX** | Final Draft XML (incl. tagged element categories) |
| **Fountain** | Plain-text screenwriting |
| **CSV** | Script breakdown exports (auto header mapping; unknown columns become custom categories) |

## License

Apache-2.0
