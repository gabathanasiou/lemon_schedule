
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

## 93. Ribbon designer — kit ContextMenu/dropdown for the cell menu (`[ ]`)

- The ribbon designer's **cell context menu** (`RibbonContextMenu.tsx`) is a
  bespoke fixed menu — rework it onto the kit `ContextMenu` so it gets the
  shared morph/positioning/keyboard/close-on-outside for free:
  - the **field list** (all fields, active check) → kit `ContextMenuItem`s;
  - **Clear field / Delete Column** → kit `ContextMenuItem` (danger);
  - **Prefix / Suffix / Text-content inputs** stay in a small custom floating
    strip (the kit menu's single-highlight key lock captures typed letters, so
    a Radix menu can't host text inputs without breaking typing).
- The toolbar buttons/icon-tabs/size-fields are already kit-powered (item 92
  batch); this item is the last bespoke surface in the designer.

**Verify**: lint + designer manual pass (open the cell menu, pick/clear/delete
a field, edit prefix/suffix/text).

## 95. Scene Sheet entity cells — wrap long values + full-box writing hitbox + auto-grow notes (`[ ]`)

- In the Scene Sheet (`SceneSheetFields`), the closed entity dropdowns (Cast,
  Set, Location, all category boxes) truncate long values with an ellipsis
  (`truncate whitespace-nowrap` overlay) and their write hitbox is a single
  `h-[1lh]` line — a 22-member cast is shown cut, and clicking the box's empty
  padding does nothing. The Notes/Synopsis textareas are fixed `rows={2}`
  scroll boxes that don't grow with content.
- 1. **Wrap, don't truncate**: add an opt-in `wrapValue` prop to
     `EntityDropdown` that swaps the closed display overlay from
     `truncate whitespace-nowrap` to `whitespace-normal break-words
     leading-snug` (top-aligned), so long comma-lists flow onto the lines
     below the cell.
  2. **Hitbox = whole container**: `wrapValue` also makes the write target
     (transparent input) cover the whole cell — wrapper loses `h-[1lh]`
     (grows with content via `min-h-[1lh]`), input becomes `absolute inset-0
     w-full h-full`, and the SceneSheet passes `wrapValue` + stretches the
     box (`flex flex-col` + `flex-1` on the dropdown) so clicking anywhere in
     the Cast box (min-h-80px) or a category box opens the editor.
  3. **Auto-grow notes**: Notes/Synopsis textareas move to the
     `[field-sizing:content] resize-none overflow-hidden` auto-size pattern
     (same as the manager name cells), starting at `min-h-[2lh]` and growing
     with content instead of scrolling in a fixed 2-row box.
- Applies only where `wrapValue` is passed (the Scene Sheet) — stripboard,
  Glide and modal usages keep the single-line truncating cell behavior.
- e2e: seed-agnostic `scene-sheet-cell-layout.spec.ts` — set a long cast via
  the bridge, assert the closed display shows no ellipsis and wraps to >1
  line; click the box padding and assert the input receives focus; type a
  multi-line note and assert the textarea grows past 2 rows. RULES:
  `src/components/SceneSheet*.tsx` already maps to SHEET; add the spec to the
  `SHEET` bucket.

**Verify**: lint + `scene-sheet-cell-layout.spec.ts` + scene-sheet-order
regression.

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

- **Goal**: expose the app's project data and mutation surface to external
  developers and AI agents as a supported, versioned contract — not just the
  internal debug bridge. **Agents must be able to WRITE, not just read** — full
  parity with what a user can do in the UI.
- **What exists today (not this)**: `window.__lemonSchedule`
  (`src/lib/debugBridge.ts`) is an in-page, DEV/`LEMON_AGENT=1`-only read/write
  window over the store, explicitly "dev tooling, not a product feature"; the
  repo's `opencode.json` Playwright MCP is browser automation, NOT an app API.
  There is no stable external contract, no MCP server for the app, no auth, no
  versioning.
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

## 132. Portable script pane, scene cuts/duplicates & split-aware script revisions (`[ ]`)

> **Progress**: **Part A pane** shipped (`SceneScriptPane` + `ScriptPaneToggle`
> + `useScriptPanePref`; right-docked, collapsible, resizable, Sheet + Glide
> hosts, follows selection) and the **Part B FDX fix** (tagged `<Text>` runs
> retained in the body) — plus **123 Phase 1** (Script sub-tab). **Part B
> foundation shipped**: identity-anchored tags (`ScriptAnnotation` +
> `project.scriptAnnotations` + canonical `ADD/UPDATE/REMOVE_SCRIPT_ANNOTATION`)
> render category-coloured (dotted = recognised / solid = committed), tag from a
> text selection in the Script sub-tab (`ScriptTagModal` reusing
> `CategoryDropdown` + `EntityDropdown` + `addNewElement`), and an element
> rename cascades annotation refs in the same `caseUpdateElement` batch
> (`src/lib/scriptAnnotations.ts`); FDX `<Text TagNumber>` runs seed recognised
> (dotted) spans on import (`ScriptAnnotationSeed` → `commitImport`); the
> divergence view + undoable **"Update script text"** records `elementAliases`
> (applied by `parseFDX` on re-import) — **Part B complete**. **Part C complete**
> (cut at a block boundary → lettered boneyard scene + tags move; merge-with-next
> reverses; one batch — `src/lib/scriptSceneOps.ts`, `SceneCutModal`, Script
> sub-tab hover). **Part D complete** — ONE duplicate modal
> (`SceneDuplicateProvider`/`useSceneDuplicate` + `SceneDuplicateModal`,
> `buildSceneDuplicate`) serves stripboard/Glide/Scene Sheet with Split /
> Coverage (copy badge) / Not care; `Scene.duplicateOf`/`duplicateKind` record the
> relationship. **Part E shipped (lean)** — split groups (`src/lib/splitGroups.ts`)
> + `SplitManagerModal` list cut groups with a clean/diverged badge and Merge back
> (`mergeSplitGroup`) / Open; Renumber / Move break / Resolve remain. **Part F
> shipped** — `annotationRemap` re-anchors tags through a revision (orphans
> counted in the review), same-number/low-similarity pairs flagged `collision`
> (default keep), and the review shows a split-group notice. **123 Phase 3
> shipped** via `SceneScriptPreviewProvider` (shared hover preview, wired on
> Calendar scene cards; item 123 closed). **Remaining script work (order)**:
> **136** (tagging overhaul — selection→category menu + import-span unification +
> suggestions) → **E** Renumber / Move break / Resolve → **F** interactive
> Apply-to-both / Merge-back / Keep review. **137** (AI) parked; **135** integrity
> audit; **43** / **133** blocked.
> **API/agent compatibility is a hard constraint** (see API note + Relations 97).

**Relations**: `depends on` **123 Phase 0** (**DONE** — retained
`project.scriptDocument` / `scriptBaseline`); `reuses` the existing
`ScriptSceneScript` renderer (`src/components/script/`) and **delivers the ONE
portable `SceneScriptPreview` component** (`SceneScriptPreviewProvider`, now the
shared hover preview — item 123 closed); `overlaps` **123 Phase 2** tagging
(reuse `addNewElement` / `EntityDropdown` — no second tag model); `extends` **38**
(**DONE** — Part F builds on the shipped `commitScriptDiff`/`scriptDiff` engine)
and upgrades its `tagSplitMerge` to split-aware / appliable (one split engine);
`reuses` **127** `parseSceneHeading` (**DONE**: `src/lib/import/headingValues.ts`)
and the shared `nextLetterSceneNumber` (`src/lib/sceneNumbering.ts`); `enables` **97** — every script/annotation write is
a canonical `Action` (see the API note below).

**Requested**: a portable, collapsible/resizable **preview pane** of the real
scene in screenplay format, live and available in the Glide Breakdown and the
Sheet tab; select-and-tag elements (and edit/create the set) straight from the
page; cut a scene at a point into an intelligent `6A`; and make that cut survive
script revisions (or ask). Industry precedents: Filmustage's read-only script
panel in the Stripboard, Scene Breaks + Merge-with-next, Duplicate-with-copy-badge,
and annotation layers; StudioBinder's bulk rename explicitly does NOT rewrite the
script. Nobody ships an automatic split-aware content merge — that is the
differentiator, so it is phased and human-in-the-loop.

### Phase P0 — authoring, tagging & deterministic reconciliation

**A. Portable split pane** (`SceneScriptPane`, docks **RIGHT**): toolbar toggle
in the **Sheet + Glide Breakdown** tabs (pref-persisted); **collapsible** and
**resizable** (reuse the `useColumnResize`/`ColumnResizeStrip` pointer-dragger —
never a new dragger); **bottom sheet on coarse/iPad**. Header = live scene number
+ heading, a `PREVIEW` label, `−`/zoom/`+`, close. Body renders via the 123
renderer; **follows selection both ways**; live from memoized project state.
Empty states: no retained body → "predates retained scripts" CTA; scene missing
→ "No script for scene N".

**B. Layered model + tagging + FDX tags**:
- **Structured** fields (INT/EXT · set · location · day-night) render **live** and
  edit inline via `useLinkedEditGuard.tryCommitSceneEdit`; **authored prose is
  preview-only** (text editing stays in the 123 Script sub-tab).
- Tags are **identity-anchored span annotations**, category-coloured (dotted =
  recognised-untagged, solid = committed); popover: Edit/rename/create,
  Change category, Remove, View in Element Manager.
- **Must-not-miss**: `caseUpdateElement` (`breakdown.ts:156-190`) rename-cascades
  scene fields BY NAME — annotation refs must be updated in the **same rename
  batch** (cast is ID-anchored and safe).
- Rename never rewrites the page: show `Tag: PISTOL · Script: "gun"`, offer an
  explicit undoable **"Update script text"**, keep the old wording as an **alias**
  so re-imports still recognise it.
- **FDX fix**: seed spans from imported `<Text TagNumber>` and stop dropping
  tagged words from the retained body (`fdx.ts:154-166` — a tagged phrase
  currently leaves a hole in the script).

**C. Cut → `6A`** (`SceneCutModal`): block-**boundary** cut affordance on hover;
modal with an editable split point, **auto** (`6 → 6A`) or custom number,
prefilled **intelligent heading** (`parseSceneHeading`, carry the parent's
INT/EXT·set·day-night), and **inherit all parent element fields** plus an
optional **"move tags after the cut"** (via spans). New scene lands in the
**boneyard** (schedule untouched). **One batch**: body division via
**`UPDATE_SCRIPT_DOCUMENT`** (baseline NOT rotated — `script.ts:19`) +
`ADD_SCENE`. **Merge with next** reverses.

**D. Duplicate modal**: unify the three duplicate flows (stripboard / Glide /
**Scene Sheet `SceneSheet.tsx:290`, which today does not renumber**) through one
modal: **Split/second scene** (renumber `6A`, copy body) · **Coverage/second
unit** (same number + "copy" badge, schedule-only, script untouched) · **Not
care** (plain duplicate, no metadata). Records the relationship.

**E. Split groups + Split Manager**: model `{ original, fragments, cutAnchor }`
keyed by scene **id** (never number — duplicates/scene-sheet copies share one);
the `cutAnchor` is **content-based**, not a raw offset, so it survives imports
and `scriptBaseline` rotation. A Breakdown toolbar modal lists every group
(`5 → 5 + 5A`) badged **clean / diverged / merged-back / conflict**, with
**Merge back**, **Move break**, **Renumber**, **Open in pane**, **Resolve**.

**F. Import reconciliation (deterministic, P0)**: on import, detect split groups
and open an **explicit split review** — "scene 5 was split into 5/5A; the script
revised scene 5" with per-fragment before→after and **[Apply to both] / [Merge 5A
back] / [Keep]**. When the script itself splits a scene we hold whole, **suggest
adopting it** (cut-point previewed) with default **keep** — never auto-create.
**Number-collision rule**: same number + low body similarity ⇒ a collision
decision, never an auto-match. Annotation spans **remap through the import block
alignment** (`diffScriptBlocks`/`diffArrays` the review already computes):
unchanged blocks carry spans 1:1; changed blocks re-anchor or are **flagged
orphaned** (count + re-tag) — never silently corrupted.

