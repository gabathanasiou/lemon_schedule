
# Roadmap — Future Implementations Checklist

This file is the pending work list: `[ ]` not started, `[~]` in progress.
Only open/in-progress items live here — the live file is read by every
roadmap worker session, so it stays lean.

- **Completed items:** see `docs/ROADMAP-ARCHIVE.md` (index + code/knowledge
  pointers; full narratives in git history).
- **New asks** go through the triage/dedupe gate (AGENTS.md, §Roadmap Work)
  before becoming an item here.

> **Next session — Reports Designer**: pick up and finish the designer pass.
> Then **191** (inline text blocks + the ONE shared chrome), **194**
> (resize-tab double-click reset), **195** (reference `.` attributes match the
> repeater scope — honor its guardrails), **196** (cellref collection
> navigation / chaining), **198** (designer day picker — preview any day) and
> **199** (collection-table column headers — custom text + tokens).
> **190** (`=` cell references) and **197** (day repeats sample Day 1 of the
> active schedule/calendar) shipped 2026-10-02.

---
## 17. Report designer iPad-friendly (`[ ]`)

- The **report designer must work on iPad** — both the **looks** and the
  **designer preview/canvas itself**.
- **Drag & drop does not work on iPads** (HTML5 DnD is desktop-only; pen =
  touch = coarse pointer) — the palette → canvas and block reordering flows
  must fall back to touch-friendly interactions (tap to add, move via
  controls) or a pointer-based drag shim.
- Audit everything touch-related in the designer:
  - canvas scrolling/panning over block cards,
  - selecting blocks/cells, column reorder grips, resize handles,
  - hover-dependent affordances (any-hover gating, hover-reveal),
  - the floating chrome panels (coarse-pointer sizing/padding),
  - drop zones / edge zones during drag.
- Visual audit on iPad viewport (730px portrait / 1060px landscape per
  `useViewMode`): palette, chrome panels, tables, preview.
- **WebKit play-test (required before done)**: Playwright WebKit + touch
  emulation (`playwright.ipad.config.ts` — `devices['iPad Pro 11']`,
  `hasTouch`) covering palette → canvas block drag, block reordering, resize
  handles (table columns + columns-block gutters), edge/zone drops, column
  reorder grips. Touch fallbacks: tap-to-add from the palette; pointer-based
  drag shim (`touch-action: none` — the ribbon dragger pattern, item 24) or
  move-via-controls. Re-run against item 24's shared draggers (**DONE** —
  `src/components/columnResize.tsx`) to confirm no regression.

## 43. Import `.mmx` / `.MMS10` (Movie Magic Screenwriter XML) (`[ ]`)

**Requested**: someday — optional import path for EP's Screenwriter XML interchange (`.mmx`, rebadged `.MMS10` for MMS 10's "Import Script"). Producers would arrive with scripts/tagged breakdowns exported from Movie Magic Screenwriter, Filmustage, Shamel Studio or StoryboardCanvas.

- **BLOCKED — no sample file.** The schema is undocumented in the open; nothing in `open-moviemagic-toolkit` or anywhere public. An XML parser needs a real sample to build and verify against.
- **Unblock**: one `.mmx` file with known content (2–3 scenes + tagged elements) — e.g. a Filmustage free-tier export, or a Screenwriter trial export. That single file makes it a contained task (XML with a known schema — like the FDX parser; the `TagData`/tag-resolution machinery in `fdx.ts` is the template).
- **Scope if implemented**: NEW-PROJECT-ONLY import (same as `.msd`/`.sex` — update `parseMsdFile`-style flow + Project Manager "Import" accept list + e2e). Breakdown side only — script data (headings, characters, tagged elements, synopses, page counts), no stripboard. Do NOT build an .mmx export unless a user asks (screenwriter XML fans mostly read-side).
- **Priority: low — parked knowingly.** `.sex` (item 41) already covers every real scheduling tool, and `.fdx` covers script-with-tags. This is a "who knows, maybe in the future" item; skip until a sample exists.

## 50. EXPERIMENTAL: EntityDropdown committed values as chips (`[ ]`)

**Parked exploration — not building now.** Review question: should
`EntityDropdown` render committed multi-values as per-value chip pills
(tag-input pattern) instead of the comma-joined resolved text? The chip
variant (`variant="chip"`) already exists — the trigger shows the values
resolved Glide-style via the `chipDisplay` overlay (`EntityDropdown.tsx:457`).

**Why parked** (verified against the code):
- The value IS the input (caret-at-end to append, backspace, Enter/Tab
  commit, Glide callbacks) — per-value chips would render only in the closed
  trigger and vanish on open, so the text-editing model underneath stays.
- The ui-kit has no generic Chip primitive (TokenChipView is tied to the
  contenteditable token editor) — this would be new in-app UI.
- 34 call sites; multi-chip triggers wrap/overflow the single-line modal
  rows (Link Manager cards, ElementPicker/ElementPickerRow).

**When it becomes worth it** — a requirement giving committed values
per-item affordances: per-chip × to remove one cast member from a
travel/hold attachment or linked row without retyping the list; or
category-colored chips (45/46's calendar event chips are the visual
precedent). A kit `Tag/Chip` primitive could host both if item 49's
`Button` work opens the door to kit primitives generally.

**Experimental-branch plan (when triggered)**:
- Work on an experimental branch ONLY; scope = a NEW `variant="tags"`
  (default untouched), wired into ONE place first — Link Manager multi
  rows (biggest density case).
- Interaction contract to evaluate: click chip = remove (and how it
  coexists with toggle-in-panel); Backspace on last chip removes it;
  typing appends a fresh segment; committed value stays raw comma-
  separated (invariant intact).
- Kill criteria: row wrap pain in Link Manager, keyboard-flow regressions
  in Glide/SceneSheet cell editing, double-affordance blur (chip × vs
  panel toggle). Survives → DESIGN-LANGUAGE update + rollout to remaining
  modal rows; fails → delete the branch (AGENTS.md rule 3 — no speculative
  abstractions).

**Verify**: probe spec exercising the new variant only; full suite green
with `variant="tags"` unused by default UI.

**Relations**: chip language + modal patterns from items 45/46; kit
primitive work out of item 49.

## 56. Promote shared bespoke components into @gabriel/ui-kit (`[ ]`)

DESIGN-LANGUAGE §Mental model #2: "All interaction primitives come from `@gabriel/ui-kit`… extend the
kit instead." The genuinely-shared components that are still app-local should move INTO the kit
(same migration pattern as DatePicker → v0.1.34), keeping 1-line re-export shims in `src/components/`:

- **`HoverTooltip` / `FloatingTooltip`** — rich-content (ReactNode) portal tooltips with smart
  positioning + hover delay; the kit's `Tooltip` is string-only, so this is an extension, not a
  duplicate. Used by day cells (violation/comment tooltips), `TravelHoldTooltip`, `ScheduleOverlays`.
- **`RuleCard`** — the shared rule card (light + dark themes, conflict-count badge, cast-aware
  `describeRuleDetailed`); used by the Rules tab + day modal Rules tab.
- **`EntityDropdown`** — the cast/element picker (multi/single/chip variants); the app's largest
  bespoke primitive, used everywhere.

Per item: bump `@gabriel/ui-kit` (`package.json` → `@gabriel/ui-kit#v0.1.x`), re-verify the
DESIGN-LANGUAGE §Primitive matrix + Recipes class strings, update this roadmap + the matrix in the
same commit. The events-mode day cells, section tabs, and icon-only buttons stay bespoke
(no kit primitive exists; icon-only is the documented exception).

## 97. Developer/agent API + MCP server for the app (`[ ]`)

**Relations**: extends the debug bridge (AGENTS.md §Agentic Debug Bridge);
must reuse the canonical `Action` union/reducer — no parallel mutation path.

**Progress (stage 1 — live bridge, shipped)**: `tools/mcp/` (MCP stdio server +
loopback WS helper, Origin/Host checks, proxy-on-busy) + `src/lib/agentBridgeClient.ts` /
`useAgentBridge.ts` + **File → Connect agent bridge**. Reads (`get_project`,
`list_scenes`, `get_schedule`, `list_entities`, `get_versions`, `get_schema`,
`get_scene_script` — one scene's breakdown + retained screenplay body, so agents
never need the whole script) and
writes (`apply_actions` atomic batch, `make_scene`, `undo`/`redo`) route through the
debug bridge; tool schemas/entity shapes are DERIVED from `reducer.ts`/`types.ts`
(`tools/mcp/actionSchema.mjs`). Blocked: `LOAD`/`EMPTY_TRASH`; read-only refused.
Docs: `docs/API.md`. Remaining for the full item: friendly write wrappers
(`edit_scenes`/`manage_entities`), pairing token + destructive-op confirmation +
audit/rate limits (security P1), project lifecycle / import-export / derived
analytics (P3), validation parity (P4), contract versioning (P5).

