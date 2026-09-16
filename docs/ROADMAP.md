
# Roadmap — Future Implementations Checklist

This file is the pending work list: `[ ]` not started, `[~]` in progress.
Only open/in-progress items live here — the live file is read by every
roadmap worker session, so it stays lean.

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
same commit. The events-mode day cells, section tabs, and icon-only buttons stay bespoke
(no kit primitive exists; icon-only is the documented exception).

## 96. Spread `wrapValue` (multiline entity dropdown + growing container) to the other surfaces (`[ ]`)

- The Scene Sheet got the opt-in `wrapValue` prop (`EntityDropdown`: closed
  values wrap onto new lines, the editor is a wrapping `<textarea>` covering
  the whole cell, and the container grows with content — roadmap 95). The
  SAME pain exists wherever an entity dropdown holds a long comma-list inside
  a fixed container. Check and extend:
- Candidate surfaces (verify each on a seeded project with a long cast/list):
  - **Link Manager** (`elements/LinkManagerModal.tsx`) — the linked-element
    rows are the chip-`EntityDropdown` `ElementPickerRow`s; long lists may
    truncate and the row container stays fixed.
  - **Glide overlay editors** (`src/lib/glideEditor.tsx`) — `autoGrow`
    widens horizontally (roadmap 88) but never grows vertically/height.
  - **Stripboard / boneyard cells** — edit-mode cells truncate; may be
    intentionally single-line (leave if so — the sheet form was the pain).
  - **Day/event modal attachment rows** (`DayEventsModal`, `ElementEventsModal`)
    — multi-mode EntityDropdown rows.
  - **Color Rules / rule editor cast pickers** (`rules/ElementPicker.tsx`).
- The `wrapValue` prop is already opt-in and surface-agnostic; `resolveClosed`
  resolves cast to "1. NAME". The worker should wire `wrapValue` per surface
  where it fits (and stretch the container like the sheet's `flex flex-col` +
  `flex-1` + `pb-[1lh]`), NOT change EntityDropdown's default behavior.
- Decide per surface: full multiline growth vs. keep single-line cells that
  are edited in place (stripboard). Document the choice in the item's Done
  note. Only add to `SHEET`-adjacent specs that exercise the changed surface.

**Verify**: lint + e2e for each surface actually changed.

## 97. Developer/agent API + MCP server for the app (`[ ]`)

**Relations**: extends the debug bridge (AGENTS.md §Agentic Debug Bridge);
must reuse the canonical `Action` union/reducer — no parallel mutation path.

**Progress (stage 1 — live bridge, shipped)**: `tools/mcp/` (MCP stdio server +
loopback WS helper, Origin/Host checks, proxy-on-busy) + `src/lib/agentBridgeClient.ts` /
`useAgentBridge.ts` + **File → Connect agent bridge**. Reads (`get_project`,
`list_scenes`, `get_schedule`, `list_entities`, `get_versions`, `get_schema`) and
writes (`apply_actions` atomic batch, `make_scene`, `undo`/`redo`) route through the
debug bridge; tool schemas/entity shapes are DERIVED from `reducer.ts`/`types.ts`
(`tools/mcp/actionSchema.mjs`). Blocked: `LOAD`/`EMPTY_TRASH`; read-only refused.
Docs: `docs/API.md`. Remaining for the full item: friendly write wrappers
(`edit_scenes`/`manage_entities`), pairing token + destructive-op confirmation +
audit/rate limits (security P1), project lifecycle / import-export / derived
analytics (P3), validation parity (P4), contract versioning (P5).

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

## 121. Smart lookup tokens — `@item.attribute` two-stage drill-down in rich-text editors (`[ ]`)

**Request**: in any rich-text token editor (reports designer text blocks /
free-table cells / headers, Call Sheet zone), typing `@` opens the lookup
picker. Today it's a flat query-filtered list — item · attribute in ONE step
(item 100's documented deviation). Users want object-dot-property: type `@` →
pick/search an item ("Bob") → press `.` → see only THAT item's attributes
(call time, phone, email, …) → pick one. Should cover every lookup collection
(cast, crew, days, locations, categories, location types, day types) with fuzzy
search + category grouping.

**Design**: the token format is already right — `lookup.<collection>.<field>.<encodedItemKey>`
stays; this is a PICKER feature, not a new data model. Reuse the canonical
`buildLookupTokens(project, days)` for stage 1 (items grouped by collection,
stable keys) and `getReportFieldDefs(project)`/`fieldsForScope` for stage 2 —
the field registry already scopes attributes (a cast member's phone/email/
call-time vs a location's address), so invalid picks never appear. The kit
rich-text editor has no nested picker, so this needs a kit change: stage 2 as a
submenu of the highlighted item, or a second popup stage after the `.`. Keep the
flat list as a fallback (typing a full `item.attr` query still works) and fire
the `.` trigger only after a committed item. Insertion stays a single chip whose
label resolves to the item name (renames don't break the stable key).

**Verify**: e2e in the reports designer + Call Sheet editor — type `@`, pick an
item, `.`, assert the attribute list is scope-filtered, pick one, assert the
token resolves/renders (link fields still link); a ui-kit bump + playground
spec for the nested picker.

**Relations**: extends 100 (the deferred three-step picker — **DONE**) and 19/16
(token chips/affixes — **DONE**); touches the ui-kit rich-text editor +
`reportFields.ts` (`buildLookupTokens`, `fieldsForScope`).

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
111/112 grids and 113/114 call-sheet chrome; related to 140/141.

## 143. Reports designer — cast/element tables ordered by Board ID (`[ ]`)

**Request**: tables (and element blocks) that iterate cast should list rows by
**Board ID** — the cast id behind the "1. GEORGE" display and the call-sheet ID
column — not scene-appearance order. Non-cast element categories should have a
predictable order too (by name, numeric-aware) unless a category board id
applies.

**Why it isn't already**: the order is incidental to `loadCategoryElements`
(`src/lib/elements.ts:31`) — cast = first-scene-appearance order, then the
remaining `project.castMembers` in stored order. `buildElementsFor`
(`src/lib/reportData.ts:778-823`) wraps that into `ReportElementInfo[]`, and
`resolveCollection` (`reportData.ts:943-944`) serves it to repeats AND tables,
so today's table order is whatever scene order produced.

**Approach**:
- Add a cast `boardId` to `ReportElementInfo` (`elementMatchId(e, 'cast')` is
  the id; `boardId` is currently only populated on `elementCallsOfDay` items,
  `reportData.ts:987`) and sort the cast collection by it.
- Use a natural compare (`naturalSortSceneStrings`, `src/lib/utils.ts:158`) so
  1, 2, 10 order correctly (not 1, 10, 2); blank ids sort last.
- Element categories: `localeCompare(..., { numeric: true })` on the name —
  confirm whether any category has a board id worth ordering by first.
- Sort in the SHARED collection (`getElementsFor`/`buildElementsFor`) so
  tables, repeats and future surfaces agree — do NOT fork a table-only order.
  `EntityDropdown`/pickers keep their own order.
- A user-facing sort control, if wanted later, layers on this canonical order —
  out of scope here.

**Verify**: unit (`reportData`/`elements`): numeric + letter board ids order
naturally, blank last, order stable; visual check of a cast table in
designer/preview/print. Fixed-list ordering = manual per rule 7 (no e2e) unless
a silent wrong-order regression proves one is worth it.

**Relations**: touches 140 (table title) and the 100/81 collection pipeline;
read `docs/REPORTS-DESIGNER.md`.
