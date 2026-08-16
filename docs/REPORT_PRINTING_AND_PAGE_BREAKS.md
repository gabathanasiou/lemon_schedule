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

TWO layers, used by BOTH print and preview so the preview always equals the
print:

### Layer 1 — structural pages
- `paginateBlocks(blocks)` (`src/lib/reportBlocks.ts:20`): splits the design's
  **top-level** blocks at each `pageBreak` block. Leading break → no-op;
  consecutive breaks → blank pages; trailing break → dropped.
- `buildReportPages(blocks, ctx)` (`src/lib/reportPagination.ts:73`): top-level
  split **plus** per-item expansion: a repeat whose children contain **ANY**
  `pageBreak` (`hasItemBreaks`, `reportPagination.ts:58` — not just trailing)
  is expanded into one page per item (the Call Sheet pattern). The pageBreak
  children are **dropped** in per-item rendering (`FragmentBody`,
  `ReportBlockView.tsx:416`).

### Layer 2 — measured chunks (`useReportPaginator`)
Structural pages alone cannot paginate overflowing content (a huge table) nor
repeat header/footer per PHYSICAL page. `useReportPaginator`
(`src/components/reports/useReportPaginator.tsx:425`) renders the structural
pages offscreen ONCE (`ReportMeasureContainer`, `:363`), reads real element
heights, and splits content into page-sized `PageChunk`s (types in
`src/lib/reportPagination.ts`). BOTH print (`ReportPrint.tsx`) and preview
(`ReportPreview.tsx`) render the SAME chunks via `ReportChunkPage`
(`ReportBlockView.tsx:468`) — never one without the other.

**Chunk granularity (universal — any block can flow to the next page, at any
nesting depth):**
- whole blocks (text/field/link/image/map/columns/spacer) move WHOLE;
- repeats split between ITEMS;
- tables split between ROWS — the column header REPEATS on continuation chunks;
- ribbons split between STRIPS, never mid-strip (split day boxes drop the box
  border on fragments — `unitRange` on `ReportRibbonView`);
- per-item repeat fragments split between their CHILDREN (`repeatItemPart`
  chunks carry `parts`, one slice per child).

**Canonical geometry:** `REPORT_PAGE_METRICS` (`reportStyle.ts:45`) —
contentWidth = A4 minus 12mm side margins (697px portrait / 960px landscape);
contentHeight conservative so one chunk fits EVERY common sheet in Safari
(880px portrait / 620px landscape — bound by US Letter portrait and A4
landscape under the print dialog's 0.5in margins). The measurement budget
subtracts header + footer + the 8pt header margin, so a chunk never exceeds
the box. Oversize: a single unit taller than a page stays put and overflows
(slices at the sheet boundary — the pre-measurement browser behavior).

**Why structural + measured?** Safari only honors forced breaks at the TOP
level (`break-before: page` on the `.report-page` divs, `ReportPrint.tsx:56`).
The measured chunks guarantee each div's content fits its sheet, so the
browser never auto-splits mid-chunk — header/footer repeat per physical page
instead of only the first/last.

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
   Repeat children: `FragmentBody` FILTERS every `pageBreak` child
   (`ReportBlockView.tsx:416`) — never render a pageBreak inside a per-item page.
   This is the "why is my last page empty" bug.
5. **`break-inside: avoid` is honored only when the content fits one page** — a
   taller element still splits. Use it on rows/cards/items, never on page-sized things.
6. **ANY pageBreak in a repeat's children = one page per item** (`hasItemBreaks`).
   Do NOT add break-before divs inside repeat items — expand via `buildReportPages`.
7. **Preview must use the same pagination as print** — otherwise the preview
   lies. Both render the measured `useReportPaginator` chunks via
   `ReportChunkPage`; if you change chunking, change it once.
8. **Chunk budget = contentHeight − header − footer − 8pt header margin.**
   The measurement container must mirror the render's margins exactly
   (header margin-bottom, footer padding-top — see `ReportMeasureContainer`).
9. **An oversized single unit stays and overflows** — never auto-split mid-strip/
   mid-row beyond the walker's units; document the slice instead (measurement is
   engine-local, so the chunk list itself is always consistent).

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

The automated spec is `e2e/report-pagination.spec.ts` (run with
`npx playwright test --config=playwright.ipad.config.ts report-pagination` —
every project in the config runs it: Desktop Chrome + iPad WebKit, print AND
preview). It injects a stress design (header/footer + a scenes table that
splits + a full-schedule ribbon), clicks through the print dialog, then asserts
on BOTH engines:
- header/footer text on EVERY `.report-page` (the original bug: footer only on
  the last physical page);
