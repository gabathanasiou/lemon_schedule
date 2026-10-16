# Lemon Schedule

A film production breakdown & scheduling app that runs entirely in the browser. Break down the screenplay scene by scene, schedule the shoot on a drag-and-drop stripboard split into shooting days, plan the production calendar, run each day from the Day Manager and Call Sheets, and print schedules, breakdowns and custom reports. Local-first — projects save to your browser, no account required; Google Drive sync and online collaboration are optional.

**Status:** pre-1.0, under active development — the version shows on the boot screen. The local/Drive app is the primary path; online collaboration is newer and evolving. It's a breakdown and scheduling tool, not a screenwriting editor or a budgeting package: import the script, plan the shoot, print the paperwork.

## Getting started

**Hosted:** [gabathanasiou.github.io/lemon_schedule](https://gabathanasiou.github.io/lemon_schedule/) — nothing to install. Sign-in for Google Drive sync and for collaboration lives in the Project Manager.

**Local:**

```bash
npm install
npm run dev        # http://localhost:3000/lemon_schedule/
```

Requires **Node 20 or newer** (CI builds on Node 20; run the unit tests on **Node 22.12+**, which Vitest 5 requires). There is no backend — the app works fully offline. Every cloud integration is optional and configured through Vite env vars (see `.env.example`):

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google Drive sync |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Accounts, shared projects, live presence |
| `VITE_ROOMS_URL` | Realtime co-editing rooms |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Places address search (falls back to OpenStreetMap) |

## Features

### Breakdown
- **Sheet** — a per-scene form (number, page eighths, INT/EXT, day/night, set, location, synopsis, cast, every element category, notes) matching the print layout, with an optional screenplay pane and a scene-number collision guard.
- **Script** — the screenplay body retained from FDX/Fountain imports: scene sidebar, full-text search, eighths ruler. Tag selected text into any breakdown category (with cast suggestions), cut and merge scenes, and manage split scenes (`5` → `5` + `5A`). **Update script (diff)** reviews a new screenplay revision change by change.
- **Glide Breakdown** — a spreadsheet over every scene × every category: inline dropdown editing, copy/cut/paste, multi-select and range fill.
- **Element Manager** — cast and every category, built-in or custom: merge duplicates, per-day-type stats, events, element links, Board-ID locking.

### Schedule
- **Day sections** — the stripboard is split into shooting days by Day Break separators; each day has its own call time ("START OF DAY N"), a running clock and totals (pages, shoot time, breaks, estimated wrap).
- **Drag & drop** — reorder scenes and whole days, move scenes between days, drop to the unscheduled Boneyard; multi-select and drag as a block.
- **Banners** — colored note/break ribbons placed top, middle or bottom of every day at once, or auto-split by duration or pages.
- **Auto Day Breaks** — split the stripboard into days automatically by duration or page count.
- **Sort & custom order** — one-click sorts with lockable tie-breaks and a manual-order editor.
- **Keyboard workflow** — arrows, range selection, Cmd/Ctrl+A, Tab between stripboard and Boneyard, a digit buffer to schedule rows to a day, and inline edit mode. Help lists every shortcut.
- **Schedule versions** — clone, rename and switch named versions; deleted versions sit in Trash for 30 days (newest 10 kept).

### Calendar
- **Month view** — scenes on their scheduled days with drag-to-reschedule, a Boneyard sidebar, expandable day cells and filters.
- **Events** — per-day cards for holds, travel, days off, element events (with comments) and rule violations; add and edit them from the day.
- **Day Types** — the day-status registry: name, icon, color and attachment rules for travel/hold/day-off/custom statuses, with usage counts per date.
- **Production Dates** — prep start, production start, post end and a weekly days-off pattern applied across the schedule.
- **Calendar versions** — production dates, days off, statuses and events live in their own versioned axis (C01, C02…), independent of schedule versions.

### Production
**Days** — the Day Manager and the Call Sheet editor:
- **Day Manager** — one page per shooting day: date and day type, master location and key locations, events and conflicts, scenes, call times and crew, plus breaks/notes and a live call-sheet preview.
- **Call times** — a reusable stage model (stage list, per-category stage sets, department precalls, crew template). Element calls compute backwards from the element's first scene; absolute or relative overrides are stored per day and edited in an inline grid.
- **Call Sheet editor** — edit a day's Call Sheet design in place: live call-time/crew grids in the day's zone, a times toggle, preview, reset to template, print.
- **Copy from day** — copy chosen sections (call times, crew, locations, notes…) from another shooting day.

**Crew** — roles grouped by department (drag to reorder), people with phones/emails, duplicate merging, crew links to elements and positions, plus a Glide grid view.

**Locations** — location types, name/address/contact details/notes, nearby hospital and police pickups, a map picker (address search, drag-to-place pin, center on current location), plus a Glide grid view.

### Design
- **Ribbon Designer** — design the stripboard's row layout itself: columns, fields, prefixes/suffixes, alignment, overflow, merges, padding, per-cell text size — with multiple designs and a live preview.
- **Colors** — the scene color matrix (INT/EXT × day/night, editable labels and colors) plus conditional color rules.
- **Reports Designer** — build custom reports from blocks: text, field, repeat, table, columns, ribbon strips, map, image, spacer, page break, relative "advance" blocks, and day-grid blocks (Call Times, Crew Table, Precalls) for call sheets. Collections and scopes, row filters, item/attribute reference tokens in rich text, and page-break pagination. Ships with templates (one-liner, cast list, breakdowns, crew contact sheet, call sheet) and prints to PDF.

### Reports
- **Day Out of Days** — an element-by-day grid with work/start/finish/hold/travel codes and totals; printable per category.
- **Element Breakdown** — per-element scene lists, days worked and page totals; printable.

### Rules
Per-cast rules — **max hours**, **date restrictions**, **time windows**, **cast conflicts**, **scene flags** — with violations as red flags on day headers and scene strips in Schedule and Calendar, plus a violations popup.

### Print
Stripboard (A4 portrait/landscape or full width) with color-coded strips, day headers/footers, totals, an optional cast list and page numbers; DOODs; Scene Breakdown sheets; Element Breakdown sheets; custom reports and Call Sheets — all through the print dialog with page-break control.

### Import & export
| Format | Notes |
|---|---|
| **FDX** (Final Draft), **Fountain** | Append into the project with category mapping; keeps the screenplay body for the Script tab |
| **CSV** | Script-breakdown exports with header mapping; unknown columns become custom categories |
| **MSD** (Movie Magic Scheduling), **SEX** (Scheduling Exchange) | New-project import: builds a complete project with schedule and calendar versions |
| **.lemon** | Project file — export and import |

- **New-project import** runs the same review dialog as append import: rename, cast Board IDs, categories, heading mapping.
- **Update script (diff)** — review a revised screenplay against the project, change by change.
- **Export** — breakdown to CSV, schedule to SEX, project to `.lemon`.
- **Script integrity…** (File menu) audits the project↔screenplay map and repairs it.

### Collaboration
Online features need the Supabase configuration. The Project Manager gains a **Shared** tab.

- **Accounts** — email/password, Google or Apple sign-in.
- **Sharing & roles** — invite people as editors or viewers, or share a view-only link (expiry: never, 7 or 30 days). Manage members, copy links, stop sharing.
- **Live presence** — live cursors with names and colors, follow mode, peer selection highlights (stripboard, calendar, Glide grids, designers), drag ghosts with a soft lock on the item a peer is moving, and overlay cues when someone is in a menu or modal.
- **Realtime rooms** — server-authoritative editing: a Cloudflare Durable Object per project runs the same reducer, with per-user undo/redo (a blocked-undo note when a peer built on your edit), an offline action buffer and a room-status badge. Enabled by `VITE_ROOMS_URL`; the hosted demo runs without it.

### Data & storage
- **Local projects** — saved per project in the browser (gzip-compressed); cloud projects are excluded from the local index.
- **Google Drive** — optional sync with a connectivity probe, bounded save retries, and automatic catch-up when the connection returns. Offline editing is locked read-only until then.
- **Save folder** — point a project at a local folder ("Set save folder") and every save also writes a project file there; "Restore from Folder" brings projects back (File System Access API, supported browsers).
- **Undo/redo** — 50 steps, batched for bulk operations (imports, paste, auto day breaks).
- **Trash** — scenes, versions, calendar plans, rules, elements, categories, crew, ribbon designs and color rules restore from the Trash dialog; 30-day expiry (versions keep the newest 10).
- **Auto-open** — the last project reopens on boot shortly after closing.

### Platform
- **Pop-out windows** — desktop: shift-click or right-click any tab, sub-tab or day to open it in its own window with live shared state.
- **Navigation** — tabs and sub-tabs are URL-backed; browser back/forward (and iPad swipe) navigate the app.
- **iPad & touch** — coarse-pointer sizing, long-press context menus, marquee selection, keyboard toggle; covered by WebKit iPad tests.
- **Offline status** — a banner and read-only lock when the connection drops, with a retry.

## Tech stack

| Layer | |
|---|---|
| **Framework** | React 19 + TypeScript |
| **Build** | Vite 6 — static build, deploy base `/lemon_schedule/` (GitHub Pages) |
| **Styling** | Tailwind CSS v4 + `@gabriel/ui-kit` |
| **State** | React Context + `useReducer` with undo/redo, persisted to localStorage |
| **Grids** | `@glideapps/glide-data-grid` |
| **Drag & drop** | `@dnd-kit` |
| **Menus & dialogs** | Radix UI |
| **Rich text** | TipTap (report text blocks) |
| **Maps** | Leaflet |
| **Cloud** | Supabase (accounts, sharing, presence) · Cloudflare Workers + Durable Objects (realtime rooms) · Google Drive API |
| **Icons** | Lucide |
| **Testing** | Vitest + Playwright |

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server (port 3000) |
| `npm run build` / `npm run preview` | Production build / preview |
| `npm run lint` | Typecheck + repo hygiene checks (docs budget, roadmap, e2e lint) |
| `npm run test:unit` | Unit tests (`:watch` / `:coverage` variants) |
| `npm run test:smart` | E2E subset mapped from the changed files, plus canaries |
| `npm run test:full` | Full Playwright suite (`test:baseline` compares against clean HEAD) |
| `npm run mcp`, `npm run mcp:install`, `npm run mcp:schema` | Local MCP server for AI agents (see below) |

## Testing

The Playwright suite runs against the **production preview build** by default (`PLAYWRIGHT_DEV=1` switches to the dev server) — 70 specs / 280 tests. It seeds a committed demo project from `e2e/fixtures/seed.lemon` (override with `LEMON_SEED_PATH`) and resolves its data through the debug bridge, so the seed can be re-exported at any time without breaking specs. `npm run test:smart` maps changed files to specs and adds canaries; perf/memory harnesses are `@perf`-tagged and excluded, and iPad specs run under `playwright.ipad.config.ts`. Strategy and flake policy: [`docs/TESTING.md`](docs/TESTING.md).

## Developer tools

An AI agent can read and edit the project open in the app through a local MCP
server. It is loopback-only, off by default, and — for now — **only offered when
the app runs on localhost**:

- Register the server: `npm run mcp:install` (detects opencode, Codex/ChatGPT,
  Claude Desktop, Cursor; `--dry-run` to preview).
- Open a project and click **File → Connect agent bridge**, then let the agent
  call tools like `get_project`, `get_schedule`, `get_schema`, `apply_actions`.
- Writes go through the same reducer the UI uses (undoable); `LOAD` and
  `EMPTY_TRASH` stay UI-only.
- **Realtime rooms worker** — `workers/rooms` (Cloudflare Worker + Durable
  Object) runs the shared-project reducer; run it locally with
  `npx wrangler dev` and point `VITE_ROOMS_URL` at it.

Dev builds also expose `window.__lemonSchedule`, a read/write bridge over the
store used by agents and tests. Full details: [`docs/API.md`](docs/API.md).

## Documentation

The working manuals live in [`docs/`](docs/):

- [Scheduling, stripboard & daybreaks](docs/SCHEDULING-STRIPBOARD-DAYBREAKS.md)
- [Day types & the calendar axis](docs/DAY-TYPES-AND-CALENDAR.md)
- [Store, sync & realtime rooms](docs/STORE-AND-SYNC.md)
- [Online collaboration](docs/COLLABORATION.md)
- [Glide Breakdown](docs/GLIDE-BREAKDOWN.md)
- [Ribbon cells & the ribbon designer](docs/RIBBON.md)
- [Reports Designer](docs/REPORTS-DESIGNER.md)
- [Element & crew links](docs/ELEMENT-LINKS.md)
- [Import/export pipelines](docs/IMPORT-EXPORT.md)
- [Report printing & page breaks](docs/REPORT_PRINTING_AND_PAGE_BREAKS.md)
- [Design language](docs/DESIGN-LANGUAGE.md)
- [Security model](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)

## Security

Found a vulnerability? Please report it privately via GitHub's private
vulnerability reporting (repo **Security** tab → _Report a vulnerability_) — see
[SECURITY.md](SECURITY.md). Please don't open a public issue for security
problems.

## License

Apache-2.0 — see [`LICENSE`](LICENSE).
