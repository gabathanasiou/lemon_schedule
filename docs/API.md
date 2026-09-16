# Developer API / MCP Bridge

Status: **read this before changing the MCP/agent-bridge surface** (`tools/mcp/`,
`src/lib/agentBridgeClient.ts`, `useAgentBridge.ts`, `debugBridge.ts`) or adding a tool.

Stage 1 of roadmap **97**: drive the project open in the app from an MCP client
(opencode, Claude Desktop, Cursor, …). The API is *derived*, not a hand-written
endpoint list — it reads and writes through the app's existing debug bridge and
the single `Action` union, so new features are agent-reachable automatically.

## Architecture

```
MCP client ──stdio──▶ tools/mcp/lemon-mcp.mjs ──WebSocket──▶ app tab
(opencode, …)         127.0.0.1:3939                          src/lib/agentBridgeClient.ts
                      Origin + Host checked                    → getAgentBridge() (debug bridge)
                                                               → dispatch(Action) → reducer
```

- **`tools/mcp/lemon-mcp.mjs`** — MCP stdio server + the only WS listener
  (loopback). A second instance whose port is taken proxies to the first.
- **`tools/mcp/tools.mjs`** — tool definitions + handlers. Reads are nouns,
  writes funnel through one `apply_actions` tool.
- **`tools/mcp/actionSchema.mjs`** — parses `src/store/reducer.ts` (the `Action`
  union) and `src/types.ts` (core entity interfaces) with the TypeScript
  parser. `get_schema` serves that output, so agents never guess field names.
- **`src/lib/agentBridgeClient.ts`** — wire protocol + method whitelist (no
  `eval`). **`src/lib/useAgentBridge.ts`** — React glue (connect/reconnect).
- **`src/lib/debugBridge.ts`** — the bridge object is always installed
  in-module; `window.__lemonSchedule` stays gated behind DEV / `LEMON_AGENT=1`.
  The menu toggle + local WS are the opt-in.

## Setup

1. `npm install` (dev deps `@modelcontextprotocol/sdk`, `ws`).
2. Register the server:
   - **Published package (works anywhere, no clone):** add
     `npx -y lemon-schedule-mcp` as an MCP server in your client.
   - **From this repo:** `npm run mcp:install` — detects opencode,
     Codex / ChatGPT desktop, Claude Desktop and Cursor, and merges the config
     (backing up every changed file as `<file>.bak`). Flags: `--dry-run`,
     `--all` (create configs for clients not installed), `--only=<ids>`.
   - **Manual:** add it in the client's own config. opencode uses the repo's
     `opencode.json`; others take:
     ```json
     { "mcpServers": { "lemon": { "command": "node", "args": ["tools/mcp/lemon-mcp.mjs"] } } }
     ```
     Run from the repo root, or use the script's absolute path to make it work
     from any directory. `LEMON_MCP_PORT` overrides the port.
3. Start the app (`npm run dev`) and open a project.
4. **File → Connect agent bridge.** The first time, a short how-to dialog
   explains the flow (checkbox suppresses it for 24 hours); the dot then shows
   connecting / connected / helper not running. Connection failures surface as
   a warning dialog (once per episode) and the app retries every 2s while
   enabled. If another tab takes over the bridge, the older tab stops retrying
   and says so.

## Tools

