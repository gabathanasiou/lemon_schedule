# Reports — Lego Context & Scoping (spec)

How nested repeats/tables/columns compose in the Reports Designer. Read this
before touching `resolveCollectionItems`, `ReportRepeatView`, `ReportTableView`
or the collection menus — this is the canonical model, don't re-derive it.

## 1. The context-passing contract

Every nested block receives, and must forward (containers pass-through):

| Prop | Meaning | Provided by |
|---|---|---|
| `item` | the parent repeat's current item | the parent repeat's loop |
| `parentCollection` | the parent repeat's collection | the parent repeat |
| `parentCategory` | category of an `elements` parent | the parent repeat |
| `outerItem` | the GRANDPARENT context — used by `scopedToParent` | the parent repeat passes its own `item` |
| `scopeFilter` | print scope selection | print dialog (top-level) |
| `aux` | counter index / page / pageSize / counterStart | repeat loop + page renderer |
| `showKeys` / `hint` / `onceTable` | view chrome | the renderer |
| `parentItems` | the parent repeat/relative's post-scope resolved list — the `relative` block slices it (roadmap 27) | the parent repeat/relative view (unchanged on split pages too: chunk parts slice the same view, never a re-resolve) |
| `itemIndex` | the current item's index in `parentItems` | same as above |

Rules:
- **repeat** = iteration container: provides `item`, passes `outerItem = item` to children, AND passes `parentItems` (its post-scope filtered list) + the current `itemIndex` to children.
- **relative** = mini-repeater: resolves `parentItems.slice(idx + offset, idx + offset + count)`, renders children once per sliced item with `parentItems` = the slice + the local `itemIndex` (relative-in-relative = offset composition). No collection of its own — the unit IS the parent's collection.
- **columns** = transparent layout container: forwards everything unchanged
  (`item`, `parentCollection`, `parentCategory`, `outerItem`, `scopeFilter`, `aux`, `showKeys`).
- **table** = data container: consumes the context to resolve its items/fields;
  has no children.

## 2. Scoping — `scopedToParent` (default ON, `!== false`)

A nested repeat/table can reduce its collection to the items that live in the
parent's context. The primitive for every rule:

```
parentScenesOf(parentItem)  →  the SCENES the parent item stands for
  day        → that day's scenes
  scene      → the scene itself
  element/cast → scenes containing it
  category   → scenes using that category
  crew       → none (no scene data — scoping is a no-op)
```

### Intersection (ancestor chain)

Every block receives the FULL ancestor chain (`ancestors`, nearest first;
`columns` passes it through untouched). Scoping **intersects** — a nested
collection keeps only items that live in EVERY rule-bearing ancestor's scenes:

| Nested collection | Scoped to ancestors = |
|---|---|
| scenes (+ scenesOf*) | in all ancestors' scenes |
| days (+ daysOfCast) | days of all ancestors' scenes |
| categories | present in all ancestors' scenes |
| elements / cast (+ elementsOf*) | attached to all ancestors' scenes |
| crew | no rule (global) |

So `Cast → Days → Scenes` gives "this person's scenes on this day". Shallow
chains (one ancestor) behave exactly as before. Unchecking "Only … in this …"
disables ALL ancestor scoping for that block (opt-out).

## 3. Contextual collections (defaults)

`contextualCollectionsFor(parent)` picks a smart DEFAULT when a new table/repeat
is dropped in a parent (via `tableItemCollection`):