### Phase P1 — deferred, gated on real usage

Build ONLY if P0's explicit review proves too painful: **automatic 3-way
projection** of a revision's edits across a cut. Reconstruct base from the
fragments, diff theirs↔base, project each change across the cut onto the correct
fragment; **auto-apply only when clean, ask when ambiguous** (straddle / re-split
/ merge-back). Must be a pure, golden-tested module; **never auto-write at low
confidence**. The same commit may add writer-side split auto-adoption, same gate.

### API / agent compatibility (hard constraint — item 97)

Every write this item introduces MUST be a dispatchable `Action` (the reducer
union + `ACTION_TYPES` kept in sync) so the developer/agent API reaches it **by
construction** — never a parallel mutation path, never out-of-band writes to
`scriptDocument` or the annotation layer. Concretely, an agent must be able to,
through the canonical surface: **load / replace a screenplay**
(`SET_SCRIPT_DOCUMENT`, exists), **tag elements and write descriptions from the
page** (`UPDATE_SCENE` fields already; the annotation layer needs new
`ADD_/UPDATE_/REMOVE_SCRIPT_ANNOTATION`-style actions added to the union), and
**read** the retained body + annotations via the bridge/API reads. The
annotation model must therefore persist as project data reached through an
action — not as local/transient view state — or 97's derived API surface can't
see it and the store drifts. (Same rule for the cut/Split-Manager writes:
`splitting` scenes uses the existing `ADD_SCENE` / `UPDATE_SCENE` /
`UPDATE_SCRIPT_DOCUMENT` actions; no new bespoke path.)

