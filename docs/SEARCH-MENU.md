# SearchMenu — the catalogue picker (kit)

Status: **read this before building or changing any record-search picker, or
when choosing between `SearchMenu`, `EntityDropdown`, `MorphSearchField` and the
other picker primitives.** It is the design-decision reference for the kit's
one catalogue picker; `src/components/location/LocationSearchMenu.tsx` is the
app's location face.

`SearchMenu` is the kit's **record picker**: a search field with a panel of
groups, records and actions. It is one component with two physical shapes
(always-visible field, or a button that morphs into a field) and several
category behaviours. This manual is the reference for making design decisions
about it — every name below is a real prop, type or file.

Source of truth: `node_modules/@gabriel/ui-kit/src/SearchMenu.tsx` +
`searchMenuModel.ts` (the kit repo is `~/Documents/Software Apps/ui-kit`).
App adapter: `src/components/location/LocationSearchMenu.tsx`.

## 1. What it is — and what it is not

**Use `SearchMenu` for** a standalone, single-select catalogue where the user
picks one record and categories or deep fields matter: locations, crew roles,
people, days, report fields.

**Do not use it for:**

| Need | Use instead |
|---|---|
| A grid/cell editor (Tab/Enter commit, comma multi, free-text create) | `EntityDropdown` |
| A short fixed option list (status, type) | `SelectDropdown` / `AutocompleteDropdown` |
| Async place search (a geocoder request per keystroke) | `AsyncResultsDropdown` |
| A toolbar row filter that keeps its term | `MorphSearchField` |
| A grouped single/multi select in a form row | `GroupedSelect` |
| A second search dropdown for a new surface | the existing `SearchMenu` or `LocationSearchMenu` — never fork one |

A `SearchMenu` is **single-select, synchronous, and creates nothing inline**.
“Create” is an action (see §6), not a record row. It has no controlled `open`
prop, no async source and no stored value of its own: the caller owns the value
and passes the current one as the trigger label.

## 2. The model — items, groups, rows

```ts
SearchMenuItem {
  id: string;                 // stable key; what onSelect receives
  label: string;              // the row face
  group?: string;             // SearchMenuGroup.key
  detail?: string;            // right-hand secondary text
  icon?: ReactNode;           // leading icon
  disabled?: boolean;
  fields?: { label: string; value: string }[];  // deep-search attributes
  keywords?: string;          // extra free text (e.g. the role label)
}

SearchMenuGroup {
  key: string;                // items point at it
  label: string;              // rendered as the category/header text
  icon?: ReactNode;
  count?: number;             // TOTAL records, not hit count
}
```

Rows in the panel, top to bottom:

1. **Leading actions** (`leadingActions`): pinned, always visible.
2. **Groups and records** in registry order — a group row, then its records;
   records without a group (or with an unknown group) render last.
3. **Empty state** when no records match the query.
4. **Empty actions** (`emptyActions`): only in that no-results state.
5. **Footer actions** (`footerActions`): pinned, always visible.

`SearchMenuRow` (exported) describes what the renderer sees:
`{kind:'group'} | {kind:'item', hit, hidden?} | {kind:'empty'} |
{kind:'action', label, actionIndex, source?: 'empty'|'leading'|'footer'}`.

## 3. Trigger shapes — `mode`

**`mode="expandable"`** (default). A primary `triggerLabel` button morphs into
the text field (animated `collapsedWidth` → `expandedWidth`, focus moves into
the input, Escape/select/outside click collapses it and returns focus to the
button). The panel opens **after the width morph settles**, so it anchors to
the expanded field rather than the collapsed button. `triggerIcon` sets the
collapsed button's leading icon: **MapPin** for locations, **Plus** for adders.
The expanded field always carries the magnifier. `autoFocus` controls the
focus-on-open.

**`mode="inline"`.** The field is always visible (manager sidebars). Focus or
click opens the panel when `openOnFocus` is true.

Common sizing/behaviour props: `collapsedWidth`, `expandedWidth`, `panelWidth`
(defaults to the trigger/anchor width), `maxMenuHeight` (default 420),
`autoFocus`, `closeOnSelect` (default true), `onClose`, controlled
`query`/`onQueryChange`, `theme` (`DropdownTheme`; pass it on dark surfaces),
`morph` (false disables the panel morph), `className`.

## 4. Category behaviour — the decision table

A **category row** is a `SearchMenuGroup`. It is only actionable when clicking
it does something real. Three browse behaviours:

