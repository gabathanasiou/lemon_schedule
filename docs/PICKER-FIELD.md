# PickerField — the ONE value picker (roadmap 322)

Status: **canonical** — read this before touching any picker (`PickerField`,
`EntityDropdown`, `AutocompleteDropdown`, `SelectDropdown`, `GroupedSelect`,
`SearchMenu multiple`) or a Glide cell editor.

`PickerField` is the kit's value layer: a field that **stores** a selection
(single or multiple), built on the shared `SearchMenu` panel. Every app picker
that persists a value is a thin adapter over it — do not write another.

```
src/PickerField.tsx        (ui-kit)   value layer: field text, key↔label, commit
src/SearchMenu.tsx         (ui-kit)   the panel: catalogue, groups, query, keyboard
src/selection.ts           (ui-kit)   the selection model (useSelection)
src/SelectionControls.tsx  (ui-kit)   SelectionCheck + SelectionFooter
```

## Two families — pick the right one

| The surface… | Use | Contract |
|---|---|---|
| **stores a value** (a cell, a form field, a filter chip) | `PickerField` | commit on close — one `onChange`, only when the value changed; Escape drops the draft |
| **does something** (bulk action: "Add 6 roles") | `SearchMenu multiple` | draft + footer hero; Escape/outside CANCELS; the hero commits one batch |

Both share the same rows, indicators and keyboard model, so they look identical.
Never build a third panel.

## PickerField props that matter

| Area | Props |
|---|---|
| Value | `values`, `onChange(values)`, `resolveBy` (`id` default · `label`), `mode` (`single` · `multiple`) |
| Face | `appearance` (`inline` cell · `chip` form field · `wrap` multi-line cell · `morph` button→field), `display` (`names` · `chips` · `count`), `formatDisplay`, `formatEditing`, `renderTrigger` |

The **morph** face's resting trigger is the outline-button recipe (kit `Button`
`variant="outline"`): a 1px edge painted as an inset shadow, so the box keeps
exactly the same size when it transforms into the field — a border + padding
tweak would make the morph jump. Use `outline` for any button that becomes a
field (morph pickers, expandable search triggers).
| Catalogue | `items`, `groups`, `renderItem`, `badge`, `trailing`, `anchoredKeys`, `sortItems`, `max`, `disabledIds` |
| Panel | `indicator` (`box` · `check`), `browse` (`open` · `accordion`), `groupToken`, `keepAllRows`, `panelWidth`/`panelMinWidth`, `maxMenuHeight`, `theme`, `portalTarget` |
| Behaviour | `allowFreeText` (default true), `uppercase`, `selectAllOnOpen`, `defaultOpen`, `autoFocus`, `readOnly`, `inputReadOnly`, `disabled`, `skipComma`, `autoGrow` |
| Async | `loadItems(query)` (400 ms debounce, sequence-guarded), `emptyTitle`/`emptyHint` |
| Glide | `initialQuery`, `selectAllOnOpen`, `onTabExit` |

### Single vs multiple

- **single** — a pick commits and closes. Typing a prefix + Enter/Tab completes
  to the arrow-lit option (`keepAllRows` keeps the full list visible while the
  prefix only moves the highlight: `i` → INT, `e` → EXT, `m` → MORNING).
- **multiple** — `SearchMenu`'s `live` selection: a row click TOGGLES (the
  panel stays open, the field text mirrors the draft). The value commits on
  close (blur / outside / Tab), only when it actually changed. Escape cancels.
  Selected rows float to the top only in ungrouped lists; grouped lists keep
  their sections intact.
  - **Arrows after a toggle are geographic, not index-based:** ticking sorts
    the list under the cursor, so `SearchMenu` remembers the row that was
    visually above/below the toggled one. The next Up/Down jumps to that
    neighbour's NEW position — the cursor continues where the user was, never
    from the ticked row's new index (or the top of the list).
  - **Strict catalogues** (`allowFreeText: false`) never commit typed text
    outside the catalogue: a multi commit that resolves to nothing keeps the
    committed values (an intentionally emptied field still clears).

### Two highlight layers (do not merge them)

