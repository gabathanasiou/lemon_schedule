# Lemon Schedule — Design Language Booklet

Status: **read this before building or changing ANY UI** in lemon_schedule. This is the canonical
design language: principles, exact class recipes, primitive choice, and anti-patterns.
Scope: app chrome (modals, menus, dialogs, pickers, toolbars, feedback, empty/loading states)
and the device model (desktop + iPadOS). NOT covered: print/paper subsystem (AGENTS.md §Print),
Glide canvas internals, reports-designer canvas (`docs/REPORTS-DESIGNER.md`).

---

## Keeping this doc current (update it in the SAME commit as the code)

- **ui-kit bump** (`package.json` → `@gabriel/ui-kit#v0.1.x`, see `UI-KIT.md`): re-verify §Recipes
  class strings and the §Primitive matrix against `node_modules/@gabriel/ui-kit` and fix this doc.
- **New primitive / feedback pattern**: register it in the primitive matrix or feedback taxonomy in
  the same change that adds it.
- **Single source of truth**: edit this booklet when shared patterns change — never fork the strings
  into a new file. The `code-reviewer` pass flags design-language drift against this doc.

## Mental model

1. **Two-layer surface system**: light in-app pages (`zinc-50` bg, white cards) hold the content;
   dark chrome (zinc-900/950 surfaces, `bg-black/20` overlays) holds every overlay — modals, menus,
   dialogs, popovers. The two never mix inside one surface.
2. **All interaction primitives come from `@gabriel/ui-kit`** (in-app 1-line re-export shims in
   `src/components/`). Writing a second copy of a primitive is forbidden — extend the kit instead.
3. **The exact class strings below ARE the visual language** — a menu that doesn't use
   `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg` is wrong by definition.
   Extract shared strings into module-level constants at the second use (like
   `LinkManagerModal.tsx:26-33`, kit `EditorChrome` `TB_*`).
4. **One design language across desktop and iPadOS.** Touch/pen are first-class: hover styles are
   un-gated (iOS tap-to-hover), paddings bump via `IS_COARSE`, tap feedback is `:active` (never JS pulses).

## Principles applied (NN/g heuristics → how this app does it)

| Heuristic | App rule | Proof |
|---|---|---|
| Visibility of system status | Save/offline state is always visible: `SaveIndicator` icons + `StorageStatus` folder pill; every consequential action updates one of them | `SaveIndicator.tsx`, `StorageStatus.tsx` |
| User control & freedom | Undo/redo history for everything (`state.past/future`); every modal closes via Esc/outside-click; destructive flows prefer reversible (Boneyard) over delete | store barrel; `Modal.tsx:160-170` |
| Consistency & standards | One primitive per job, one class string per surface type — reuse, never re-create | this doc, §Primitive matrix |
| Error prevention | Confirmations only for irreversible/expensive actions; confirm copy names the consequence — never "Are you sure?" | §Confirmations |
| Recognition over recall | Entity names render in cells; edit-mode hover affordance (`index.css:117-125`); EntityDropdown typeahead; keyboard shortcuts documented in `HelpModal.tsx` | `index.css:117-125` |
| Flexibility & efficiency | Shortcuts (HelpModal), long-press context menu on touch, Shift+click pop-out tabs | `AppHeader.tsx`, `LongPressMenuProvider` |
| Aesthetic & minimalist | Base `text-[12px]` (`index.css:77`), dense rows, no decorative fluff, no brand colors | `index.css:75-79` |
| Recognize/diagnose/recover errors | Severity ladder in §Feedback: inline text → banner → modal | §Feedback |
| Help & documentation | HelpModal for shortcuts; `text-[10px]` micro-copy under fields explains domain terms | `DayTypeModals.tsx:61` |

## The two-layer surface model

| Layer | Palette | Where |
|---|---|---|
| Light page | `bg-gray-50` body; white cards `bg-white border-zinc-200 rounded-xl shadow-sm` | SceneSheet, stripboard, Calendar, ProjectManager cards, PageToolbar light theme |
| Dark chrome | `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg` | App header, Modal, DropdownMenu, Dialog, print dialogs, ElementPicker |
| Cloud (`data-theme="blue"` or `bg-blue-950`) | light toolbars switch to `bg-blue-950` + `text-blue-50` active tabs | `useIsCloudProject()`; `PageToolbar.tsx:44-48` |

- Modals/menus are dark even when they sit on light pages.
- **Section containers inside dark modals must step UP a luminance level** — never
  same-as-body backgrounds (black-on-black): on the `bg-zinc-900` modal body, grouped
  sections (day-type cards, violation boxes, picker panels, rule lists) use gray
  containers `bg-zinc-800 border border-zinc-700 rounded-lg` with inner dividers
  `border-zinc-700/60`. Contents may sit directly on the body only when they are
  single rows (labels, help text) — anything boxed must be visibly lighter.
- **Exception**: kit `ContextMenu` is **light-themed by default** (`data-theme="light"`,
  `node_modules/@gabriel/ui-kit/dist/index.js:539`) because it anchors on light surfaces.
  DropdownMenu (dark) and Dialog (dark) set their own themes (`index.js:174`, `:671`).

### Boot screen (no project open) — minimal backdrop + app lockup (roadmap 82)

When no project is open (`App.tsx` renders `ProjectManagerBoot`), the ProjectManager
modal floats on a **deep zinc gradient** instead of flat gray. Minimal on purpose —
no color, no motifs:

- **Backdrop** (`ProjectManagerBoot.tsx`): **flat `bg-zinc-950`** for the whole
  screen + ONE soft lightening at the **bottom edge only** (a `h-56
  bg-gradient-to-t from-zinc-900/70 to-transparent` band, `pointer-events-none`).
  Minimal on purpose — no color, no centered glow, no motifs.