| Setup | Browse appearance | Click | Keyboard | Use for |
|---|---|---|---|---|
| `browseExpanded` | Plain header: small, uppercase, tracked, muted, count on the right; **no** chevron, pointer, hover or focus | Nothing — it is a header | Arrows skip headers and land on records | SHORT catalogues where every record should be visible (master location, per-department Add role) |
| `expandableGroups` + `groupExpandMode="single"` | Category row with a chevron; all collapsed | Expands/collapses that category (one at a time = accordion) | → expands, ← collapses, Enter on the row toggles | LONG catalogues (Report to, Add location, master Add role) |
| `expandableGroups` + `"multiple"` | Same, several can stay open | Toggles independently | same | Long lists where comparing categories helps |

**Plain headers are never selectable.** The kit renders them as real dropdown
group labels: `role="presentation"`, no `ui-item` class, no pointer cursor, no
hover fill, no keyboard stop, no `aria-selected`. Counts remain (a count of
`0` means “no available records” — e.g. a role with only “Add new person…”).

**During a query, every category is a plain header.** Search results are shown
under their category label; a category's chevron/action only exists in the
empty-query browse state. This is deliberate: a search result list has nothing
to expand.

**`onSelectGroup`** makes categories perform an action (a jump). Do **not** use
it to make a category “add” or “select” — categories only expand or jump; the
records do the picking. In this app no SearchMenu passes `onSelectGroup`.

`browseExpanded` needs `groups` to render records in the browse state; an
ungrouped item is only rendered when a query produces a hit. Both flags may be
set together: chevrons + groups start open.

**The category focus rule:** clicking a category or its chevron never steals
focus from the text field (`onMouseDown` is prevented), so you can click
“Camera”, then keep typing to filter; Escape still closes.

## 5. Search semantics

- The query is **comma-separated tags, ANDed**: `roy, 555` keeps a record only
  if every tag matches somewhere.
- A tag matches `label`, `detail`, the **group label**, `keywords`, and every
  `fields[].value` (case-insensitive substring).
- When a tag matched a `field`, that field's value becomes the row's right-hand
  snippet (`Phone: 555-0199`); a `detail` match uses the detail.
- The empty query is the **browse state** (`openOnFocus`, or always with
  `browseExpanded`). Typing switches to grouped hits.
- The pure model is exported and MUST be reused for any jump/highlight
  bookkeeping: `parseSearchTags`, `matchSearchItem`, `searchMenuContent`,
  `buildSearchMenuRows`. The manager jump/flash uses `searchMenuContent` so the
  rows it flashes are exactly the rows the panel showed.

## 6. Actions — three slots

`SearchMenuEmptyAction = { label: string | ((query) => string);
onClick(query); icon?: ReactNode }`.

