# Daybreak-as-Days Naming Cleanup

> Status: **Approved** — ready for execution.
> Decision doc captured from brainstorm, 2026-07-14.

---

## 1. Locked Decisions

| Question | Answer |
|---|---|
| `ScheduleRow.shootDay` | → `containerId: number` (null = unscheduled, -1 = clipboard sentinel) |
| Architecture | StripBlock still renders all rows; DAYBREAKs create the days inside it. No structural change. |
| Old `dayMeta` with stored dates | No conversion. Surface a warning + lock the version to delete-only. |
| Functionality | Untouched — identifiers, dead code, and docs only. |
| `ScheduleVersion.daybreakStartDate` | → `productionStart`. Each new schedule version gets its own. |
| Legacy versions | Hidden from use (not selectable), but still deletable. |
| `DAY_BREAK_REFACTOR_PLAN.md` | Delete — already shipped. |
| `Scene.shootDay` field | Dead. Drop from `Scene` interface, `types.ts:32`, and `importScreenplay.ts:675`. |

---

## 2. Terminology Map

| Old | New |
|---|---|
| `shootDay` (field on `ScheduleRow`) | `containerId` |
| `ShootDayMeta` | `DayMeta` |
| `ScheduleVersion.dayMeta` | `ScheduleVersion.dayMeta` (same name, new type `Record<number, DayMeta>`) |
| `ScheduleVersion.daybreakStartDate` | `ScheduleVersion.productionStart` |
| `RuleViolation.shootDay` | `RuleViolation.containerId` |
| `StripBlock.dayInt` / `StripBlock.chronoDay` | `containerId` (single prop) |
| `chronoDayMap` / `chronoDay` | **Deleted** — section index = display number |
| `existingDays` | **Deleted** — replaced by `useDaybreakSections().sections` |
| `Scene.shootDay` | **Deleted** (dead field) |
| `SortableRow.tsx` (file + component) | `SortableRibbon.tsx` / `SortableRibbon` — renders any ribbon (scene, note, break, daybreak), not just scenes |
| `data-shoot-day` attribute | `data-container-id` |

User-facing strings like "End of Day N" and "DAY #N" are correct — sections ARE days now. Leave them.

---

## 3. Files in Scope

### A. Types & Store
1. `src/types.ts` — rename fields, drop dead types
2. `src/store.tsx` — legacy-version flag, migration, `UPDATE_VERSION`, new-version default for `productionStart`

### B. Core libs
3. `src/lib/useStripboardContextMenu.ts`
4. `src/lib/useDaybreakSections.ts`
5. `src/lib/rulesEngine.ts` — `shootDay` → `containerId` in params
6. `src/lib/importScreenplay.ts` — drop `Scene.shootDay` from field list

### C. Components
7. `src/components/ScheduleTab.tsx`
8. `src/components/StripBlock.tsx`
9. `src/components/SortableRow.tsx` → **rename file to `SortableRibbon.tsx`**; component `SortableRow` → `SortableRibbon`; `data-shoot-day` → `data-container-id`
10. `src/components/CalendarTab.tsx`
11. `src/components/BoneyardBlock.tsx`
12. `src/components/StripboardContextMenuContent.tsx`
13. `src/components/SectionHeader.tsx` — props + comments
14. `src/components/DoodsTab.tsx`
15. `src/components/SceneSheet.tsx`
16. `src/components/ElementBreakdownView.tsx`
17. `src/App.tsx` — `dayMeta` passing, legacy-version banner

### D. Print
18. `src/components/print/PrintSchedule.tsx`
19. `src/components/print/Dood.tsx`
20. `src/components/print/BreakdownSheet.tsx`
21. `src/components/print/ElementBreakdown.tsx`

### E. Docs
22. `AGENTS.md` — terminology refresh
23. `DAY_BREAK_REFACTOR_PLAN.md` — **delete**

---

## 4. Dead Code to Delete

- `chronoDayMap` / `chronoDay` in ScheduleTab:798, CalendarTab:547, PrintSchedule:894, Dood:250, DoodsTab:198
- `existingDays` in ScheduleTab:790
- `scheduledRows[dayInt]` grouping — replace with `useDaybreakSections().sections`
- `StripBlock.chronoDay` prop
- `Scene.shootDay` field (interface + import initializer)
- `'shootDay'` string in `importScreenplay.ts:675` category set

---

## 5. Legacy Version Handling

In `store.tsx` migration:
- When loading a `ScheduleVersion` whose `dayMeta` has entries with stored `date`/`status`/`castIds` fields (legacy model), set `version.legacy = true`.
- Do NOT convert. Do NOT attempt to rebuild.

UI treatment (in `ScheduleTab.tsx` / version dropdown):
- Legacy versions are removed from the selectable list.
- They appear in a "Legacy versions" sub-section with only a delete action.
- Banner at top of stripboard when viewing a legacy version:
  > "This schedule version uses the old day model. Create a new version for daybreak scheduling."
- The "Create new version" button seeds a fresh empty version with `productionStart` initialized.

---

## 6. Execution Order

Batch files to keep `npm run lint` green between rounds:

1. **Types + store** (`types.ts`, `store.tsx`) — foundation rename.
2. **Libs** (`useDaybreakSections.ts`, `useStripboardContextMenu.ts`, `rulesEngine.ts`, `importScreenplay.ts`).
3. **Stripboard core** (`ScheduleTab.tsx`, `StripBlock.tsx`, `SortableRibbon.tsx` (rename), `StripboardContextMenuContent.tsx`, `SectionHeader.tsx`, `BoneyardBlock.tsx`) — rename file + all imports.
4. **Sibling views** (`CalendarTab.tsx`, `DoodsTab.tsx`, `SceneSheet.tsx`, `ElementBreakdownView.tsx`, `App.tsx`).
5. **Print** (all files under `print/`).
6. **Docs** (`AGENTS.md`, delete `DAY_BREAK_REFACTOR_PLAN.md`).

Run `npm run lint` after each batch.

---

## 7. Out of Scope (Explicitly)

- No dnd logic rewrites — `day-${id}` / `end-${id}` prefixes stay.
- No collision-detection changes.
- No changes to user-facing "Day N" / "End of Day" text.
- No new migration to rebuild old versions — delete/recreate only.
- No `ProductionCalendar`, `StatusDayBlock`, boneyard-as-day — those were the bigger refactor and are done/deferred elsewhere.

---

## 8. Verification

- `npm run lint` (tsc --noEmit) after each batch.
- Spot-check: create a new version with daybreaks, drag rows between days, print — all behavior identical pre/post.
- Spot-check: load an old project with stored `dayMeta` dates → legacy banner appears, version not selectable.
