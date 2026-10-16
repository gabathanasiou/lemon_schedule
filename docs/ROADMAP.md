
# Roadmap — Future Implementations Checklist

This file is the pending work list: `[ ]` not started, `[~]` in progress.
Only open/in-progress items live here — **query it, don't read it whole**:
`grep '^## '` lists every item with its flags in ~1KB. The recipes
("what's next", one item, triage dedupe) live in the `manage-roadmap`
skill, §Queries.

- **Completed items:** see `docs/ROADMAP-ARCHIVE.md` (index + code/knowledge
  pointers; full narratives in git history).
- **New asks** go through the triage/dedupe gate (AGENTS.md, §Roadmap Work)
  before becoming an item here.

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
same commit. The events-mode day cells and section tabs stay bespoke; icon-only
buttons move to the kit via **216** (the "icon-only is the documented exception"
note is retired).

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

**Relations**: powered by **195/196** (contextual resolution/chaining);
touches **99/111/112** (the collections), archive **25** (self-redundant menu
hiding); read `docs/REPORTS-LEGO-CONTEXT.md` first.

## 209. Crew database — universal across projects, not per project (`[ ]`, awaiting user detail)

**Request** (user, 2026-10-08): a crew database that is UNIVERSAL — crew
people live in one place and are reusable across projects, instead of the
current per-project store. The user will explain the intended shape later —
**do not design or implement before that conversation**; this item only
captures the ask.

**Current state** (for that conversation): crew people are per project —
`project.crew` (`Record<string, CrewPerson[]>`, role-keyed) + `CrewPerson`
(`src/types.ts:521`) + `crewTemplate` (`src/types.ts:866`), managed by the
Crew Manager and consumed by the day roster (`dayCrew.ts`), call-time grids
(`crewCalls`) and report seams (`crewOfDay`). Nothing crosses projects today.

**Open questions** to resolve with the user: where the DB lives (device-local
vs Drive/account), identity/dedup across projects, whether person↔role /
department / contacts / `crewLinks` travel with the person, how project
rosters reference people (stable ids), merge semantics on import/copy, and
offline behavior (`docs/STORE-AND-SYNC.md` read-only rules).

**Relations**: sibling of **157** (cast performer person records + contacts —
the same "person beyond one project" idea for cast); overlaps **146** (crew
roster/template model) and the Crew Manager items **89-91**; may interact with
**145** (desktop app hosting) and **97** (API store) for where the DB is kept.

## 212. Call Sheet editor — 1:1 designer parity with the Reports designer (docked inspector included) (`[ ]`, future, big)

**Request** (user, 2026-10-08, user-confirmed direction): the call-sheet
editor's design surface should BE the Reports designer — including the
right-hand inspector dock (palette when nothing selected → block/column/cell
inspector on selection, collapse + drag-resize), Fields/Values mode, and the
full block/column/cell editing chrome. **Confirmed as accurate**: today the zone
mounts the raw canvas with `editorMode: 'floating'` and `mode: 'values'`
hardcoded (`CallSheetZoneDesigner.tsx:84,148`) — no rail, no mode switch,
floating chrome only. `CallSheetZoneDesigner` is the wrapper to retire in favour
of a first-class zone mode on `ReportDesigner` — not a second designer.
(Zone-less designs now render through the same `CallSheetCanvas` page with no
zone slot — roadmap 211 — so this item only concerns the zone itself.)

**Approach**: give `ReportDesigner` a first-class zone mode (design = the
selected call-sheet template's `days` repeat, editable root = the
`callSheetEdit` zone, day item resolved like today) and retire the hand-rolled
wrapper: same rail layout/`usePaneResize` + persisted prefs
(`lemon_schedule_report_editor_mode` / `..._rail`), same Fields/Values `Seg`,
same canvas. Keep the surrounding template read-only and the per-day-per-design
zone writes (`daybreakMeta.callSheets[designId]`); keep the live grid blocks
(`callTimes`/`crewTable`) interactive. Decide the toolbar shape in
implementation (keep the editor header's Times/Preview/Print, or adopt the
designer toolbar) and document whichever ships.

**Verify**: `npm run lint`; `e2e/call-sheet-day.spec.ts` stays green + new
assertions (rail open by default, selecting a block swaps palette → inspector, a
Fields-mode edit still persists to that day's zone); rule-7 manual (rail parity
side-by-side with the Reports designer).

**Relations**: replaces `CallSheetZoneDesigner` (keep until then); **142**
(Unified Day workspace) merges the surfaces — this item makes the editor good
WITHOUT merging navigation (the 176 note keeps Day Manager / Call Sheet
separately navigable); builds on **203** (Fields/Values mode) and **204**
(duplicate selects); touches **113**/**114** (zone chrome/Times toggle) and
**208**/**211** (same editor); related **222** (the fill canvas's live-grid
headings/print parity — independent, not blocked by this).

## 214. Image block — bottom-right drag to scale; editor renders at true print scale (`[ ]`)

**Request** (user, 2026-10-08): image blocks must scale by dragging the
bottom-right corner — aspect-locked, Shift = free stretch (user decision) — and
the designer must stop the guessing game: sizes in the editor should BE the
printed sizes ("print matches the editor").

