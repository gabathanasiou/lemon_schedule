# Modals Studio (roadmap 374)

Status: **read this before adding or changing a modal surface/fixture** — the
registry is the completeness contract; `npm run test:unit` fails on drift.

DEV-only preview of **every modal and dialog** in the app, at
`#/lab/modals`. The studio renders the REAL component against the open
project — not a screenshot — with a kit dock for walking the list, switching
theme/width/text scale, and undoing preview edits. The active surface is
published to the debug bridge / local MCP (`get_lab_state`), so an agent knows
exactly which surface the user means.

Production never ships the studio: `App.tsx` lazy-imports it under
`import.meta.env.DEV`, so the chunk (and every fixture) is dropped from the
production bundle.

## The contract

- **One registry**: `src/lab/modals/surfaces/<group>.ts` holds pure metadata
  (`id`, `title`, `group`, `note`, `kind`, `sources`, `width?`,
  `projectless?`). One metadata file per studio section, in review order.
- **One renderer per surface**: `src/lab/modals/fixtures/<group>.tsx` exports
  `render: Record<SurfaceId, SurfaceRender>`. The `Record` is typed from the
  metadata union, so a missing fixture fails `tsc` — no silent gaps.
- **`sources` is the completeness contract**: every app file that renders a
  modal (`<Modal`) must appear in a surface's `sources`. The unit test
  `src/lab/modals/__tests__/completeness.test.ts` scans `src/**/*.tsx` and
  fails on an unmapped file. A new modal cannot ship outside the studio.
- **Group modules stay disjoint** so parallel work never collides: a group
  owns its metadata + fixture file, and any modal component it extracts.

## Adding a surface

1. Add a metadata entry to the group's `surfaces/<group>.ts` with a stable
   kebab-case `id`, a one-line `note`, and **every** source file that renders
   that surface (list the host file too when a modal is inline in a tab).
2. Add the fixture in `fixtures/<group>.tsx`:
   ```tsx
   'my-modal': (ctx) => <MyModal open onClose={ctx.close} … />,
   ```
   Render the real component open. Use `ctx.project!` (the studio gates
   project-dependent surfaces), `ctx.dispatch`, `ctx.calendar`,
   `ctx.picks`, and `ctx.close`. For controlled forms wrap a small preview
   component in the same file; for a modal embedded in a bigger component,
   extract it into a named component and use it in both places.
3. Call `ctx.select({ kind, id, label })` from an effect when the fixture is
   pointed at a specific entity — that is the "selected element" the MCP
   reader reports.
4. Run `npm run lint` (tsc catches a missing `render` key) and
   `npm run test:unit` (the completeness scan).

## Fixture context

`FixtureContext` (`src/lab/modals/types.ts`):

| Field | Meaning |
|---|---|
| `project` | The active project, or `null` for `projectless` surfaces. |
| `dispatch` | The real store dispatch (preview edits are undoable in the dock). |
| `calendar` | The active `CalendarVersion`. |
| `picks` | Project-derived first picks: cast, element, scene, day date, crew, location, report design, budget line. |
| `close` | Close the preview (the dock offers Re-open). |
| `select` | Publish the entity in view for `get_lab_state`. |
| `theme` | The studio's current theme (`light` / `dark`). |

The `Modal` shim reads `getModalThemeOverride()` (dev-only, set by the studio)
before the `?modalTheme=` harness, so the theme knob reaches every app modal.
The studio also nests a `DialogProvider` so confirm/prompt/alert follow the
same knob. Width and text scale are preview-only CSS on `.ui-modal`.

## Agent control & audit (agent-useful studio)

The studio is not just visual: the debug bridge / local MCP exposes a small
control surface. Everything is studio UI only — it never edits project data.

- `getLabSurfaces()` / MCP `list_lab_surfaces` — every surface with id, title,
  group, kind and **capability tags** (`dropdown`, `segmented`, `tabs`,
  `checklist`, `date`, `colour`, `map`, `rich-text`, `file`, `table`, `grid`,
  `form`). Tags are derived automatically from each surface's source imports —
  never maintained by hand.
