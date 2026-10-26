# Links — elements, crew, departments, locations (agent manual)

Status: **read this before touching links, link propagation, the Link Manager, the
Element View Links tab, crew associations, or day-location suggestions.**
`src/lib/links.ts` is the canonical store module; `src/lib/elementLinks.ts` is the
scene-propagation seam; `src/lib/crewLinks.ts` is a view adapter over the same
store. Never re-derive their logic.

## Mental model

1. **ONE store**: `project.links: Link[]` (roadmap 308). Every association —
   element rules, crew attachments, whole-department tags and location links —
   is one record.
2. **Only element → element links propagate into scenes.** All other kinds
   (element→crew, element→department, element→location, crew→crew) are
   associations: reports, the panel, warnings and the day location suggestions
   read them; scene fields never change because of them.
3. **Canonical direction**: the element owns its element/crew/department/
   location links; crew owns person→person links.
4. **Legacy fields are migrated on every read path** — `project.elementLinks`
   (roadmap 44) and `project.crewLinks` (roadmap 11) are converted by
   `migrateProjectLinks` and dropped from the in-memory project.

```ts
type LinkKind = 'element' | 'crew' | 'department' | 'location';
interface Link {
  id: string;
  anchorKind: LinkKind;
  anchorCategory?: string;   // element category when anchorKind === 'element'
  anchorValue: string;       // elementMatchId | person id | location id
  linkedKind: LinkKind;
  linkedCategory?: string;   // element category when linkedKind === 'element'
  linkedValue: string;
}
```

Value spaces:

| Kind | Value | Matching |
|---|---|---|
| element (cast) | Board ID (`CastMember.id`) | exact |
| element (other) | element name | case-insensitive |
| crew | `CrewPerson.id` | exact |
| location | `ProjectLocation.id` | exact |

## Store module (`src/lib/links.ts`)

- `isPropagationLink(link)` — `anchorKind === 'element' && linkedKind === 'element'`.
  **Every propagation helper filters this first.**
- Lookups: `getOutgoingLinks` / `getIncomingLinks` (kind + category aware),
  `getElementOutgoingLinks` / `getElementIncomingLinks` (optional kind filter),
  `getCrewPersonLinks` (either side), `crewPersonIdOf`, `elementSideOf`.
- `dedupeLinks` — drops incomplete rows and exact duplicates (first wins;
  element names and department names compared case-insensitively, cast IDs
  exact).
- `makeLink(anchorKind, anchorCategory, anchorValue, linkedKind, linkedCategory, linkedValue)`.
- `renameElementInLinks(links, category, oldValue, newValue)` — rewrites both
  sides; called by `UPDATE_ELEMENT` (cast Board-ID change / non-cast rename) and
  by `MERGE_ELEMENTS` (then dedupe) so links never dangle.
- **Deletes keep links** (element trash restore must restore its links too);
  unresolved targets render as raw values and are skipped by resolvers.

## Migration (`migrateProjectLinks`)

Idempotent; late legacy records from an older peer are merged and deduped on the
next load. Runs on local load (`store/storage.ts`), the provider's load +
`importProjectFromData` (`store/provider.tsx`), Drive reads
(`lib/googleDriveStorage.ts`) and online reads (`lib/supabase/onlineProjects.ts`).

- `elementLinks[]` → `element → element`.
- `crewLinks[]` with `category !== 'crew'` → `element(category, elementKey) → crew(personId)`.
- `crewLinks[]` with `category === 'crew'` → `crew(personId) → crew(elementKey)`.

## Element rules (roadmap 44 — propagation)

- One write-path seam for scene entity-field edits:
  `useLinkedEditGuard(links, customCategories, dispatch).tryCommitSceneEdit(scene, updates)`
  — never dispatch raw `UPDATE_SCENE` for entity fields.
- `computePropagation` (anchor added → linked values added),
  `computeRemovedLinks` / `cascadeRemoval` (anchor removed with remaining links =
  confirm + cascade), `applyLinkToScenes` (retroactive), `getAnchorLinks`
  (element→element only), `anchoredKeysFor` (the anchor icon).
- **Sets are anchor-only** — a set can own links, never be an element target
  (adding a set replaces the field, so a set-target link would silently never
  apply; the category is not offered in linked rows). `notes` is not linkable.
- Scene wiring: `SceneSheet.commitField`, Glide `commitEdit` (erase/paste route
  through the guard), stripboard/boneyard `updateScene` (`SortableRibbon` takes
  the `elementLinks` prop — `project.links`; memo-compared; per-row components
  MUST NOT call `useProject()`).

## UI — one row editor, three hosts