**Current state**:
- Image renders `width: 100%` of its container + optional `imageHeight` px
  (`ReportBlockView.tsx:331`; fields `imageDataUrl`/`imageHeight`/`imageFit`,
  `types.ts:780-782`); only a height number input (`blockControls.tsx:1117-1175`).
- Designer canvas page = view-mode width (730/1060/full) grey card
  (`ReportDesignerCanvas.tsx:904`; `VIEW_WIDTHS`, `lib/persist.ts:28`) while
  preview/print/paginator measure `REPORT_PAGE_METRICS` (697px portrait / 960
  landscape — `reportStyle.ts:49`, `ReportPrint.tsx:61`,
  `useReportPaginator.tsx:548`) → text wraps and images scale differently than
  print. `CallSheetCanvas.tsx:127` already uses the true metrics.

**Approach**:
- Persist `imageWidth` alongside `imageHeight` (store % of content width so the
  size survives a page-geometry change; `imageFit` stays the legacy stretch
  control) and add a selection-gated bottom-right handle on the canvas — reuse
  the pointer-resize recipe (`src/components/columnResize.tsx`, roadmap 188
  precedent); aspect-locked by default, Shift = free; show a px size badge while
  dragging; keep the Content controls in sync with the handle.
- Render the designer page at `REPORT_PAGE_METRICS[page].contentWidth` — ONE
  metrics source shared with print/preview/paginator — with a display-only
  fit/zoom so landscape still fits the viewport (zoom never changes layout units).

**Verify**: `e2e/report-page-breaks.spec.ts` stays green (pagination math);
targeted e2e only if the resize persistence is silently losable; rule-7 manual —
drag the corner (aspect lock + Shift), editor vs preview/print side-by-side
equality, reload keeps the size, Fit modes unchanged.

**Relations**: overlaps **160** (page geometry/scale — the single metrics source;
its scale control must compose with this, not fork it); reuses **188**'s resize
recipe; touches **212** (call-sheet editor inherits the same canvas).


## 215. Reports — unlock chained reference navigation (roadmap 196 child steps) (`[ ]`, gated, parked)

**Parked (user, 2026-10-09):** keep the gate closed — do not flip until the
feature is explicitly wanted in the product.

**Request**: 196 shipped code-complete but LOCKED — `CHILD_NAVIGATION_ENABLED = false`
(`src/lib/reportLookup.ts`) keeps the child steps (`→ First scene` / `→ Last scene`
+ specific children after any reference chip) out of the `.` picker. Flip when the
feature is wanted in the product.

**Approach**: set `CHILD_NAVIGATION_ENABLED = true`. Nothing else should be
needed — the path grammar, `lookupTargetItem`/`chainSceneScope` resolution, pair
suppression and `referenceOffer` are live and unit-tested; the editor surfaces
`offer.children` again at the one seam (`reports/RichTextEditor.tsx`).

**Verify**: `npm run lint` + `test:smart` (unit coverage already exercises the
chains); rule-7 manual — `@Day 1` → `.` shows `Scenes` steps, `→ First scene`
inserts a `Scene N` chip, its `.` offers that scene's attributes; deleting chips
restores the anchor.

**Relations**: unlocks the gate over **196**; related to **195** (attribute
parity) and **27** (`relative` context shifter).

## 220. Reports designer — base `departments` collection (pre-calls in tables + `@`) (`[ ]`)

**Request** (item 159 follow-up, user 2026-10-09): expose the project's crew
departments as a BASE report collection — one item per department (label,
pre-call expression, resolved call in a day context, crew count) — so pre-calls
can be listed in plain tables/repeats WITHOUT a days repeat and referenced as
`@` attributes, not only via the day-scoped `departmentCallsOfDay` and the
precalls block.
- **ONLY the new picker category** — it does NOT touch the existing day-scoped
  collections (`elementCallsOfDay`/`crewOfDay`/`departmentCallsOfDay`, item 99),
  which stay as-is; those remain the day-contextual data behind the grid blocks.
- Registry: `ReportCollection` (`types.ts`) + `resolveCollection` branch
  (`reportData.ts`, reuse `dayCrew.projectDepartments`/`dayDepartments`) +
  labels/identity (`reportBlocks.ts`) + a `departments` field family
  (`reportFields.ts`: label, pre-call expression, day-resolved call via the
  Lego day ancestor, crew count) + lookup identity (`reportLookup.ts`
  `fieldScopeFor`, `buildLookupTokens`) so `@Camera` offers its attributes.
- Keep `departmentCallsOfDay` as the day-scoped contextual child — the base
  collection is the project-level DB (ONE source: the `dayCrew` pool).
- **Verify**: Vitest for the resolver + lookup identity; `e2e/report-collections.spec.ts`
  only if a silent break is plausible.