- the table's column header repeats on continuation pages;
- no page's CONTENT exceeds the budget (measure `.report-page-content`
  children, NOT `scrollHeight` — the page div is `min-height: 100vh`);
- Chromium-only: `page.pdf({ format: 'A4' })` page count == `.report-page`
  count (measured pagination == what reaches paper);
- WebKit-only: `getComputedStyle(page2).pageBreakBefore === 'always'`.

Manual/one-off checks:

**Chromium** (can count real pages):
1. Seed a project + inject the design (see `e2e/helpers.ts`).
2. Stub `window.print` in an init script (the print view stays rendered).
3. Click the designer **Print** button (through the dialog), `page.pdf({ printBackground: true })`.
4. Count PDF pages (`/Type /Page` matches) and decode text per page
   (ToUnicode CMaps — see past debug specs) to confirm which content landed where.

Expected for the Call Sheet pattern: `N` pages, exactly one day per page,
no trailing blank page; oversized days SPLIT between strips with header/footer
repeating on each continuation page.

**WebKit / Safari engine** (`page.pdf()` is Chromium-only — you CANNOT count pages):
1. Same setup, `browserName: 'webkit'`.
2. Assert `.report-page` div count == expected pages and
   `getComputedStyle(page2).pageBreakBefore === 'always'`
   (also under `page.emulateMedia({ media: 'print' })`).
3. Screenshot each `.report-page` div to eyeball the output.

## 6. Custom reports from the app header Print menu (plan)

Today a custom report can only be printed from inside the Reports Designer
(Designer Print button → `setReportPrint`). The header's `File → Print` only
offers the built-in prints. Plan to make any report design printable directly
from the header, with scope options like the Schedule print dialog.

### Menu restructure — `AppHeader.tsx` + `App.tsx`

```
File → Print
  ├─ Schedule…
  ├─ Day Out of Days…
  ├─ Breakdown Sheet…
  └─ Custom Reports          ← new submenu (DropdownSubmenu, like the rest)
       ├─ <report design name>…
       ├─ <report design name>…
       └─ …                  ← one entry per project.reportDesigns (activeReportId
                                first or checked), divider, "Manage…" → opens Design tab
```

- **Remove** `Element Breakdown…` from the header menu — it's redundant now that
  a custom report can produce the same output (the Reports tab still has it).
- **`AppHeader.tsx`**: drop `onPrintElementBreakdown`; add
  `onPrintReport(design)` (or a single `onPrintCustomReport` that opens a picker).
- **`App.tsx`**: new state `customReportPrint: { design, scopeFilter? } | null`
  (or reuse `reportPrint` with an added `scopeFilter`). Reuse the existing
  `ReportPrint` early-return + `window.print()`/`afterprint` effect.

### Scope options dialog

When a report is picked from the header menu, show a small print-options modal
(modeled on `PrintDialog`/`DoodDialog`) BEFORE `window.print()`:

- For **every top-level repeat/table**, a scope section:
  - `Repeat over <Collection>` / `Table over <Collection>` label
  - **All items** (default) vs **Selected…** — a checklist of the resolved items
    (whatever the block iterates: days, scenes, elements, categories, crew)
- Generic, not day-specific: `ReportScopeFilter` (`src/lib/reportData.ts`) holds
  per-collection include lists keyed by `reportItemKey` (scene id / day index /
  element id / category key / crew position). Missing scope = include all;
  `[]` = include nothing.

### Plumbing

- `filterItemsByScope(items, collection, category, scopeFilter)` is the single
  filter point, applied in `ReportRepeatView`, `ReportTableView` and
  `buildReportPages` (per-item page expansion) — replacing the old
  `scopeFilter.days` special case.
- `ReportPrint` / `ReportPreview` / `ReportPageItems` thread the filter through;
  `ReportPrintDialog` builds the checklists via `resolveCollectionItems` (so
  categories skip-empty/exclude filters apply to the list too).

## 7. Future-work checklist

- [x] Page breaks split only top-level blocks; per-item pagination goes through `buildReportPages`.
- [x] Any `pageBreak` inside a repeat's children = one page per item (`hasItemBreaks`).
- [ ] Any NEW container block type that can hold `pageBreak` children, or any new
      splittable content inside repeat fragments: decide its chunk semantics in
      `useReportPaginator.tsx` (`flattenBlock` + `assembleChunks`) — never rely
      on nested CSS breaks.
- [ ] Re-run both engine checks above after touching `ReportPrint`, `ReportPreview`,
      `useReportPaginator.tsx`, `reportPagination.ts`, or `ReportBlockView`'s
      repeat/table/fragment rendering.
