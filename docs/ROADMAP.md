
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
  move-via-controls. Re-run after item 24 lands (shared draggers).

## 38. Script version diff — accept a new screenplay against the current one (`[~]`)

> **Progress**: engine + commit + review modal shipped (`src/lib/import/scriptDiff.ts`,
> `commitScriptDiff.ts`, `ScriptUpdateModal.tsx`): explicit "Update script…",
> number→heading→similarity matching + order-aware alignment, scene-level
> apply/keep/add/skip/remove, per-field keep/take, character-rename detection,
> one-by-one + list views, page-count-safe partial updates, apply report.
> Remaining: baseline-aware conflict rows (needs field snapshots on
> `scriptBaseline`), split/merge e2e, docs.

**Relations**: depends on **123 Phase 0** (retained `project.scriptDocument` +
`project.scriptBaseline`) — the diff and its content fingerprint run on the
real scene body, not the one-line synopsis; do NOT build a parallel body store.

**Requested**: when uploading a newer version of the screenplay, a diff
viewer / acceptance step before anything changes. Research: Filmustage (same
domain: breakdown → schedule) ships a compare hub — Scene Diff
(side-by-side content diff, filter by Modified/Removed), Tags Diff
(added/removed/changed grouped by category), impact summary. Industry
consensus: match scenes by scene number, diff per field; `diff` (jsdiff,
Myers algorithm, word/line level) is the standard JS lib.

**Problem**: `ImportDialog` appends every parsed scene as a brand-new scene
(fresh UUIDs in `commitImport`) — re-uploading a revised script duplicates
all scenes and orphans the schedule. When the project already has scenes,
the import must **diff and update in place** instead of append.

**Matching** (new pure module `src/lib/import/scriptDiff.ts`,
unit-testable, no store/UI deps) — three escalating signals + order-aware
alignment:

1. **Primary — normalized scene number** (`1` vs `1A`; tolerate
   renumber/prefix drift).
2. **Secondary — heading signature** via `parseSceneHeading` (`intExt` +
   normalized `set` + `dayNight`).
3. **Tertiary — content/context similarity** (user-requested): a per-scene
   fingerprint = normalized scene-body tokens (action + dialogue, from
   `project.scriptDocument` — 123 Phase 0) + cast characters (via
   `normalizeCharacterName`) + element items + location; paired by
   token-overlap (Jaccard) score against neighbor candidates — high-score
   pairs match even with no number/heading match (renumbered, retitled
   heading, broken heading).
4. **Order-aware alignment**: the pass is an **LCS alignment over the
   ordered scene lists** keyed by the signals above — an inserted scene
   mid-list never cascades wrong matches onto the scenes after it (classic
   ordered-diff pitfall). **Added / Removed** come from the alignment gaps,
   not per-scene lookups.
5. **Suspected split/merge tags**: one old scene splitting into two new
   (or two merging into one) scores high against the same counterpart
   twice — badge "Scene 8 split into 8A/8B" instead of a confusing
   "modified + added" pair (same scoring data, cheap).

**Per-scene diff** (vs the current saved scene):
- Heading fields: `intExt`, `set`, `dayNight`, `pageCount`/`pageCountDecimal`,
  `scriptDay` — simple equality.
- Scene body — **word-level** diff over the retained `scriptDocument` blocks
  (action, dialogue, dual dialogue; jsdiff `diffWords`, added/removed
  highlighting); falls back to the `description` synopsis text when no body is
  retained.
- `cast` + every element category (props, wardrobe, …) — **item-set** diff
  (± lists; via `getFieldItems`, never raw `split(',')`).
- `notes`, `location` — equality.
- **Unchanged** only when number/heading matched AND context similarity ≈ 1;
  a heading-only match with big content drift shows as **Modified**.

**Trigger — EXPLICIT, not automatic** (user decision): File → Import stays the
plain append flow; a separate **File → Import → "Update script (diff)…"** (and,
long-term, a **Script sub-tab in Breakdown** — 123 Phase 1) opens the update
flow. Never auto-diff on a plain import.

**Review UI — a SEPARATE, keyboard-fast modal** (`ScriptUpdateModal`, NOT an
ImportDialog stage), one change at a time (user decision):
- The current change renders as **proper screenplay** — current vs incoming —
  via the SHARED `ScriptSceneScript` renderer (built for 123 Phase 1; never a
  second renderer): Courier, indents, dual dialogue. Block-level ± highlight
  (removed blocks shown in place, struck through; added blocks highlighted);
  item ± lists for cast/elements; before → after for heading fields. A
  split/merge change diffs the old scene against each fragment.
- The queue **clears one by one**: Update/Take (`→`/`U`) or Keep (`←`/`K`)
  (Add/Skip for a new scene, Keep/Remove for a removed one) removes the change
  and instantly shows the next. Progress "Change 3 of 12"; the final change
  flows into a one-line impact summary (page-count shifts, cast/element adds,
  split/merge) + "Apply N changes".
