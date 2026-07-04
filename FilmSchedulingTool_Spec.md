# Film Scheduling Tool — Product Specification
**Project:** A Little Bit of Hope (working title)  
**Version:** 1.0  
**Date:** June 2026  

---

## 1. Overview

A single-page web application with two primary tabs: **Breakdown** and **Schedule**. The Breakdown tab is the source-of-truth database for all scene data. The Schedule tab is an interactive, day-by-day shooting schedule builder that reads from the breakdown. The app targets film 1st ADs and directors working on short films and features.

---

## 2. Technology Stack (Recommended)

- **Framework:** React (with hooks)
- **State management:** React context or Zustand (lightweight global store)
- **Drag and drop:** `@dnd-kit/core` + `@dnd-kit/sortable` (accessible, touch-friendly)
- **Persistence:** `localStorage` for auto-save; JSON export/import for portability
- **CSV parsing:** PapaParse
- **Styling:** Tailwind CSS or CSS modules — utilitarian and dense, not consumer-app soft
- **Fonts:** A monospaced or semi-condensed typeface fits the production-document aesthetic (e.g. IBM Plex Mono for labels, Inter for body)

---

## 3. Data Model

### 3.1 Scene (Breakdown Row)

```
Scene {
  id: string (UUID)
  sceneNumber: string          // text — "1", "19A", "21C" etc. NEVER cast to number
  pageCount: string            // fraction string — "2/8", "1 3/8", "2" etc.
  pageCountDecimal: float      // computed from pageCount for totalling (e.g. "1 3/8" → 1.375)
  scriptDay: string            // "1", "2" etc.
  intExt: enum                 // INT | EXT | INT/EXT
  set: string                  // location name
  dayNight: enum               // DAY | NIGHT | EVENING | DAWN | DUSK
  description: string          // one-line scene description
  cast: string                 // comma-separated cast numbers, e.g. "1, 2, 3"
  notes: string                // free text
  shootDay: number | null      // which shoot day this scene is assigned to (nullable)
}
```

### 3.2 Schedule Row

A schedule is made up of an ordered list of rows. Each row is one of three types:

```
ScheduleRow {
  id: string (UUID)
  type: enum // SCENE | BREAK | NOTE
  shootDay: number
  order: number                // integer position within day, for drag-drop reordering
  
  // If type === SCENE:
  sceneId: string              // reference to Scene.id
  estimatedDuration: number    // minutes — editable per schedule row, not stored on scene
  
  // If type === BREAK:
  breakLabel: string           // e.g. "LUNCH DAY 01", "BLACKOUT REQUIRED – D4N", "MOVE DOWNSTAIRS"
  breakDuration: number        // minutes (0 for non-timed notes like "MOVE LOCATION")
  isTimed: boolean             // true = counts toward running time; false = visual divider only
  
  // If type === NOTE:
  noteText: string             // free text annotation
}
```

### 3.3 Schedule Version

```
ScheduleVersion {
  id: string (UUID)
  name: string                 // e.g. "v6 – Director Cut", "v7 – Location Change"
  createdAt: timestamp
  rows: ScheduleRow[]          // full ordered list for this version
}
```

### 3.4 Project

```
Project {
  title: string
  draftNumber: string
  scenes: Scene[]
  versions: ScheduleVersion[]
  activeVersionId: string
}
```

---

## 4. Tab 1 — Breakdown

### 4.1 Layout

Full-width table with a sticky header row. Each row = one scene. Below the table: a toolbar with import/export controls. Scrollable vertically; table does not paginate.

### 4.2 Columns (left to right)

| Column | Width | Editable | Notes |
|---|---|---|---|
| Scene # | 60px | Yes | Stored as text. No auto-sort. |
| Pages | 80px | Yes | Fraction string. Tooltip shows decimal equivalent. |
| Script Day | 70px | Yes | |
| I/E | 80px | Yes | Dropdown: INT / EXT / INT/EXT |
| Set | 200px | Yes | Free text |
| D/N | 80px | Yes | Dropdown: DAY / NIGHT / EVENING / DAWN / DUSK |
| Description | flex (fills remaining) | Yes | Free text |
| Cast | 120px | Yes | Comma-separated numbers |
| Notes | 200px | Yes | Free text |