`elements/LinkRow.tsx` is the ONE linked row. Element categories reuse
`rules/ElementPicker.tsx` `ElementPickerRow` (shared with Color Rules):
`CategoryDropdown` + `EntityDropdown variant="chip"` — dark chip trigger + dark
`DropdownPanel`, type-to-filter, multi-mode per category (one link per comma
value via `getFieldItems`). **Crew and Locations use the Day Manager's
`GroupedSelect`** (`production/day/GroupedSelect.tsx`): a real multi-select whose
trigger shows names; people are grouped by department with the ROLE as the
right-aligned hint, locations by location type. Never show raw ids in a link
row. Catalog helpers live in `src/lib/linkTargets.ts`
(`crewTargetItems`/`locationTargetItems`); draft-row translation lives in
`src/lib/linkDrafts.ts` (`CREW_TARGET`, `LOCATION_TARGET`,
`targetFromDraftValue`, `draftValueForLink`).

**Whole-department tags.** The crew picker's "All <department>" rows are a
distinct background (amber) and store a real `department` link — NOT an
expansion of today's people. A person added to that department later is covered
automatically. On the draft row the tag is encoded `dept:<name>` and converted
by the link-draft helpers; never hand-roll that prefix outside `linkTargets`.
The tag is element-owned only (there is no person anchor for a department), so
the Crew Manager's person cards do not show it.

- **Link Manager** (`elements/LinkManagerModal.tsx`, Element Manager → Links):
  grouped anchor cards; each card = anchor picker + linked rows. Linked rows may
  target element categories **plus Crew (with department tags) and Locations**
  — the shared `LinkRow` renders the grouped pickers, so names show and ids
  stay in the store.
  Per-card Apply (retroactive, batch = one undo entry) + footer Apply All —
  **only element→element rows take part**. One row per category per card;
  changing a row onto a used category merges values.
- **Element View → Links** (`elements/ElementLinksSection.tsx`): the same card
  for the selected element (`key={`${category}:${key}`}` remount), plus a
  read-only **"Pulled in by"** list of incoming links (click to jump when the
  anchor is the same category). Rows are LOCAL drafts so an empty "Add linked
  element" row survives until it has a value; every edit persists immediately
  (`UPDATE_PROJECT`) keeping the links not owned by this element.
- **Crew Manager → Links → People** (`crew/CrewLinkManagerModal.tsx`): reads
  `crewLinkViews(project.links)` (legacy-shaped view) and writes back through
  `crewLinkToUnified`, replacing all crew-involving links. Person→element and
  person→person stay managed there; department tags are element-owned and do
  not appear (no person anchor).
- **Never** add a fourth link editor — extend `ElementPickerRow` / the shared
  draft helpers instead. `resolveBy` on `EntityDropdown` = "values are ids,
  display names" (crew/locations); `displayMode` alone is for element fields.

## Reports + warnings

- `lib/crewLinks.ts` resolves report fields: crew `linkedElements` /
  `linkedCrew`, element `linkedCrew`; `targetLabelForLink` /
  `linkedElementLabelsForPerson` / `linkedCrewNamesForElement` resolve
  ids/keys to display labels. Department tags read **"All <department>"** in
  `linkedCrew` — they are not expanded to the current people.
- `crewLinkWarnings` feeds the `dayWarnings` report field and the Day Manager
  Crew section: a person on the day linked to a person/element not on the day,
  or an element linked to a department with **nobody** from it on the day
  (`peopleInDept` callback; one member on the day satisfies the tag).
- `CrewRole.categories` (position → categories, `resolveRoleCategories` in
  `lib/crewCatalog.ts`; `undefined` = catalog default, `[]` = none) makes crew
  rule-bearing — managed in Crew Manager → Links → Positions (item 153).

## Day locations — suggestions from linked sets (roadmap 309)

`linkedLocationsForDay(project, day)` (`lib/dayView.ts`): the day's **set**
elements → their element→location links → resolved `ProjectLocation`s
(deduped, keeps the source set). `LocationsSection` shows them in the master/key
location pickers under **"Linked from <SET>"** — **suggestions only, sets only,
never auto-attached**; the DB copy of a linked location is folded into the
suggestion group so it does not appear twice.

## Verification

- Vitest: `src/lib/__tests__/links.test.ts` (migration idempotence, propagation
  exclusion, reverse scans, rename, day suggestions),
  `elementLinks.test.ts`, `crewLinks.test.ts`, `linkDrafts.test.ts`
  (department-tag round trip), `linkTargets.test.ts` (grouping, tags, empty
  departments).
- e2e: `e2e/linked-elements.spec.ts`, `e2e/crew-links.spec.ts`
  (`[data-link-row="crew"]` in the panel), `e2e/element-manager-merge.spec.ts`.
- Anything visual (row layout, which categories are offered, the suggestion
  group) is rule-7 manual — do not add e2e for it.