- **Conflicts** (baseline-aware): a field whose CURRENT value differs from
  `project.scriptBaseline` AND the incoming script also changes it — i.e. your
  in-app edit vs the writer's new value. Annotate the baseline inline as
  "was:" and offer keep yours / take the script. (Deferred until the baseline
  carries field snapshots — see Notes.)
- **Removed scenes default to KEEP** — the stripboard/schedule investment is
  untouched unless the user opts in.
- Existing review controls stay (new categories, hidden categories with data,
  cast ID assignment/ordering) as a final step before Apply.
- Footer: "Apply N changes" + Cancel.

**Notes**: the baseline conflict comparison needs per-scene field snapshots
(Phase 0 currently retains the body only) — extend `scriptBaseline` or catch
up here before shipping the conflict row.

**Commit** — one undo entry (`BATCH_START`/`BATCH_COMMIT`; extend/parallel
`commitImport` with a `commitScriptDiff`):
- Matched + accepted → `UPDATE_SCENE` patches **in place, ids preserved**
  (stripboard rows, day assignments, call times, ribbons survive;
  `caseUpdateScene` re-parses `pageCount` on patch).
- Added → `ADD_SCENE` — lands **in the boneyard** (`containerId: null`,
  `maxBoneyardOrder + 1`, schedule.ts:24-31 — user decision: new scenes
  never shift the stripboard; user restores them where they belong).
- Confirmed-removed → `DELETE_SCENE` (scene→row invariant: rows removed in
  every version; copy goes to trash, restorable).
- New cast → existing `castIdMap` flow (`ADD_CAST_MEMBER` +
  `ADD_ELEMENT` cast category — cast referenced by ID, names via
  `normalizeCharacterName`); new elements → `ADD_ELEMENT` per category;
  new/updated sets as today.
- **Script body** — the SAME batch also writes `SET_SCRIPT_DOCUMENT` (the new
  body becomes current; the previous current becomes `scriptBaseline`), so the
  diff path stays in sync with the retained body (123 Phase 0) — one pass, one
  undo entry.
- No new scene/cast/element action types (all exist: `UPDATE_SCENE`/
  `ADD_SCENE`/`DELETE_SCENE` + element/category/cast actions); the body uses
  123's `SET/UPDATE_SCRIPT_DOCUMENT`.

**Dependency**: `diff` (jsdiff) — `diffWords` for the body diff +
`diffArrays` for the LCS alignment; the standard, tiny, browser-safe lib.
New-dep rule: imported by ≥1 source file.

**Verify**: re-import the seed script ("IT'S A WONDERFUL LIFE") with a few scenes edited,
added, removed, one split, one renumbered, and one field hand-edited in-app
before import (must surface as a conflict with the baseline value shown) →
only diffs apply; unchanged scenes keep ids; schedule + ribbons intact; new
scenes in the boneyard; removed scenes kept by default; undo restores exactly;
filters + expanded diffs render; lint + playwright. **Out of scope**
(follow-ups): Filmustage-style cross-version schedule/budget impact reports,
archived-versions hub (full script version history — see 123) — this item is
the import acceptance step only.

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

- Repo branch: `main` (push before ending session).
- Next session: pick items above in order; re-read `docs/REPORTS-DESIGNER.md`
  before touching the designer, `docs/REPORT_PRINTING_AND_PAGE_BREAKS.md`
  before print/pagination work, `docs/IMPORT-EXPORT.md` before import/export
  work.

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

**Relations**: extends 100 (the deferred three-step picker) and 19/16 (token
chips/affixes); touches the ui-kit rich-text editor + `reportFields.ts`
(`buildLookupTokens`, `fieldsForScope`).

## 123. Script view in the Breakdown + portable scene-body preview (`[~]`)

> **Phase 0 shipped** (retained `project.scriptDocument` / `scriptBaseline`,
> parsers emit the body in the existing import pass, `SET/UPDATE_SCRIPT_DOCUMENT`,
> persistence). Phases 1–3 (Script sub-tab view / highlight-to-tag / preview)
> remain open — see `docs/IMPORT-EXPORT.md` §Script body retention.

**Relations**: Phase 0 (retained `project.scriptDocument` + `scriptBaseline`)
is the shared prerequisite **item 38 depends on** — do not build a parallel
body store. Reuses item 115's `FloatingTooltip` primitive + the
`InlineGlideTable.rowTooltip` seam (the *mechanism* only — 115's
`FirstSceneTooltip` is scheduling metadata and stays as-is). One source of
truth: committed tags are the existing breakdown elements/categories — no
parallel tagging model. Home is the **Breakdown tab's sub-tab row**
(`BreakdownTab.tsx:56-59`), NOT a new top-level tab.

**Chain** (import + diff reference each other; no links skipped):
124 (shrink storage) → 123 Phase 0 (retain body in the EXISTING import pass) →
38 (body-aware diff + conflicts) → 123 Phases 1-3 (view / tag / preview);
125 only if 124 falls short. Each references the next; nothing parses or stores
the script twice.

