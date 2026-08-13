# Reports — Violations & Call/Wrap Attributes (plan)

Violations (rules engine) and per-element call/wrap times as report attributes,
available everywhere attributes appear: field blocks, table columns, and
`{{tokens}}` — for scenes, days, elements, cast, and the document scope.

## Data layer — `src/lib/reportData.ts`

Computed ONCE in `buildReportCtx` (already memoized per project/version/daybreak),
never re-derived:

- Loop the production sections (the same loop that builds `dayInfos`, using the
  same base call times) and run the canonical `checkSection(rows, date,
  baseTime, rules, scenes, castMembers)` from `rulesEngine.ts`.
- Build indexes on `ReportCtx`:
  - `sectionViolations: Map<sectionIndex, RuleViolation[]>`
  - `sceneViolations: Map<sceneId, RuleViolation[]>` (from `sceneIds`)
  - `castViolations: Map<castId, RuleViolation[]>` (via `violation.castId`
    plus CAST_CONFLICT / CAST_SCENE_FLAG attribution through `project.rules`)
  - `totalViolations: number`
- Extend `ReportElementInfo` with `callTimes` / `wrapTimes` (arrays of
  `{ chronoDay, call, wrap }`):
  - group the element's scenes by day (`sectionIndex`)
  - **call** = the day's call time (daybreak call, canonical `dayInfos.callTime`)
  - **wrap** = the element's LAST scene that day: `computedCallTime` +
    `estimatedDuration` (`addMinutesToTime`) — rough estimate, no break padding

## Fields — `src/lib/reportFields.ts`

All fields use human formatting (`formatDuration` → "1h 30m"; wrap math via
`addMinutesToTime`). MultiValue fields get item affixes automatically.

### Violations (group "Violations")

| key | label | scope | multiValue |
|---|---|---|---|
| `violationCount` | Total Violations | document | — |
| `sceneViolationCount` | Scene Violations | scenes | — |
| `sceneViolations` | Violation Details | scenes | yes |
| `dayViolationCount` | Day Violations | days | — |
| `dayViolations` | Violation Details | days | yes |
| `elementViolationCount` | Violations | elements | — |
| `elementViolations` | Violation Details | elements | yes |
| `castViolationCount` | Violations | cast | — |
| `castViolations` | Violation Details | cast | yes |

Cast duplicates mirror the existing `workDays`/`castWorkDays` pattern (cast
pickers are scope-separate from elements).

### Call / Wrap (group "Shooting")

| key | label | scope | value |
|---|---|---|---|
| `elementCallTimes` | Call Times | elements | `Day 1: 08:00, Day 3: 10:00` |
| `elementWrapTimes` | Est. Wrap Times | elements | `Day 1: 17:30` |
| `elementCallWrap` | Call–Wrap (est.) | elements | `Day 1: 08:00–17:30` |
| `castCallTimes` | Call Times | cast | same |
| `castWrapTimes` | Est. Wrap Times | cast | same |
| `castCallWrap` | Call–Wrap (est.) | cast | same |

Names flag the estimate (`Est.`): wrap = last scene's call + that scene's
duration only — a rough estimate, may drift later in the day.

Days already expose `dayCallTime` + `dayEnd` (canonical section times); scenes
expose `callTime`. No new UI wiring — fields surface in every attribute
surface automatically.

## Verification

- `npm run lint`
- Existing `report-designer-move` e2e suite
- Probe: seeded project — a scene/day/cast with known violations renders counts
  + message lists (table + token); call/wrap/combined render per element;
  `violationCount` shows at top level
