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