| Tool | Kind | Notes |
|---|---|---|
| `get_project` | read | Active project; `scriptDocument`/`scriptBaseline` excluded unless `includeScript:true`. |
| `list_scenes` | read | Every scene × every breakdown column (Glide grid truth). |
| `get_scene_script` | read | ONE scene: breakdown row + retained screenplay blocks (`heading`/`action`/`character`/`dialogue`), matched by scene number. Use instead of `get_project(includeScript:true)` — a full script can exceed the read limit. |
| `get_schedule` | read | Computed rows + sections (call times, dates from the active calendar version). |
| `get_days` | read | Production days overview: call/first call/wrap, counts, locations, sums, violations. |
| `get_day` | read | ONE day fully resolved (scenes, cast/elements with DOOD codes, crew, locations, notes, violations). |
| `get_violations` | read | Rule violations across the schedule (by day + by scene). |
| `get_element_stats` | read | Per-element work/finish/total days + day-type counts. |
| `audit_script` | read | Project ↔ scriptDocument integrity report. |
| `repair_script` | write | Renumber/prune/re-link the script map (one undo entry). |
| `list_entities` | read | `kind`: cast · crew · locations · categories · day_types · element_categories · rules · reports. |
| `get_versions` | read | Schedule versions + calendar versions + active ids. |
| `get_schema` | read | Derived actions (with payload types), entity interfaces, write conventions. |
| `get_report_registry` | read | Reports-Designer vocabulary: collections, field registry, block types. |
| `get_report_design` | read | One report design's full block tree (start from a seeded template). |
| `make_report_block` | read | Valid blank ReportBlock (build `ADD_REPORT_DESIGN` payloads). |
| `apply_actions` | write | Array of `Action`s; `atomic:true` (default) = one undo entry. |
| `move_row` | write | Move rows within/between the stripboard and boneyard (drag-and-drop equivalent). |
| `reorder_rows` | write | Set a version's stripboard order (a full permutation incl. daybreaks). |
| `sort_rows` | write | Hierarchical scene sort (e.g. set → day/night → INT/EXT). Drops daybreaks. |
| `auto_daybreaks` | write | Re-split the board into days by duration/pages (drops existing daybreaks). |
| `delete_all_daybreaks` | write | Remove every non-pinned daybreak. |
| `add_row` | write | Insert a NOTE / BREAK / DAYBREAK row at a position. |
| `make_scene` | read | Valid blank Scene with optional overrides (build `ADD_SCENE` payloads). |
| `undo` / `redo` | write | Step the history stacks. |
| `get_bridge_status` | read | App connectivity, open project, read-only flag, sync diagnostics. |

Blocked over the bridge: `LOAD` (replaces the project + clears history) and
`EMPTY_TRASH` (irreversible). Writes are refused while
`diagnostics().readOnly` (cloud project offline). Reads never expose the undo
history (`getState`) or the OAuth token/session.

## Bulk edits

One large `apply_actions` batch is fine for a few dozen actions, but the app
applies each action through a React update — a single nested batch of ~100+
throws `Maximum update depth exceeded` (the whole call fails). For bulk work
(e.g. writing a description on every scene, or a mass breakdown pass), LOOP
`apply_actions` in chunks of **~20–30 actions**, with `atomic:false` so one
oversize chunk cannot abort the run; per-chunk undo entries are an acceptable
trade for bulk edits. Read the items first (`list_scenes`, `get_scene_script`)
so every payload carries a real id — never hand-craft ids. (Proven on the "Lair"
project: 172 scene descriptions written as 9 chunked calls.)

## Schedule edits (ordering, day breaks, timing)

The stripboard is ONE ordered list (`containerId` 1); a "day" is a DAYBREAK row
in it, and `containerId` null is the boneyard. Whole-board transforms are
task-shaped tools backed by the shared pure module `src/lib/scheduleOps.ts` —
the SAME functions the Schedule tab uses, so the API can't drift from the UI:

- **`move_row`** — move rows to a position (`beforeRowId` / `afterRowId` /
  `toIndex`) within the stripboard or across to/from the boneyard. The pinned
  Day 1 daybreak never moves; an insert above it is clamped below it.
- **`reorder_rows`** — set the whole stripboard order (`orderedRowIds` must be a
  permutation of its current rows, daybreaks included). This is what you pass
  after computing a custom order in one go.
- **`sort_rows`** — hierarchical sort by ordered criteria, e.g.
  `[{key:"set"},{key:"day_night"},{key:"int_ext"}]` = group by set, then
  day/night, then INT/EXT. Built-ins: `scene_number`, `script_day`, `page_count`,
  `duration`, `int_ext`, `day_night`; any scene field/custom category works.
  `customOrders` sets value order (e.g. `{int_ext:["INT","EXT","INT/EXT"]}`).
  Like the UI it DROPS existing daybreaks (and their day details).