**Progress (stage 2 — schedule-op wrappers, shipped)**: the first task-shaped
write tools, backed by ONE shared pure module `src/lib/scheduleOps.ts` (also
consumed by `ScheduleTab`, so agent + UI share the ordering/day-break logic):
`move_row` (within/between stripboard + boneyard), `reorder_rows`,
`sort_rows` (hierarchical criteria — set → day/night → INT/EXT),
`auto_daybreaks`, `delete_all_daybreaks`, `add_row` (NOTE/BREAK/DAYBREAK).
Comparators moved to `src/lib/sortCriteria.ts` (re-exported by `SortDropdown`).
Retiming stays on the generic `UPDATE_ROW` path by design.

**Progress (stage 2b — Reports Designer surface, shipped)**: `get_report_registry`
(collections + field registry + block types, derived from `reportBlocks.ts`/
`reportFields.ts`), `get_report_design` (one full tree; seeded templates incl.
Call Sheet are the intended clone source), `make_report_block` factory, and
`list_entities` kind `reports`. Report entities (`ReportDesign`/`ReportBlock`/
`ReportTextStyle`/…) added to the derived schema (`ENTITY_NAMES`), snapshot
regenerated. Agents can now clone the seeded Call Sheet and customise it via
`ADD_REPORT_DESIGN`/`UPDATE_REPORT_DESIGN`.

**Progress (stage 2c — day, analytics & script reads, shipped)**: canonical
read-only computes exposed so agents see what the UI sees — `get_days` /
`get_day` (`buildDayViews`, the Day Manager model), `get_violations`
(`computeViolationIndex`), `get_element_stats` (`computeElementDayStats`),
plus `audit_script` / `repair_script` whitelisted and undo depth in
`get_bridge_status`. Project lifecycle / import-export remain out (the bridge
binds to the open project).
Stage 1 is **local-only for now**: the app offers the toggle only when it runs on
loopback (`isAgentBridgeAvailable`), the helper allowlists no hosted origin, and
the npm package under `tools/mcp/` is prepared but unpublished. Shipping the
feature to everyone = the desktop app (**item 145**); a hosted remote MCP would
require a backend and is not planned.

- **Goal**: expose the app's project data and mutation surface to external
  developers and AI agents as a supported, versioned contract — not just the
  internal debug bridge. **Agents must be able to WRITE, not just read** — full
  parity with what a user can do in the UI.
- **What exists today (not this)**: `window.__lemonSchedule`
  (`src/lib/debugBridge.ts`) is an in-page, DEV/`LEMON_AGENT=1`-only read/write
  window over the store, explicitly "dev tooling, not a product feature"; the
  repo's `opencode.json` Playwright MCP is browser automation, NOT an app API.
  Stage 1 now adds a local MCP server over that bridge (see Progress above);
  there is still no versioned public contract, auth or compatibility policy.
- **Future-proof by construction (hard requirement)**: the API must be DERIVED
  from the canonical surfaces, not a hand-maintained endpoint list — so every
  future feature is exposed automatically and the contract can never drift:
  - **Writes**: every dispatchable `Action` (the union in `store/reducer.ts`,
    the SAME one the UI uses) is reachable; adding a new action to the union +
    `ACTION_TYPES` makes it agent-reachable with no API edits. This is already
    the debug bridge's contract (AGENTS.md §Agentic Debug Bridge).
  - **Reads**: project state + computed rows/sections from the canonical
    selectors (`getRows`/`useDaybreakSections`, `computeRowData`), field/category
    metadata from the field registry + `ELEMENT_CATEGORIES`, and the reports
    designer's registry — never re-derive domain models in the API layer.
  - **MCP tools**: generated/wrapped from the same union + read surface (not
    one tool hand-written per feature), so a new roadmap feature needs no MCP
    change either.
- **Coverage = every persisted feature, by construction.** All 95 action types
  are one union, so the API reaches everything that stores data: scenes,
  schedule + calendar versions, **locations** (`ADD_/UPDATE_/DELETE_LOCATION*`),
  **crew** (`ADD_/UPDATE_/DELETE_CREW_*`), **production management**
  (`SET_PRODUCTION_INFO`, day types), categories/elements, rules, ribbon/color/
  report designs, trash restore. The three layers to design for:
  1. **Persisted data (actions)** — free for every current *and future* feature
     that routes through the reducer.
  2. **Derived/read output** (report pagination + field registry, computed rows,
     DOODs, print payload) — expose the canonical selectors, don't re-derive.
  3. **Business logic above the reducer** (element-link propagation,
     `addNewElement`, import commit, cascade deletes) — expose the shared
     helpers, or agents bypass the rules the UI enforces.
- **Future custom databases**: covered only if the API is registry/generic-
  driven (one generic entity surface + the category/DB registry, à la
  `DatabaseManagerView`), never hand-coded per manager.
- **Versions & calendars (in practice)**: both axes are fully reachable —
  schedule versions via `NEW_/SET_ACTIVE_/RENAME_/DELETE_/UPDATE_VERSION` +
  `UPDATE_ROW`/`RESTORE_VERSION_FROM_TRASH`; calendar versions via
  `NEW_/SET_ACTIVE_/RENAME_/DELETE_/UPDATE_CALENDAR_VERSION` +
  `RESTORE_CALENDAR_VERSION_FROM_TRASH`. Two invariants the API must enforce:
  - calendar-field writes go ONLY through `UPDATE_CALENDAR_VERSION` (never
    `UPDATE_VERSION` with calendar fields — the single write path), so expose
    the correct action and don't let agents pick the wrong one;
  - the two axes are independent — switching the active calendar version
    recomputes stripboard section dates/call times on purpose, so the read
    layer should report which calendar version produced `getRows` output.
- **Gaps beyond the reducer (must also design — the union alone is NOT the
  whole API)**:
  - **Project lifecycle** — create/open/delete/rename/duplicate/
    `importProjectFromData` live in `provider.tsx`, NOT the reducer, and the
    debug bridge doesn't expose them; without them an agent can only edit the
    currently-open project. Expose the provider methods too.
  - **Import/export** — `.lemon` export, CSV/FDX/Fountain append, MSD/SEX
    new-project (`src/lib/import/`); not actions.
  - **Derived analytics** — rules violations (`checkAllDays`), DOODs
    (`deriveDood`), `computeElementDayStats`, report pagination/`reportData`,
    print payload; expose the canonical functions as reads.
  - **Cloud vs local + `readOnly`** — cloud projects are filtered out of the
    localStorage index; Drive/auth is separate. Handle both project sources and
    refuse writes while `readOnly`.
  - **Concurrency** — agent + user (or two agents) editing the same project is
    last-write-wins with no conflict detection today; decide a strategy
    (serialize / optimistic version check / document the limitation).
  - **Destructive-op safety** — deletes/empty-trash need explicit intent;
    undo/`batch` must be first-class affordances.
  - **Schema introspection/discovery** — agents need action shapes + field
    names (JSON schema / MCP resources) or they guess.
  - **Validation parity** — the reducer is permissive; the UI validates (cast
    uppercasing, day types, entity naming). Mirror that validation or the API
    can create invalid state.
  - **API versioning** — contract version + deprecation policy.
  - **Out of scope (not project data)**: local UI prefs — view mode, cell
    borders, sheet order, selection cursors.
- **Scope (agree with the user before implementing)**:
  - **API surface**: reads (`getProject`, `getVersion`/`getRows`, scenes,
    calendar versions, entities) + writes (the `Action` union) — typed +
    versioned.
  - **MCP server**: tools wrapping that surface so agents can inspect/drive a
    project; decide transport (stdio vs HTTP), auth, and whether it targets a
    live app session or a `.lemon` project file.
