# Roadmap — Future Implementations Checklist

Checklist of features narrated by the user for future sessions. Read this before
starting a new session; work items here are the pending product work. Status:
`[ ]` not started, `[~]` in progress, `[x]` done.

---

## 1. Ribbon Block outside a Repeater (`[ ]`)

Block types today: `text | field | repeat | table | columns | ribbon | pageBreak | spacer`
(see `docs/REPORTS-DESIGNER.md`). A **Ribbon block placed outside any Repeater**
should:

- **Default to showing ALL ribbons of the schedule** (not just a sample).
- **Preview**: show only the first four + an indication that there are more
  ("+ N more" style hint).
- Add a **special property to toggle displaying day breaks** on/off.
- When on, day breaks display **1:1 from the stripboard**, exactly like the
  ribbons do.

Related bugs to fix while here:
- **Notes currently display weirdly** in the ribbon block — they must display
  **1:1 with the stripboard**.
- **Breaks same as notes** — 1:1 with the stripboard.

## 2. REMINDER: Location Manager fix + wire locations into scenes (`[ ]`)

**Reminder: the Location Manager needs to be fixed.**

- Wire locations so they can be linked/input into scenes.
- **There is no location column/type on scenes** even though it exists in the
  scene sheet — wire them together (one source of truth; scene sheet and
  stripboard/glide must agree).

## 3. Custom reports — proper page breaks, no element cutoff (`[ ]`)

- Page breaks must be used properly: **no element cutoff** (a block/element
  must never be sliced across a page boundary mid-content).
- Be smart about how tables/other elements break between pages **when content
  is too large** (split tables cleanly, move whole blocks, etc.).
- The current schedule print implementation already handles this —
  see `docs/print-system.md` (per-block tables in `PrintSchedule.tsx` /
  `DaySection`). **Follow a similar logic to the print engine for custom
  reports.** Existing spec: `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`
  (`paginateBlocks` in `src/lib/reportBlocks.ts` — read before touching).

## 4. Reports page print button skips the modal (`[ ]`)

- The **print button in the Reports page currently skips the print report
  modal** — it must open the modal first (same as the designer flow).

## 5. Custom report print modal polish (`[ ]`)

- Improve the **custom report print modal to closely match the style of the
  print schedule modal** (`PrintDialog` — grouped checklists, days selector,
  etc.). Right now it's subpar.

## 6. Repeater type for Locations / Location Types (`[ ]`)

- Add a **new repeating type + table inside the report designer that repeats
  locations and location types** (both — location types exist).
- Pattern: **same as categories → elements** repeaters.
- **Make that logic shared** so future databases can plug into the repeater
  pipeline without new per-collection code.

## 7. Bug: remove the Link block from the report designer (`[ ]`)

- Remove the **Link block** from the block palette/designer.

## 8. Bug: Attribute-block links not clickable in print (`[ ]`)

- A **text block** with an inserted link prints a **pressable link**.
- Selecting the **same attribute via an attribute block** produces a link that
  is **NOT clickable** in print.
- The attribute block must **match the text block behavior**.

## 9. Map block location awareness (`[ ]`)

- The **Map block should be smart about which location it shows**, or allow
  picking via a **dropdown**.
- Future-proofing: when the **Day Manager** lands, a single day may have
  **multiple locations attached** — the block must choose intelligently
  (default = first) and/or let the user select another.

## 10. Future: CallSheet Designer (`[ ]`)

- A **CallSheet Designer**: a **variant of the Report Designer** sharing the
  same code — almost a toggle.
- Instead of designing reports, you pick a **call sheet template created in
  the reports designer**, then **edit it individually for every day**.
- To make per-day editing easy, add a **"call sheet edit block"** in the
  reports designer: in the call sheet editor you're **only allowed to put or
  not put things inside that block**; everything else remains static and taken
  from the template.

---

## Session handoff

- Repo branch: `main` (push before ending session).
- Next session: pick items above in order; re-read `docs/REPORTS-DESIGNER.md`
  before touching the designer, `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`
  before print/pagination work.