- **`auto_daybreaks`** — re-split into production days by `duration` (minutes)
  or `pages`. Destructive like the toolbar: drops existing daybreaks; displaced
  NOTE/BREAK rows go to the boneyard (or are deleted) per `notesAction` /
  `breaksAction`.
- **`delete_all_daybreaks`** / **`add_row`** — remove non-pinned daybreaks; insert
  a NOTE/BREAK/DAYBREAK row (the id is generated for you).

**Retiming is NOT a special tool** — it is a single `UPDATE_ROW` through
`apply_actions` (prefer the generic path when one action suffices): a scene's
`estimatedDuration` (minutes), a break's `breakDuration`, and a day's start time
is the DAYBREAK row ABOVE the section (`daybreakCallTime`). Read `get_schedule`
for row ids. `reorder_rows`/`move_row` return `{applied, versionId, rowCount, daybreaks}`.

## Reports Designer (call sheets & templates)

Report designs are project data and every report action is in the `Action`
union, so `apply_actions` already creates/edits them (`ADD_REPORT_DESIGN`,
`UPDATE_REPORT_DESIGN`, `UPDATE_REPORT_PAGE`, `RENAME_/SET_ACTIVE_/DELETE_/
RESTORE_REPORT_DESIGN`, `SET_REPORT_TEXT_STYLES`). The MCP surface adds the
vocabulary an agent needs to do it without guessing:

- **`get_report_registry`** — collections (key/label, `contextual` = only valid
  inside its parent repeat/table, `scoped` = honors the Lego scope filter,
  `typedChildOf`), the field registry (key/label/group/scope + `multiValue`/
  `dayList`/`link`), and the block types. Derived from the same registries the
  designer uses (`reportBlocks.ts`, `reportFields.ts`) — never re-derived.
- **`get_report_design`** — one design's full tree (blocks/header/footer/page).
  New projects seed templates — One-Liner, Cast List, Element Breakdown, Category
  Breakdown, Scene Breakdown, Crew Contact Sheet and **Call Sheet**. The reliable
  path to a great result is to read the seeded Call Sheet, then
  `ADD_REPORT_DESIGN { cloneFromId }` and customise, rather than composing from
  nothing.
- **`make_report_block`** — a valid block (`makeReportBlock`), then assemble the
  tree and write it back with `ADD_REPORT_DESIGN`/`UPDATE_REPORT_DESIGN`.
- `list_entities` kind **`reports`** lists designs (id/name/page/block counts),
  the active id and the named text styles.

The three pillars — block tree (`lib/reportBlocks.ts`), collection resolver
(`lib/reportData.ts`), field registry (`lib/reportFields.ts`) — each have ONE
canonical implementation; read `docs/REPORTS-DESIGNER.md` before deeper work.
There is **no generic sum/count attribute** on blocks: use an existing count/sum
field or the DOOD totals, never view logic.

## Days, analytics & script integrity

The bridge reuses the canonical computes so agents see exactly what the UI
shows — never a parallel derivation:

- **`get_days`** — every production day (the pure `buildDayViews` model the Day
  Manager uses): chrono day, date, section label, call / first call / wrap,
  scene + cast + element counts, scene locations, master location, day note,
  section sums and a violation count. Dates follow the ACTIVE calendar version.
- **`get_day`** — ONE day fully resolved, by `sectionIndex`, `chronoDay` or
  `date`: scenes with computed call times, cast + elements carrying DOOD
  start/work/finish codes, crew, locations, notes, breaks, rule violations and
  sums. This is the read behind the Day Manager page and the call-sheet seams.
- **`get_violations`** — rule breaches schedule-wide (`computeViolationIndex`):
  total, per day and per scene.
- **`get_element_stats`** — per-element first/finish date, work days, total days
  and day-type counts (`computeElementDayStats`; the Element Manager / DOODs
  numbers).
- **`audit_script` / `repair_script`** — the project ↔ `scriptDocument`
  integrity report and its one-undo repair (`auditScriptMap` /
  `repairScriptMap`).