- `showLabSurface({ surfaceId, theme?, width?, scale? })` / MCP
  `show_lab_surface` — drive the preview (open a surface, switch light/dark,
  width, text scale). `false` for an unknown id.
- `auditLabSurfaces({ surfaceIds? | group?, theme?, restore? })` / MCP
  `audit_lab_surfaces` — DOM contrast audit of the open modal(s): low-contrast
  text/controls and dark controls on a light surface. Returns structured
  issues with selector/text/colours; restores the studio afterwards.

### Search by capability

The picker is the kit's morph-to-search `SearchMenu`. Its record keywords are
`note + capability tags`, so typing **dropdown**, **tabs**, **segmented**,
**map**, **form**, … filters to the modals that use them. No tag list is shown;
the capability index is hidden metadata.

### Dummy-data scenarios

A surface that needs a non-local project state should render the real
component with a **preview path** rather than a parallel mock. The first one is
`SharingModal` (`preview` prop): owner/editor/viewer members, a pending invite,
a share link and invite suggestions, with actions disabled and the access-mode
segment still switchable. The studio never creates a shared project.

### Dock boundary

The dock measures its occupied height and the studio caps every modal above it
(with an 8px gap), so a tall modal's footer/close row can never hide under the
controls.

## MCP / debug bridge

- `window.__lemonSchedule.getLabState()` → the snapshot below, or `null` when
  the studio is not open.
- MCP tool **`get_lab_state`** (also included as `status.lab` in
  `get_bridge_status`).
- Snapshot: `surfaceId`, `title`, `group`, `kind` (`modal|dialog`), 1-based
  `index`/`total`, `project {id,title}`, `theme`, `width`, `scale`,
  `selection {kind,id?,label?}`, and `hash`.
- Deep links: `#/lab/modals/<surface-id>`; the studio keeps the hash in sync.
- The studio writes NOTHING to the project store except through a fixture's
  own dispatch; it never edits lab state into project state. `showLabSurface`
  changes studio UI only.
- The dock's **MCP** chip is the same consent toggle as File → Connect agent
  bridge, so the studio can be driven from an agent without leaving the lab.
- On port 3000 (the standard dev server) the helper accepts the app origin; a
  worktree server on another port can preview the studio but the MCP socket
  will be refused by the helper's origin allowlist.

## Manual verification

1. `npm run dev` → `#/lab/modals`. The dock lists every group; arrows and
   ←/→ walk the full list; the counter matches the registry.
2. Each fixture opens the real modal with real project data; close →
   Re-open works.
3. Theme Light/Dark changes the modal (and a confirm dialog); Width 240/300/
   360/400/560/Wide and Text 100/125/150% visibly change the preview.
4. Edits made inside a fixture appear in the project and Undo in the dock
   reverts them.
5. `window.__lemonSchedule.getLabState()` reports the surface on screen; the
   MCP `get_lab_state` tool returns the same.
6. `npm run build` → the production `dist/` contains no lab/modals chunk.
7. Agent pass: `list_lab_surfaces` → surfaces with capabilities; filter for
   `dropdown`; `show_lab_surface` a light modal; `audit_lab_surfaces` returns
   structured contrast findings and restores the previous view.
8. Tall-modal check: Help at 1000×700 — the modal bottom stays above the dock.

Light-theme findings and the remaining component-family work: see
`docs/audits/2026-11-26-modal-light-theme.md`.

## MUST NOT

- Never register a surface without a real fixture; never fake the modal.
- Never import the studio, registry or fixtures from production code (only
  `src/lib/labState.ts` and `src/lib/modalDevTheme.ts` are always-bundled,
  tiny, and inert outside the studio).
- Never hand-write a second dock control recipe — use kit `Button`, `Seg`,
  `SearchMenu`, `DropdownMenu`.
- Never let a modal file exist without a `sources` entry — the unit test is
  the gate, not a suggestion.
