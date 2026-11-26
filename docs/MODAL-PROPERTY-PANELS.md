# Modal property panels — the inspector recipe (agent manual)

Status: **read before migrating a modal/manager property panel onto the shared inspector
rows.** Roadmap 373 batch (d) pilot: **Element View → Properties**. The DEV studio for
deciding further modal migrations is roadmap **374**.

## Reference implementation

- `src/components/elements/ElementPropertiesSection.tsx` — the ONE migrated panel.
- `src/components/inspector/Inspector.tsx` — the primitives (`InspectorGroupCard`,
  `InspectorSection`, `InspectorRow`, `InspectorGroup`, `InspectorSubGroup`; `labelWidth`).
- Grammar + MUST-NOTs: `docs/DESIGN-LANGUAGE.md` §Inspector & control rows.
- Launch: Breakdown → Element Manager → a row's **View**; DEV route
  `#/breakdown/elements` (the Elements lab is `#/lab/inspector` for width/theme checks).

## The surface is a panel, not a form

Wrap the body in `InspectorSurfaceContext.Provider value="panel"` and do **not** use the
label-above form language inside it. The hierarchy is:

```
InspectorGroupCard "Element"                 ← master group (raised card + eyebrow)
  InspectorSection "Identity"                ← section card (recessed band)
    InspectorRow "Board ID" [input]          ← 42px label column + control column
InspectorGroupCard "Performer & booking"
  InspectorSection "Contact"
    InspectorRow "Phone" [phone] Email [email]
```

- Master groups stack; never side by side. Every section lives in one.
- `labelWidth` on wide surfaces: the Element View uses `4.5rem` so “Character” / “Agent Ph”
  fit; **never below the 42px rail column**.
- Labels are **right-aligned in the column** so every label sits the same **8px** from its
  control. A left-aligned label in a wide column reads as a stray gap.
- Rows are 28px, one concept; the control column wraps. `full` is only for a big composite.

## Paired fields share a row

Related fields stay together: the row label names the first control, and the second uses an
`InspectorSubGroup` with a fixed **36px right-aligned mini-label** (`w-9 pr-1.5`), so its
input lines up down the panel and its text sits the same 8px from the box.

| Row label | First control | Inline label | Second control |
|---|---|---|---|
| Phone | phone | Email | email |
| Agent | agent | Ph | agentPhone |
| Address | address | Email | agentEmail |
| Rate | rate (money) | Per | rateUnit |

All free-text boxes in one panel share **one width** (`w-56` in the pilot); numbers stay
compact (`w-20`); a note field is the only `w-full`. Mixed widths read as broken chrome.

## Inputs, state and hooks

- Text fields use the kit `TB_INPUT`; **commit on blur / Enter** (never per keystroke, never
  a Save button) and keep the panel's `data-*` test hooks.
- `aria-label` every input — the row label is not a `<label>` wrapper.
- Money uses the shared `MoneyField` (`src/components/budget/fields.tsx`); units use
  `InspectorMenu`. Never hand-roll a currency box.
- `readOnly` + `disabled` are first-class; keep `locked` semantics.
- Use `InspectorGroupCard` for a new group. Never copy its bordered/eyebrow div, and never
  force `min-w-max`/`flex-nowrap` in a panel row.

## Migrating another modal

1. **Data first**: add the field to its canonical registry / type / report fields before
   touching UI (for cast details that is `src/lib/castDetails.ts` + `src/types.ts`).
2. **Place it**: pick the master group + section; pair it with its companion value when one
   exists.
3. **Prove it**: `npx tsc --noEmit`; the manager/panel spec; manual pass at
   **240 / 300 / 360 / 400px** and **150% text** — no horizontal scroll or clipped labels.
4. **Document the grammar change** in `docs/DESIGN-LANGUAGE.md` (and the
   `inspector-controls` skill) in the same commit.
5. Keep the batch revertible: file list + control faces in the commit/summary.

## Brief another agent (copy-paste)

> Read `docs/MODAL-PROPERTY-PANELS.md` and `docs/DESIGN-LANGUAGE.md` §Inspector & control
> rows. Migrate `<Modal>` onto the panel surface, using
> `src/components/elements/ElementPropertiesSection.tsx` as the reference. Keep
> commit-on-blur, existing data hooks and read-only behaviour; verify 240/300/360/400 +
> 150% text and update the docs with the diff.

The global **`inspector-controls`** skill carries the same workflow for any app.

## Future

- Roadmap **374** — DEV-only modal & dialog studio: arrows over every modal/dialog, MCP
  awareness of the active surface + clicked element, and a completeness check so new
  modals are always registered.
- Roadmap **373** stays open for the remaining modal/manager property panels.
- Roadmap **375** — cast rate: the Budget's numeric `rateCents`/`rateUnit` is the source of
  truth; the Element View Rate row will edit it (not the MMS strings).