### 4.3 Inline Editing

- **Single click** on any cell → activates an inline text input or dropdown in place. No modal, no separate edit view.
- **Tab key** moves focus to the next cell to the right; **Shift+Tab** moves left.
- **Enter** confirms and moves focus to the same column in the row below.
- **Escape** cancels and restores prior value.
- All changes are saved to state immediately (auto-save to localStorage).

### 4.4 Row Operations

- **Add row:** Button at bottom of table ("+ Add Scene"). Inserts a new blank row. Scene number must be filled manually.
- **Delete row:** On hover, a trash icon appears at the far left of the row. Click prompts a single inline confirmation ("Delete scene 19A? [Confirm] [Cancel]") — no modal.
- **Reorder rows:** Rows are not drag-sortable in the Breakdown (the schedule handles order). The breakdown is sorted manually by typing scene numbers; a "Sort by scene number" button re-sorts rows alphanumerically (treating suffixes correctly: 1, 2, 3 … 19, 19A, 20, 21, 21A, 21B, 21C, 22, 22A …).
- **Duplicate row:** Right-click context menu or row hover menu. Useful for sub-scene variants.

### 4.5 Import

- **Import CSV button** opens a file picker. Accepts `.csv` files.
- On import, a column-mapping modal appears: user maps CSV columns to the Scene fields. Mappings are remembered for subsequent imports from the same file structure.
- If a scene number from the CSV already exists in the breakdown, user is prompted: **Replace**, **Skip**, or **Merge** (keep existing notes/fields not present in CSV).
- After import, breakdown updates immediately.

### 4.6 Export

- **Export CSV:** Downloads the current breakdown as a `.csv` file.
- **Export JSON:** Downloads the full project state (breakdown + all schedule versions) as a `.json` file for portability and backup.

### 4.7 Footer / Summary Bar

Sticky bar below the table showing:
- Total scene count
- Total page count (sum of all `pageCountDecimal` values, displayed as both decimal and nearest eighth fraction)
- Pages per script day (breakdown)

---

## 5. Tab 2 — Schedule

### 5.1 Overall Layout

The schedule is a vertically scrolling document. Each shoot day is a discrete block separated by a day header banner. Within each day, rows appear in order. There is no grid or timeline — it is a linear list, matching the screenshot aesthetic.

### 5.2 Colour Coding

Row background colour is determined by the combination of **I/E** and **D/N** on the scene:

| Condition | Colour |
|---|---|
| INT + NIGHT | Dark olive green (as per screenshot: #4a5e2a range) |
| INT + DAY | Warm white / light cream |
| INT + EVENING | Warm amber-tinted white |
| EXT + NIGHT | Steel blue / dark blue-grey |
| EXT + DAY | Pale lime green (as per screenshot: #c5d97a range) |
| EXT + EVENING | Soft peach |
| INT/EXT + NIGHT | Split: gradient or striped between INT NIGHT and EXT NIGHT colours |
| INT/EXT + DAY | Split between INT DAY and EXT DAY |
| BREAK rows | Dark maroon / burgundy (as per screenshot: #5c1a1a range) — always, regardless of scene content |
| NOTE rows | Pale yellow |

A **colour legend** is always visible as a compact floating key in the top-right corner of the schedule view (collapsible).

### 5.3 Day Header Banner

Each shoot day begins with a full-width dark banner containing:

```
DAY 01          UNIT CALL: 12:00          SATURDAY 6TH JUNE 2026
```

- These fields are all editable inline (click to edit).
- Day number auto-increments but can be manually overridden.
- Date field: date picker or free text.

### 5.4 Schedule Row — Scene Type

Each scene row displays the following columns (matching screenshot):

| Column | Content |
|---|---|
| Scene # | From breakdown. Bold. Left-aligned. |
| Call time | Computed automatically (see §5.6). |
| Estimated duration | Editable. Format: "1h 30m", "45m", "0d" (zero duration). |
| Pages | From breakdown. |
| I/E | From breakdown. |
| Set | From breakdown. |
| D/N | From breakdown. |
| Description | From breakdown. Editable inline without leaving the schedule. |
| Cast | From breakdown. |

All fields sourced from the breakdown reflect live updates if the breakdown is changed — except **description**, which can be overridden per schedule row (an override indicator, e.g. a small dot, shows the field has been locally edited vs. sourced from breakdown).

### 5.5 Break / Divider Rows

Break rows span the full width of the schedule and display:
- **Label** (e.g. "LUNCH DAY 01", "BLACKOUT REQUIRED – D4N", "PULL DOWN BLACKOUT", "MOVE DOWNSTAIRS")
- **Duration** (e.g. "1h", "30m") — shown on the left. If duration is 0 or not set, no time is shown.
- **Running total since day start** — when it is a LUNCH break specifically, the row also shows elapsed shoot time since unit call (e.g. "5h 15m" in the screenshot). This is the time from the unit call to this break row, excluding prior breaks.

### 5.6 Time Calculation Engine

This is the core logic of the schedule. Rules:

1. Each shoot day starts at its **unit call time** (set on the day header).
2. Every row has a **duration in minutes**.
3. The **call time** of each row = the call time of the previous row + the previous row's duration.
4. Rows with `isTimed: false` (e.g. pure location notes with no duration) do not advance the clock.
5. Wrap time = call time of last row + last row's duration.
6. Wrap time is displayed at the bottom of each day as a "WRAP TIME" row.
7. If a duration is changed anywhere, all subsequent call times in the day cascade and update immediately.
8. The **end of day** summary row shows:
   - Total pages for the day
   - Total shoot time (sum of scene durations only, excluding breaks)
   - Total elapsed time (unit call to wrap, including breaks)

### 5.7 Drag and Drop

- Any scene row within a day can be dragged to reorder within that day.
- A scene row can also be dragged **across day boundaries** — dropping it into a different day block reassigns its `shootDay` value.
- Break rows and Note rows are also draggable and reorderable within the same constraints.
- While dragging, a ghost preview follows the cursor. A drop target indicator (horizontal line) shows the insertion point.
- Time recalculates live as the drag occurs (debounced at ~60fps).
- Undo (Ctrl+Z / Cmd+Z) reverts the last drag operation.

### 5.8 Inline Scene Editing (Double-click)

- **Double-clicking** a scene row opens an **inline edit panel** that expands below the row (not a modal — it pushes content down).
- The panel shows all breakdown fields for that scene, all editable.
- A toggle switches between "edit schedule only" (changes affect this schedule version's row only) and "edit breakdown" (changes propagate back to the source breakdown and all versions).
- Panel closes on Escape or clicking a close button.

### 5.9 Adding Rows

A persistent **"+ Add"** button or dropdown appears:
- At the bottom of each shoot day block
- On hover between any two rows (a faint "+" appears in the gutter)

Clicking opens a small inline menu:
- **Add scene** → opens a searchable dropdown of all breakdown scenes not yet scheduled for this day. Typing filters by scene number, set name, or description.
- **Add break** → inserts a break row with editable label and duration.
- **Add note** → inserts a plain text annotation row.
- **Add new day** → appends a new shoot day block at the end of the schedule (or after the current day).

### 5.10 Schedule Versions

- A **version selector** dropdown sits in the top navigation bar, showing the current version name.
- **"New version"** button duplicates the current version with a new name (e.g. "v6 copy"). The user can rename it immediately.
- Switching versions loads that version's full row order; the breakdown (scene data) is shared across all versions.
- Versions can be deleted (with confirmation). The active version cannot be deleted.
- There is no diff/compare view in v1.

### 5.11 Schedule Export

- **Print / PDF:** A print stylesheet renders the schedule cleanly — colour-coded rows preserved, no UI chrome. Each day starts on a new page.
- **Export CSV:** Exports the schedule rows in order with all computed times filled in.

---

## 6. Navigation & Global UI

### 6.1 Top Bar

```
[App name / project title]    [Breakdown] [Schedule]    [Version: v6 ▾]    [Save ✓] [Export ▾]
```

- Project title is editable inline.
- Save indicator shows "Saving…" → "Saved" → timestamp. Auto-saves to localStorage every 30 seconds and on every meaningful state change.
- Export dropdown: Export JSON, Export CSV (breakdown), Print Schedule.

### 6.2 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd/Ctrl + Z | Undo last action |
| Cmd/Ctrl + Shift + Z | Redo |
| Cmd/Ctrl + S | Force save |
| Escape | Close any open inline editor or panel |
| Tab / Shift+Tab | Navigate between cells in breakdown |

---

## 7. Colour Coding Reference (Exact, from Screenshot)

Matching the screenshot palette as closely as possible:

| Row type | Approximate hex | Notes |
|---|---|---|
| INT NIGHT | `#4a5c28` / `#3d5022` | Dark olive green |
| EXT NIGHT | `#1a3a5c` | Dark steel blue |
| INT DAY | `#f5f0e8` | Warm off-white |
| EXT DAY | `#c8d96b` / `#b8cc55` | Bright lime green |
| BREAK / DIVIDER | `#5c1a1a` / `#6b1e1e` | Dark burgundy/maroon |
| DAY HEADER | `#1a1a1a` | Near-black |
| NOTE row | `#fff9d6` | Pale yellow |
| WRAP / END OF DAY | `#2a2a2a` | Dark grey |

Text on dark rows: white (`#ffffff`)
Text on light rows: near-black (`#1a1a1a`)

---

## 8. Edge Cases & Business Rules

1. **Scene numbers are strings always.** "19A" must never be coerced to `19`. Sorting uses a natural sort algorithm (e.g. `19 < 19A < 19B < 20`).
2. **Page count fractions.** Stored as strings ("2/8", "1 3/8"). A parser converts to decimal for arithmetic. Display always shows the original string.
3. **Duration of "0d"** means zero duration — the scene has no estimated shoot time (e.g. it's a "if time permits" pickup). It appears in the schedule at the same call time as the previous row and does not advance the clock.
4. **A scene can appear in multiple shoot days** across different schedule versions, but within a single version it should only appear once. The UI should warn (not prevent) if a user tries to add a scene already scheduled that day.
5. **Unscheduled scenes** — scenes in the breakdown that haven't been added to any shoot day — are visible in a collapsible "Unscheduled" panel at the bottom of the Schedule tab, available to drag into any day.
6. **Break rows with `isTimed: false`** (e.g. "MOVE DOWNSTAIRS", "BLACKOUT REQUIRED") display in the schedule as full-width dividers but do not appear in time calculations. Their duration input is hidden or locked to 0.
7. **CSV import column mapping** must handle the common case where scene numbers come in as integers (Excel strips leading zeros or converts "1" to a number). The importer must always stringify the scene number field.
8. **Undo history** should be capped at 50 actions to avoid memory bloat.
9. **The time engine must handle midnight wrap.** If unit call is 12:00 and total shoot time is 12+ hours, call times after midnight should display as e.g. "00:45" not as a negative number or NaN.

---

## 9. Out of Scope for v1

- Multi-user / collaboration
- Cloud sync (localStorage only in v1)
- Cast availability / deal memo integration
- Budget / cost tracking
- Shot list or storyboard integration
- Mobile-optimised layout (desktop-first; must be usable on a 13" laptop at minimum)
- Diff / compare between schedule versions
- Automatic day assignment / AI scheduling suggestions

---

## 10. Acceptance Criteria Summary

| Feature | Done when… |
|---|---|
| Breakdown editable | Every cell edits inline; Tab/Enter navigation works |
| Scene sort | "Sort by scene #" correctly orders 1, 2 … 19, 19A, 20, 21, 21A, 21B, 21C … |
| CSV import | File picked → columns mapped → scenes populate breakdown |
| Colour coding | All 8 row-type colours render correctly on schedule |
| Time engine | Changing one duration cascades all subsequent call times in that day |
| Drag and drop | Rows reorder within and across days; time recalculates |
| Double-click edit | Expanding inline panel opens on scene row; changes can target breakdown or schedule-only |
| Break rows | LUNCH row shows elapsed time since unit call |
| End of day summary | Total pages and total shoot time correct |
| Versions | Duplicate, rename, switch version; breakdown data shared |
| Undo | Ctrl+Z reverts last drag or edit |
| Auto-save | State persists on page reload |
| Print | Clean colour-coded output, no UI chrome |
