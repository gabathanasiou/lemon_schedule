# UI Primitives, Toolbars & Touch — Agent Manual

Status: **read this before building or changing app chrome** (toolbars, tabs, modals, menus,
dropdowns, hover/tap). `docs/DESIGN-LANGUAGE.md` is the canonical design booklet (exact class
recipes, primitive matrix, anti-patterns) — this file is the working summary + gotchas that agents
hit. When they disagree, DESIGN-LANGUAGE wins; update both in the same commit as the code.

## Tabs & Toolbars

- Top tabs (App header): breakdown, schedule, calendar, design, rules, reports. Shift+click /
  right-click = pop-out (desktop only, `!IS_COARSE`).
- `PageToolbar` (`src/components/PageToolbar.tsx`): reusable toolbar with optional sub-tabs. Active
  tab `bg-zinc-950 text-white rounded px-3 py-1.5` (cloud: `bg-blue-950 text-blue-50`); inactive
  `text-zinc-500 hover:text-zinc-900`. Scrolls horizontally with edge fades. Usage: Breakdown
  (light; Sheet/Element Manager/Glide Breakdown), Design (dark; Ribbon Designer/Colors), Reports
  (dark; DOODs/Element Breakdown), Schedule (light, justify end, no tabs), Calendar (two light
  instances).
- **Header portal pattern**: parent puts `<div ref>` in `rightContent`; child accepts `headerTarget`
  and `createPortal`s its controls there (fallback: inline). Used by ElementManager, SceneSheet,
  GlideBreakdownTab, ColorsTab, RibbonTab.
- **Scene sheet view order** (`SceneSheet.tsx`): view-only pref `lemon_schedule_breakdown_order`
  (`sheet | sceneNumber | stripboard`, `usePersistState` — the object form `{order}`). A sorted COPY
  drives rendering/navigation — `project.scenes` is never reordered; the Sheet # column always shows
  the TRUE sheet number (array index + 1). `naturalSortSceneStrings`; stripboard order = active
  version's SCENE rows, boneyard scenes appended. `initialIndex` echo-guarded
  (`lastReportedIndexRef`) so the App→prop feedback doesn't yoyo the position in non-sheet orders.
- **Cloud coloring**: cloud projects switch light PageToolbars to `bg-blue-950` (active
  tabs/buttons); derive via `useIsCloudProject()`. Dark toolbars unaffected.

## UI Primitives (use these, not raw HTML)

- **Design language: `docs/DESIGN-LANGUAGE.md` is the canonical booklet — read it before
  building/changing any UI, and update it in the same commit when you change a shared pattern or bump
  the ui-kit.**
- **Overlay morph (menus/panels/modals)**: every floating surface shares the modal FLIP motion
  language via kit `overlayMorph.ts` (`useOverlayMorph` — trigger-anchored scale+fade, animated
  close, `prefers-reduced-motion` + `localStorage lemon_schedule_modal_morph === '0'` opt-out; see
  DESIGN-LANGUAGE §Modal anatomy). New dropdown-like surfaces MUST use it (app shims in
  `src/components/` inject the opt-out key). Don't re-create menu/panel positioning, morphing, or Esc
  handling. **iPad invariants (kit ≥v0.1.64)**: overlays inside modals are finger-scrollable
  (react-remove-scroll cancels touchmoves outside the dialog content; `useOverlayMorph` intercepts
  them at capture) and modals/dropdowns position against the **visual viewport**
  (`visualViewport.height/offsetTop` — the iOS keyboard fires resize there, never on `window`), so
  panels re-clamp and modals re-centre when the keyboard opens/closes. Async search pickers keep the
  input focused — use the shared `DropdownPanel`, NOT the kit menu (its document key-lock eats
  typeahead letters).