- **Security model (dedicated — this is a static browser app, so an API changes
  the threat model; the debug bridge is DEV/`LEMON_AGENT=1`-gated, a supported
  API needs stronger)**:
  - **Exposure surface**: never a public endpoint on the deployed
    `/lemon_schedule/` site — local-only + explicit opt-in + per-session token,
    off by default in production.
  - **Local bridge/companion**: bind `127.0.0.1` only (never `0.0.0.0`);
    per-session secret handshake; validate `Origin` AND token (WebSockets/HTTP
    to localhost are reachable by any webpage — origin alone is spoofable);
    DNS-rebinding protection (`Host` check); CORS restricted to the app origin.
  - **Secrets**: never expose/log the Google OAuth token/session (AGENTS.md
    §Security; it stays in `useRef`/sessionStorage); minimal Drive scope; env
    only; respect `readOnly` (refuse writes offline).
  - **Authorization + destructive ops**: decide who may call (local user vs
    third-party) and enforce; human-in-the-loop confirmation for deletes/empty-
    trash/import-overwrite (MCP recommends a human able to deny tool calls +
    clear UI when a tool fires); make deletes undoable.
  - **Prompt injection via project data**: scene names, notes, element labels,
    imported files are attacker-controllable — treat as untrusted data, never as
    instructions; mark tool outputs untrusted.
  - **File access** (file-based transport): use File System Access API
    user-granted handles, never arbitrary paths (path traversal/symlink); scope
    to the chosen project file.
  - **Abuse & audit**: rate-limit calls, cap batch/payload size, audit-log
    invocations without secrets.
- **API design best practices** (sources: MCP tools spec, Google AIP-121/122/
  155/158/162/180):
  - **Resource-oriented reads, task-oriented writes** — clean nouns + stable IDs
    to read (`get_project`, `list_scenes`, `list_cast`, `list_versions`), but do
    NOT expose 95 raw action tools; group writes into a few well-described tools
    (`edit_scenes`, `edit_schedule`, `manage_entities`, `apply_actions`). MCP:
    few clear model-legible tools beat a huge flat list.
  - **One way to do each thing** — no overlapping paths (e.g. calendar writes
    only via `update_calendar_version`).
  - **Version the contract** + additive-only back-compat (AIP-180/185);
    breaking change = new major + deprecation window.
  - **JSON Schema on every input AND output** (MCP `inputSchema`/`outputSchema`)
    + **introspection/discovery** so agents don't guess field names.
  - **Idempotency + request IDs** (AIP-155) for safe retries; destructive ops
    idempotent.
  - **Two-tier errors** (MCP): protocol errors vs tool-execution errors
    (`isError:true`) with actionable, self-correcting messages.
  - **Atomicity** — batch related writes as one unit (existing
    `BATCH_START`/`COMMIT` = one undo).
  - **Concurrency** — revisions/optimistic checks (AIP-162) so agent + user
    edits don't silently clobber.
  - **Pagination/filtering/field masks** (AIP-158/157/160) so big reads don't
    dump megabytes.
  - **Safety** — validate inputs, access-control, rate-limit, sanitize outputs,
    never expose tokens, human-in-the-loop confirmation for destructive ops,
    audit log of invocations.
- **Reuse, don't fork**: build on `src/lib/debugBridge.ts` read/write helpers +
  the `Action` union/reducer so there is one source of truth; do not create a
  second mutation pipeline.
- **Open questions**: audience (internal agents vs third-party devs),
  local-only vs hosted, file-based vs live-session, and whether to promote the
  debug bridge into the supported public API or keep the two separate.
- **Docs deliverables (required when implemented, not before)**:
  - **API reference** — generated or hand-written: every resource/tool, input +
    output schemas, errors, examples. Keep it generated from the schema so it
    can't drift.
  - **Maintenance docs** — a `docs/API.md` (or similar) covering architecture,
    the transport, how to add a new action/tool so it stays auto-exposed, the
    security model, versioning/deprecation, and the test story.
  - **README update** — a short "Developer API / MCP" section pointing to the
    reference + maintenance doc, with setup for the MCP client.
  - **AGENTS.md** — add the API/MCP invariants to the canonical rules so future
    workers extend it correctly (replaces "dev tooling only" for the promoted
    surface).
  - Update `docs/DESIGN-LANGUAGE.md` only if new shared UI (e.g. consent/confirm
    surfaces) is introduced.
- **Implementation shape / effort** (the core is largely reusable):
  - Already reusable: the reducer is nearly pure (`store/reducer.ts` +
    `actions/*.ts` only touch `Date.now()` — no `window`/`localStorage`/DOM),
    so it runs in Node; `storage.ts` isolates the only browser dep
    (`localStorage`) to load/save; `debugBridge.ts` already does reads/writes/
    factories/batch/undo/`onAction`; canonical reads + Playwright MCP exist.
  - Phased: **P0** schema/introspection + generic `apply_actions` + reads over
    the existing bridge (S) → **P1** resource read tools + friendly write
    wrappers (M) → **P2** file-based Node MCP reusing the pure reducer + swapped
    storage (M) **or** live-session companion + WebSocket (L) → **P3** project
    lifecycle + import/export + derived analytics (M–L) → **P4** validation
    parity via shared helpers (M) → **P5** docs/tests/versioning (M).
  - Biggest risks: load/migration pipeline outside the browser (coupling +
    possible DOM deps in `lib/`), live-session security, concurrency,
    tool ergonomics across 95 actions, validation drift.
  - Cheapest path to value: file-based MCP reusing the pure reducer on a
    `.lemon` file; defer the live-session companion until agents must drive the
    running UI.

**Verify**: TBD once scope is agreed.

## 125. Storage overhaul — delta pack, normalization only if needed (FUTURE, parked) (`[ ]`)

**Relations**: follow-on to 124 (**DONE** — `src/lib/projectCodec.ts`); build
125 only if 124 plus real usage still produces large files or quota pressure.
This is the deferred "archived-versions hub" storage layer referenced by 123.

**Problem, measured**: every `ScheduleVersion` stores a full `rows` array
(`types.ts:164`), and version trash keeps up to 10 full copies (39% of the seed
file). Rows are ~155 bytes each, dominated by repeated UUIDs + per-version
metadata.

**Approach A — delta pack (recommended first; model unchanged)**:
- Persistence codec: store the project base once + each extra snapshot
  (versions, trash) as a row-level delta against the previous snapshot (jsdiff
  `diffArrays` keyed by row id, or content-address identical rows); stack gzip
  after the delta.
- Add a `_storageFormat` marker; decode old + new on load; migrate on first
  save. No reducer/model change → blast radius is a codec + migration tests.

**Approach B — normalize the model (last resort)**:
- Split row identity (type, sceneId, note/break content) from per-version state
  (order, container, daybreak call time/meta, description override): a canonical
  row table + versions as ordered manifests, content-addressed.
- Breaks the "`ScheduleVersion.rows` is the single source of truth for stripboard
  order" invariant (AGENTS.md) → large blast radius: reducer, rows computation,
  drag/drop, daybreak/insert logic, calendar, import, print.

**Decision point**: measure first; build A only when 124 is insufficient, B only
if A is.

**Verify**: encode/decode round-trip; migration from plain + 124 formats; every
row-version behavior unchanged; `npm run lint` + `npx playwright test`.

## 133. Standalone script-diff app (+ PDF screenplay import) (`[ ]`)

**Relations**: extracts/reuses **38**'s diff engine (`src/lib/import/scriptDiff.ts`),
**128**'s aligned review UI (`ScriptUpdateModal` + `alignScriptBlocks`) and **123
Phase 0**'s retained body model — do NOT fork a second diff. New prerequisite:
**PDF screenplay parsing** (PDF import is explicitly out of scope for 123/38
today). Vision + detail: `docs/SCRIPT-DIFF-APP.md`.

**Idea (note to self)**: the script diff turned out really good — spin it out as
a **standalone tool**: load ANY two scripts (FDX/Fountain, ideally PDF) and read
the diffs side by side, with no film/project attached. Either a separate
app/site, or a project-less mode in this app.

**Blocker**: **PDF screenplay import** — PDFs carry no semantic structure, so it
needs text extraction + screenplay-format heuristics (scene headings, dialogue,
page eighths, dual dialogue, revision marks). Hard and error-prone; treat as its
own research spike (OCR of scanned/image PDFs is a further step). Nothing here
is schedule-committed.

**Reuse**: `ScriptDocument` / `ScriptBlock` + `diffScripts` matching + the 128
aligned renderer are format-agnostic once a parser emits a `ScriptDocument`, so
the standalone tool is essentially "two `ScriptDocument`s → the 128 view" behind
a thin shell. Ship only if it's genuinely low-effort on top of the existing
pieces; otherwise park.

## 137. AI script-breakdown suggestions (Filmustage-style) (`[ ]`, FUTURE, parked)