**Must-cover edge cases**: no retained body (degrade to the existing review);
two scenes sharing a number (group by id); `normalizeSceneNumber('5.1') → '51'`
collision (fix); multi-letter / nonstandard numbering (documented set only);
mid-dialogue cut (block boundaries only); a tag span straddling the cut; element
over-inheritance; `elementLinks` anchors across fragments; undo/redo of a cut;
delete/move a fragment (group cleanup); page-count/eighths division.

**Out of scope**: PDF/OCR import, FDX write-back, `ScriptNote`/revision-colour
fidelity, auto-adopting a differently-cut writer split, concurrent-edit conflict
resolution, the archived-versions hub (123/125).

**Verify**: seed-agnostic — pane renders + follows selection in both tabs,
collapses/resizes, coarse bottom-sheet; rename a prop → highlight survives, prose
unchanged, text-sync + alias work; FDX import keeps tagged words + seeds spans;
cut mid-scene → `6A` heading + body split, one undo; each duplicate mode; import
a revision editing both sides of a split → edits land correctly, a straddling edit
asks, a collision is flagged; writer `5A`/`5B` suggests adopt (default keep);
merge-back reverses; `npm run lint` + `npx playwright test`; extend
`scripts/smart-test.mjs` `RULES` for the new pane/cut/split files.

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

