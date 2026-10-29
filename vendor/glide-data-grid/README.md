# Vendored fork — Glide Data Grid

This is our **fork** of [`@glideapps/glide-data-grid`](https://github.com/glideapps/glide-data-grid),
vendored so the kit owns the runtime instead of depending on an upstream
release. MIT licensed; copyright typeguard, Inc. (see `LICENSE`).

- **Upstream fork:** https://github.com/gabathanasiou/glide-data-grid
- **Pinned version:** `6.0.4-alpha24` (see `upstream-package.json`)
- **What is here:** the published build — `dist/esm` (readable ESM; TypeScript
  output, unminified), `dist/dts` (types) and `dist/index.css`. The original
  sources are **not** copied here; they live in the fork above.

## How it is wired

`vite.config.ts` aliases the bare import `@glideapps/glide-data-grid` to
`vendor/glide-data-grid/dist/esm/index.js`, and the kit `tsconfig.json` maps the
same specifier to `dist/dts/index.d.ts`. Nothing resolves upstream — deleting
the npm package has no effect. CSS consumers import
`vendor/glide-data-grid/dist/index.css` (or the package path when published).

## Local patches in this vendored build

1. **`dom-cells/`** — new module exporting `DataEditorWithDomCells` (+
   `GetDomCell`/`DomCellEditorProps` types): mounts a click-through DOM layer
   over the canvas and keeps one box glued to each requested cell. Boxes are
   positioned in CONTENT space (`getContentBounds`) and scrolling moves four
   clipped bands (frozen headers / headers / frozen cells / body cells) with one
   compositor `translate3d` each, so controls track the canvas on both axes with
   no scroll heuristic. Frozen columns, the row-marker gutter and headers pin per
   axis; the sticky trailing add row is a band inset (`domCellBottomInset`).
   Enter/Space on the selected cell activates its control when the DOM cell
   holds exactly one focusable element. `getDomHeaderCell` pins real controls
   over column headers; headers expose `data-glide-header-focused` when the
   selection range covers their column and `data-glide-header-selected` when the
   column itself is selected. The overscroll band past the last row is flattened
   to the cell background (stock painted phantom row lines there).
2. **Scroll pass paints the grid** (`internal/scrolling-data-grid/infinite-scroller`)
   — the visible-region update is committed inside `flushSync`, so the canvas
   repaints on the same offsets the scroll applied. Stock defers it to React's
   next commit (a frame late; fast flicks left the paint behind the scroll).
   The scroller is `overflow: auto` in Safari too (stock forces `scroll`, which
   reserves a gutter with always-visible scrollbars); a content-height sheet
   (`data-glide-fit`) additionally pins `overflow-y: hidden`, because its rows
   always fit — otherwise Safari latches both scrollbars on after a row is added.
3. **`getContentBounds`** (`internal/data-grid`) — a cell's rect in content
   space (canvas-relative, scroll independent), exposed through the editor ref.
   This is what the DOM-cell layer pins from; `getBounds` answers with the last
   PAINTED offsets and is stale for a frame during a scroll.
4. **Editor chrome** (`dist/index.css`, "fork: the overlay editor must look
   like the cell") — square corners, a crisp 1px inset accent rectangle, no
   drop shadow/fade, the cell's exact box/height/padding/font/line rhythm, and
   no inner scrollbar (stock's growing-entry top margin + sub-pixel rounding).
5. **Header selection range** (`dist/esm/internal/data-grid/render/`) — stock
   tinted only the focused cell's column header; every column covered by the
   selection range now tints (`rangeStack` included), matching the range.
6. **Source maps stripped** — `*.map` files and their `sourceMappingURL`
   comments are removed to keep the vendored tree small (Vite then logs no
   missing-map errors).
7. **Zero-height header** (`dist/index.css`) — `data-glide-no-header` (a sheet
   with `headerHeight: 0`, the one-cell shape) hides the 1px header canvas
   Glide still creates, so the element is literally the cell.
8. **Imperative `openCellEditor` column offset** (`dist/esm/data-editor`) — the
   API takes a DATA column, while `getMangledCellContent` and the overlay's
   `cell` are RAW (the row-marker gutter is column 0). Stock mixed the two: on
   a grid with row markers it opened the PREVIOUS column's content in the
   clicked cell's box. The fork adds `rowMarkerOffset` for both, matching the
   double-click path (painted picker lanes call this API).

## Patching

- **Small change:** edit the file in `dist/esm/**` directly (the code is plain
  ESM, names intact). Keep the change minimal and add a `// fork:` comment so a
  re-vendor diff surfaces it.
- **Structural change / new feature:** patch the real TypeScript in the fork
  (`github.com/gabathanasiou/glide-data-grid`), build it with its own toolchain
  (`./build.sh` needs the monorepo's `config/build-util.sh`; a standalone
  checkout usually needs that script copied in), then re-vendor `dist/`.
- **Re-vendor:** copy `dist/esm`, `dist/dts`, `dist/index.css`, `LICENSE`,
  `README.md` and `package.json` from the built package into this folder
  (drop `*.map`).

Vendored edits are part of our code review. Do not add `.map` files.