- `DropdownMenu`/`DropdownItem`/`DropdownDivider`/`DropdownSubmenu` (Radix click-to-toggle;
  **single-highlight + keys/lock shared with ContextMenu** — one `.ui-item-highlighted` row, the CSS
  `:hover` fill is suppressed while a row is highlighted (kit `tokens.css`), arrows/Enter/typeahead,
  document-level menu key-lock, panel positioning; `ContextMenuSub` = `DropdownSubmenu`),
  `Modal`+`ModalFooter` (draggable; no manual resize — auto-fits content; one `.ui-modal-overlay`
  dim per window — stacked modals zero non-top dims), `ContextMenu`/`ContextMenuItem`/
  `ContextMenuDivider` (fixed-position), `CellInput` (inline text, Enter confirm/Escape cancel;
  **commits on blur only — never per keystroke**), `EntityDropdown` (see below), `PageToolbar`,
  `Button` (ui-kit toolbar button — `subtle`/`primary`/`danger-ghost` variants, `cloud` prop for
  cloud coloring, `theme="dark"`; icon-only nav + status pills stay bespoke), `ColorField`,
  `Tooltip`, `FloatingTooltip`.
- **Modal body rules**: wrap body in `<div className="p-6 space-y-5">`; labeled rows
  `flex items-center justify-between py-1` (label `text-xs text-zinc-300`, annotations
  `text-zinc-500`); segmented toggles `flex border border-zinc-700 rounded p-0.5` (selected
  `bg-white text-zinc-900`). **Footer buttons — one hero, rest ghost**: every modal footer has
  exactly ONE hero button = the primary action (kit `ModalFooterButton`, default `variant` — solid
  `bg-zinc-800`, e.g. "+ New Project"); EVERY other button — Cancel, secondary actions, Import — is
  `variant="ghost"` (e.g. "Import"). Destructive: `variant="danger"` (ghost, `mr-auto`) for Delete,
  `variant="danger-solid"` for red confirms. Never hand-write footer button classes.
- **Dialogs (confirm/prompt/alert) are Modal sub-elements**: `useDialog()` renders through the kit
  Modal's `flat` chrome (no header/footer bars — title row + buttons on the body surface) so they
  inherit the morph, one-dim backdrop, viewport clamp and coarse sizing. **Enter ALWAYS triggers the
  primary action** (document-capture in the kit Dialog — even with focus on the X close button);
  Esc/outside/X = cancel; DNWA checkbox via `suppressKey`. `NewProjectModal` and `TrashModal`
  (File → Trash…, per-kind `ItemCard` sections + Empty) are kit-Modal surfaces — reuse the pattern,
  never hand-roll overlay divs.
- **EntityDropdown**: multi mode = comma-separated value typed in the input; single mode =
  search-then-select. `items` is REQUIRED (no context fallback — pass cast/entity items explicitly).
  As a cell editor ALWAYS separate commit from exit: `onChange` updates the value, `onExit` leaves
  edit mode (never call both in one handler — editor unmounts and can't reopen).
- `TimeField`/`DurationField` (`src/components/`): call-time expression input (absolute/relative,
  touch keypad, live resolved value, reset) + the extracted duration recipe. `GroupedSelect`
  (`production/day/`): grouped single/multi-select dropdown rendered through `DropdownPanel` (flips
  above the trigger when short on space — the kit menu's `bottom`-anchored flip lands off-screen in a
  modal's transformed popper wrapper); `EntityItem.group` also renders headers in `DropdownPanel`.
- **Key patterns**: click-to-toggle menus (never `group-hover`); Lucide icons
  `w-3.5 h-3.5 shrink-0` in menus; dark surfaces `bg-zinc-950/95 backdrop-blur-md border
  border-zinc-800`.

## Hover & Tap Feedback

- **Hover styles are UNGATED by design** (`index.css @custom-variant hover` — no media query; kit
  `tokens.css` header): iOS Safari's native tap-to-hover needs a real `:hover` rule on the tapped
  element — first tap applies `:hover` (sticky highlight/reveal), the click defers to the second tap.
  `(hover: hover)` is false on iPadOS and `(any-hover: hover)` is false when no hovering pointer is
  attached — either gate kills the native behavior on touch. Every hover is still a Tailwind `hover:`
  variant or `.group:hover`/`.group:focus-within`.
- `.hover-reveal`: hidden until hover/tap (`opacity: 0`), revealed by `.group:hover` +
  `.group:focus-within` — on iOS the first tap on the row reveals it, the second tap activates.
- iOS sticky hover (tap → `:hover` sticks until the next tap) IS the tap feedback — no JS
  flash/pulse workarounds; they double with it and read as delays.
- Pen = finger = touch: Apple Pencil is `pointerType 'pen'` (`isTouchLike()` in device.ts). Safari
  doesn't synthesize clicks for pen in overlays (device.ts shim) and never fires `:active` for pen.