**Relations**: `depends on` **136** (the dotted→solid suggestion pipeline + the
category menu) and **97 P0+P2 only** — the intended unblock is the cheap slice
(JSON schema/introspection + generic `apply_actions` + reads, then the file-based
Node MCP reusing the pure reducer on a `.lemon`), NOT the full item's live-session
companion/auth/versioning; prompt-injection/untrusted-data rules still apply when
project data reaches a model. `related to` **43**/**41** (import tags).

**Idea**: an opt-in pass that proposes elements (props / wardrobe / vehicles /
VFX / …) per scene from the screenplay body, surfaced as recognized spans/rows
for human confirm — NEVER auto-commit. Parked because the deterministic
known-element matching in **136** ships the same value cheaply; AI needs
accuracy, consent and cost decisions first.

**Verify**: TBD when unparked.

## 140. Reports designer — rich-text table title (top-left, opt-in) (`[ ]`)

**Request**: table-shaped blocks get an optional title rendered top-left
ABOVE the block in designer, preview and print. Off by default; when on it
starts as the block's auto label (`scopedCollectionLabel` / `tableOverLabel`
— e.g. "Scenes", "Crew Table") and the user can type anything, including
`{{field}}` tokens and `@` item lookups. No title when the block renders
nothing.

**Blocks**: `table` (columns/rows + custom rows), `callTimes`, `crewTable` —
NOT repeat/relative.

**Approach**:
- New optional `ReportBlock` props (no migration): `title?: string`
  (rich-text HTML + tokens), `showTitle?: boolean`, `titleRepeat?: boolean`
  (repeat on every pagination fragment; default off = first fragment only).
- One small shared title renderer used by `ReportTableView`
  (`ReportBlockView.tsx:660`) and `ReportGridBlock`; an empty `title` falls
  back to the block's auto label. Left-aligned, above the table header,
  inheriting `getReportBlockBaseStyle`.
- Reuse the existing token recipe — do NOT build a new editor/parser:
  designer (`hint`) edits via `RichTextEditor` + `fields`/`lookupTokens`
  (the `CustomCellEditor` recipe, `ReportBlockView.tsx:762`); preview/print
  resolve via `resolveReportTokensHtml(ctx, fieldMap, block.title, item, aux)`
  (`ReportBlockView.tsx:836`).
- Emptiness: the title lives INSIDE the existing `null` return path, so
  preview/print omit it when the collection is empty; the designer skeleton
  still shows it.
- Pagination: tables dissolve into row fragments — render the title with the
  first fragment, and (with `titleRepeat`) on each continuing fragment,
  mirroring `repeatTableHeader`/`rowRange` in `ReportChunkPage`. The title
  must count toward the measured page budget.
- Controls in `blockControls.tsx` Content: table branch (`:1027-1113`) and
  `callTimes` branch (`:1186`) — token-capable "Title" field, "Show title"
  checkbox, "Repeat on each page" checkbox (shown only when enabled).
- Docs: `docs/REPORTS-DESIGNER.md` (props + recipe); `docs/DESIGN-LANGUAGE.md`
  only if a new control recipe appears.

**Verify**: visual (AGENTS.md rule 7) — manual: title shows in
designer/preview/print, blank → auto label, off → gone, empty collection → no
title, `{{field}}`/`@` resolves, forced page split honors the repeat toggle.
Add a targeted `report-page-breaks` case ONLY if the title turns out to be
duplicated/dropped/miscounted across fragments.

**Relations**: 111/112 (grid blocks), 100 (same chrome header), 121 (`@` token
picker); read `docs/REPORTS-DESIGNER.md` first.

## 142. Unified Day workspace — the Call Sheet becomes the Day Manager (`[ ]`, big)

**Request**: merge the Day Manager and the Call Sheet editor. Production →
Days lands on the day's call sheet as the main view; the day's data panels
(details, locations, events, conflicts, breaks, crew, scenes, call times) live
in a rail inside the same workspace; the block palette appears ONLY in layout
mode; inputable values (day note, general call, master location, breaks) are
editable where they render; empty states are CTAs ("No crew on this day" →
Add crew…).

**Why**: the two surfaces are one job split by surface — the light Day Manager
edits data, the dark full-surface editor edits the artifact, and the user
shuttles (`DayManagerPage.tsx:188-211` page swap; the editor can only write
the zone + call-times/crew grid overrides). Split by INTENT instead: **fill
the day** vs **shape the sheet**.

```
FILL (default)                           LAYOUT (toggle, or click a block)
┌───────────────────────────────┐        ┌───────────────────────────────┐
│ ‹ DAY 12 › ·Work· ⚠2          │        │ ‹ DAY 12 › [Design▾][Reset]   │
│            [Print] [Layout]   │        │            [Print] [Layout ●] │
├────────┬──────────────────────┤        ├───────────────────────┬───────┤
│▾Details│  ┌────────────────┐  │        │ white page + drop     │BLOCKS │
│ ▸Loc.  │  │  CALL SHEET    │  │        │ zones; block chrome   │ Text… │
│ ▸Events│  │  live data,    │  │        │ when selected         │ATTRS  │
│ ▸Crew  │  │  editable      │  │        │ (rail collapsed)      │ Day…  │
└────────┴──────────────────────┘        └───────────────────────┴───────┘
```

**Design**:
- **One host, sheet main.** `DayManagerPage` stops page-swapping: shared
  header + data rail + the existing `CallSheetCanvas` as the main pane (reuse
  it, `InteractiveGridBlock` and the zone designer untouched — one canvas).
  The light sections page goes away as a separate screen; its panels become
  the rail.
- **One header**: `< DAY N >` picker (week-grouped, conflict badges), date +
  type, Copy from day, Production details, Call Times settings, Pop out,
  Print, and a **Layout** toggle. Design picker / Reset / Times move inside
  Layout (they change the template, not the day); Preview stays a view toggle.
- **Data rail**: the existing `DAY_SECTIONS` registry components rendered
  compactly (accordion / icon rail, one-or-two panels open, persisted) —
  props-in/patch-out unchanged, no fork. Narrow/iPad: drawer/bottom sheet,
  never two squeezed panes.
- **Two intents, never mixed.** Fill: rail + in-place edits, NO palette,
  chrome or drop zones. Shape (`Layout` toggle, or click a zone block → enters
  Layout with it selected): design picker + palette + block chrome + drop
  zones + Reset; enforce `blockAllowedIn` in the zone designer (today only the
  full designer guards it, `ReportDesigner.tsx:223-231`).
- **In-place editing v1 (minimal mapped set)**: day note, general call,
  master location, breaks — click the rendered value on the sheet, edit with
  the existing primitive (`TimeField`/`CellInput`/`EntityDropdown`) through a
  small field→writer map (existing `patchMeta`/`patchRow` writers) — not
  per-field hacks. Call-times/crew grids stay editable as today.
- **Empty states are CTAs**: Crew → `Add crew…` (grouped picker + "Use usual
  crew", reuse `GroupedSelect`); Locations → `Set master location…`; Events →
  `Add event…`; Call Times → `Set up call stages…`; Scenes → open in Schedule.
- **Cross-highlight rail↔sheet**: scene hover already highlights strips (item
  115); extend to crew/scenes/call-times selections; the conflict pill jumps
  to the Conflicts panel.

**Phases** (each independently shippable): 1) host merge (workspace layout,
one header, delete the page-swap branch); 2) layout mode (palette/chrome/drop
gating + click-block entry + `blockAllowedIn` guard); 3) CTA empty states;
4) in-place editing (mapped set + field→writer map); 5) polish/docs (persisted
rail/layout prefs, HelpModal, `docs/DESIGN-LANGUAGE.md` +
`docs/REPORTS-DESIGNER.md` zone section; `docs/DAY-WORKSPACE.md` only if the
surface earns a manual).

**Non-negotiables**: one canvas (no fork); one write path (`daybreakMeta` on
the governing DAYBREAK; `patchDayMeta`/`UPDATE_ROW`); sections stay
props-in/patch-out; zone content stays per-day per-design; print/preview
output unchanged; `readOnly` respected.

**Open at implementation**: single white canvas vs paginated page stack as the
default pane; rail side and default collapse; iPad control shape
(`Fill | Sheet | Layout`).

**Verify**: `e2e/day-manager.spec.ts` + `e2e/call-sheet-day.spec.ts` stay
green; new e2e: palette hidden in Fill / visible in Layout, a CTA adds crew
through the picker, zone edits still persist per day; manual iPad pass.

**Relations**: builds on 98/99/101/110-118 (all DONE), supersedes D21's
`Manage | Call Sheet` toggle and the removed `CallSheetSection`; touches
111/112 grids and 113/114 call-sheet chrome; related to 140/141. **User note
(176)**: the Day Manager and the Call Sheet editor now navigate as separate
history places with memory — the user wants them kept separately navigable;
this merge would supersede that split.

## 145. Desktop app (Tauri) hosting the web UI + local MCP server (`[ ]`)

**Relations**: `supersedes` the distribution half of **97** (the live MCP bridge
stays; the ship path to everyone moves here). `depends on` 97 stage 1.

- **Goal**: one downloadable macOS/Windows app that renders the existing web UI
  and hosts the MCP server on `127.0.0.1` in the same process — agent editing
  for any user, no Node/npx, no config editing, data never leaving the machine.
  This is the **Figma Dev Mode** model (the desktop app runs the MCP server on
  localhost; clients connect to it). Chosen over a hosted remote MCP (needs a
  backend / accounts) and a hosted relay (needs auth, sessions, uptime).
- **Approach**:
  - Wrap the built `dist/` in Tauri (system webview, small binary); keep the web
    build + `/lemon_schedule/` base unchanged so both targets share one source.
  - Run the existing `tools/mcp/` helper as the app's sidecar: it already speaks
    stdio MCP + loopback WS, and the app already connects out — no bridge rewrite.
  - Drop the loopback gate in the desktop shell (`isAgentBridgeAvailable`) so the
    toggle shows for every user; first-run writes/copies the MCP client config.
  - Add the security work item 97 deferred: per-session pairing token +
    destructive-op confirmation + an audit log, since the helper ships to
    non-developers now.
- **Open questions**: signing/notarization + auto-update channel; desktop-only vs
  desktop + hosted site; macOS first vs both; where project files live (app
  storage vs user-chosen `.lemon` folder).
- **Verify**: packaged app launches UI + helper; a real MCP client creates,
  edits and undoes a project end-to-end; helper is unreachable from non-app
  origins; project data survives app restart.

## 146. Crew per day — department-slot roster, template + Add Crew Member modal (`[ ]`, big)

**Request**: rebuild the Day Manager's crew management. Crew is grouped by
department (catalog order + "Other"); each department shows one slot per role
(deduped, auto-filled from the roster), a person dropdown, a static call box
that survives switching the person, an include/exclude toggle, and a
department pre-call anchor. A project-level **crew template** (full
arrangement) replaces "Usual crew"; "Apply template" / "Copy from day" restore
a day. A shared **Add Crew Member modal** (name/phone/email + role) serves the
day-slot/template entry points; the Crew Manager's add button stays an inline
blank row (user decision, debug report — no modal there).

**Call chain**: day call → dept pre-call resolves against the day call = dept
call → slot override resolves against the dept call; `noCall` wins over
everything. Replaces `resolveCrewCall` (a semantic change: existing relative
overrides previously anchored on the day call).

**Model**: `DayCrewSlot { id, role, personId?, callTime?, noCall?, note? }`.
`DayMeta.crewSlots` + repurposed (currently dead) `DayMeta.departmentPrecalls`
(day override) + `DayMeta.excludedCrewDepts`. `CrewTemplate` becomes a full
arrangement (`slots`, `excludedCrewDepts`, keeps `departmentPrecalls`), always
present (auto-derived from the roster when unset). One owner
`src/lib/dayCrew.ts` (`slotsForDay`, `groupSlotsByDept`, `resolveSlotCall`,
pure mutations).

**Phases** (each shippable): 1) model + migration + `dayCrew.ts` + read path
(`dayView`, `reportData.crewOfDay`/`departmentCallsOfDay`, `reportGrids`);
2) shared `CrewRosterEditor` built on `InlineGlideTable` (per-department
table: Role · Person dropdown · Call, dept header include+pre-call, "+ Add
role") hosted by the Day Crew section and the Call Times "Crew template" tab;
3) `AddCrewMemberModal` for the day-slot/template entry points ONLY — the
Crew Manager's add button appends an inline blank row (user decision, debug
report) + `ManagerShellConfig.addModal`; 4) call-sheet crew table grouped by
department + docs.

**Non-negotiables**: `daybreakMeta` on the governing DAYBREAK; one write path
per concern; sections stay props-in/patch-out; use `InlineGlideTable` (not a
bespoke row list); migration runs on local load (`storage.ts`) AND
`readDriveProject`; `slotsForDay` derives defensively if unmigrated (no crew
data loss).

**Verify**: `npm run lint`; Vitest for the anchor chain (`dayCrew`), migration,
defaults/noCall; targeted e2e for slot persistence, person-swap-keeps-call,
dept exclude, template apply, Add-modal role correctness; the rest is rule-7
manual (numbered hand-off).

**Relations**: supersedes the "Usual crew" concept (item 99) and the flat/
person-keyed `crewCalls` write path (items 101/106/112); touches 111/112 grids;
related to **142** (Day workspace) and **148** (crew glide Links).

## 156. Crew table block — contact details + "Report to" (`[ ]`)

**Request**: the `crewTable` report block needs **report-to** info (who/where
the crew reports to — location/contact; user-confirmed not a time).
- SHIPPED: Phone/Email columns (static `CREW_FIXED` + the interactive
  `CrewTableGlide`) — `reportGrids.ts`, `CrewTableGlide.tsx`.
- Remaining: decide the report-to source (per-person/per-slot field on the
  item-146 crew model vs crew links) — one owner, no parallel model.
- **Verify**: rule-7 manual + `e2e/report-grid-blocks.spec.ts` only if the write
  path changes.
- **Relations**: 112, 146.

## 157. Cast performer ("Artiste") — person + contact details on cast elements (`[ ]`, big)

**Request**: a cast element is the character; users must record the actual
performer playing them — name + contact details like crew has (phone/email) —
shown in the cast call-times block (labelled "Artiste") and available to
reports.
- Scope first: decide the model — extend `CastMember` (`types.ts`) with
  performer fields or link a crew-person record (reuse item 146's crew person
  shape; never duplicate `project.crew`). One source of truth; migration on
  local load AND `readDriveProject`.
- Surfaces: Element Manager cast table/columns, `ELEMENT_CALL_FIELDS`
  (`reportFields.ts:230-236`) + call-times block labels, cast report fields.
- **Verify**: Vitest for migration + read model; targeted e2e only if
  call-times output changes (wrong name/contact = silent).
- **Relations**: 111, 146; 11/44 are links, not the store.

## 158. Reports designer — Requirements table block (FUTURE, parked) (`[ ]`)

**Request** (future): a Requirements table block (reports designer, user
decision). Scope TBD at unpark: what rows/columns and where the requirements
data comes from.
- Parked knowingly — no data model exists yet (rule 3; don't speculate).
- When unparked, reuse the 111/112 grid recipe (`reportGrids.ts` +
  `ReportGridBlock`) — never a new table engine.
- **Relations**: 111, 112.

## 159. Reports designer — Precalls table block (`[ ]`)

**Request**: a table block showing the day's department precalls (department →
resolved call), sibling of Call Times / Crew Table (reports designer, user
decision).
- Reuse the canonical `departmentCallsOfDay` collection (item 99) + the
  111/112 grid seam (`reportGrids.ts`, `ReportGridBlock`); palette entry next
  to Call Times / Crew Table; editable-in-place only if the call-sheet editor
  should edit precalls (decide at implementation).
- **Verify**: rule-7 manual + `e2e/report-grid-blocks.spec.ts` only if writes.
- **Relations**: 99, 111, 112.

## 160. Reports designer — page setup: margins, document size, scaling (`[ ]`)

**Request**: designer controls for page margins + document size + page scaling
(user-confirmed: designer page scaling, print included). Today
`ReportDesign.page` is portrait/landscape only (`types.ts:765-775`) and margins
are hard-coded (`src/components/reports/reportStyle.ts:37-42`, A4 − 12mm;
`@page` in print CSS).
- Add page geometry to `ReportDesign` (size, margins, scale) with today's
  values as defaults; ONE metrics source feeds designer canvas, preview, print
  and the paginator's page-height math.
- **Verify**: `e2e/report-page-breaks.spec.ts` must stay green (pagination
  math) + manual; migrate existing designs.
- **Relations**: 140/142 (designer chrome), 3.

## 163. Script tab performance — render is unacceptably heavy (`[ ]`)

**Request** (debug report, escalated): the Script tab renders too slowly and is
heavy — "performance is really unacceptable". Likely suspects, verify by
profiling before changing anything:
- the tagging derivation recomputes attached spans + suggestions for EVERY
  scene on every project change (`attachedRanges`/`suggestionRanges` scan each
  element × each block — `src/lib/scriptTagging.ts`, `useScriptTagging`);
- full-document re-render on selection/hover, `ScriptTagging` overlay
  recompute/scroll listeners, scene-index rebuilds (`ScriptView.tsx`,
  `src/components/script/*`).
- **Deliverable**: a measured fix using the existing perf tooling
  (`docs/PERF-DIAGNOSIS.md`); behavior unchanged. Evaluate virtualized/windowed
  rendering for the script body (e.g. `react-window`/`react-virtuoso`/TanStack
  Virtual) and/or foveated/priority rendering (render the viewport, degrade the
  rest) — look online for current libraries/methods and pick the smallest one
  that clears the budget; new deps must be imported by ≥1 source file.
- **Verify**: before/after profile + `npx playwright test e2e/script-*.spec.ts`
  green (README: existing perf harnesses are `@perf`-tagged).
- **Relations**: 123/132/136.

## 164. Day Manager — add an element to a day's Call Times (`[ ]`)

**Request**: in the Day Manager Call Times section, allow adding an element
(cast etc.) to the day even when it appears in no scheduled scene (e.g. a
fitting), so it lands on that day's call sheet.
- Extend the day-scoped element set: resolver `elementCallsOfDay`
  (`reportData.ts`) + `DayTimesGlide` reads; write per-day additions on the
  governing `daybreakMeta` (item 99/101 convention, `dayMeta.ts`) — one source
  for grid + report + call sheet.
- **Verify**: Vitest for the resolver; extend `e2e/day-times-glide.spec.ts`
  (wrong call time/count = silent).
- **Relations**: 99, 107, 111, 146.

## 171. Day Manager locations overhaul + drop nearest hospital/police (`[ ]`, big)

**Request**: the day's location attachment is bad — the dropdown cuts off and
shows too much. Rebuild the Day Manager **Locations** module like the crew
system: pick the **master location**, then add any number of additional
locations (unit base, hospital, police station, …) as an ordered slot list with
add/remove + type picker. The Locations manager stops carrying nearest
hospital/police links (user decision; supersedes item 53's fields) — those are
set manually per day instead.
- Scope: `production/day/sections/LocationsSection.tsx` → slot list (146's
  roster pattern); remove `nearbyHospital`/`nearbyPolice` from
  `locationManagerConfig.tsx` (fields, merge plan, blank row) + `Location.nearby`
  (`types.ts:555-558`) with a migration/prune; day writes stay `daybreakMeta`
  (`dayMeta.ts`); keep `getReportLocation` / `locationsOfDay` truthful.
- **Verify**: Vitest for migration + resolver; targeted e2e for day
  persistence; module is a rule-7 manual pass.
- **Relations**: 98, 53 (supersedes its nearby-fields part), 109, 146.

## 172. Managers + Glide — deep search, jump-and-flash, table filtering (`[ ]`, big)

**Request**: the managers' left search must also search **inside** categories
and attributes (e.g. "Roy" → crew roles containing Roy; phone numbers).
Clicking a result opens that category, scrolls to the match and briefly flashes
the matching row(s) red (scroll only to the first). Universal for all manager
pages. Glide tables get a row **filter** (show only matching rows). Multiple
tags via commas — consider reusing the rich-text chip/token system for search
tags.
- Approach: one shared search module (parse comma tags → per-manager field
  accessors from the manager configs) consumed by `managerShell.tsx` (sidebar)
  and `ElementManager.tsx` (scroll + flash); Glide filter in `glideShell.tsx` /
  `InlineGlideTable`. Evaluate a small fuzzy lib (fuse.js / uFuzzy) — no new dep
  unless it clearly beats a tokenizer (deps must be imported by ≥1 source file).
- **Verify**: Vitest for the query/tag parser; e2e for flash/scroll + glide
  filter (rows silently disappearing = break).
- **Relations**: 121, 84, 88, 139-145.

## 174. Call Times — label audit (`[ ]`, parked)

**Request** (debug report): audit and fix the Call Times labels — stage headers,
category/department names in the Call Times modal and the day grids.
Enumerate the wrong ones with the user before changing copy.
- **Parked (user, this session)** — no concrete wrong labels could be named;
  revisit only if a specific example is reported.
- Pointers: `production/day/CallTimesSettingsModal.tsx`, `DayTimesGlide.tsx`,
  `CrewRosterEditor.tsx`, `CallTimesSection.tsx`/`CrewSection.tsx`.
- **Verify**: rule-7 manual.
- **Relations**: 110, 146; split out of 173.

## 182. Nested submenus on touch — iOS-style replace-in-place (`[ ]`)

**Request**: on touch devices a submenu should present over/near its parent —
the parent card scales down and fades while the child opens (Apple's mobile
menu pattern), instead of the desktop side-placement that can land off-screen.
- Kit `DropdownSubmenu.tsx`: coarse-pointer (`useTouchMode`) presentation only —
  child anchored to the parent card (same rect + slight offset), parent
  scale-down + fade via `useOverlayMorph` (`playOverlayOpen/Close`), a back
  affordance in the child; desktop keeps the Radix side placement.
- **Verify**: playground spec under the `ipad` project + app iPad manual pass.
- **Relations**: 165 (positioning engine), 64, 69-71.

## 191. Reports designer — inline rich-text editing + ONE shared chrome for text blocks and free-table cells (`[ ]`)

**Request**: one rich-text experience across the designer's two free-text
surfaces. Click selects; double-click (desktop) or tap-again-on-selected
(coarse, item 17) types in place on the canvas instead of in the chrome; ONE
floating chrome serves both surfaces — same header shell and the same Format +
Style body — with only the header actions and extra rows contextual (block:
empty behavior/structure/Padding/Outline/chip affixes; cell:
merge/unmerge/reset, vertical align, range). The atoms are already shared
(`reports/RichTextEditor.tsx` + `reports/RichTextFormatBar.tsx`, roadmaps
188/192/193), but the chrome BODY is wired twice (`CustomCellControls` vs the
text branch of `ContentControls`/`StyleControls`) and a text block still edits
inside the chrome. Extends the original inline-editing item with the user's
unify-the-rich-text-editing ask (2026-10-02 session).

**Design**:
- **Shared body**: extract `reports/RichTextControls.tsx` — the Format row
  (existing `RichTextFormatBar`) + the Style row (named `TextStyleMenu` +
  horizontal align; a `verticalAlign` slot rendered only for cells). Consumed
  by `CustomCellControls` and the text case of `BlockEditorContent`; horizontal
  align moves out of `StyleControls` into the shared row (field blocks keep
  whole-block font/size/B/I + Outline; text blocks keep Padding + chip-affix
  rows). No second row wiring anywhere.
- **Inline editing**: the canvas text block (`ReportBlockView`'s `text` case,
  gated `hint && !!onPatchBlock` like `CustomTable`) renders the app
  `RichTextEditor` adapter (tokens as chips, `@` incl. the 121 two-stage
  picker, `resolveToken`). WYSIWYG in the block's computed
  `getReportBlockBaseStyle` typography so size/line breaks/alignment match
  preview/print; empty blocks show the placeholder.
- **One editor channel**: the composition root owns ONE active editor handle +
  `RichTextState`, mirroring the existing `cellEditorRef`/`cellRtState`
  (`ReportDesigner.tsx`) — a small `ReportInlineEditorContext` register/get by
  block id or an equivalent ref channel. The floating chrome, docked rail and
  top toolbar bind the shared body to that instance; the chrome's own Content
  text editor is deleted (one editing surface, no duplication).
- **Same affordance language**: an editing block wears the focused-cell
  outline; canvas drag/edge-zones/drop targets for that block are suppressed so
  text selection never starts a drag (drag resumes on blur); clicking another
  block/Escape commits (`onPatch({ text })` per change — the CustomTable
  pattern). The floating chrome clamps so it never covers the first line; the
  docked rail is the roomy fallback. Selection still marks all instances of a
  repeated template; editing one edits the template (same as editable cells).
- **Not unified (deliberate)**: the block/cell DATA models — a text block is
  never a 1×1 table (pagination, drag, outline and token semantics stay
  block-specific); field/link blocks keep their chrome inputs; cell/table
  context menus stay structure-specific. Preview/print never render an editor.

**Files**: `reports/RichTextControls.tsx` (new — the shared Format+Style body),
`reports/CustomCellControls.tsx` (render the shared body; keep the merge header
+ V-align), `reports/blockControls.tsx` (text case renders the shared body
against the canvas instance; drop the duplicate editor + Style-row wiring;
`StyleControls` loses H-align for text), `reports/ReportBlockView.tsx` (text
case renders the inline editor when hint+onPatchBlock),
`reports/ReportDesignerCanvas.tsx` + `reports/ReportDesigner.tsx`
(editor-handle channel, edit-mode state, drag suppression),
`reports/RichTextEditor.tsx` (no change expected — same adapter), `index.css`
(inline editor affordances / placeholder / focus outline),
`docs/REPORTS-DESIGNER.md` (block + free-table bullets, Extending recipe).

**Verify**: `npm run lint`; manual (rule 7) — type inline on desktop + iPad
emulation (entry/exit, chip selection + two-stage picker, named style run vs
object, Format/Style rows target the canvas instance, block drag still works
after blur, chrome never covers line 1, print preview unchanged); extend an
existing report spec only if a silent break (edit persistence) appears
uncovered; bump `package.json` (patch) when wrapping.

**Relations**: merges the unify-the-rich-text-editing ask into **191**; builds
on **188** (self-editing canvas blocks + persistence precedent), **189**
(canvas cell-chrome interaction language) and **192**/**193** (shared format
bar + linked style runs — the atoms this body reuses); gives **121** (and
**190**) their inline home — the two-stage picker works in the inline editor
through the shared adapter; related to **17** (iPad touch affordances) and
**140** (rich-text table title, same editor reuse).