| Parent | Default contextual collection |
|---|---|
| days | `scenesOfDay` |
| scenes | `elementsOfScene` (Shape A — the scene's breakdown elements; optional category filter) |
| elements | `scenesOfElement` |
| cast | `scenesOfCast`, `daysOfCast` |
| categories | `elementsOfCategory` |
| crew | none (per-item) |

These are menu shortcuts AND defaults; the Lego checkbox is hidden for them
(they're structurally scoped) and shown for explicit base-collection selections
(scenes / days / elements / categories / cast / crew). The Repeat over menu lists
the parent's contextual collections ahead of the base ones — e.g. a repeat
dropped inside a `categories` repeat can select "Elements (of this category)" to
iterate every element of the parent's category (not one fixed category).

## 4. Summary tables (`onceTable`)

A **table nested in an `elementsOfCategory` repeat** whose effective collection
matches the parent is a SUMMARY: it renders ONCE per category, listing all of
the category's elements. This is the only `onceTable` case — do not broaden it
(a same-collection table in a scenes/crew repeat is per-item).

## 5. Ribbon block (context-driven, no modes)

The ribbon has NO mode dropdown — it renders from the Lego context:

| Context | Renders |
|---|---|
| inside a Scenes repeat (item = scene) | that scene's strip |
| inside a Days repeat (item = day) | the day's boxed section (always bordered) — daybreak halves when `ribbonDayBreaks` |
| day section with an element/cast ancestor | the day's strips FILTERED to that person's scenes ("personal scenes within this day") |
| anywhere else at top level | the full schedule in stripboard order (daybreak halves + strips + notes/breaks); empty schedule shows a hint |
| inside elements/categories/cast/crew item | nothing |

Person-filtered chains: `Cast → Days → Ribbon` = each cast member's workdays,
each showing the full day section with only their strips.

## 6. Full chain example (what the user can build)

```
Repeat over Days                          item = day D
  └─ Repeat over Cast  ☑ Only cast in this day     (scoped: cast working D)
      └─ Table over: Scenes (of this cast member)  (this person's scenes ON that day — intersection)

Repeat over Scenes
 └─ Table over: Elements (of this scene)  ☑ Category: Props → just this scene's props

Repeat over Cast (person P)
 └─ Repeat over Days  ☑ Only days in this element  (P's workdays)
     └─ Ribbon                                   (full day section, only P's strips)

Repeat over Days
 └─ Repeat over Categories ☑ Only categories in this day
     └─ Table over: Elements (of this category)   (elements of that category on D)
```

## 6. Gotchas

- Defaults are ON (`scopedToParent !== false`, `skipEmptyCategories !== false`,
  `showBorders !== false`) — matching the checkbox semantics in the toolbar.
- `elementsOfScene` with no category = union across ALL categories; with a
  category = that category's elements (the "just the props of a scene" case).
- The print scope filter (`ReportScopeFilter`) is orthogonal to Lego scoping:
  it's per-collection include lists from the print dialog, applied on top.
- Per-item tables (crew parents, same-collection scenes tables) render the
  parent item as a single row — Counter uses the repeat index, not the row.

## 7. Lookup refs in context (roadmap 195)

A `@item.` reference is a Lego participant too — it resolves against the
containing chain, not against its own authored position:

- **Offered list** — `lookupAttributeFields` (`lib/reportTokens.ts`) = the
  target's OWN item scope: `fieldsForScope` for its collection/category minus
  the identity field, the document-wide GLOBAL divider (production/project/
  document never read the item) and smart fields where the item kind can't
  read them (crew/locations/rollup types). A day ref offers the days palette
  (smart fields, locations, per-day breakdown attributes); a cast element adds
  the cast identity fields.
- **Resolution** — `scopeLookupTarget` (`reportTokens.ts`) applies
  `aux.sceneScope` (the ancestor intersection) to the target before the field
  reads it: a category ref's Element List/counts reduce to the scoped scenes
  (shares `unionSceneFieldParts` with `dayBreakdownValue`, so
  `@Props.Element List` inside a days repeat ≡ `{{props}}`); an element ref's
  attached scenes/scene count/pages reduce to its scoped scenes; day-list
  timeline attributes stay element-wide. No scene scope (top level, or a
  non-rule-bearing chain like a crew repeat) → the global item.
- Cellref pins (`cellref….<field>`) resolve through the same scope.
- **Chained navigation (196 — LOCKED behind `CHILD_NAVIGATION_ENABLED` in
  `reportLookup.ts`; unlock = roadmap 215)** — a reference can walk to children:
  the path lives in the token (`lookup.…nav:<encoded JSON>`, `LookupPath`), and
  the `.` stage offers the child steps (`referenceOffer`): day → scenes,
  element/cast → scenes, scene → elements, category → elements, crew →
  categories (`navChildItems`; crew→categories = the categories present in the
  member's scenes). `→ First/Last` + specific children by name (element
  children name their category, e.g. "Elements · Sets"); picking one inserts a
  chained chip that suppresses its anchor and anchors the next `.` stage. A
  chain resolves against its OWN path ancestors (`chainSceneScope` — the
  intersection of every path item's scenes), so
  `@EDITH.Categories.Wardrobe.Element List` scopes the category to EDITH's
  scenes and the containing block's `aux.sceneScope` never leaks in.
  Locations/location types/day types have no child steps. Locked = the picker
  hides the steps; grammar + resolution stay live and tested.

## 8. Field scopes (picker gating)

Scope gates **pickers only** — values resolve through the field map regardless
(`fieldValueSafe`), so a saved design always renders. ONE collection→field-scope
map feeds every picker: `fieldScopeFor` (`lib/reportLookup.ts`), consumed by
`fieldsForScope` (internally — raw callers are safe) and by
`tableFieldScope(block, parent) = fieldScopeFor(tableItemCollection(block, parent))`
(the block's EFFECTIVE item collection: contextual defaults resolved, explicit
nested picks respected — a Days table under a Scenes repeat offers day fields).

| Collection | Field scope |
|---|---|
| scenes / scenesOfDay / scenesOfElement / scenesOfCast | `scenes` |
| days / daysOfCast | `days` (+ Breakdown-union + locations admitted) |
| cast | `cast` **+ `elements`** (cast items ARE element infos + ID/ID&Name) |
| elements / elementsOfCategory / elementsOfScene | `elements` (+ `cast` when category `cast`; `elementsOfCategory` always, its category is per-iteration) |
| locationsOfType / locationsOfDay | `locations` |
| dayTypesOfElement | `dayTypes` |
| crewOfDay | `crew` |
| elementCallsOfDay / departmentCallsOfDay | themselves |
| everything else | itself |

Plus always: `production` / `project` / `document` / `smart`.

Surfaces and their scope source:

- Palette + block context menu: the designer's `insertScope` — a selected
  repeat/table stands for `tableItemCollection(block, parent)`; otherwise the
  selection's parent collection.
- Table column / rows-mode header / "Filter rows" pickers: `tableFieldScope`
  (same for the floating chrome and the docked inspector).
- Field blocks / text blocks / free-table cells (`{{}}` + `@` suggestions):
  `fieldsForScope(parentCollection, parentCategory)` — the block's CURRENT item
  is the parent repeat's item.
- `@` stage 1 (item list) is context-free (`buildLookupTokens`); the `.` stage
  after a reference/cellref chip uses the TARGET's own scope
  (`lookupAttributeFields`) — references exist only for `LOOKUP_SPECS`
  collections (cast refs ride `elements` + category `cast`).
- Day-scoped grid blocks (`callTimes`/`crewTable`) are allowed in any day
  context (`fieldScopeFor(scope) === 'days'`), `daysOfCast` included.