## 135. Project script-map integrity audit + repair (`[ ]`)

**Problem**: a `.lemon` can carry a stale/corrupt script map (a real file has two
scenes numbered `40` → one script body shadowed). The app has no way to detect or
repair it, and `97`'s "validation parity" only covers *new* API writes.

**Idea**: a read-only audit (bridge + a Reports/Diagnostics surface) that lists
project↔`scriptDocument` mismatches — duplicate normalized numbers (project AND
body), project scenes with no body, bodies with no scene, scene→row invariant
breaks — with an explicit, undoable repair (renumber collision to `40A` etc.,
prune orphan bodies) so a corrupted file is recoverable without hand-editing JSON.

**Relations**: `related to` **134** (prevention) and **97** (same integrity
surface an agent API should expose).

**Verify**: runs over the Lair V17 fixture (duplicate `40`) → reports it;
repair renumbers both project scene and body in one undo; clean files report
"no issues".

## 136. Script tagging overhaul — selection → category menu, import-span unification, suggestions (`[ ]`)

**Requested**: replace the tag **picker modal** with the industry-standard
"highlight → click category" flow (StudioBinder / Final Draft / Movie Magic
model). The highlighted text BECOMES the element — never a picker into existing
elements. Imported FDX tags and auto-suggestions must render and behave
IDENTICALLY (one dotted→solid pipeline). Follow-up to the **132 Part B**
tagging foundation (the picker felt wrong) — narrative in git history.

