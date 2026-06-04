# Print Schedule System

## Overview

The print system renders a film production schedule (scenes, notes, breaks grouped by shoot day) as a print-optimized page. It uses `window.print()` on the main window (no iframe). The `PrintSchedule` component replaces the entire page content during print via React rendering triggered by the print event.

## Core Components

### `PrintSchedule.tsx` (`src/components/PrintSchedule.tsx`)
Top-level component. Groups schedule rows by shoot day and renders `DaySection` for each day.

### `DaySection` (internal component within `PrintSchedule.tsx`)
Renders a single day block consisting of:
- **Day header** — black banner with "DAY #N", date (formatted long), and unit call time
- **Per-block tables** — each scene/note/break is its own `<table>` (one per logical "card")
- **Day footer** — "End of Day #N", date, total pages, and estimated time

## Architecture

### Per-block tables
Each scene/note/break is rendered as an independent `<table className="print-table">`. This is critical for reliable **page breaking** — `page-break-inside: avoid` on a block-level `<table>` is universally supported by all browsers, unlike `tbody` where support is inconsistent.

### Table structure
All tables share the same column structure via CSS class widths:

```
| SC# (18pt) | CALL (22pt) | DUR (22pt) | I/E (28pt) | SET (auto) | D/N (20pt) | CAST (38pt) | PGS (22pt) |
```

Note/break rows use `colSpan` to merge I/E through CAST into a single centered content cell.

### Scene blocks (2 rows)
1. **Scene row**: `print-row-scene` — scene number, call time, duration, I/E, SET, D/N, cast, pages
2. **Description row**: `print-row-desc` — description text spanning columns 4–8

### Note/Break blocks (1 row)
Single row with `vertical-align: middle` and 6pt top/bottom padding to match the 2-row scene block height (~17pt).

## Border System

### Interior borders (colored, matching background)
- **Scene/desc cells**: `border-right` and `border-bottom` set to the scene's background color via CSS custom property `--td-border-color`
- **Note/break cells**: `border-right` and `border-bottom` set to `#591b1b` (matching the dark red background)

Only `right` and `bottom` borders are set on each cell. The `top` and `left` borders are provided by the adjacent cell's `bottom` and `right` borders. This avoids corner conflicts with the outer black borders.

### Outer borders (black, `!important`)
- `border-top: 1px solid #000 !important` — on first row of every table
- `border-bottom: 1px solid #000 !important` — on last row of the **last table only** (via `.print-table:last-of-type tbody tr:last-child td`)
- `border-left: 1px solid #000 !important` — on `td:first-child` of every row
- `border-right: 1px solid #000 !important` — on `td:last-child` of every row

The `!important` ensures outer black borders always override the colored interior borders. Only the last table gets a black bottom border to avoid double-thick (2px) lines between adjacent tables.

### Why not use `border` on all 4 sides?
Setting `border: 1px solid <color>` on all 4 sides creates corner artifacts where the colored border competes with the `!important` black outer border. Using only `border-right`/`border-bottom` on interior cells eliminates this because the `top` and `left` of any cell are never explicitly colored — they come from the cell above/left.

## Page Break Strategy

Each block is its own `<table>` with:
```css
page-break-inside: avoid;
break-inside: avoid;
```

This prevents any block from being split across pages. If a block does not fit on the current page, the browser moves the entire block to the next page.

## Color System

### Scene colors (`sceneStyle()` function)
Colors are determined by `intExt` + `dayNight` combination:

| Condition | Background | Text |
|---|---|---|
| INT DAY | `#ffffff` | `#464646` |
| EXT DAY | `#bdd857` | `#000000` |
| INT NIGHT | `#67832e` | `#f2fce3` |
| EXT NIGHT | `#2148a7` | `#ffffff` |
| INT MORNING | `#efbea0` | `#4a3730` |
| EXT MORNING | `#e88aa5` | `#ffffff` |
| INT EVENING | `#e29926` | `#000000` |
| EXT EVENING | `#ce7d21` | `#000000` |

### Note/Break colors
Both notes and breaks use `#591b1b` background with white text.

### Day header/footer
- Header: `#000000` background, white text
- Footer: `#ffffff` background, `#18181b` text

## Typography

- **Font family**: Helvetica, Arial, sans-serif
- **Base font size**: 5.5pt (everything inherits from `.print-root`)
- **Line height**: 1 (tight)
- **Day header/footer**: 5.5pt (inherited)
- **Column headers**: no header row (removed)

## Print Layout

- `@page { size: landscape; margin: 10mm 8mm; }`
- `-webkit-print-color-adjust: exact; print-color-adjust: exact;` — preserves background colors
- No external CSS files — all styles are inline via the `PRINT_STYLE` template literal

## Day Footer

Footer layout (flexbox, left-to-right):
```
[End of Day #N] [date, centered, flex: 1] [spacer, flex: 1] [Total Pages: X] [EST. TIME: X]
```

- `padding: 3pt 4pt` — 4pt to match table cell horizontal padding
- `border-top: 0.5pt solid #d4d4d8` — thin separator line

## Key Implementation Details

### CSS custom property for scene border colors
The `--td-border-color` property is set inline on each scene table:
```tsx
style={{ pageBreakInside: 'avoid', breakInside: 'avoid', '--td-border-color': bgColor } as any}
```
This allows scene cells to use `var(--td-border-color, #ffffff)` for their colored borders without needing individual inline styles on each cell.

### Note duration hiding
When a note has 0 duration, the duration cell renders with empty text (`''`) instead of "0 min". The cell is still rendered (not removed) to maintain consistent column alignment with break rows.

### Conditional columns
CALL and DUR columns are conditionally rendered based on `showTimes` and `showDurations` props. When hidden, the remaining cells use `colSpan` to fill the space — but note that the `contentColspan` variable (set to 4 for I/E + SET + D/N + CAST) is adjusted per-table only for note duration hiding.

## Extending

### Adding a new scene color
Add a new condition in the `sceneStyle()` function in `PrintSchedule.tsx`.

### Adding a new column
1. Add a CSS class with width (e.g., `.print-col-new { width: XXpt; }`)
2. Add the `<td>` to scene rows in the JSX
3. Update `contentColspan` or individual colSpans as needed
4. Add corresponding `td:first-child`/`td:last-child` handling if the column order changes

### Changing block height
Adjust `padding-top`/`padding-bottom` on the relevant row classes. Note/break height is controlled by `.print-table .print-row-note td` and `.print-table .print-row-break td` padding. Scene block height is the sum of scene row padding + content + desc row padding.

## Common Issues

### White lines between cells
Caused by browser rendering artifacts with `border-collapse: collapse`. Fixed by adding `border-right` and `border-bottom` colored borders matching each cell's background color.

### Black border corner gaps
Caused by `border` shorthand (all 4 sides) on cells conflicting with `!important` outer borders. Fixed by only setting `border-right`/`border-bottom` on interior cells.

### Blocks splitting across pages
Fixed by using per-block `<table>` elements with `page-break-inside: avoid` instead of multiple `<tbody>` inside a single `<table>`.

---
