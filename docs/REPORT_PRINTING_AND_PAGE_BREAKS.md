# Report Printing & Page Breaks — Spec

How reports print, how pagination works, and how to keep it working in **Safari**
(where we've repeatedly broken it). Read this before touching anything in the
print/pagination pipeline.

## 1. Print flow (how a report gets to paper)

```
Designer Print button
  → ReportDesigner.onPrint(activeDesign)          ReportDesigner.tsx
  → ReportsTab.onReportPrint(design)              ReportsTab.tsx
  → App: setReportPrint({ design, daybreak })     App.tsx
  → App early-returns <ReportPrint/> (full page)  App.tsx (mirrors printOptions/doodOptions)
  → effect: document.title = file name,
    window.print(), afterprint restores UI
```

- `daybreak` (sections + computed rows) comes from `useDaybreakSections()` at
  App level — the canonical daybreak computation, never re-derived.
- `ReportPrint` builds the report context via `buildReportCtx(project, version, daybreak)`
  and renders `design.blocks` with `ReportBlockView`.
- `@page { size: portrait|landscape; margin: 10mm 8mm }` + `BASE_PRINT_RESET` are injected
  as an inline `<style>` in the print view.

## 2. Pagination model (the source of truth)

Two helpers, used by BOTH print and preview so the preview always equals the print:

### `paginateBlocks(blocks)` — `src/lib/reportBlocks.ts`
Splits the design's **top-level** blocks into pages at each `pageBreak` block:

- leading page break → no-op (a forced break at the start of the document does nothing)
- consecutive page breaks → **blank pages** are produced
- trailing page break → dropped (a trailing break would print a blank final page)

### `buildReportPages(blocks, ctx)` — `src/lib/reportPagination.ts`
Top-level split **plus** expansion of per-item repeats: a `repeat` block whose
children **end with a page break** (the Call Sheet pattern — one day per page) is
expanded into one page per repeated item. Each page is a `PageItem[]`:
`ReportBlock | { repeatItem, item }`. Expanded items render via `ReportPageItems`
(`ReportBlockView.tsx`): the repeat's children are rendered against the single
item, with edge page breaks stripped (`stripEdgeBreaks`) and the content wrapped
in `break-inside: avoid`.

**Why structural?** Safari is unreliable with forced breaks nested inside
`break-inside: avoid` wrappers and flex containers. Moving every forced break to a
**top-level block-level page container** is the one path every engine honors.

## 3. The rules (hard-won)

1. **Forced breaks (`break-before: page`) may only live on top-level block
   containers** — the `.report-page` divs. Never inside:
   - `break-inside: avoid` wrappers (Safari ignores them)
   - flex/grid containers (Chrome AND Safari are both unreliable)
2. **Blank pages need real height.** An empty page div won't materialize in
   Chrome/Safari — the empty-page filler is `<div style={{ height: 1 }} />`.
3. **Always emit both properties** — legacy `page-break-before: always` AND
   modern `break-before: page` (React: `pageBreakBefore` + `breakBefore`).
4. **Trailing breaks print a blank page** — drop them. Top-level: `paginateBlocks`.
   Per-item: `stripEdgeBreaks`/`dropTrailingBreaks`. This is the "why is my last
   page empty" bug.
5. **`break-inside: avoid` is honored only when the content fits one page** — a
   taller element still splits. Use it on rows/cards/items, never on page-sized things.
6. **A per-item repeat break = a trailing pageBreak in the repeat's children.**
   Do NOT add break-before divs inside repeat items — expand via `buildReportPages`.
7. **Preview must use the same pagination function as print** — otherwise the
   preview lies. `ReportPreview` uses `buildReportPages`; if you change one, change both.

## 4. Safari specifics

- ✅ **Forced top-level breaks work** (verified in WebKit via Playwright).
- ❌ **`@page { size }` is ignored** — the user must pick paper size/orientation
  in Safari's print dialog (the design's Portrait/Landscape does not auto-apply).
- ❌ **`@page { margin }` is ignored** — margins come from the dialog.
- ⚠️ **"Print backgrounds" must be checked** in Safari's dialog or gray table
  headers / spacer lines / colors silently disappear
  (`-webkit-print-color-adjust: exact` is set, but Safari still requires the checkbox).
- Forced breaks **do not shift** with paper size — a page break always starts a
  new page regardless of how much fits.

## 5. Testing (before claiming print works)

**Chromium** (can count real pages):
1. Seed a project + inject the design (see `e2e/helpers.ts`).
2. Stub `window.print` in an init script (the print view stays rendered).
3. Click the designer **Print** button, `page.pdf({ printBackground: true })`.
4. Count PDF pages (`/Type /Page` matches) and decode text per page
   (ToUnicode CMaps — see past debug specs) to confirm which content landed where.

Expected for the Call Sheet pattern: `N` pages, exactly one day per page,
no trailing blank page.

**WebKit / Safari engine** (`page.pdf()` is Chromium-only — you CANNOT count pages):
1. Same setup, `browserName: 'webkit'`.
2. Assert `.report-page` div count == expected pages and
   `getComputedStyle(page2).pageBreakBefore === 'always'`
   (also under `page.emulateMedia({ media: 'print' })`).
3. Screenshot each `.report-page` div to eyeball the output.

## 6. Future-work checklist

- [ ] Page breaks split only top-level blocks; per-item pagination goes through `buildReportPages`.
- [ ] Any new container block type that can hold `pageBreak` children: decide its
      pagination semantics in `reportPagination.ts` — never rely on nested CSS breaks.
- [ ] Re-run both engine checks above after touching `ReportPrint`, `ReportPreview`,
      `reportPagination.ts`, or `ReportBlockView`'s repeat/table rendering.