**Relations**: `supersedes` the `ScriptTagModal` picker built under **123
Phase 2 / 132 Part B**; `depends on` the `ScriptAnnotation` model + canonical
`ADD/UPDATE/REMOVE_SCRIPT_ANNOTATION` actions; `reuses` kit `ContextMenu` /
`FloatingTooltip`; `extends` **132 F** (import remap); `enables` **137**.

**Ground rules (user decisions)**:
- Selection → context menu of ALL element categories (built-ins + custom,
  icons). NO Location / Script Day. NO EntityDropdown / existing-element picker.
- Click a category → `name = selection.trim().toUpperCase()`; ensure the element
  (non-cast `ADD_ELEMENT {id:name,name}`; cast reuse-by-name else new id via
  `firstFreeCastId` — no naming modal); **append/replace the scene field**
  (`isMultiValue`); `ADD_SCRIPT_ANNOTATION` (`elementKey=name`, `text=selection`,
  committed). Re-tagging the exact range CHANGES its category, never stacks.
- Span = category colour; **hover** → `FloatingTooltip` badge
  `Category · ELEMENT` (+ `script: "…"` only on rename divergence); **click** →
  same menu, current category checked + Remove (moving a category re-points the
  annotation and swaps the scene-field attachment).
- ONE undo batch per action.

**Steps**:
1. `src/lib/scriptTagging.ts` (new, pure): `planTagCommit(project, sceneId,
   category, text)` → `{ elementKey, sceneFieldValue, annotation }`;
   `commitTag(dispatch, project, target, category, text)`; `suggestionRanges(
   project, scene)`.
2. `ScriptTagMenu` (new) — kit `ContextMenu` at the selection rect; one
   `ContextMenuItem` per category; the click-a-tag path adds a divider + Remove.
3. `ScriptView`: drop the floating "Tag" button + `tagModal`; hover badge; a
   **Suggestions** toggle (persisted `usePersistState`, kit `Button active`) in
   the Script header portal controlling every NON-committed span.
4. Renderer: derived suggestions as dotted `ranges` (ephemeral — computed in the
   view, not persisted; skip overlaps with committed tags) alongside stored
   annotations; committed solid; FDX `recognized` spans show while the toggle is
   on and commit on click.
5. Import unification: FDX tags already seed `recognized` (**132 B**) — route
   them through the same menu/commit path. **SEX/MSD have NO retained body → no
   spans (scene fields only)**; document.
6. Delete `ScriptTagModal.tsx`; replace the old tagging e2e; unit-test the pure
   helpers (`planTagCommit`, `suggestionRanges`).
7. Docs: `IMPORT-EXPORT.md` §Script body retention; add the selection-menu
   pattern to `DESIGN-LANGUAGE.md` if it becomes shared.

**Verify**: select "bulbs" → Props → `scene.props` gains BULBS, element exists,
span solid + category colour, hover badge; change category; remove; FDX tag
dotted → click → solid; the Suggestions toggle shows/hides non-committed spans;
a cast cue suggests + commits; SEX import stays scene-field-only; `npm run lint`
+ `npx playwright test`.

## 137. AI script-breakdown suggestions (Filmustage-style) (`[ ]`, FUTURE, parked)

**Relations**: `depends on` **136** (the dotted→solid suggestion pipeline + the
category menu) and **97** (agent/API + prompt-injection/untrusted-data rules);
`related to` **43**/**41** (import tags).

**Idea**: an opt-in pass that proposes elements (props / wardrobe / vehicles /
VFX / …) per scene from the screenplay body, surfaced as recognized spans/rows
for human confirm — NEVER auto-commit. Parked because the deterministic
known-element matching in **136** ships the same value cheaply; AI needs
accuracy, consent and cost decisions first.

**Verify**: TBD when unparked.