## 194. Resize tabs — double-click resets the boundary (`[ ]`)

**Request**: double-clicking a column-resize tab resets that boundary —
horizontally, the two neighbouring columns split evenly (the boundary returns
to the middle); vertically, the row returns to its default height (drop the
explicit override). User ask (2026-10-02), on the free table's tab. The
free-table right-edge row tab already resets on double-click (`CustomTableBands.tsx`
row-height grip, roadmap 188) — verify it and fill the gaps.

**Approach**: `ColumnResizeStrip` (`src/components/columnResize.tsx`) gains an
optional `onResetBoundary?: (ci: number) => void` wired to the tab's
`onDoubleClick` (no drag session, stopPropagation like the pointerdown).
Free tables (`reports/CustomTable.tsx` + `useCustomTableCells`): column
boundary `ci` → set `columns[ci]`/`columns[ci+1]` to half their combined width
(MIN_PCT clamp, other columns untouched) through the existing block-patch
commit; the vertical strip mode → clear the row's `height`. The ribbon
designer's tabs and the collection-table `TableResizeBar` opt into the same
callback where they share the strip.

**Verify**: extract the split math as a pure helper + unit test if it grows;
`npm run lint`; `test:smart` (resize specs); rule-7 manual (double-click a
horizontal tab → the pair equalizes; vertical → default height; dragging still
works on both, mouse + touch).

