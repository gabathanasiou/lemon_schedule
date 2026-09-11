# Day Types & Calendar Versions — Agent Manual

Status: **read this before touching day statuses, non-shoot dates, DOOD counts, or the
calendar-version axis.** This file owns the day-type registry and the CalendarVersion axis.
The daybreak/section model and the date cursor live in
`docs/SCHEDULING-STRIPBOARD-DAYBREAKS.md`; this file references it and never re-derives it.

## Mental model

1. **Day status is a registry key, not a literal.** `project.dayTypes` defines the types; a
   `NonShootDate.status` stores the key string. Resolve display through the registry helpers.
2. **Days can carry events even when their status is "work".** A `lists` group without a day
   status is an extra event card; every count surface includes card events.
3. **Calendar is an independent axis** (`CalendarVersion`) from the schedule (`ScheduleVersion`),
   even though the stripboard's dates/call times follow the active calendar version.

## Day Types & Non-Shoot Status

- `project.dayTypes` (`DayTypeDef[]` = `{key,label,color?,icon?,attachable?,markable?,builtin?}`)
  is the status registry; built-ins `work|hold|travel|holiday` = Work/Hold/Travel/Day Off
  (`DEFAULT_DAY_TYPES`, `lib/dayTypes.ts` — icons via `typeIconComponent`, one-letter DOOD codes
  via `codeForType`: T/H fixed, custom = label initial). `NonShootDate.status` stores a **type key
  (string)**, never a literal — resolve display via `getDayType`/`visualForType`/`dayTypeTextColor`.
- One write path: `SET_DAY_TYPES` → `caseSetDayTypes` (`store/actions/reports.ts`) prunes statuses
  whose key vanished from **every calendar version** — "delete-in-use falls back to no status"
  lives there, nowhere else. Manager UI = the Calendar tab's **Day Types sub-tab** (`DayTypesTab` —
  ElementManager-style sidebar + `DayTypeModals`; built-ins fully locked — no edit/delete; LOAD
  normalizes built-ins to DEFAULT order and re-adds missing ones).
- **Work** (`work`, `markable: false`) is the DEFAULT state of every shooting day — never markable
  (excluded from the context menu + TravelHoldModal dropdown via `getMarkableDayTypes`; marking it
  would wrongly skip the date from the schedule). Its sidebar count and pane list the schedule's
  **production days**, derived from the canonical `useDaybreakSections` — never re-derived.
- **Day-card items (events)**: `NonShootDate.lists` = `Record<statusKey, Record<category, string[]>>`
  (cast = IDs, others = names, `'*'` = whole category) — the old `travel`/`hold`/`castIds` fields
  folded into `lists.travel`/`lists.hold` in the LOAD migration. `attachable` gates which types can
  carry lists (built-ins: hold/travel yes, holiday no). Day modal = the status dropdown (ui-kit) +
  list rows per picked type; helpers in `nonShootHelpers.ts` (status-keyed). DOODs: marked elements
  get the type's cell letter, header shows label + color, per-type count columns render for in-use
  attachable customs.
- **Events count everywhere, not just the day status**: a `lists` group WITHOUT a day `status` is an
  extra event on a normal day ("GEORGE has a travel card on his work day"). All count surfaces (DOOD
  cells/totals `deriveDood` in `nonShootStats.ts`, Element Manager day-type columns
  `computeElementDayStats`, Day Breakdown pane lists, reports `dayType` field) include card events.
  DOOD **cell precedence: status letter → work wins (`W`/`SW`/`WF`) → card letter → `H` gap**; totals
  count status AND card days (a travel card on a work day counts as a travel day even with a `W`
  cell). `elementDayStats`/`dayTypeForDate` scan `isElementMarked`/card groups — never key cells on
  `entry.status` alone. Multi-type days: first type in manager order in the cell, all counted in
  their lists.
- **Days-off pattern (Production Dates modal)**: `calendarVersion.weeklyDaysOff` (Mon=0..Sun=6) is
  synced MMS-style both ways across the **scheduled span** — Apply and Save mark pattern weekdays as
  `holiday` from the start through the stripboard's last shooting day (walked with
  `advanceDateCursor` in `daybreakUtils.ts`, the same cursor `computeRowData` uses; `postEnd` only
  extends the window), and unchecking a weekday removes ONLY the statuses the pattern created
  (marked `NonShootDate.pattern = true` when added) — hand-made statuses and event cards are never
  touched or removed (a removed day's cards/notes survive with the status stripped). The flag is
  STICKY: `upsertNonShootDate` carries it across status edits, so a generated day off cycled through
  another status stays generated.
- **Invariant**: the section date cursor skips statused dates (`computeRowData` `getDate`) — a
  section can never sit on a statused date. Consequence: the reports `dayType` field (Days group)
  prints the day's status or its first card type; it prints EMPTY only for truly unmarked days — not
  a bug; don't "fix" it by shifting the cursor.

## Calendar Versions (item 66 — independent axis)

- Calendar data lives in **`CalendarVersion`** (`project.calendarVersions` + `activeCalendarVersionId`),
  NOT `ScheduleVersion` (which only has `rows` now): `nonShootDates`, `productionStart`, `prepStart`,
  `postEnd`, `weeklyDaysOff`. The two axes are independent — the stripboard's dates/call times follow
  the ACTIVE calendar version (cursor skips its statused dates), so switching calendar versions
  shifts section dates on purpose.
- **No migration (user decision)**: old per-version calendar data is dropped; LOAD bootstraps a
  blank `c01` (`productionStart` = today) when none exists.
- Actions: `SET_ACTIVE_CALENDAR_VERSION`, `NEW_CALENDAR_VERSION` (blank via
  `makeBlankCalendarVersion(name, id)` — **must pass the caller's `id`**, the item-manager rename
  flow depends on the created id matching; clone = duplicate), `RENAME_CALENDAR_VERSION`,
  `DELETE_CALENDAR_VERSION` (→ `calendarVersionTrash`, same 30-day/newest-10 retention as versions —
  `pruneCalendarVersionTrash`), `RESTORE_CALENDAR_VERSION_FROM_TRASH`, `UPDATE_CALENDAR_VERSION`
  (every calendar-field write — never `UPDATE_VERSION` with calendar fields, TS enforces).
- Reads: `useProject().activeCalendarVersion` (memoized) — every calendar surface (CalendarTab +
  modals, DayTypesTab, ElementEventsModal, DoodsTab, ProductionTab dates, print, reports
  `dayType`/totals, daybreakUtils cursor, `useDaybreakSections`, `computeElementDayStats`, debug
  bridge `getRows`/`getCalendarVersion`).
- **UI (user decision)**: no header pickers — the **schedule picker** lives in the Schedule tab
  toolbar (`ScheduleToolbar`, far right, labeled "Schedule:"), the **calendar picker** in the
  Calendar tab's outer PageToolbar (hosts both sub-tabs). Both are `ItemManagerDropdown`
  (rename/duplicate/delete/create; create opens inline rename like the ribbon designer). Kit note:
  item-manager active-row buttons are theme-colored (`--ui-icon-btn-active-text`; light = black).
- `.msd`/`.sex` imports materialize each board's calendar into a `CalendarVersion` per board.
