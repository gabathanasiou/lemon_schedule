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

Rules:
- **repeat** = iteration container: provides `item`, passes `outerItem = item` to children.
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

Then the nested collection filters against those scenes:

| Nested collection | Scoped to parent = |
|---|---|
| scenes (+ scenesOf*) | the parent's scenes |
| days (+ daysOfCast) | days of the parent's scenes |
| categories | categories present in the parent's scenes |
| elements / cast (+ elementsOf*) | elements of that category attached to the parent's scenes |
| crew | no rule (global) |

Resolution lives in ONE place: `resolveCollectionItems(ctx, collection, category,
parentItem, parentCategory, block, outerItem)` — every renderer (designer canvas,
preview, print, pagination) goes through it.

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
(scenes / days / elements / categories / cast / crew).

## 4. Summary tables (`onceTable`)

A **table nested in an `elementsOfCategory` repeat** whose effective collection
matches the parent is a SUMMARY: it renders ONCE per category, listing all of
the category's elements. This is the only `onceTable` case — do not broaden it
(a same-collection table in a scenes/crew repeat is per-item).

## 5. Full chain example (what the user can build)

```
Repeat over Days                          item = day D
 └─ Repeat over Cast  ☑ Only cast in this day     (scoped: cast working D)
     └─ Table over: Scenes (of this cast member)  (all scenes of that cast member)

Repeat over Scenes
 └─ Table over: Elements (of this scene)  ☑ Category: Props → just this scene's props

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