**Relations**: builds on **24/34** (shared `useColumnResize` seam) and **188**
(free-table resize tabs).

## 195. Reports designer — reference `.` attributes match the repeater scope (`[ ]`, future)

**Request**: when a reference targets an item (a day, a scene, an element, a
category…) the `.` attribute list should offer EXACTLY the attributes the
matching repeater/table scope offers (`fieldsForScope` parity) — contextual
children and smart fields included, so a day ref's list matches a days-repeater
palette, a scene ref's matches a scenes palette, and so on. **Both reference
surfaces** (user ask 2026-10-02): `@item` + `.` lookups in text blocks /
free-table cells (`RichTextEditor.attributeItems`) AND `=` cellrefs
(`cellRefAttributeItems`) — they share `lookupAttributeFields`
(`lib/reportTokens.ts`), so fix the seam once, don't patch cellrefs only.

**Contextual resolution (same ask)**: the referenced item's attributes must also
RESOLVE against the containing repeater, not just be offered contextually —
`@Props` + `.Element List` inside a days repeat must print that day's props
(the `{{props}}` day union), not all 99 project props. Contextualize the lookup
TARGET through `resolveCollectionItems` with the containing chain's ancestor
scene scope (machinery exists: `ancestorSceneScope`/`ruleBearingAncestor`),
then read the attribute off the scoped item. This is the resolution twin of the
offer parity; **196** keeps the navigable-child half.