| Prop | Where | Visible when | Use for |
|---|---|---|---|
| `emptyActions` | In the empty state, below the “No matches” body | ONLY when the query yields no rows | “Add “typed name”…” (the typed text becomes the new record's name/address) |
| `leadingActions` | Pinned above the list | Always, unless `hideLeadingOnEmpty` is set and the query has no results | The primary create action: **“New location…”** at the top of the Add-location menu |
| `footerActions` | Pinned below the list | Always | A persistent management action that should stay reachable |

Action rows are keyboard-reachable and receive the **current query**, so a
leading “New location…” can prefill the map with what the user typed. The
default action icon is **Plus**. Empty actions never compete with results.

**Set `hideLeadingOnEmpty` when the leading action and the empty action are the
same create path.** That is the Add-location rule: with an empty query you see
**“New location…”**; with a query that matches nothing you see only
**“Add “typed”…”** (query-aware) — never both. With a matching query the
leading row returns.

## 7. Empty state

`emptyTitle`, `emptyHint`, `renderEmpty({query, close})` and `emptyActions`.
`renderEmpty` replaces the title/hint body; the action rows still render below
it. The adapter's location menu uses a map-pin empty body plus “Add “…”“”.

## 8. Keyboard and focus

- The text field owns the keyboard. ↑/↓ move the highlight through actionable
  rows; plain headers, the empty row and hidden rows are skipped.
- **→ / ←** expand / collapse a focused category in accordion browse.
- **Enter** activates the highlighted row (a record, category, or action).
  Opening a picker highlights the first list row — not the pinned create action
  — so Enter cannot create a record by accident.
- **Escape** closes (via the field); clicking a category keeps the field
  focused, so Escape still works.
- When `closeOnSelect` is true, picking a record/action closes the surface and
  the query clears (except a controlled query — `onQueryChange('')` fires).

## 9. App adapter — `LocationSearchMenu`

`src/components/location/LocationSearchMenu.tsx` is the ONE location face of
the SearchMenu. It is not a second dropdown; it builds the catalogue from
`locationOptions(project)` and delegates.

| Prop | Meaning |
|---|---|
| `items` | `LocationOption[]` from `locationOptions(project, extras)`; the add-new sentinel is ignored |
| `value` | selected Locations-DB **id** (`''` = none) |
| `onSelect(id)` | commit a location id |
| `onClear()` | show an × that clears the value |
| `onAddNew(query)` | the create path; powers the no-match “Add “…”“” action and, with `newActionFirst`, the pinned “New location…” leading action |
| `newActionFirst` | pin “New location…” above the catalogue (Add location only); it hides while the query has no matches, where the typed “Add “…”“” action takes over |
| `browse` | `'open'` = `browseExpanded` plain headers; `'accordion'` = `expandableGroups` single |
| `icon` | trigger icon; default MapPin, Add location passes Plus |
| `readOnly` | renders a plain non-interactive field (SearchMenu has no disabled mode) |
| `placeholder`, `collapsedWidth`, `expandedWidth`, `panelWidth`, `maxMenuHeight`, `theme`, `className` | pass-through sizing/theme |

Locations are grouped by **location type**; search covers name, address,
place, contact and phone. Values stay id-keyed — never store a display name.
Duplicate display names: the panel shows the full name; the trigger clips long
labels (the panel always shows the full text).

**Current app map** (roadmap 318):

| Surface | Mode | Categories | Create action |
|---|---|---|---|
| Manager sidebars (`SidebarNav`) | inline | `expandableGroups` single | — |
| Day Manager → master location | expandable | `browseExpanded` (plain headers) | — |
| Day Manager → Report to (all crew + each department) | expandable | `expandableGroups` single | no-match “Add “…”“” |
| Day Manager → Locations → Add location | expandable | `expandableGroups` single | **leading “New location…”** + no-match add |
| Day Manager → Crew → Add role… (header / Call Times) | expandable | `expandableGroups` single | — |
| Day Manager → each department → Add role | expandable | `browseExpanded` (plain role headers) | “Add new person…” per role |
| Call Times modal → Crew template | same `CrewRosterEditor` | same as above | same |

## 10. Design rules

- **Categories never add.** A category click expands or jumps; a record pick
  commits. The only add paths are actions and record pickers.
- **Plain headers must look inert.** Small uppercase muted label, count right,
  no chevron, no hover, no pointer, no keyboard stop. If a category can't be
  pressed, it must not look pressable.
- **Adders use Plus** (Add role, Add location). Field pickers use their domain
  icon (MapPin for location fields).
- **Short catalogue = open** (`browseExpanded`); **long catalogue = accordion**
  (`expandableGroups` + single). The per-department Add role is short → open;
  the master Add role is long → accordion.
- **Counts are totals**, not hits. A `0` is meaningful; don't hide it or floor
  it to 1 to account for a create row.
- **One create affordance per menu.** If a “New location…” action exists, do
  not also add a separate “New” button beside the trigger; when the no-results
  state has its own query-aware “Add “…”“”, hide the leading create
  (`hideLeadingOnEmpty`) so the panel never shows two add rows.
- **Verb-first action labels**: “New location…”, “Add new person…”,
  “Add “…”“”. The ellipsis means “more input follows”.
- **Deep search fields are attributes, not labels**: `fields` should carry
  address, contact, phone, performer, Board ID, etc.; `keywords` carries a
  parent role/department so searching the parent lists its records.
- **Reuse the pure model** for any external search/highlight; never re-implement
  tag parsing or matching.

## 11. Limits (by design)

Single-select · synchronous items only · no async source · no inline
create/rename (use actions) · no controlled `open` · no stored value ·
trigger structure is icon + label (no custom trigger node) · actions only in
the three slots.

## 12. Extending and releasing the kit

1. Edit the kit source (`src/SearchMenu.tsx`, `src/searchMenuModel.ts`) and its
   unit tests (`src/__tests__/searchMenu.test.ts`).
2. `npm run build` (the committed `dist/` is what consumers install), `npm run
   lint`, `npm run test:unit`.
3. Bump `package.json` (patch for fixes, minor for new props), commit, `git tag
   vX.Y.Z`, push `main` + the tag.
4. In this app: pin `@gabriel/ui-kit` to the new tag, `npm install`, `rm -rf
   node_modules/.vite*` if the dev pre-bundle is stale, then `npm run build` /
   the suite. Update this doc + `UI-KIT.md` in the same change.

Consumers must never hand-roll a second search panel, and must not re-derive
the group/row model outside `searchMenuModel.ts`.