- **Relations**: extends **159**; overlaps **99**/**146** (pool source); **201**
  (base-vs-contextual collection direction).

## 224. Call Sheet editor — container/card affordance for the live editable grids (`[ ]`, NEEDS DECISION)

**Request** (user 2026-10-09): in the Call Sheet editor's fill canvas, the
dynamic editable tables (Call Times / Crew Table / Precalls — the live Glide
grids) should sit in a clear **container/card** so it's obvious they are
interactive, not read-only template content.

**Current state**: they already render inside white cards — per-category cards
(`data-report-grid="elementCalls"`), per-department cards (`CrewRosterEditor`),
one Precalls card (`data-report-grid="precalls"`) — but flush on the white
printed page with light `border-zinc-200` borders, so editability doesn't read.
The `callSheetEdit` zone signals itself with the dashed
`CALL_SHEET_EDIT_ZONE_STYLE` border (`reports/reportStyle.ts`).

**Decision needed** (ask before building): (a) wrap every live block (title +
grid) in the dashed edit treatment, (b) tint the live cards (e.g. the
`zinc-50`/interactive-cell tint already used for editable Glide cells), or
(c) leave the cards and add a hover-only outline. One seam:
`production/day/InteractiveGridBlock.tsx` + `CallSheetCanvas.tsx`
(`data-report-grid` wrappers) — print/preview output MUST stay unchanged (no
`hint` leakage; the canvas already separates those paths).

**Verify**: rule-7 manual on the call sheet canvas; preview/print byte-equal
visually; `npm run lint`.

## 225. Crew table (print/preview) — one flat table, no department sections (`[ ]`)

**Request** (user, 2026-10-09): the **rendered** crew table — Reports designer
canvas/preview/print and the Call Sheet's preview/print — must be ONE flat
table: Name · Role · Call · Phone · Email. No per-department separator bars
("Above the Line", "Camera", …) and no repeated column-header row per
department. The editable live grid (Call Sheet → Edit) and the Day Manager Crew
section keep their per-department cards (they carry include/exclude + department
pre-calls).

**Approach**: the split lives in the static read model —
`resolveReportGridGroups`'s `crewOfDay` branch (`src/lib/reportGrids.ts:116-134`)
returns one group per department, so `reports/ReportGridBlock.tsx:99-155` draws
a department bar + a fresh header row per group. Return ONE flat group (same
canonical `crewOfDay` order, fixed `CREW_FIXED` columns); `multi` goes false and
the renderer emits a single header row with no bars —
`skeletonReportGridGroups` (line 168) is already flat. The live path does NOT
consume this function (its grouping is `groupSlotsByDept` inside
`CrewRosterEditor`), so the editor is untouched — grep to confirm before
changing. No new block option: one flat shape is the decision (no toggle).

**Verify**: Vitest — add a `resolveReportGridGroups(ctx, 'crewOfDay', …)` case
to `src/lib/__tests__/reportResolve.test.ts` (exactly one group; columns
`crewName`/`role`/`crewCallTime`/`phone`/`email`); rule-7 manual — designer +
preview + print show one header and no department bars, Call Sheet → Edit
unchanged. `e2e/report-grid-blocks.spec.ts` crew test targets the EDITOR (must
stay green untouched). Update `docs/REPORTS-DESIGNER.md` §What already exists
(grid blocks): the static crew table no longer mirrors the live per-department
bars — static flat / live grouped becomes the deliberate asymmetry.

**Relations**: narrows **146**'s department-grouping decision to the live editor
(146's call-sheet crew table stays grouped); touches **112** (the block), **156**
(columns), **222** (headings parity — crew diverges by design now); related
**142**, **224**.

## 230. Editions & licensing — Free / Studio one-time / offline verification (big)

**Vision + decisions: `docs/LICENSING.md` — read it first.** Decided 2026-10: Free vs Studio (£150 one-time) vs Collaboration subscription (requires Studio + active sub; guests free); **DIY on Supabase** — Ed25519-signed offline licence files, 3 device activations, no account required for Studio; **one merchant of record** (Polar or Lemon Squeezy) for one-time + subscription (VAT handled); feature gates via one `FEATURE_GATES` registry. Free-tier limit values still open (doc §9).

**Order:** the last remaining collaboration item (S5 — 229 stages S1–S4 are shipped and deployed) — blocked on the free-tier limit values (`docs/LICENSING.md` §9).

**Non-negotiables**: no account for offline Studio; signing private key never ships; entitlement state never lives in the Project document; every gate goes through the registry; export of the user's own data always available.

**Verify** (when built): Vitest for signature/expiry/fingerprint + gates + free limits; e2e activation against a mocked endpoint; manual purchase → activate → offline relaunch pass. `npm run lint`.

**Relations**: `relates to` **229** (collab entitlement + shared gating), **145** (desktop app = the true offline host), **209** (account question).

## 257. Element Manager — Board IDs for every element category (MMS parity, Option A) (`[ ]`)

**Requested 2026-10-15 (user):** Movie Magic numbers every element — its
`<Element>` records carry `BoardID` + `LockBoardID` + `SortOrder` (the
`wonderful-life.msd` fixture: Cast 1..59, all 99 Props and 11 Vehicles numbered,
other categories blank; `CategoryMgr` has a per-category `AutoAssignIds` flag) —
while Lemon only numbers cast. Give every category MMS-style Board IDs and stop
discarding the file's real numbers on import.

**Model — numbers as labels, references unchanged (Option A, user's pick).** Cast
keeps `CastMember.id` as its Board ID; `ProjectElement` (every other category)
gains `boardId` (numeric string, per-category from 1). Scenes keep referencing
non-cast categories by NAME — MMS's own `ElementRef`s carry only
`CategoryName`+`ElementName` (`msd.ts:174-186`), so numbers are registry-side
identity, not the reference. Consequence (accepted): renames still cascade and
duplicate names still merge (the `MergeRowsModal` flow stays), and cast stays the
one id-keyed category for refs (`isIdKeyed`, `elements.ts:16`) — no key-space
change.

**Decisions (user, 2026-10-15).**
- Per-category numbering starting at 1 (Props 1..n, Vehicles 1..n, …).
- Auto-assign the next free number on element create — editable + lockable in
  the Element Manager for EVERY category. Reuse the cast machinery, don't fork:
  `lockedElementIds` is already per-category (`types.ts:869-870`),
  `TOGGLE_ELEMENT_LOCK` is generic (`actions/breakdown.ts:487-499`); only the
  column / lock / Auto-ID UI and the allocator are gated on `isCast`
  (`ElementManager.tsx:313-363` `commitCast`, `:454-481` sort + Auto-ID,
  `:609,628-645` column + lock). Auto-ID contract verbatim: fill empty ids
  (continuing after the highest), never touch locked ones, one undo batch.
- Typing a NUMBER does NOT select an element — numbers are display-only for now.
- Existing projects: one-time migration assigns sequential numbers per category
  in stored order (idempotent, no scene rewrites).
- MMS import reads real ids: `msd.ts` currently ignores `BoardID` (cast ids are
  re-derived by counting ElementMgr order at `:352-384` — coincidence in the
  fixture, unvalidated) and drops Props/Vehicles numbers. Read
  `BoardID`/`LockBoardID` per element; cast ids come from the attribute (keep
  the counting fallback for blank ids).

**"N. NAME" display surfaces — DEFERRED (user: discuss later).** Candidate list
for the follow-up pass only, do not build now: `EntityDropdown` prefixes,
Breakdown Sheet / Element Breakdown print, DOOD, call sheets, and widening
`sortReportElements` (`reportData.ts:813`, cast-by-id today) + the `dayView`
`boardId` field (cast-only) to all categories.

- **Verify:** Vitest — per-category allocator (next free, gaps, locked skipped),
  migration (stable, idempotent), msd mapping (cast from `BoardID`, Props/
  Vehicles preserved, blank fallback); e2e only where silence would hurt:
  renumbering a boardId must never rewrite `scene.*` (debug-bridge assertion),
  plus the manager commit paths (`e2e/new-cast-naming.spec.ts` is the template).
  Column/prefix UI = rule-7 manual pass (deferred surfaces anyway).
- **Relations:** `extends` **122** (cast-only lock/Auto-ID — generalized here)
  and **143** (report ordering by Board ID — candidate to widen, second pass);
  `relates to` **228** (name-typed cast guard), **157** (cast details),
  **40/41** (MSD/SEX import — real BoardIDs).

## 262. File → Help — Send feedback / support entry (`[ ]`)

**Requested 2026-10-15 (user):** the Help submenu should gain a contact /
feedback / support entry — a way to reach the maker with bugs and ideas, and
the home for support-style items later.

- **Where:** the `Help` submenu in `src/components/AppHeader.tsx` (next to
  What's New) — the submenu was introduced (260) for exactly this.
- **Destination — decided (2026-10-16): GitHub issues** (a new-issue link from
  the Help submenu). The repo is private today and goes public eventually
  (user plan — eventual open-source release); until then the link only works
  for the owner, so ship the entry with/after the public launch.
- **Still open at build time:** what context to attach (app version
  `APP_VERSION`, the open tab/screen — never project contents or tokens);
  whether a signed-in account prefills identity. No secrets in the client.
- **Relations:** `extends` **260** (File → Help submenu introduced there).

## 267. iPhone portrait — Schedule-first chrome, edge-to-edge stripboard (PoC, `[~]`)

**Requested 2026-10-15 (user, PoC):** on a phone held in **portrait** the app
collapses to what a phone can actually use; **landscape is untouched**.

- **Top bar:** tabs reduce to **Schedule** + **Sheet** (Sheet opens
  Breakdown → Sheet — the SceneSheet surface, last sheet index kept). File
  menu, project name and the presence bubbles stay; SaveIndicator, Undo/Redo,
  RoomNote and the other five tabs hide.
- **Schedule toolbar:** only the **View** menu and the schedule **version**
  picker render; the View trigger gains its "View" label beside the eye icon.
- **Boneyard:** forced closed on the phone — it renders null while collapsed
  and its expand button is one of the trimmed toolbar controls, so the
  stripboard owns the whole width.
- **Stripboard:** opens **Full Width** with ~4px side margins (`p-8` → `px-1`
  in the phone branch) so the schedule spans the device; the bottom reserve
  shrinks too (`pb-32` → `pb-16`) — strips render down to the bottom edge
  while a modest scroll run still lifts the last strip clear of Safari's
  floating bottom bar (no `env(safe-area-inset-bottom)` — that is 0 in a
  Safari tab anyway and stays reserved for installed web apps). The stored
  `useViewMode` pref is never rewritten by the phone layout on its own — a
  View-menu pick applies for the mount (session override) and still persists
  for every other surface.
- **Sheet surface:** the mini bar drops the other sub-tabs
  (Script/Element Manager/Glide) and the sheet's New/Duplicate/Delete scene
  actions; it keeps the **order menu** (view options), the **‹ Sheet N of M ›
  navigation** and the **script-pane toggle**. The script pane defaults
  **closed** on the phone (an explicit toggle still wins, on any surface).
- **Detection:** `usePhonePortrait()` (`src/lib/device.ts`) —
  `(pointer: coarse) and (max-width: 600px) and (orientation: portrait)`,
  matchMedia-driven (no UA sniffing). Landscape, iPads (≥744pt) and the Duo's
  open inner display fall out; the Duo OUTER display (466×678) matches on
  purpose — it is a phone-width portrait viewport. Known quirk: iPad Slide
  Over (≤600pt) also matches.
- **Debug on the Mac:** Safari's Responsive Design Mode does NOT emulate
  `pointer: coarse`, so the layout cannot trigger there — `?phone=1` forces it
  in a PORTRAIT viewport while keeping orientation real (DEV builds always;
  prod/preview with `localStorage LEMON_AGENT=1`, the debug-bridge gate).
  Console one-liner: `localStorage.setItem('LEMON_AGENT','1'); location.search='?phone=1'`
  (clear with `location.search=''`). Chrome DevTools device mode and a real
  iPhone flip the query natively.
- **Orientation memory:** rotating never moves you off a page that exists in
  the target orientation — Schedule and Sheet are valid in both, so
  portrait↔landscape keeps them as-is ("don't use the memory thing when the
  page is supported by both"). Only a landscape-only page has no portrait
  home: rotating into portrait then restores the remembered portrait place
  (`App.tsx` single slot + effect; predicate `isPhoneSupportedPlace` in
  `lib/appNav.ts`; default Schedule — also the boot-place clamp). Collab follow
  is clamped the same way: on a phone, following a peer never navigates onto a
  place the two-tab chrome cannot show (it holds still until the peer visits
  one that maps).
- **Phone boot + splash:** the first paint is phone-aware
  (`activeTab`/`brSubTab` lazy-init from `usePhonePortrait`), so the desktop
  default (Glide) never flashes before the boot clamp; opening a project in
  portrait then shows a 700ms full-screen splash in the header-bar colour with
  the project name + spinner (`App.tsx`, `data-testid="phone-splash"`).
- **Bottom bar (iOS 26+, phone) — root cause + measured ceiling 2026-10-16:**
  the app was CLIPPED BY OUR OWN CSS. `src/index.css` had
  `html, body, #root { height: 100%; overflow: hidden; }` — on iOS 26 the
  layout viewport ends at the top of the floating bottom bar, so `height:100%`
  capped the shell there and `overflow:hidden` cut everything past it (it also
  defeated the earlier fixed-wrapper/+120px attempts, which sat BELOW the
  clip). Proof: a plain scrolling document with no such confinement
  (`directedbygabriel.com` — user's own site) paints under the bars; this app
  did not. Fix: the confinement is gone (html/body/#root = `margin:0;
  overscroll-behavior:none; background #f4f4f5` — never re-add the clip).
  **Measured on the device** (14 Pro Max via the temporary dev probe —
  `src/lib/devProbe.ts` + a probe server on the Mac, REMOVE when the phone
  pass ends): portrait inner 775 / `100lvh` 815 / screen 932 → a Safari TAB
  can paint at most `100lvh` (815 = 40px into the bar), the last ~117px is
  Safari's own zone; the canvas background fills it so it reads as the
  stripboard/Sheet surface. Landscape: shell = full height already, insets
  report the Dynamic Island (59px left/right, 20px bottom) — the shell now
  carries `env(safe-area-inset-top/left/right)` paddings in BOTH orientations
  (`phoneDevice`, `PHONE_DEVICE_QUERY`), and the `viewport-fit=cover` opt-in
  (`src/main.tsx`) uses that same phone-any-orientation query (iPad/desktop
  keep the plain meta — roadmap 265). Reserves `pb-safe-or-16` keep the last
  row scrollable clear. **What finally filled the screen (user: "you fixed
  it"):** the shell height — no viewport unit reaches the bottom (WebKit
  301108), so portrait sizes it from the REAL screen height (`h-(--app-h)`,
  `--app-h` = `screen.height` px set by App.tsx when portrait; `index.css`
  holds the `100lvh` fallback) + the `#f4f4f5` canvas fills the residual.
  **Library use (user directive — don't reinvent):** `tailwindcss-safe-area`
  v1.3.0 + Tailwind's `h-screen`/`h-lvh`; the community skill
  `ios-safari-safe-area` (GitHub/MIT) prescribes the same shape. **Landscape
  model (user-specified):** the app DRAWS full-bleed; only interactables and
  container content sit inside the safe areas — the shell stamps
  `data-island` (left|right) from `useIslandSide()` (`screen.orientation.angle`
  mapping: 90 → left, 270 → right — flip if a device disagrees) and every
  edge surface reacts with Tailwind `group-data-[island=…]` variants:
  `AppHeader` clusters, `PageToolbar` (all pages' mini tab bars),
  `BoneyardPanel`, `SidebarNav`, `ReportsTab`/`RibbonPalette` (left docks),
  the report palette (left/right), `SceneScriptPane` (right dock) and the
  SceneSheet content. The side WITHOUT the island never insets. Everything
  recalculates on rotation (`screen.orientation` change + `orientationchange`
  + `resize` + `visualViewport` resize); floating toggles use
  `right/bottom: max(16px, env(...))`.
  Remaining: the PM boot screen is still `fixed inset-0` (caps at the layout
  viewport — gets the `--app-h` treatment next); REMOVE the temporary dev probe
  (`src/lib/devProbe.ts` + `tools/phone-probe.mjs` — server on :3999, logs
  `/tmp/lemon-phone-probe.json`); run the FULL Playwright suite before closing
  (the session's last suite run predates the shell/CSS changes). The surface
  sweep is item **269**. Full-bleed standalone remains **Add to Home Screen**.
- **Wiring:** `App.tsx` owns the hook + the Sheet tab's `go({tab:'breakdown',
  sub:'sheet'})`; AppHeader takes `phone` (tab set + hidden controls);
  ScheduleTab takes `phone` (effective view mode + padding) and passes it to
  `ScheduleToolbar`.

**Status:** PoC built 2026-10-15 (this session). Remaining before closing: real
iPhone pass (portrait + rotate); open questions — undo/redo unreachable on
phone (deliberate?); boneyard unreachable while closed (no toggle — do we need
a peek affordance?); whether Sheet should carry the Breakdown sub-tab bar;
whether to persist the phone default.

**Verify:** `npm run lint` + full suite (no test profile matches the query —
desktop is 1280/`pointer:fine`, iPad 834 — so the phone branch is
manual-only by design, rule 7). Manual: iPhone portrait → two tabs, trimmed
toolbar, edge-to-edge stripboard; rotate → everything normal.

**Relations:** trims what **258**/**264** built (icon-first tabs, edge rails);
the View menu is **243**'s followed `viewMode` field; related **17**/**182**
(touch surfaces), **265** (status-bar tint). The remaining surface sweep is
**269**.