- **`get_bridge_status`** also reports `history` = `{ past, future }` undo depth.

## Breakdowns & scene descriptions

Guidance distilled from standard 1st-AD practice (see sources below) — it is
also in the MCP `get_schema` conventions, so agents inherit it automatically.

- **Break down for the schedule, not the story.** The director asks what a
  scene *means*, the producer what it *costs*; the AD asks what it costs in
  **time, people and logistics**. A 1-page two-hander is 20 minutes; a half-page
  with a stunt, rain, four extras and a 90-minute move can eat a morning.
- **Tag every element in every scene it appears.** Cast (speaking) · background/
  extras (+rough count) · stunts · practical SFX · VFX · props · vehicles ·
  animals (+wrangler) · wardrobe · hair/makeup · special equipment · notes
  (permits, minors, night, weather). Repetition is the point — it is how the
  stripboard and Day Out of Days know a car is needed on days 3, 7 and 11.
- **Catch what the script implies, not just what it names.** "He grabs his keys
  and leaves" = prop + vehicle + location. "The bar erupts in cheers" = count
  the background now. "EXT. ROOFTOP - NIGHT" hides a night exterior, height
  safety, a lighting package and a turnaround problem.
- **Page counts in eighths, never eyeballed** (2⅜ pages, not "about two and a
  half"); a day is planned in pages.
- **Element fields hold comma-separated, simple atomic names.** `props`,
  `wardrobe`, `makeup`, `sfx`, `vfx`, `sound`, `music`, `vehicles`, `stunts`,
  `backgroundActors`, `animalsAndWranglers`, `weapons`, `greenery`, `artDept`,
  `set` (single value) and custom categories are lists — write `STATUE`, not
  `STATUE (blood-caked)`, and never semicolons. `description`, `notes` and
  `location` are free text.
- **Name elements with the exact word(s) the script uses, same form.** The
  screenplay highlighter (`elementOccurrences`, `src/lib/scriptTagging.ts`)
  matches an element name as a **whole word** in action/dialogue — cast instead
  matches the **character cue**. So `SCREAMS` ≠ `SCREAM` (won't match), and
  `BLOOD-CAKED STATUE` / `INTIMATE VIOLENCE` / `LADY ON PHONE` won't highlight
  unless that exact phrase appears. Prefer a single scripted word (`STATUE`,
  `WEEPING`, `BLOOD`) over an editorial label; a cast member's name should equal
  the cue (`CAROL`). Flags with no scripted noun (a stunt, an implied effect)
  are still valid but never highlight.
- **Writing a scene element field AUTO-REGISTERS new names in the Element
  Manager** — the bridge mirrors the UI's `addNewElement` (non-cast branch) in
  `applyActionsToBridge`, so `{applied, elementsRegistered}` comes back and the
  value is a first-class element. Agents do **not** send `ADD_ELEMENT` by hand
  for these.
- **Cast is the exception.** `scene.cast` holds comma-separated cast **IDs**
  referencing `project.castMembers`; cast is never auto-created (a new member
  needs the naming modal). Reference existing ids only; to add a person:
  `ADD_CAST_MEMBER` (blank) then `UPDATE_CAST_MEMBER` with the name.
- **Scene description (the one-liner):** ONE concise present-tense action line —
  what happens and who, in order, specific (never "the scene continues"), no
  quoted dialogue. Flag the schedule-critical facts. Never invent elements or
  cast; flag uncertainty instead of guessing.
- **Element color code** (common Movie Magic set, *not* a fixed standard;
  wardrobe/makeup/VFX/set-dressing vary per show): red cast · yellow silent
  extras · green atmosphere · orange stunts · blue practical SFX · purple props ·
  pink vehicles/animals · brown sound.

Sources: Wikipedia *Script breakdown* (Honthaner, *The Complete Film Production
Handbook*; Cleve, *Film Production Management*); AD PrePro, *How to Break Down a
Script: A 1st AD's Method*; Tools for Film, *Script to Schedule* (DGA/PGA-aligned);
Wikipedia *One liner schedule*.

## Wire protocol (app ⇄ helper)

One JSON request/response per frame:

```
helper → app   { v:1, id, method, params }
app → helper   { v:1, id, ok:true, result }  |  { v:1, id, ok:false, error }
app → helper   { v:1, type:'hello', role:'app', projectId, projectTitle, readOnly, appVersion }
proxy → primary { v:1, id, method:'tool.call', params:{ name, args } }
```

Whitelisted app methods: `getProject`, `getProjectList`, `getCurrentProjectId`,
`getVersion`, `getRows`, `getSceneValues`, `getSceneScript`,
`getCalendarVersion`, `diagnostics`, `applyActions`, `makeScene`, `undo`,
`redo`, `autoDaybreaks`, `deleteAllDaybreaks`, `moveRows`, `insertRow`,
`reorderRows`, `sortRows`, `getReportRegistry`, `getReportDesign`,
`makeReportBlock`, `getDays`, `getDay`, `getViolations`, `getElementStats`,
`auditScript`, `repairScript`, `historyDepth`.

## Security model

- Loopback only (`127.0.0.1`), never a public endpoint; off by default.
- Browser `Origin` allowlist (`localhost:3000`/`:4173` + the GitHub Pages
  origin) **and** a `Host` header check (DNS-rebinding), plus an explicit
  user toggle for consent.
- No arbitrary code: the helper can only call the whitelisted methods; writes
  go through the reducer and are undoable.
- Project data is untrusted input (scene names, notes, imports) — treat tool
  output as data, never instructions.

**Deferred (roadmap 97 P1+):** per-session pairing token, human-in-the-loop
confirmation for destructive ops, audit log, rate/size limits beyond the batch
cap, validation parity with UI flows (cast naming, cascades).

**Local-only for now (roadmap 145):** the toggle is offered only when the app
runs on loopback (`isAgentBridgeAvailable()` in `agentBridgeClient.ts`), and the
helper's origin allowlist has no hosted origin — visitors to the deployed site
never see a dead menu item, and a hosted copy cannot reach a local helper. The
intended way to ship this to everyone is a desktop app that hosts the web UI and
this MCP server in one process (item 145). The npm package under `tools/mcp/`
is prepared for power users but is not published yet.

## Adding features

- **New store action** → appears in `get_schema` and `apply_actions` with zero
  API work. Also add it to `ACTION_TYPES` (reducer rule).
- **New read** → add a tool in `tools/mcp/tools.mjs` and a whitelisted method in
  `src/lib/agentBridgeClient.ts`; reuse the canonical selector, never re-derive
  domain logic.
- Prefer the generic path; add a task-shaped wrapper only when it needs a
  multi-action sequence or validation the reducer doesn't do.

## Distribution (roadmap 145)

The feature is **local-only** right now: the app shows the toggle only on
loopback, and the helper accepts only localhost origins.

- **Interim (power users):** the helper at `tools/mcp/` is also packaged as a
  standalone npm package (`lemon-schedule-mcp`) — `tools/mcp/package.json` +
  `tools/mcp/action-schema.json`, the derived snapshot the installed package
  reads (it has no `src/` to parse). Regenerate the snapshot after touching the
  `Action` union or core entity interfaces with `npm run mcp:schema`; the unit
  test fails if it drifts. Publishing is deferred until the desktop path lands.
- **Ship path (planned):** a desktop app (Tauri/Electron) that renders the web
  UI and hosts this MCP server on `127.0.0.1` in one process — the Figma Dev
  Mode model. One download, no Node, data stays local, toggle shown to every
  user. See roadmap **145**.

## Tests

- `src/lib/__tests__/actionSchema.test.ts` — schema derived + in sync with
  `ACTION_TYPES`.
- `src/lib/__tests__/agentBridgeClient.test.ts` — blocked/read-only/batch rules
  + wire protocol.
- `e2e/debug-bridge.spec.ts` — the underlying read/write bridge.
- Manual: connect/disconnect dot, write from an MCP client, Cmd+Z in the app,
  helper restart reconnects.