**Split (2026-10-02)**: the Lego collection-navigation half (day → first scene
→ that scene's attributes) moved to **196**; this item is the parity +
contextual-resolution deliverable that lands first.

**Finding (deep dive 2026-10-02, seed-verified)**: contextual `.` does NOT
retire the relative list fields (`categoryItems` Element List, `cast`,
`attachedScenes`, `workDayList`/…, `dayTypeDays`): they read the CURRENT repeat
item, while `@item` + `.` references a NAMED item. The two routes converge only
when the named item sits in a context (`@Props.Element List` in a days repeat ≡
`{{props}}`). Keep every list field; the code simplification is that
`lookupAttributeFields`'s static scope list collapses into `fieldsForScope`.

**Approach**: `cellRefAttributeItems` (`lib/reportTokens.ts`, roadmap 190)
currently returns `lookupAttributeFields` (static item-scope registry). Swap it
for the canonical `fieldsForScope` (`reportFields.ts`) with the target item's
context (collection + category + the parent/ancestor context the formula cell
carries), including day-context extras (breakdown-in-days, locations-in-days,
`crewOfDay`/`locationsOfDay`-style children where applicable). Pinning resolves
through the same scope, not the formula cell's aux. Thread the parent context
(`parentCollection`/`parentCategory`/ancestors) into `TokenResolveOptions` from
`CustomTable`/`ReportBlockView` **and** into the text-block/free-table
`RichTextEditor` adapter (the `@` lookup path).

**Verify**: unit tests comparing the offered key set against
`fieldsForScope(...)` for each collection/context, plus a resolution test
(`@Props.Element List` inside a day item ≡ `{{props}}` day union; bare ref
outside any repeater stays global); `npm run lint` + `test:smart`; rule-7
manual (picker rows match a repeater's palette for the same item).

**Guardrails (do not lose)**: parity only changes the OFFERED LIST — the
existing cellref picker behavior must survive: transitive target resolution
through nested/pinned refs (chains keep passing the item, e.g.
`@Bob` → `LEFT.phone` → `LEFT.email`), the element category's extra identity
scope (cast item → Cast ID fields), identity-field exclusion, the RELATIVE form
preserved when composing a pin (`cellref.rel.*` stays relative), the picker
group label from the target item, and the typed query filter. Add a no-loss
unit test: capture today's per-collection offered key set and assert it stays a
subset of the new `fieldsForScope` list, so nothing silently disappears.

**Relations**: extends **190** (cellref resolution + attribute picker) and
**121** (two-stage item picker); **196** is the split-off navigation half;
reuses the canonical scope registry in `reportFields.ts` /
`docs/REPORTS-LEGO-CONTEXT.md`.

## 196. Reports designer — cellref collection navigation / scope chaining (`[ ]`, future, big)

**Request** (split out of **195**): walk the collection graph through cell
references — reference a day, reach its first scene, reference that scene cell,
then use the scene's attributes; same for element → scenes, category →
elements, crew → categories. Lego-style scope chaining.

**Approach**: a scope-chain model on top of 195's parity: refs carry their
collection + ancestor context through resolution (not the formula cell's aux);
canonical child relationships (day → scene, category → element, …) become
navigable ref targets rather than synthetic fields; the `.` picker offers a
"child" section (or a dedicated navigation token form) for scopes with a child
list. Smart/contextual fields resolve against the target's chain, not the
formula cell's. Lookup (`@`) refs ride the SAME chain — their
contextual-resolution half lands in **195**; this item adds the navigable child
step on top.

**Verify**: resolution tests for day → first scene → attribute (and a
category → element chain); `npm run lint` + `test:smart`; rule-7 manual (picker
navigation + the resolved preview value).

**Relations**: depends on **195** (attribute parity); extends **190** and
**121**; related to **27** (`relative` context shifter).

## 198. Reports designer — day picker to preview the design against a chosen day (`[ ]`)

**Request** (user, 2026-10-02): reuse the call-sheet editor's day picker
(`production/day/DayPicker.tsx` — the ONE `< [DAY N] >` selector shared by the
Days page + Call Sheet edit, item 113) in the Reports Designer, so the day the
canvas samples is explicit and the template can be previewed against any day
(the "`{{wardrobe}}` looks blank on preview page 1" confusion, roadmap 197).

**Approach**: add a dark-theme `DayPicker` to the designer toolbar (next to
View/Preview) when the design is day-scoped (a `days`/`daysOfCast` repeat or a
`callSheetEdit` zone anywhere in the tree). Options from the canonical
production sections (same source as the Day Manager, incl. violation counts).
Selecting a day pins the repeat sample: thread an optional
`previewSectionIndex` into `sampleRepeatItem` (`lib/reportSampling.ts`; the
default stays Day 1 of the active schedule/calendar) so day repeats resolve
against the chosen day, and use the same index for the designer's
Preview/Print so canvas and preview agree; persist per design like the other
designer view prefs. In the Call Sheet design the `callSheetEdit` zone stays
template-level (per-day content is edited in the Day Manager — item 113
precedent); the picker only drives which day the sample resolves.

**Verify**: rule-7 manual (picker visible only for day-scoped designs; Day 1 vs
Day 2 show different per-day values in canvas + preview; preference persists);
`npm run lint`; extend an existing report spec only if a silent break (wrong
day sampled after reload) is plausible.

**Relations**: extends **197** (day repeats sample Day 1 of the active
schedule/calendar — this item makes the sample selectable), reuses **113**'s
DayPicker + preview-persistence precedent and the Day Manager day source;
related to **191** (inline canvas) and **190** (token resolution).

## 199. Reports designer — collection-table column headers: custom text + tokens (`[ ]`)

**Request** (user, 2026-10-02): a collection table's column header is hardwired
to the field label — there is no rename at all. Give each column an optional
rich-text header (custom text + `{{field}}` tokens and `@` item lookups),
falling back to the field label when empty. Headers resolve against the
ENCLOSING repeat item (the table's `item`), not the row item: a crew table
inside a days repeat can read "Crew — {{dayDate}}"; top level uses
`{{title}}`/`{{company}}`. Row-matrix mode gets the same for its row labels and
the top-left `headerField`. Collection tables only — free tables keep their
existing editable header labels (`columns[].label` is shared: render plain
labels unchanged and pass HTML through).

**Approach**:
- Data: reuse `ReportTableColumn.label` (exists; today only free tables consume
  it). Store token HTML; no migration (plain labels render as text).
- Renderer: `TableColumnsGrid` header + `TableRowsMatrix` row labels/top-left
  (`ReportBlockView.tsx:836/932/966`) — when `col.label` is set,
  `resolveReportTokensHtml(ctx, fieldMap, col.label, item, blockAux)`, else the
  field label. `showKeys` keeps `{{field}}`. Empty-collection skeleton and
  per-fragment `repeatTableHeader` behavior unchanged (resolution is
  deterministic per fragment).
- Editor: a "Header" `RichTextEditor` field in the selected-column chrome
  (`reportColumnControls.tsx` `CollectionColumnEditorContent`) — `fields` /
  `allFields` scoped to the PARENT context (`fieldsForScope(allFields,
  parentCollection)`), `lookupTokens` from `buildLookupTokens`, so a top-level
  header never offers `{{sceneNumber}}`; `@` + `.` work, and **195** makes the
  `.` attributes contextual automatically.
- NOT in scope: tokenizing cells (the typed grid stays), inline header editing
  (**191** can layer it later), free-table header rework.

**Verify**: `npm run lint`; rule-7 manual (custom text, `{{token}}`, `@`
lookup, empty → field label, rows mode + top-left, print header repeat, blank
collection skeleton); no new e2e unless a silent break (persistence of the
header HTML) appears uncovered.

**Relations**: same rich-text recipe as **140** (block title above the table —
per-column sibling, not a duplicate); reuses **191** (shared editor/chrome),
**121** (`@` picker) and **195** (contextual `.` attrs); docs
`docs/REPORTS-DESIGNER.md` (§free vs collection tables / Extending) update at
wrap.

## 200. E2E — `glide-first-edit` fails whenever a dev server occupies :3001 (`[ ]`)

**Reported** (user, 2026-10-02): `e2e/glide-first-edit.spec.ts` fails routinely
in local runs. **Verified root cause** (agent, same day): `npm run dev` starts
Vite with `--port=3000` but NO `--strictPort`, so when 3000 is already taken a
second dev server silently falls back to 3001; `playwright.config.ts` then
REUSES whatever listens on the default port (`reuseExistingServer: !isolated`),
so the suite actually runs against the DEV server, not the production preview.
The spec waits for the prod chunk URL (`…data-grid-overlay-editor-<hash>.js`);
dev serves `…/@glide-overlay-editor.js?v=<hash>` (does not end in `.js`), so the
wait times out. Proof: `PLAYWRIGHT_PORT=3011 npx playwright test
e2e/glide-first-edit.spec.ts` passes (owned preview), and `test:baseline`
(clean HEAD, owned server) passes — no code regression, but ANY run can silently
test another process's stale server.

**To fix / decide**:
- Never silently reuse a foreign server: when `PLAYWRIGHT_DEV` is unset, probe
  the reused URL for a prod-preview marker and fail fast with a clear message
  (name the port + `lsof -i :<port>`), or set `reuseExistingServer: false` by
  default (keep `PLAYWRIGHT_PORT` owned-server semantics).
- And/or make the fallback impossible: `--strictPort` on the dev script (fails
  loudly when 3000 is busy) or move the E2E default off 3001.
- Same family: `glide-clipboard.spec.ts` hardcodes
  `grantPermissions(..., { origin: 'http://localhost:3001' })`, so the documented
  `PLAYWRIGHT_PORT=<n>` isolation makes all 6 clipboard tests fail with
  `NotAllowedError` — read the origin from the test `baseURL` instead.
- Update `docs/TESTING.md` §Harness facts + the "was it me?" flow with the
  symptom → diagnosis.

**Verify**: with a dev server on 3001, a default-port run either uses an owned
preview or exits with the new diagnostic; `npm run test:smart` + the isolated
spec are green; `npm run lint`.

**Relations**: extends **63** (the boot preload this spec pins); touches
`playwright.config.ts`, the `dev` script (`package.json`) and `docs/TESTING.md`.

## 201. Reports designer — fold day-contextual collections into base collections? (`[ ]`, NEEDS CONVERSATION FIRST)

**Status: DISCUSS BEFORE BUILDING — do not implement from this item alone.**
User ask (2026-10-02): the collection menus are overloaded with hardcoded
contextual entries ("Crew (of this day)", "Element Calls (of this day)",
"Department Calls (of this day)", "Locations (of this day)", "Day Types (of
this element)", …). Hypothesis: once **195**'s contextual attribute resolution
lands, a plain scoped collection + day-aware fields produces the same output,
so those entries can be retired and the picker shrinks.

**What it would mean (spell out in the conversation)**:
- Picker: users pick ONLY base collections (Scenes/Days/Cast/Elements/
  Categories/Crew/Locations/Day Types); Lego scoping + context-aware fields
  make them behave as today's "(of this …)" entries. Saved designs + the
  built-in Call Sheet migrate via collection aliases (old id → base collection
  + scoping) or keep the old ids as legacy read aliases.
- Field work: per-day logic baked into the synthetic item shapes moves into
  field resolvers — `crewCallTime`/department against the day's slots/precalls/
  overrides; per-element `call_{stage}` columns against the day call chain;
  `dayTypeDays` scoped to an element/day ancestor; the day location seam for a
  scoped locations table. Fields registered ONLY for synthetic scopes today
  (`call_{stage}`, `elementCallCode`, `elementCallFirstScene`) must be offered
  on base scopes in day contexts.
- Audit first: some contextual collections may ALREADY be subsumed by ancestor
  scoping (`daysOfCast` vs scoped `days`; `scenesOfDay` vs scoped `scenes`) —
  classify each as shape alias / needs day-aware fields / genuinely separate.
- NOT implied: lookups still fetch ONE named item — iteration always needs a
  repeat/table. This is about collection entries, not tokens.
- Hard cases to weigh: `departmentCallsOfDay` (departments aren't a base
  collection — keep synthetic?), Call Sheet zone (`callSheetEdit`) + its field
  seams, `ReportScopeFilter` (keyed by collection), `tableFieldScope`/
  `fieldsForScope` mappings, `onceTable`, `defaultIdentityField`, MCP
  `get_report_registry` output, e2e specs pinned to collection ids.
- Trade-off: smaller user-facing menu vs churn in saved designs, the Call
  Sheet template and a working registry — candidate for staging (pilot
  `crewOfDay` first).

**Conversation agenda (before writing code)**: enumerate every contextual
collection, classify (already subsumed / needs day-aware fields / genuinely
separate), decide keep/retire/stage, choose the saved-design migration
approach. Only then turn the outcome into an implementation plan.

**Verify** (if it proceeds): parity tests (scoped base collection output ===
today's synthetic collection output for the built-in templates), design-load
migration test, `npm run lint` + `test:smart`, rule-7 manual on the built-in
reports; update `docs/REPORTS-LEGO-CONTEXT.md` + `docs/REPORTS-DESIGNER.md`.

**Relations**: powered by **195/196** (contextual resolution/chaining) and
**199** (contextual headers); touches **99/111/112** (the collections),
archive **25** (self-redundant menu hiding); read
`docs/REPORTS-LEGO-CONTEXT.md` first.