## 269. Optimise every area for iPhone & landscape (sweep) (`[ ]`)

**Requested 2026-10-16 (user):** after the 267 PoC, sweep EVERY surface for
iPhone portrait + landscape so nothing collides with the Dynamic Island, the
rounded corners or the home indicator — and nothing stays capped at a viewport
unit on iOS 26 Safari (WebKit 301108: no unit reaches the physical bottom).

- **Model (established in 267 — reuse, never invent per-surface):** the app
  DRAWS full-bleed (shell height = the real screen dimension via `--app-h`;
  page canvas `#f4f4f5` fills Safari's residual band); only interactables and
  container content sit inside the safe areas, and only on the island side —
  `useIslandSide()` → shell `data-island` → Tailwind
  `group-data-[island=…]` variants with the `tailwindcss-safe-area`
  utilities (`pl-safe`/`pr-safe`/`pb-safe-or-16` — never hand-rolled `env()`
  in styles).
- **Sweep checklist (per surface × orientation, on the device):**
  - modals/dialogs + footers (kit `Modal` is centred — check landscape island
    clearance; wide modals may touch the island edge),
  - dropdown/context-menu panels opened near an edge (the panel aligns to its
    trigger — inset triggers move the panel with them),
  - the **Project Manager boot screen** — backdrop DONE 2026-10-16: flow
    `h-full`/`h-(--app-h)` instead of `fixed inset-0` (iOS clips fixed paint
    at the inner viewport — it left white bands) + the lockup is `fixed`
    (viewport-anchored, visually unchanged); REMAINS: island-side content
    insets,
  - per tab: Calendar (sidebar, day cells), Production (Day Manager header,
    Crew/Locations managers), Script (toolbar + cut affordances), Glide grids
    (headers), Reports (palettes done — verify), Design (Ribbon/Colors),
    Rules, Element Manager (sidebars done — verify),
  - `OfflineStatus` banners + `RoomNote` + the floating toggles.
  - Print/popout surfaces are desktop-only — out of scope.
- **Recalculation is already the rule** (`screen.orientation` change +
  `orientationchange` + `resize` + `visualViewport` resize); any new inset
  must go through the shared hook/attribute, never a one-off media query.
- **Verify:** device pass per surface (portrait + both landscape rotations);
  `npm run lint`; full Playwright suite before closing; rule-7 manual list.
- **Relations:** follows **267** (PoC + mechanism); reuses **17**/**182**
  (touch audits); chrome/status-bar notes in **265**.

## 270. iPhone app on the App Store — Capacitor/Tauri shell around the web UI (`[ ]`)

**Asked 2026-10-16 (user):** can Lemon Schedule ship as an iOS app — and does
that make the browser-chrome/safe-area work easier? Yes to both; this records
the path. Extends **145** (the Tauri desktop shell).

- **Route (pick ONE, don't build both):** **Capacitor** is the fast path —
  the app already builds to static files and Capacitor's iOS host loads them
  in a WKWebView; ~all UI code ships unchanged. **Tauri v2 mobile** is the
  sibling (system WebView; one shell story shared with 145).
- **What gets EASIER:** every Safari-chrome problem disappears — no floating
  toolbar, no layout-viewport cap (WebKit 301108 does not apply to a WKWebView
  that owns the window), no glass band, no `vh`/`lvh` roulette, no
  `?phone=1`. Safe areas become one static system (`viewport-fit=cover` +
  `env()`); the `data-island` + `tailwindcss-safe-area` stack from 267 carries
  over as-is, and `--app-h` may collapse back to a plain 100% height.
- **What is NEW work:** WKWebView keyboard behaviour (input accessory views,
  `visualViewport`); native status-bar colour + splash + icons; signing /
  provisioning / App Store Connect + review cycles; App Review 4.2 "minimum
  functionality" (fine here — offline tool, local data, collaboration — but
  import/export should feel native via Files/share sheet); push notifications
  if collab alerts are wanted.
- **Non-negotiables:** ONE build, ONE UI — the wrapper loads the same `dist/`;
  any native bridge goes through existing seams (provider / debug bridge),
  never a parallel state path.
- **Verify (when built):** the app launches the existing UI end-to-end on a
  device (open project, edit, persist, rotate); safe areas + keyboard pass;
  TestFlight build; `npm run lint` + full suite unchanged.
- **Relations:** `extends` **145** (desktop shell — same decision, shared
  wrapper tooling); informs **269** (the in-Safari sweep still matters for
  the hosted web app); reuses the 267 safe-area mechanism.

**From the 2026-10-16 production-readiness audit.** Items 274–291 below; each
is self-contained, with findings referenced by their F-numbers (full report:
`audits/2026-10-16-production-readiness-audit.md` — local, git-ignored, main
working tree only). Findings F17 (MCP per-session handshake) and validation
parity are already scoped inside item **97** — not duplicated here.

**Pick-up convention (audit items):** "do the next audit item" = the
lowest-numbered open item below, starting at **274** — filing order equals
priority order (274 = P0; 275–278 = P1; 279–288 = P2; 289–291 = P3, and 289 is
parked until unparked). Normal one-agent-per-item flow; close each through
`manage-roadmap` before picking the next.

## 279. Backups & a tested restore (`[ ]`)

**Priority: P2 — before the first stranger/paying user.** Audit F7.

**Request:** collab data has no backups/PITR on the free tier and no restore
has ever been run.

- **Approach:** decide the Supabase Pro upgrade (daily backups + no pausing)
  before the first paying collab customer; write a restore runbook (where
  backups live, restore steps, user-visible behaviour); **execute one drill**
  against a scratch project and record it. Note the paused-project restore
  window (1 year) for the pre-Pro period.
- **Pre-Pro safety net (owner-approved 2026-10-16):** a scheduled
  `supabase db dump` to off-site private storage (rides the keep-alive
  workflow or a local cron) — dumps include `auth.users` (+ password hashes)
  and every table, so a mistaken account/project deletion becomes fishable
  months before Pro. Dumps carry user data: **never commit them**, storage +
  access live in the runbook. Runbook gets the "fish rows out of a dump →
  replant" recipe; the dumps are the drill's fallback target while Pro is off.
- **Verify:** drill notes in the runbook + an annual re-test reminder; a dump
  archive exists off-site and one row-level replant from it has been rehearsed.

## 280. Transactional email — SMTP + SPF/DKIM/DMARC (`[ ]`)

**Priority: P2 — before reset emails must reach strangers.** Audit F8.

**Request:** auth email (confirm/reset) uses Supabase's shared mailer — no
custom SMTP, no sending-domain records; deliverability to arbitrary users is
unverified.

- **Approach:** custom SMTP + SPF/DKIM/DMARC; verify reset delivery across
  Gmail/Outlook/Apple Mail before inviting strangers; note bounce/complaint
  handling as a follow-up when product email exists
  (`docs/COLLABORATION.md` §11 context).
- **Verify:** a real reset lands in all three inboxes, not spam.

## 285. CSP + response-hardening pass (`[ ]`)

**Priority: P2.** Audit F13.

**Request:** no CSP, no referrer policy; the app is framable.

- **Approach:** meta `Content-Security-Policy` in `index.html` with a real
  allowlist (GIS/Google OAuth, Supabase https+wss, gstatic probe, OSM tiles +
  Nominatim, Google Places, Open-Meteo), plus `Referrer-Policy`.
  **`frame-ancestors`/X-Frame-Options cannot be set via meta** — clickjacking
  needs a header-capable layer (Cloudflare in front of a custom domain) or an
  explicit accepted-risk note in `docs/SECURITY.md` §7.
- **Verify:** boot + OAuth + Drive + rooms + maps all work under the policy
  (manual pass); consider a report-only trial first.
- **Relations:** pairs with **274** (CSP kills the stored-XSS inline-handler
  class as defense in depth).

## 286. Observability floor — error tracking, uptime, one human alert (`[ ]`)

**Priority: P2 — before public launch.** Audit F14.

**Request:** no error tracking; uptime detection is the keep-alive workflow
alone; the only "alert" is a red GitHub Action.

- **Approach:** client+worker error tracker; external uptime checks on the
  hosted app and the worker `/health`; one alert path that reaches a human;
  decide what deserves paging (`docs/SECURITY.md` §7 notes edge rate limits/WAF
  as the same pre-launch batch).
- **Verify:** inject a test error + simulate an outage → both alert.

## 287. Staging environment + migration workflow (`[ ]`)

**Priority: P2/P3 — before real tenant data.** Audit F16.

**Request:** one Supabase project serves dev and prod; migrations are
hand-pasted, forward-only, with no staging or rehearsed rollback.

- **Approach:** a second Supabase project as staging; apply via `supabase db
  push` (or a recorded ledger if staying in the SQL editor); document
  rollback/forward-fix policy and expand/contract for breaking changes; the
  `supabase/tests/` acceptance scripts stay the gate.
- **Verify:** rehearse one migration staging→prod; runbook in
  `docs/COLLABORATION.md` §5 (or a new ops doc).

## 288. Terms & privacy pages (`[ ]`)

**Priority: P2 — before paying customers.** Audit F18.

**Request:** no terms/privacy exist; data flows to Supabase, Cloudflare,
Google Drive, OSM/Nominatim, Google Places, Open-Meteo (per code).

- **Approach:** privacy policy derived from the code + `docs/SECURITY.md` §2
  (every third party + purpose), basic terms; footer links in the app and on
  the hosted page; align with the merchant-of-record model when 230 lands.
- **Verify:** every claim cross-checked against code/config before publishing.
- **Relations:** roadmap 294's account archive (30-day operator restore window,
  incl. the credential hash) must be disclosed in the privacy notice —
  security review 2026-10-16 (F-03).

## 289. CI quality gates & dependency automation (`[ ]`, PARKED)

**Priority: P3 — parked by owner 2026-10-16.** Audit F4 + F15.

**Parked knowingly:** the owner runs lint/unit/e2e locally before every push
(AGENTS.md rule 7); with a single trusted pusher the CI gate earns less than it
costs. **Unpark when:** a non-owner ships code, an external contributor joins,
or public launch nears.

- **When unparked:** PR-triggered workflow (`npm run lint` + `test:unit` +
  `npm audit`); gate `deploy.yml` on it; Dependabot/Renovate for dependency
  bumps (e2e stays local — suite cost). Note `npm audit = 0` is currently a
  human-memory policy (`docs/SECURITY.md` §5).

## 290. Audit code-health sweep (`[ ]`)

**Priority: P3.** Audit items #132/137/138 + the surprise flags.

- **Oversize files:** 28 sources exceed the project's own ~700-line split rule
  (29 counting test files; largest `src/store/provider.tsx` ~1.7k) — split or
  consciously re-justify the rule, consider enforcing it in
  `scripts/check-doc-budget.mjs`.
- **Dead code/leftovers:** `deleteProjectFromFolder` (zero call sites,
  `src/lib/persistentStorage.ts`), the unreferenced `allowScripts` allowlist
  (`package.json`), AI-Studio leftovers (`GEMINI_API_KEY` in `.env.example`,
  `metadata.json` capability claim).
- **Hygiene:** `package.json` name `react-example`; lockfile root version
  behind; `@glideapps/glide-data-grid` on a pre-release alpha — pin or watch.
- **Verify:** behaviour-neutral; `npm run lint` + full suite unchanged.

## 291. Enterprise-readiness gate (`[ ]`, P3 — triggered by an enterprise deal)

**Priority: P3 — do not build speculatively.** Audit P3 umbrella.

Open only when a deal, questionnaire or security review demands it; each line
then becomes its own item/id: MFA + recovery; SSO/SAML/SCIM; admin console
("log in as user") + durable audit/access events (today's `access_events`
migration persists nothing); quarterly access reviews; pen test +
questionnaire evidence pack; SOC 2 / HIPAA / PCI assessment (all N/A today);
second region; load testing. Triggers into **230** (licensing) for the billing
side.

## 292. Roadmap tooling — query CLI + per-item file split (`[ ]`, PARKED — build only on trigger)

**Requested** 2026-10: "what's next on the roadmap / related to X" answers cost
full-file reads (~23k tokens/session), and parallel-worktree close-outs collide
on these two shared files.

**Researched verdict — do not build yet:**
- **No external tracker** (beads / Backlog.md / Linear): adopt-their-model + new
  ID scheme (ours are stable numeric ids referenced by docs/commits) + lose the
  `npm run lint` roadmap gate; the migration cost is paid either way.
- **No separate repo:** two-step close-out (loses one-commit atomicity), lint
  gate gone, conflicts just relocate there.
- **If built (in-repo delta):** `scripts/roadmap.mjs` — `next / list / show /
  find / add / status / close / stats`, `--json`; `next` = open, non-parked, id
  order, flags + `Relations` shown inline (relations are prose — no computed
  dependency engine). Per-item files `docs/roadmap/<id>-<slug>.md` + generated
  `ROADMAP.md` view; archive keeps `.gitattributes` `merge=union` + the existing
  duplicate-id lint as the conflict net. Wire-up: `check-doc-budget.mjs` (same
  invariants, new layout), `manage-roadmap` skill, AGENTS.md pointers.

**Trigger:** backlog ≳5× today, OR two worktrees genuinely collide here, OR the
skill §Queries greps prove insufficient.

**Compat audit done** (2026-10): 52/52 items + 238/238 archive rows parse with a
tolerant split; quirks — #230 has no status marker, 7 archive rows carry `|`
inside inline code, `Relations` has two spellings.

**Relations**: interim answer shipped — `manage-roadmap` §Queries grep recipes.

## 293. Guest cleanup — stale anonymous accounts (`[ ]`, P3 — parked by the 281 decision 2026-10-16)

**Priority: P3 — pre-public-launch.** Parked out of 281 by owner decision.

**Request:** invite-link guests (anonymous sign-ins) accumulate with no cleanup.
Self-serve deletion covers them (281), but nothing reaps accounts nobody will
ever return to.

- **Approach:** decide the policy first (inactivity window — e.g. anonymous
  accounts with no session/activity for 90+ days), then ONE sweep (pg_cron +
  admin API, or a scheduled Edge Function) that deletes them through the same
  path 281 built. Never touch guests that converted to a full account.
- **Verify:** a dry-run report of what would be reaped + one live sweep on a
  scratch project.
- **Relations:** extends **281** (the deletion path ships there).
