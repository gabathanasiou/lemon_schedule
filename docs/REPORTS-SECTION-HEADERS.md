# Reports — Section Headers on Page Breaks (Future)

Status: **deferred — design note.** The global header/footer zones were shipped
instead (see Stage 8 of the editor-polish branch). This file captures the
pre-agreed shape of the future feature so it can be picked up cleanly.

## Idea

Turn a `pageBreak` block into a small drop container. Blocks dropped onto the
break row become that section's header — "scooter or information for that page".

## Model

- `pageBreak.children?: ReportBlock[]` (reuse the existing `children` field).
- **Pipeline breaks** (top-level breaks + the trailing break of a repeat, the
  call-sheet pattern): the break's children are hoisted to the top of the pages
  they start — Word-style section inheritance (a content-carrying break starts a
  new header; it applies until the next content-carrying break).
- **Inline breaks** (nested mid-content): children simply render after the
  divider in flow — with `break-before: page` they land at the top of the next
  physical page in print. One rendering path, no special case.
- Interaction with global zones: a break container **replaces** the global
  header for its section's pages (global footer still applies everywhere).
- User's chosen semantic (locked in planning): replace, not supplement.

## Implementation sketch

- `paginateBlocks()` currently drops break info — it needs to carry per-page
  header lists. The chunk walker (`useReportPaginator`) applies ONE global
  header/footer per chunk today; section headers need chunk-level header sets
  threaded through `useReportPaginator`/`ReportChunkPage`.
- Designer canvas: the page-break row becomes a dropzone (same chrome as the
  repeat container), with a compact preview of the section header when present.
- The designer's zone routing (`zoneOf` / `listOfZone` in ReportDesigner.tsx)
  generalizes naturally: page-break children become another block list.

## Why deferred

Pagination is content-driven (a break can produce 0/1/many pages; repeat
trailing breaks replicate per item). Mid-repeat non-trailing breaks make
"where does this header end?" ambiguous. Alpha → ship the predictable global
zones first; add section headers incrementally when a design need shows up.
