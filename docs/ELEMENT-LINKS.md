# Element Links & Crew Links — Agent Manual

Status: **read this before touching links, link propagation, the Link Manager, or crew↔element
associations.** `src/lib/elementLinks.ts` and `src/lib/crewLinks.ts` are the canonical modules —
never re-derive their logic.

## Mental model

1. **Element links are one-way and anchor-based.** An anchor carries a list of `(linkedCategory,
   linkedValue)` rows; adding an anchor retroactively applies the link to scenes.
2. **One write-path seam for scene edits** (`useLinkedEditGuard.tryCommitSceneEdit`) enforces the
   links; never dispatch raw `UPDATE_SCENE` for entity fields.
3. **Crew links are a separate store** (`project.crewLinks`) reusing the reserved `category: 'crew'`
   to link people to people.

## Element Links (roadmap 44)

- One-way, anchor-based: `project.elementLinks: ElementLink[]` (flat;
  `{id, anchorCategory, anchorValue, linkedCategory, linkedValue}`) — anchor values via
  `elementMatchId` (cast = Board ID, others = name; name matching case-insensitive). No
  bidirectional index — derive anchor-of by scan (`getAnchorLinks`).
- **One canonical module: `src/lib/elementLinks.ts`** — `computePropagation` (anchors added between
  before/after → linked values), `computeRemovedLinks`/`cascadeRemoval` (anchor removal with
  remaining links = warning + cascade), `applyLinkToScenes` (retroactive), `addValueToField`
  (`isMultiValue`-aware; single-value fields only take the value when empty — never clobber).
  Re-derive nothing from it.
- **Write-path seam: `useLinkedEditGuard(links, customCategories, dispatch).tryCommitSceneEdit(scene, updates)`**
  instead of raw `UPDATE_SCENE` for entity-field edits — wired in SceneSheet `commitField`, Glide
  `commitEdit` (erase/paste route through it), stripboard/boneyard `updateScene` (SortableRibbon
  takes an `elementLinks` prop — memo-compared; per-row components MUST NOT call `useProject()`).
  Removal with links → ui-kit `dialog.confirm`; cancel = edit not applied, confirm = cascade.
- Link Manager = `elements/LinkManagerModal.tsx` (Element Manager → Links, header + action bar):
  **grouped anchor cards** — each card = anchor picker + linked-element rows (one row per category);
  links dispatch immediately (`UPDATE_PROJECT`, exact-duplicate dedupe). Linked rows + anchor pickers
  are the shared `rules/ElementPicker.tsx` `ElementPickerRow` (extracted from Color Rules'
  `RuleConditionRow` — extend the shared ones, never fork): CategoryDropdown + `EntityDropdown
  variant="chip"` — the **day-status modal pattern** (TravelHoldModal): dark chip trigger + dark
  dropdown panel (`DropdownPanel dark`), type-to-filter, multi-mode per category (one link per comma
  value via `getFieldItems`). Per-card Apply (retroactive, batch = one undo entry) + footer Apply
  All. Cast renders like the Glide ("1. FISHERMAN", `—` fallback). **One linked row per category per
  card** — "Add Linked Element" prefills the next unused category; changing a row's category onto an
  already-used one merges the values into that row (no duplicate rows). **Single-highlight rule (all
  `DropdownPanel`s, both themes)**: rows keep their un-gated Tailwind `hover:` fills (they feed iOS
  tap-to-hover), but `highlightedIndex` is the ONE lit row — written by pointer hover (`onItemHover`)
  AND the keyboard arrows (latest wins; `onHoverLeave` clears pointer-driven highlights); checked
  rows stay distinct (dark: Check glyph; light: blue bg). Modal pickers use `EntityDropdown
  variant="chip"` — see `docs/DESIGN-LANGUAGE.md` §EntityDropdown chip version.
- `notes` is not linkable; **Sets are anchor-only** — a set can be an anchor, never a linked target
  (adding a set replaces the field, so a set-target link would silently never apply; not offered in
  the linked category menu). Custom single-value categories stay linkable. Escape inside any open
  dropdown (`useEscapeCapture`, `lib/dropdown.ts`) dismisses ONLY the dropdown — never the enclosing
  modal.

## Crew ↔ elements (roadmap 11)

- **Position → categories** (`CrewRole.categories`, resolve via `resolveRoleCategories` in
  `lib/crewCatalog.ts`; `undefined` = the catalog default, `[]` = none): makes crew rule-bearing —
  report scoping by the position's categories ("only crew in this day"); managed in Crew Manager →
  Links → **Positions** + Element Manager → **Positions**.
- **Person → element/crew** (`project.crewLinks`, `lib/crewLinks.ts`; reserved `category: 'crew'` =
  another person id): Crew Manager → Links → **People** + Element Manager per-element **Linked
  crew**; report fields crew `linkedElements`/`linkedCrew` and element `linkedCrew`; dangling-target
  warnings via the `dayWarnings` report field + the Day Manager Crew section.