**Requested**: read the actual screenplay inside Breakdown, highlight passages
and tag them as breakdown elements, and preview a scene's action/dialogue
anywhere a scene is referenced. Industry model: StudioBinder (select-and-tag on
the script, colored by category) + Filmustage Scene Diff (item 38) + Final
Draft ScriptNotes.

**Blocker (RESOLVED by Phase 0)**: the screenplay body used to be dropped —
`parseFDX` set `description: ''` and discarded action/dialogue, Fountain folded
action into `description` and dropped dialogue, and the uploaded file was
discarded. Phase 0 now retains it (`project.scriptDocument`). `Scene.description`
stays a one-line synopsis (seed scene 1 = "Voice over prayers for George.").
`scriptPageNumbers` remains reserved "for future full-FDX render"
(`types.ts:12`, `docs/IMPORT-EXPORT.md`).

**Phase 0 — retain the screenplay** (prerequisite, shared with item 38)
- New pure module `src/lib/script/` + `project.scriptDocument`: per-scene ordered
  element blocks (heading/action/character/dialogue/parenthetical/transition/
  dual, page breaks, scene number, script page) + title page.
- `project.scriptBaseline`: the last imported screenplay — the reference for
  conflict detection and one-step restore (no hash layer; compare current
  scene fields against the baseline). Replaced on each accepted import; same
  retention spirit as version trash.
- Extend `fdx.ts` to keep the paragraph stream it currently drops (`Paragraph
  Type` is already read); extend `fountain.ts` (fountain-js tokens incl.
  `dual_dialogue_begin/end` + `dialogue.left/.right` already exist).
- **Hook the EXISTING import chain — one pass, no parallel pipeline**: the
  parser emits breakdown data AND the body together; both the plain import
  (`commitImport`, first upload / new project) and item 38's `commitScriptDiff`
  write the body in their SAME batch. Never parse the file twice and never add
  a second import path.
- Persist + Drive sync; compact tuple-encoded blocks, no duplication of Scene
  data; optional base64(gzip) for the body in localStorage if quota bites
  (item 124).
- New actions `SET_SCRIPT_DOCUMENT` / `UPDATE_SCRIPT_DOCUMENT` (union +
  `ACTION_TYPES` kept in sync).
- **Dependency**: `diff` (jsdiff), shared with item 38 — `diffWords` for word
  diffs, `diffArrays` for ordered alignment.

**Phase 1 — script view**: new **Breakdown sub-tab** ("Script", alongside Sheet /
Element Manager / Glide Breakdown), pop-out-capable like its siblings. Custom
React renderer, no new dep (tokens from the existing parsers; layout in CSS) —
Courier, standard indents, **two-column dual dialogue**, scene numbers, page
breaks, title page. Scene-linked navigation to/from Sheet + Schedule.

**Phase 2 — highlight-to-tag**: text selection → tag to existing categories via
`addNewElement`/`EntityDropdown`; category-colored highlights; reuse the
stripboard context menu. Committed tags are real breakdown elements.

**Phase 3 — portable scene-body preview**: build ONE shared
`SceneScriptPreview` component on the `FloatingTooltip` primitive, exposed
through the existing hover seams so any surface can opt in — stripboard, Scene
Sheet, Glide (`InlineGlideTable.rowTooltip`), Calendar scene cards. Shows the
scene's action/dialogue. Candidate surfaces are examples; the component is the
deliverable.

**Sources**: FDX + Fountain/TXT only (PDF/OCR filed separately if wanted).
**Out of scope**: PDF import, FDX write-back, revision-mark fidelity, full
version history (content-addressed store — see 125).

**Verify**: golden fixture with dual dialogue; round-trip persistence + Drive
sync; re-import the seed script; `npm run lint` + `npx playwright test`.

## 125. Storage overhaul — delta pack, normalization only if needed (FUTURE, parked) (`[ ]`)

**Relations**: follow-on to 124 — do NOT start in parallel; only if 124 plus
real usage still produces large files or quota pressure. This is the deferred
"archived-versions hub" storage layer referenced by 123.

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

## 128. Diff preview — IDE-style aligned split view (filler gaps) (`[ ]`)

**Relations**: enhancement to 38's review modal + 123 Phase 1 screenplay renderer.

**Requested**: the split diff (Current vs Incoming) should stay vertically
aligned like IDEs / GitHub / VS Code split diffs. Today the two panes are
independent `overflow` scrollers of different heights, so an inserted/removed
block makes everything below drift and the diff is hard to read. IDEs insert
blank **filler rows** on the shorter side so a change lines up across panes.

**Approach**: derive an aligned row model ONCE from the `diffArrays` segments
(equal / added / removed) → `rows: { left?: TonedBlock; right?: TonedBlock }[]`
(the shorter side gets an empty filler cell). Render the shared screenplay line
component into the correct pane per row (one scroll container per pane is fine;
or a single grid with two columns + row alignment). Sync-scroll already exists
in `ScriptUpdateModal`. Study GitHub/VS Code split-diff alignment for the filler
rules (block-level, not word-level).

**Verify**: append a block mid-scene and delete another → both panes line up;
golden visual; `npm run lint` + `npx playwright test`.