- **selected** (`ui-item-selected`) — the committed value / ticked rows, blue wash.
- **highlighted** (`ui-item-highlighted`) — the keyboard/pointer cursor, neutral.

A hovered row is visual only: it never arms Enter, and a pick consumes the
highlight (the next Enter commits).

## App adapters (all thin — no panel logic)

| Adapter | Stores | Notes |
|---|---|---|
| `src/components/EntityDropdown.tsx` | breakdown entities | `scene.cast` = **Board IDs**, every other category = names; `onCreateItem` → `addNewElement` + the naming modal; `useLinkedEditGuard` on scene commits |
| `src/components/AutocompleteDropdown.tsx` | strict option lists | INT/EXT, Day/Night, Glide enums — `keepAllRows`, free text allowed |
| `src/components/SelectDropdown.tsx` | ribbon I/E + D/N cells | inline appearance, `autoFocus` opens on mount |
| `src/components/production/day/GroupedSelect.tsx` | crew / locations | `indicator="check"`, department/location-type groups, `groupToken` = whole-department tags |

Public props of these adapters are frozen (cast by ID, comma strings, the
naming modal); migrate internals only.

## Menus (bulk actions)

`SearchMenu multiple` (`MultipleSelectionProps`):

```ts
multiple={{
  selectedIds: [],                 // seed (a stored value) or []
  mode: 'draft',                   // 'live' is PickerField's value mode
  onCommit: ids => addRoles(ids),  // ONE batch → one undo entry app-side
  commitLabel: n => `Add ${n} roles`,
  clear: false,                    // add-only menus
}}
```

- The footer hero is the only commit; Escape / click-away drops the draft.
- Enter/Space toggle; ⌘A is **never intercepted** (native select-all in the field).
- Group rows become select-all in this mode only; category rows never perform
  the action in single mode.
- `checked ≠ highlighted`, the panel never closes on a toggle, and the footer
  stays sticky at the bottom (`SelectionFooter`).

## Async source (the address field)

`PickerField` with `loadItems` replaces the retired `AsyncResultsDropdown`
(`LocationPickerModal`). The panel opens with `emptyTitle`/`emptyHint` until a
query returns. The committed value is the string the host stores (the address);
picked records carry extra payload through a host-side map keyed by that value.

## Glide cell editors — the typed-open contract

Glide starts an overlay edit from the typed key itself: the character arrives
as `initialValue` and the cell data is replaced **before React sees an input
event**. Therefore:

- `AutocompleteDropdown` forwards `initialValue` → `initialQuery` (the first
  open's search) and the activation's `selectAllOnOpen` (false on typed-open,
  so the next key appends: `e`, `e` → `EE`).
- The seed lives in **state**, not a ref: React StrictMode double-mounts
  effects in dev and a ref would be cleared by the first run.
- `SearchMenu` does not re-seed the open highlight when a query is present —
  otherwise the first letter is silently lost (`e` leaves INT lit).
- Escape is captured at **window** capture (ahead of Radix's
  document-capture `DismissableLayer`); outside clicks use
  `composedPath()[0]` (Glide renders in a shadow root).
- Glide needs `portalTarget` and `click-outside-ignore`; Tab hands off through
  `onTabExit` exactly once.

## Commit rules

- One `onChange` per close; `sameSelection` suppresses no-op commits (no empty
  undo entries).
- Typed-but-unmatched text commits only with `allowFreeText`; strict lists keep
  the previous value.
- Typing into a closed field that still holds focus starts an editing session
  (right after a pick the input keeps focus — without this the close-time
  commit drops the typed text).

## Tests

- Kit playground: `playground/specs/picker-field.spec.ts`,
  `searchable-dropdown.spec.ts`, `dropdown-menu.spec.ts`.
- App: `e2e/glide-breakdown.spec.ts` (typed-open prefix), 
  `e2e/scene-sheet-cell-layout.spec.ts` (wrap + prefix completion),
  `e2e/entity-dropdown-contexts.spec.ts`, `e2e/day-call-times.spec.ts` (bulk
  role add), `e2e/locations.spec.ts` + `e2e/report-sun-weather-map.spec.ts`
  (async address field).