- **App lockup, bottom-right**: `LEMON SCHEDULE` (`text-[10px] font-semibold uppercase
  tracking-[0.2em] text-zinc-600`) + `v{APP_VERSION}` (`text-[10px] text-zinc-700`),
  `pointer-events-none select-none`. Version is build-time injected from `package.json`
  via Vite `define` (`__APP_VERSION__` → `src/lib/appVersion.ts`).
- **Dim exception**: the modal's item-59 one-dim is ZEROED on this screen (`.pm-boot
  .ui-modal-overlay { background: transparent }` in `index.css`, body class toggled by
  the component) so the backdrop reads crisp. Every other modal keeps the one-dim rule.
- Anti-pattern: this is a restrained backdrop, not a marketing splash — no brand
  colors, no decorative motifs, no animation.

## Canonical class recipes (the exact strings)

### Dark surfaces & menus
| Element | Classes | Source |
|---|---|---|
| Dark panel (menus, popovers, pickers) | `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl` | `rules/ElementPicker.tsx:56`; the print-dialog pickers render through the kit `DropdownMenu` (item 60 — `PrintDialog.tsx`, `print/ElementBreakdownDialog.tsx`, `print/DoodDialog.tsx`, `reports/ReportPrintDialog.tsx`) |
| Modal content | `bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden flex flex-col` | `Modal.tsx:173` |
| Modal header / footer | `bg-zinc-950 border-b/t border-zinc-800` | `Modal.tsx:177,229` |
| Overlay | `fixed inset-0 z-[9999] bg-black/20` | `Modal.tsx:163` |
| Scrollbar | `scrollbar-custom` (6px, zinc-500/40 thumb) | `index.css:81-97` |

### Buttons
| Role | Classes |
|---|---|
| Toolbar button (kit `Button`) | base `inline-flex items-center gap-1.5 rounded text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed`; `subtle` `px-2.5 py-1 text-zinc-600 hover:bg-zinc-200`; `primary` `px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white` (cloud: `bg-blue-950 hover:bg-blue-900`); `danger-ghost` `px-2.5 py-1 text-rose-600 hover:bg-rose-50`; dark theme mirrors with `hover:bg-zinc-800`/`hover:bg-zinc-700` — `ui-kit/src/Button.tsx` |
| Ghost (Cancel, Close) | `px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors` (`DayTypeModals.tsx:29`) |
| Solid (primary action) | `px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition-colors` (`DayTypeModals.tsx:30`) |
| Labeled icon action | `flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 border border-zinc-700 rounded-md hover:bg-zinc-800 hover:text-white` (`LinkManagerModal.tsx:33` — icon-only buttons need text labels) |
| Chip button (dark-modal dropdown triggers) | `DD_CHIP_TRIGGER_CLASS` (`src/lib/dropdown.ts`): `flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-900` — the cast-dropdown/chip look. Text size NOT included (add `text-xs`), layout extras (`relative` for an absolute value overlay, `justify-between`, min-widths, `w-full px-3 py-2` for full-width) append on top. Single source for the EntityDropdown `variant="chip"` trigger AND every value-displaying menu trigger styled like it (day-status + event-type pickers, `CategoryDropdown`, rule-type picker, print-dialog ribbon-layout/page-size/category pickers) — never hand-write the strings |
| Icon-only | `p-1.5 rounded-md transition-colors shrink-0 text-zinc-600 hover:text-red-400 hover:bg-zinc-800` (`LinkManagerModal.tsx:29-30`) |
| Toolbar micro (dark) | desktop `h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700`; touch `h-10 px-3.5 text-sm` (kit `TB_BTN`) |
| Danger ghost | `text-red-400 hover:bg-rose-950/40` (dark) / `text-rose-600 hover:bg-rose-50` (light) |

### Forms (dark modals)
| Element | Classes | Source |
|---|---|---|
| Field label | `text-[10px] font-semibold text-zinc-500 uppercase tracking-wider` | `DayTypeModals.tsx:36` |
| Text input | `w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500` | `DayTypeModals.tsx:43` |
| Segmented toggle | container `flex border border-zinc-700 rounded p-0.5`; selected `bg-white text-zinc-900` (dark modal: `bg-zinc-800 text-white`), unselected ghost | AGENTS.md; `DayTypeModals.tsx:66` |
| Help micro-copy | `text-[10px] text-zinc-600` | `DayTypeModals.tsx:61` |
| Intro copy | `text-xs text-zinc-400 leading-relaxed` | `LinkManagerModal.tsx:211` |
| Modal body | `p-6 space-y-5` (single-field forms may use `space-y-4`) | `LinkManagerModal.tsx:210`, `ScheduleModals.tsx:93` |
| **Date field** | `DateField` (`src/components/DateField.tsx`) — a composition of kit parts (promotion candidate under roadmap 56, same path as `DatePicker` → v0.1.34): **chrome** (default) = a chip trigger (the shared `DD_CHIP_TRIGGER_CLASS` + `ChevronDown`, label = `summaryLabel`) that spawns the kit `DropdownMenu` (dark, `w-64`) hosting the kit `DatePicker` — single mode collapses to the LATEST pick (the kit picker is a toggle, so re-clicking the picked day clears it); passing `className` (e.g. `w-full`) stretches the wrapper + trigger to fill the column (event editor's Date / Event Type row); **inline** = the calendar renders directly (rule editor Dates box — every date visible for multi-pick). **Open month = the relevant month** (roadmap 68): the picker seeds its visible month on mount from the field's picked date, else the production start, else real today (`initialViewFor` in `calendar/calendarUtils.ts`; kit `DatePicker` `initialView` prop, v0.1.63). Used by: EventModal, EventAdderModal (chrome; **inline + multi when element-locked** — the Element Manager add-event flow picks several dates at once), ProductionDatesModal (chrome), RuleEditorPanel (inline) | `DateField.tsx` |

### Tables (light managers)
| Element | Classes | Source |
|---|---|---|
| Manager table rows | grid `border-b` / `border-r border-zinc-200` (lines must stay readable under the hover tint), zebra `bg-white` / `bg-zinc-50/30`, **row hover `hover:bg-zinc-100`** (gray — no blue), `transition-colors` | `managerShell.tsx:452`, `ElementManager.tsx:602` |

### Item cards & rows (dark modals)

The grouped-list surface of the element events manager, extracted as the shared `ItemCard` +
`ItemRow` (`src/components/cards/`) — use these for any "one card per item, rows inside" list in a
dark modal (day-type cards, Rules sections; **the Trash modal's per-kind sections**,
`TrashModal.tsx`; RulesTab cast groups + day types are the light-theme
migration candidates — the components are dark-only today).

| Element | Classes | Source |
|---|---|---|
| Group card | container `rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden`; header row `flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 hover:bg-zinc-700/50 transition-colors` (wraps a `trailing` action below the title on narrow widths) — the toggle is a `flex-1 min-w-0 text-left cursor-pointer` **button** (chevron `w-3.5 h-3.5 text-zinc-500`, icon, title `text-xs font-semibold text-zinc-200 truncate`, count `text-[10px] text-zinc-500`) with right-aligned `trailing` actions (e.g. Add Rule) OUTSIDE it — never nest a button inside the toggle; body band `border-t border-zinc-700/60 bg-zinc-900/60 divide-y divide-zinc-700/60 p-1.5` — rows sit with divider lines (`bodyClass` overrides) | `cards/ItemCard.tsx` |
| Interactive row | `ITEM_ROW_CLASS` (`src/components/cards/ItemRow.tsx`): `group flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 hover:bg-zinc-800/60 transition-colors cursor-pointer rounded-md` — **row-wide click opens the item's editor**; title cell default `w-44 shrink-0 ... group-hover:text-zinc-100` (focusable button, pointer cursor; widen via `titleClass` — e.g. the day modal's `w-56` category label + element name); body wrapper default `flex-1 min-w-0` (shrinks, never wraps) — pass `bodyClass` = shared `ITEM_ROW_BODY_WRAP` (`flex-1 min-w-[13rem]`) to make the note area **stack onto its own full-width line under the title** on narrow rows (sizes unchanged at normal widths, trailing X flows beside the note); **body clicks bubble to the row** (interactive note text = I-beam `cursor-text` + `stopPropagation` itself; the input too); **trailing swallows its clicks** (the remove X never opens the editor). The **dark `RuleCard` renders as this row** (compact: description + conflicts + delete X; full: + icon box + type chip) inside the per-type rule cards and the day modal's Rules tab — the light RulesTab theme keeps its boxed card | `cards/ItemRow.tsx`, `rules/RuleCard.tsx` |
| Trash viewer | `TrashModal` — the File menu's Trash… on the kit Modal: **one `ItemCard` section per trash kind** (Scenes/Versions/Calendar Plans/Rules/Elements/Custom Categories/Color Rules/Crew/Ribbon Designs, kind icon + count, `data-trash-section`), rows = title + subtitle + Restore (`RotateCcw`, `data-trash-item`); footer = Empty (ghost danger `mr-auto`, DNWA confirm) + Close hero; "Trash is empty" state | `components/TrashModal.tsx` |

### Status colors
| Meaning | Classes |
|---|---|
| Danger text | `text-red-400` (dark) / `text-rose-600` (light); confirm button `bg-red-600` (dialog `danger:true`) |
| Success feedback | `text-[10px] text-emerald-400` (inline, after an action) — `LinkManagerModal.tsx:302` |
| Warning/selection pills | `bg-amber-100 text-amber-700 rounded-full` (light) — `ScheduleToolbar.tsx:105` |
| Violation | `Flag` icon `w-3.5 h-3.5 text-red-500`, pill `bg-red-100 text-red-600` |

### Icon sizing ladder
`w-3.5 h-3.5 shrink-0` = standard menu/row/button icon · `w-3 h-3` = micro (checkmarks, chevrons in
pickers, submenu chevrons) · `w-4 h-4` = modal header icons · `w-2.5 h-2.5` = StructureControls.
Touch (`IS_COARSE`) bumps modal icons to `w-4 h-4` (`Modal.tsx:13`).

### Global CSS invariants (`src/index.css`)
- **Every `<button>` is `cursor: pointer`** (a base-layer rule — Chrome 88+ defaulted buttons to `cursor: default`, which reads as dead). Utility overrides still win: `disabled:cursor-not-allowed`, `cursor-text` (note text), `cursor-default`. No button needs an explicit `cursor-pointer` class.
- **Hover styles are UNGATED** (`index.css @custom-variant hover` — no media query; kit `tokens.css`
  header): iOS Safari's native tap-to-hover — first tap applies `:hover` (sticky highlight/reveal),
  the click defers to the second tap — only engages when the tapped element has a matching `:hover`
  rule. `(hover: hover)` is false on iPadOS and `(any-hover: hover)` is false when no hovering
  pointer is attached — either gate kills the native behavior on touch. Every hover is still a
  Tailwind `hover:` variant or `.group:hover`/`.group:focus-within`, never a bare hand-written rule.
- `user-select: none` globally except inputs/contenteditable (`index.css:59-73`).
- `touch-action: manipulation` on `button, a, [role=button], [role=menuitem], [role=option]`
  (`index.css:65-67`).
- `.hover-reveal`: hidden until hover/tap (`opacity: 0`, un-gated), revealed by `.group:hover` +
  `.group:focus-within` (`index.css`) — on iOS the first tap on the row reveals it, the second tap
  activates; `:focus-within` keeps the revealed controls keyboard-reachable.
- Focus-visible: kit applies `outline: 2px solid var(--ui-accent-soft-text); outline-offset: 1px`
  (`node_modules/@gabriel/ui-kit/dist/ui-kit.css:210-213`).

## Primitive choice matrix

| Need | Use | Notes |
|---|---|---|
| Toolbar / action button | kit `Button` | Variants `subtle`/`primary`/`danger-ghost`; `cloud` prop colors light primary for cloud projects (derive via `useIsCloudProject`); `theme="dark"` for dark toolbars; icon-only nav + status pills stay bespoke |
| Version picker (schedule/calendar/ribbon-design dropdown) | `ItemManagerDropdown` | Per-tab placement (item 66: Schedule tab toolbar right edge + Calendar tab outer PageToolbar — **no header pickers**); trigger = kit `Button` with a muted label span + `text-zinc-900`/`text-zinc-200` value span + muted chevron (ribbon-designer recipe); rename inline uses the kit's theme-aware input (light theme = light input) — the create flow must dispatch with the SAME id the menu handed to its inline rename (`makeBlankCalendarVersion(name, id)`) or the rename input never appears |
| Click-to-toggle anchored menu | `DropdownMenu`/`DropdownItem`/`DropdownSubmenu` | Radix; **one `.ui-item-highlighted` row** (pointer hover + arrows, latest wins; the CSS `:hover` fill feeds iOS tap-to-hover but is suppressed while a row is highlighted — kit `tokens.css`, keyed on the kit class not Radix's attr), arrows/typeahead/Esc + the document-level menu key-lock (mini-modal: menu keys stay captured even when focus sits on a canvas); `modal:false`; root content = panel positioning (fixed below the trigger, width-matched, viewport-clamped); submenus keep the Radix popper side-placement; portals at `z-[200]` (bumped to 10001 inside modals, `index.css:29-31`). **Trigger-anchored open/close morph** (grow out of the trigger corner, shrink back on close — kit `overlayMorph.ts`, the modal FLIP language; §Modal anatomy) |
| Right-click / long-press menu | `ContextMenu` + `data-context-menu` targets | Fixed at (x,y), clamped to viewport, **light theme**; press-point-anchored morph, closes on Esc. Shares the kit menu machinery (highlight/keys/lock) — `ContextMenuSub` = `DropdownSubmenu` |
| Entity/cast picker in a cell or form | `EntityDropdown` | Modes: `multi` (comma list, click toggles), `single` (search-then-select), `select` (legacy). `items` prop REQUIRED — no context fallback. **Inside modals use `variant="chip"`** (dark chip trigger + dark panel; §EntityDropdown chip version below) — cells/forms keep the light default |
| Async address/place search | `AsyncResultsDropdown` (`src/components/location/`) | Debounced async results rendered in the **shared dark `DropdownPanel`** (the chip-EntityDropdown panel — morph, touch/wheel scroll, visual-viewport keyboard clamp for free) with a `Loader2` spinner in the trigger while searching; the search input keeps focus (NOT a kit `DropdownMenu`: its document key-lock consumes typeahead letters + steals focus to the content, breaking typing) |
| Inline cell text edit | `CellInput` | **Commits on blur only, never per keystroke**; Enter=commit, Esc=cancel |
| Live numeric box (toolbar steppers: ribbon Pad V/H, Edge, Master Size, cell offset) | `LiveNumberInput` (`RibbonToolbar.tsx`) | Free-typed draft while focused (type digits one at a time, delete-to-empty); commit clamps live (preview updates), Enter/blur clamps + finalizes, Escape reverts to the committed value. Never a clamped controlled input — clamping on change snaps the first keystroke |
| Confirm/prompt/alert | `useDialog().confirm/prompt/alert` | **Renders through the kit Modal (`flat` chrome — no header/footer bars, item 67)**: inherits the zoom/stack morph, the one-dim backdrop and the viewport clamp; Enter ALWAYS triggers the primary action (document-capture, even with focus on the X close button); Esc/outside = cancel |
| Confirm + remember-24h | `dialog.confirm({…, danger:true, suppressKey})` | For frequent-but-serious only |
| Popup above keyboard | `FloatingChrome` / `useSmartPosition` | iOS visual-viewport aware |
| Full form surface | `Modal` + `ModalFooter` | §Modal anatomy |
| Full-page detail editor | SceneSheet pattern (light page, NOT a modal) | `SceneSheet.tsx` |
| Multi-select lists | `Checklist` / `RadioList` / `Checkbox` | kit, `data-theme` aware |
| Grouped item list (dark modals) | `ItemCard` + `ItemRow` (`src/components/cards/`) | Collapsible group card + interactive row — the element events manager's day-type sections and its Rules section (first migrations). §Item cards below |

Dropdown **light picker** classes live in `src/lib/dropdown.ts` (panel `bg-white border-zinc-200
rounded-lg shadow-lg`, `DD_PANEL_CLASS_LIB` `:21-24`; items `DD_ITEM_CLASS_LIB` `:16-17`; selected
`bg-blue-50 text-blue-700`, hover `bg-zinc-100 text-zinc-900`, active `bg-zinc-200`). Synthetic
"Add" row is emerald (`bg-emerald-50 text-emerald-700`, `DropdownPanel.tsx:55`), empty state
`px-2 py-1 text-xs text-zinc-400 text-center "No matches"` (`:71`), commit hint footer
`text-[10px] text-zinc-400 border-t border-zinc-100` (`:78`).

**EntityDropdown chip version** (`variant="chip"` — modal rows: Link Manager, Color Rules rows,
`days-status` pattern, DayEventsModal attachment rows + inline rule editor cast pickers,
ProductionDatesModal-adjacent modals). Trigger = dark chip — the shared **`DD_CHIP_TRIGGER_CLASS`**
(§Buttons "Chip button"): `bg-zinc-950 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-900
px-2.5 py-1.5 flex items-center gap-1.5` (+ `relative` for the absolute value overlay) + chevron
(`w-3 h-3 text-zinc-500 absolute right-2`) + value/placeholder overlay; committed value stays raw,
the overlay resolves cast as Glide-style (`1. FISHERMAN`, `—` fallback) via the `items` prop.
**Every entity dropdown rendered inside a dark modal uses `variant="chip"`** — the dark trigger +
dark panel are the modal theme (the light default is for light cells/forms only). **Any other
dropdown/menu trigger inside a dark modal can adopt the same look by using `DD_CHIP_TRIGGER_CLASS`**
(e.g. the day-status DropdownMenu trigger in DayEventsModal, `CategoryDropdown` — its trigger IS the
constant, so category pickers everywhere already match the cast chips).
Clicking the chip prepares the text: single selects all (retype replaces), multi sets the caret at
the end (typing appends a segment). **Escape inside any open dropdown dismisses only the dropdown,
never the enclosing modal** (`useEscapeCapture` in `src/lib/dropdown.ts` — a mount-registered
document-capture interceptor; Radix dialogs close on Escape otherwise).
Panel = dark surface: `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl
z-[10001] p-1 min-w-[200px]`, items `DD_ITEM_BASE_DARK_LIB` — **`px-4 py-3 text-sm` on coarse
(`IS_COARSE`), `px-3 py-2 text-xs` on desktop** (roadmap 77: the dark panel rows + chip trigger
scale like the kit menu + light panel so iPad tap targets are as big as every other dropdown;
`DD_CHIP_TRIGGER_CLASS` padding bumps on coarse too). **Single-highlight rule (all EntityDropdown
panels, both themes)**: rows keep their un-gated Tailwind `hover:` fills (they feed iOS
tap-to-hover), but `highlightedIndex` is the ONE active row
(`bg-zinc-700 text-white` for dark, `bg-zinc-100 text-zinc-900` / checked `bg-blue-100 text-blue-700`
for light), which pointer hover (`onMouseEnter` → `onItemHover`) and the keyboard arrows both write
(latest wins; leaving the list clears a pointer-driven highlight via `onHoverLeave`). Checked rows =
distinct from the highlight: dark `bg-zinc-800/40 text-zinc-100` + trailing `Check` glyph
(`DropdownPanel.tsx`), light `bg-blue-50 text-blue-700`.

**Single-highlight rule (kit menus AND context menus — the kit `DropdownMenu`/`DropdownSubmenu`/
`ContextMenu` share the panel's highlight model, item 64)**: the one lit row is `.ui-item-highlighted`
(kit `tokens.css`) — written by pointer hover AND the keyboard arrows (latest wins; `onPointerLeave`
clears a pointer-driven highlight); the CSS `.ui-item:hover` fill feeds iOS tap-to-hover but is
suppressed while a row is highlighted (`.ui-menu:has(.ui-item.ui-item-highlighted) .ui-item:hover:not(.ui-item-highlighted)` —
keyed on the kit class, NOT Radix's `[data-highlighted]`, which stays on the last pointer-hovered
item when the keyboard moves the highlight away). Checked rows stay distinct (dark =
Check glyph; light = blue bg). **Menu key-lock (mini-modal)**: while a menu is open, the MENU keys
(arrows/Enter/Space/typeahead letters) are captured at the document and routed to the surface even
when focus sits on a stripboard canvas or the page body; events inside the menu pass through;
every other key (Cmd+Z, Esc, Tab…) is untouched. A submenu trigger row: Enter/ArrowRight opens the
sub (the keyboard-opened sub pre-lights its first item), ArrowLeft closes it and returns the
highlight to the trigger row. The menu machinery (highlight context, keys/lock/wheel handlers) is
kit-internal (`ui-kit/src/DropdownMenu.tsx`) — stable handlers created once per hook instance; the
composed-ref cleanup removes the ATTACHED closure (a per-render reassignment leaked the document
lock, and a leaked lock from a remounted menu kept its last activeRef forever — eating menu keys
app-wide).

`EntityDropdown` as a cell editor: **separate commit from exit** — `onChange` updates the value,
`onExit` leaves edit mode; never call both in one handler (editor unmounts and can't reopen).

## Modal anatomy & rules

Structure (all in `src/components/Modal.tsx`):
- **Header** (`:177`): `flex items-center justify-between px-5 py-2.5 border-b border-zinc-800 bg-zinc-950`, `cursor-grab`, **draggable** by pointer-capture; icon (`text-zinc-400`) + title `text-xs font-bold text-white truncate` (`:184`) + optional Reset (`:190`) + close X `text-zinc-500 hover:text-white` (`:195`).
- **Body** (`:201`): `overflow-y-auto flex-1 bg-zinc-900 text-zinc-100`; content carries `p-6 space-y-5`.
- **Footer** (`ModalFooter`, `:227-233`): `flex items-center justify-end gap-3 px-5 py-2 border-t border-zinc-800 bg-zinc-950`.
- **Footer buttons — one hero, rest ghost**: every modal footer has exactly ONE hero button — the
  primary action — and EVERY other button (Cancel, secondary actions, Import) is the ghost style.
  Use the kit's `ModalFooterButton` (`src/components/ModalFooterButton.tsx` re-export) — never
  hand-write footer classes. Variants: `hero` (default; solid
  `bg-zinc-800 text-white border-zinc-700`, e.g. "+ New Project" in the Project Manager), `ghost`
  (e.g. "Import"), `danger` (text+ghost destructive, left-aligned with `mr-auto` — Delete), and
  `danger-solid` (red confirm — Delete Selected). Sizes (coarse-aware `px-6 py-2` /
  `px-7 py-2.5 text-sm`), icon spacing (`gap-2`) and disabled states are baked in. A single-button
  footer IS the hero (Close). No second hero; async heroes swap to a `Loader2` spin + `disabled`.
- **No manual resize** — the modal auto-fits its content (content-driven height changes animate,
  see Morph below); drag-to-move by the header is the only manual geometry control. Default
  width comes from the `width` prop (`max-w-* w-full`, else `max-w-xl`) clamped by
  `min(100%, 100vw - 64px)` + `max-height: 100vh - 64px`.

Behavior: Esc and outside-click = cancel (touch: overlay `onTouchEnd` closes unless a Radix menu is
open, `:165-169`); Enter = confirm — when nothing interactive is focused
(input/textarea/button/dropdown open), Enter clicks the footer's LAST button
(the app's footer convention: Cancel first, primary action last, danger first
with `mr-auto`); an explicit `data-modal-confirm` marker on a footer button
wins over the heuristic, and a disabled last button is a no-op. **Dialogs
(`flat` chrome) differ deliberately**: Enter ALWAYS triggers the primary
action (document-capture in the kit Dialog — Radix focuses the X close button
on open, which would otherwise make Enter cancel), while Esc/outside/X stay
cancel. Radix focus trap. Portaled overlays above the modal
(DurationKeypad) must set their own `pointer-events:auto` (`Modal.tsx:66-67`).

Stacking (modal spawns modal, e.g. Day Events → Rule Editor): the parent fades to **invisible**
(`opacity:0` + `pointer-events:none`, 180ms) while the child is open — only the top modal stays
visible. Pure structural CSS in `index.css`: `[data-modal-stack][data-state=open]:has(~ [data-modal-stack][data-state=open])`
(dialogs portal as siblings into the window body; any open modal with an open modal after it
fades). The modal overlay dims the background **ONE layer per window** (`.ui-modal-overlay`,
kit `tokens.css`) — stacked modals never stack darkenings: the sibling `:has(~ [data-modal-stack][data-state=open])`
selector zeroes the dim on every non-top modal, so exactly one dim layer exists (belonging to the
top modal); it fades 220ms WITH the close morph (`ui-modal-overlay-closing`) and stacked swaps are
instant. The ui-kit confirm/prompt/alert dialogs are Modal instances too (item 67 — flat chrome),
so they participate in the stack + dim machinery identically: a dialog over a modal dims once (its
own layer), the modal beneath fades. **Fade-recovery watchdog**: iOS Safari can leave a stacked
modal's composited layer stuck at `opacity:0` after its child unmounts (the reported "previous
modal invisible but still there" freeze) — the survivor's exit-morph watchdog pins it back inline
(`opacity:1`, which wins over the `:has` rule) once the fade window has passed, and the next
stack-open releases the override so future fades still work. **Radix pin (roadmap 71)**: stacked
modals also break on iPad when `react-dismissable-layer` <1.1.19 — 1.1.12 defers TOUCH
outside-dismissal to the click, so a touch-tap Cancel on the top modal left the stacked dialog's
body at `pointer-events:none` on close (day modal back, app locked; the playground's 1.1.19+ never
showed it). Keep `@radix-ui/react-dialog` ≥1.1.23 + `@radix-ui/react-dropdown-menu` ≥2.1.24, bumped
TOGETHER (a partial bump forks the shared dismissable layer and breaks menus inside modals).

**Viewport & keyboard** (roadmap 70): modals centre and clamp against the **visual viewport**
(`window.visualViewport.height`/`offsetTop`) — on iPad the software keyboard and Safari chrome live
there, not in `innerHeight`. Opening/closing the keyboard re-centres an un-dragged modal into the
visible area (dragged ones just re-clamp) via a `visualViewport` resize/scroll listener.

Morph: stacked modals **grow out of the modal beneath them** and the survivor **shrinks back from
the closing modal's box**; **standalone modals zoom in from 94% on open and zoom back out on
close** — a hand-rolled FLIP in `Modal.tsx` (no animation lib): measure both rects, pin the
content box onto the target box with a `translate+scale` transform (`transform-origin: 0 0`),
force a reflow, then double-rAF to identity with a 220ms `cubic-bezier(0.32,0.72,0,1)` transition.
The transform lives on the **content box itself** (a wrapper would crop inside its fixed
`overflow-hidden` box) and never touches `pointer-events`. Enter: the child finds its stack parent
among open `[data-modal-stack]` siblings (DOM order = stack order, so popout windows work
per-window automatically); no parent → zoom-in. Close: the Modal owns its dismissal paths (X, Esc,
outside-click, overlay touch) and intercepts them via `doClose` — plays the zoom-out, THEN calls
`onClose` (footer buttons that call `onClose` directly snap closed; stacked children skip the
self-zoom since the survivor's morph-back is the close effect). Exit-morph parent side: a
MutationObserver arms a per-frame poll that tracks the child's last box; when the child disappears
it plays the reverse map while the CSS fade restores it (the inline transition carries
`opacity 180ms` so the fade keeps running). Drag/resize are gated while a morph runs; an
animation token cancels stale rAF/timeouts on rapid open/close. **Content-driven size changes** (tab switches,
async loads — e.g. Project Manager Local↔Cloud) FLIP the box height: a ResizeObserver pins the
old height, transitions to the new px height, then releases to auto — user drag/resize stays
instant and mid-morph fires re-anchor afterwards. `prefers-reduced-motion` skips
all of it. Opt-out: `localStorage lemon_schedule_modal_morph === '0'` — no code change needed to
disable. **The same motion language covers every overlay** (roadmap 58): dropdown menus grow out
of their trigger's corner, submenus out of their entry edge, context menus out of the press point,
and EntityDropdown/Select/Autocomplete panels out of their trigger — the kit's shared
`overlayMorph.ts` (`useOverlayMorph`, exported via `@gabriel/ui-kit`) replicates the modal zoom
(reduce-motion + the same opt-out key gate it; app shims inject the key, kit stays key-agnostic).
**Close-flash rule**: closing styles are NEVER cleared while the overlay is still mounted (clearing
`opacity` repaints one full-opacity frame if the unmount render is deferred) — the box is pinned
`visibility: hidden` and styles are restored only after the node detaches (menus, `Modal.zoomOut`)
or on a pinned clone for unmount-driven closes (`cloneOnUnmount`, panels).

**Touch + keyboard inside modals** (roadmap 69/70): overlays are ALWAYS scrollable by touch —
react-remove-scroll (Radix Dialog) cancels `touchmove` on anything outside the dialog content, so
`useOverlayMorph` intercepts touchmoves at document capture (stop-propagation, the same trick as the
v0.1.52 wheel interceptor) and lets native finger scroll proceed. Dropdown panels position/clamp
against the **visual viewport** and re-measure on `visualViewport` resize/scroll — the iOS keyboard
fires resize there (never on `window`), so a panel open near the keyboard stays inside the visible
area instead of extending under it.

Width ladder (verified call sites): `max-w-sm` simple forms (`CustomOrderSortModal`) · `max-w-md`
single-form (`DayTypeModals.tsx:26`) · `max-w-lg` merge/violations (`ViolationModal`) · `max-w-xl`
HelpModal · `max-w-2xl` color rules / travel-hold / import (`ImportDialog`) · `max-w-3xl`
links manager / print dialogs (`LinkManagerModal.tsx:200`, `PrintDialog.tsx:130`).

Touch bumps (`IS_COARSE`, kit `Modal.tsx`): header `px-6 py-3`, title `text-sm`, footer `px-6 py-3`.

**When NOT to use a modal** (NN/g modal-vs-nonmodal): noncritical info (use banner/tooltip/pill),
routine actions (no confirm at all), decisions needing info behind the modal (keep on page),
multi-step wizards (dedicate a page), anything not related to the current task.

## Confirmations & destructive patterns

- Copy must **restate the consequence with specifics**: "Delete scene 12 — The Drive In?" not
  "Are you sure?". Verbed buttons ("Delete", "Keep") over Yes/No.
- `danger: true` → red confirm button, ghost cancel; cascade flow: cancel = edit not applied,
  confirm = cascade with the casualty list in the message
  (`src/lib/useLinkedEditGuard.ts:57-61`).
- `suppressKey` → "Don't ask again (24 hours)" checkbox, stored in localStorage; reserve for
  frequent-but-serious (e.g. delete-from-trash), never for one-off confirms.
- **Undo-first rule**: if the action is reversible (undo history, Boneyard vs delete), prefer a
  lighter confirm or none. Confirming the same thing every time teaches users to click through it.
- Unsaved-changes guard: `dialog.confirm({title:'Unsaved Changes', message:'You have unsaved
  changes. Save before leaving?'})` — `src/lib/unsavedGuard.ts:128`.

## Feedback taxonomy (severity → mechanism)

| Situation | Mechanism | Example |
|---|---|---|
| Continuous save/offline state | Header icons + hover tooltip | `SaveIndicator.tsx` (`Loader2` spin=saving, `Cloud`=synced, `WifiOff`=offline, `CloudOff` rose=fail, `HardDrive` rose=storage full) |
| Folder backup state | Color-coded pill in header + menu | `StorageStatus.tsx` (sky=saving, emerald=saved, rose=error) |
| Offline / auth / read-only | Full-width colored bar `px-4 py-1.5 text-xs` | `OfflineStatus.tsx:24-58` (green=restored, amber=auth, red=offline) |
| Transient selection/buffer summary | Floating dark panel near cursor + amber pills | `ScheduleOverlays.tsx:92-105`, `ScheduleToolbar.tsx:105` |
| Action success | Inline `text-[10px] text-emerald-400` next to the action | `LinkManagerModal.tsx:302` |
| Severe error | Modal (rare) — see §When NOT to modal | `OfflineStatus.tsx:59-99` |
| Recoverable error | Inline near the source, red, with a remedy | form/input errors |
| Loading | `Loader2` + `animate-spin`, often with label swap ("Reconnecting…") | `SaveIndicator.tsx:88`, `OfflineStatus.tsx:52` |
| Empty state | Centered `text-zinc-500` + filled CTA button | `SceneSheet.tsx:260-272`; "Trash is empty" `App.tsx:923` |
| Reference info | `Tooltip`/`HoverTooltip` (hover-only; touch gets info inline instead) | `ViolationTooltip` |
| Overlay open/close | Trigger-anchored scale+fade morph (220ms modal easing, §Modal) — **feedback, not chrome**: no slides/overshoot/springs on functional menus; hover items keep `transition-colors` only; `active:transition-none` stays (instant touch) | kit `overlayMorph.ts`; `e2e/overlay-morph.spec.ts` |

**There is no toast system and none should be invented** — pick a mechanism from the table.

## Message copy rules

Plain language; no error codes/jargon; no blame ("invalid/incorrect" → "enter a time between…");
state the problem precisely AND the remedy; preserve user input on failure; keep it one line where
possible. Success/failure messages match the app's terse voice: "Applied: linked elements added to
N scenes" — not "Success! Your links have been applied".

## Hover, tap & device model

- **Hover styles are un-gated** (`index.css @custom-variant hover`, kit `tokens.css` header): iOS
  Safari's native tap-to-hover — first tap applies `:hover` (sticky until the next tap) and defers
  the click to the second tap — only engages when the tapped element has a matching `:hover` rule.
  `(hover: hover)` is false on iPadOS even with cursor/pencil and `(any-hover: hover)` is false when
  no hovering pointer is attached — either gate kills the native behavior on touch.
- **`:active` is outside the gate** — instant touch feedback; add `active:transition-none` to avoid
  delay. No JS flash/pulse affordances: iOS sticky hover (tap → `:hover` until next tap) IS the tap
  feedback and doubles with anything extra.
- **Apple Pencil = touch**: `isTouchLike('pen')` (`src/lib/device.ts`); Safari doesn't synthesize
  clicks for pen in overlays (device.ts shim) and never fires `:active` for pen.
- **Touch sizing** via `IS_COARSE` (`src/lib/device.ts`): menu items `px-4 py-3 text-sm` (vs
  `px-3 py-2 text-xs`), toolbar buttons `h-10 px-3.5 text-sm`, modal header `px-6 py-3` — bump the
  same way, never guess a middle size.
- Long-press opens context menus with a progress ring (`.ui-longpress-ring`,
  `node_modules/@gabriel/ui-kit/dist/ui-kit.css:826`).
- Keyboard: `Esc` clears selection (`useScheduleKeyboard.ts:38-41`); cell editing navigates via
  Tab/Shift+Tab/↑↓ (`CellInput`).

## Accessibility requirements

Radix primitives supply focus traps, `role=menu/menuitem`, arrow/typeahead, Esc. App obligations:
`aria-label` on every icon-only button (`LinkManagerModal.tsx:252,262`), `aria-pressed` on toggles
(`SelectionModeButton.tsx:15-16`), decorative icons `aria-hidden`. Never communicate state by color
alone — pair red with icons/text (violation `Flag`, error icon + message). Keyboard parity: every
pointer action must have a keyboard path (documented in `HelpModal.tsx`). New shortcuts/controls
MUST be added to `HelpModal.tsx` (AGENTS.md rule).

## Anti-patterns (MUST NOT)

1. **Never write a second copy of a primitive** — kit first, then the app shim re-export; fix bugs
   in the kit, port back to in-app copies if not yet migrated (`UI-KIT.md`).
2. **No new toast system** — use the §Feedback taxonomy.
3. **No hardcoded ribbon-cell styling** — always `getRibbonCellBaseStyle` (`src/lib/ribbonUtils.ts`).
4. **No per-keystroke commits** — `CellInput` commits on blur; EntityDropdown commits on exit.
5. **Never gate hover styles behind `(hover: hover)` / `(any-hover: hover)`** — a non-matching gate
   kills iOS tap-to-hover (first tap = sticky `:hover` highlight/reveal, click on the second tap).
   Un-gated `hover:`/`:hover` is the rule; `.hover-reveal` needs a `.group:focus-within` path.
6. **No raw colors outside the zinc palette/tokens** — no brand colors, no saturated UI chrome;
   danger/success/amber semantics as in §Status colors.
7. **No mixing layers** — a light card inside a dark modal or vice versa is a bug.
8. **No black-on-black sections in dark modals** — section containers take a gray
   backdrop (`bg-zinc-800 border-zinc-700` on the `bg-zinc-900` body); same-as-body
   backgrounds bury the hierarchy (see §Two-layer surface model).
8. **No parallel dropdown/menu families** — extend `src/lib/dropdown.ts` classes or the kit;
   `rules/ElementPicker.tsx` `ElementDropdown`/`ElementPickerRow` are the shared picker rows
   (extend, never fork).
9. **No hardcoded z-index surprises** — overlay `9999`, modal content `10000`, menus `200`
   (10001 in modals), tooltips `99999`.

## Verification checklist

1. `npm run lint`
2. Visual pass on `npm run dev` (port 3000): the changed surface + a modal, a dropdown, touch-size
   emulation (devtools → iPad) — hover, active, Esc/outside-close, keyboard nav.
3. `npx playwright test` (or `npm run test:smart`) after any primitive/kit change; canaries
   (`seeded-smoke`, `debug-bridge`) cover modal/menu basics.

## Appendix — source index

- Modal: `src/components/Modal.tsx` · PageToolbar: `src/components/PageToolbar.tsx` ·
  EntityDropdown: `src/components/EntityDropdown.tsx` + `src/lib/dropdown.ts` ·
  dropdown panel: `src/components/DropdownPanel.tsx` · CellInput: `src/components/CellInput.tsx` ·
  ColorField: `src/components/ColorField.tsx` · tooltips: `src/components/{Tooltip,FloatingTooltip,HoverTooltip}.tsx`
- Kit shims: `src/components/{DropdownMenu,DropdownItem,DropdownDivider,DropdownSubmenu,ContextMenu,Dialog,Checkbox,Checklist,RadioList,FloatingChrome,EditorChrome}.tsx`
- Kit source + tokens: `node_modules/@gabriel/ui-kit/dist/index.js`, `dist/ui-kit.css`
- Global CSS: `src/index.css` · device model: `src/lib/device.ts`

External sources consulted (Aug 2026): Nielsen Norman Group — "10 Usability Heuristics"
(nngroup.com/articles/ten-usability-heuristics), "Confirmation Dialogs Can Prevent User Errors — If
Not Overused" (nngroup.com/articles/confirmation-dialog), "Error-Message Guidelines"
(nngroup.com/articles/error-message-guidelines), "Modal & Nonmodal Dialogs"
(nngroup.com/articles/modal-nonmodal-dialog).
