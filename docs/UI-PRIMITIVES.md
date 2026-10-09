# UI Primitives, Toolbars & Touch — Agent Manual

Status: **read this before building or changing app chrome** (toolbars, tabs, modals, menus,
dropdowns, hover/tap). `docs/DESIGN-LANGUAGE.md` is the canonical design booklet (exact class
recipes, primitive matrix, anti-patterns) — this file is the working summary + gotchas that agents
hit. When they disagree, DESIGN-LANGUAGE wins; update both in the same commit as the code.

## Tabs & Toolbars

- Top tabs (App header): breakdown, schedule, calendar, design, rules, production, reports.
  Shift+click / right-click = pop-out (desktop only, `!IS_COARSE`).
- `PageToolbar` (`src/components/PageToolbar.tsx`): reusable toolbar with optional sub-tabs. Active
  tab `bg-zinc-950 text-white rounded px-3 py-1.5` (cloud: `bg-blue-950 text-blue-50`); inactive
  `text-zinc-500 hover:text-zinc-900`. Scrolls horizontally with edge fades. Usage: Breakdown
  (light; Sheet/Element Manager/Glide Breakdown), Design (dark; Ribbon Designer/Colors), Reports
  (dark; DOODs/Element Breakdown), Schedule (light, justify end, no tabs), Calendar (two light
  instances).
- **Header portal pattern**: parent puts `<div ref>` in `rightContent`; child accepts `headerTarget`
  and `createPortal`s its controls there (fallback: inline). Used by ElementManager, SceneSheet,
  GlideBreakdownTab, ColorsTab, RibbonTab, DayManagerPage/CallSheetEditPage.
- **Sub-tab pop-outs mount the CONTENT, never the tab shell** (`App.tsx` SUB-TAB POPOUT WINDOWS):
  each popped sub-tab renders its content component (SceneSheet, ElementManager, DoodTab,
  CrewManager/CrewGlideTab per `prodViews`) in a `SubTabPopoutFrame`; the main window shows
  `PopoutPlaceholder`. Mounting the host tab component in its own pop-out re-triggers the
  placeholder (its own id is in `poppedOutSubTabs`) and doubles the toolbar. Production → Days
  pop-outs use the day-popout recipe (plain `PopoutWindow` + `DayManagerPage` local header).
- **Merged-view switcher** (roadmap 177): sub-tabs that are two views of one surface (Crew
  manager/Glide, Locations manager/Glide, Days Day Manager/Call Sheet) collapse to ONE sub-tab plus
  a 2-segment icon control **pinned rightmost** in the `PageToolbar` — after the portaled controls,
  so it never moves when the view changes. It is theme-aware (dark while the Call Sheet editor is
  open); the view mode travels in the history place (roadmap 176). Recipe:
  `docs/DESIGN-LANGUAGE.md` §Buttons + §Toolbar composition.
- **Toolbar composition rule** (`docs/DESIGN-LANGUAGE.md` §Toolbar composition): order controls by
  scope with shared controls in a fixed right slot, and divide groups with the shared
  `ToolbarDivider` (`src/components/ToolbarDivider.tsx`; light `bg-zinc-200` / dark `bg-zinc-700`)
  — never hand-write divider strings.
- **Scene sheet view order** (`SceneSheet.tsx`): view-only pref `lemon_schedule_breakdown_order`
  (`sheet | sceneNumber | stripboard`, `usePersistState` — the object form `{order}`). A sorted COPY
  drives rendering/navigation — `project.scenes` is never reordered; the Sheet # column always shows
  the TRUE sheet number (array index + 1). `naturalSortSceneStrings`; stripboard order = active
  version's SCENE rows, boneyard scenes appended. `initialIndex` echo-guarded
  (`lastReportedIndexRef`) so the App→prop feedback doesn't yoyo the position in non-sheet orders.
- **Cloud coloring**: cloud projects switch light PageToolbars to `bg-blue-950` (active
  tabs/buttons); derive via `useIsCloudProject()`. Dark toolbars unaffected.

## App Navigation (roadmap 176)

- Tabs + sub-tabs are **places** with hash routes (`#/production/days`); every navigation pushes a
  browser-history entry, so browser back/forward (keys, iPad swipe) and browser forward undo app
  navigation. There is **no in-app back button** right now (user decision — browser buttons are the
  affordance).
- **Production → Days has a sub-sub level** (like a sub-sub tab): `#/production/days` = Day Manager,
  `#/production/days/callsheet` = Call Sheet editor. All three merged-view modes live in `prodViews`
  (`usePersistState` key `lemon_schedule_prod_views` in `App.tsx`), passed to `ProductionTab`;
  `DayManagerPage` receives `dayMode`/`onDayModeChange`. Memory persists across tab switches and app
  restarts (a fresh open resumes the last-used view); the editor's Back button returns to the
  manager without stacking duplicate entries.
- **One entry point**: `go(place)` in `App.tsx` (dedupe → `pushState`/`replaceState` → applies
  tab/sub/target state). Never call `setActiveTab`/sub-tab setters directly for user navigation —
  route through `go` (in-tab selections like a selected day/scene are NOT places). One-shot jump
  targets (scene/day/sheet) travel in the history state, not the hash.
- Pure model: `src/lib/appNav.ts` (`AppPlace`, `placeToHash`/`parsePlaceHash`, `placeLabel`, stack
  helpers, unit-tested). The stack rides in `history.state` (`{ lemon, pid }`) so reload-restore
  works; the route is adopted on project open and left untouched on the boot screen.
- The element manager's unsaved guard (`requestUnsavedSave`) runs for browser back too (cancel =
  discard, same contract as a tab click); pop-out windows never push main-window history.

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
  them at capture). Async search pickers keep the
  input focused — use the shared `DropdownPanel`, NOT the kit menu (its document key-lock eats
  typeahead letters).
- **One positioning engine (roadmap 165, kit v0.1.83)**: EVERY floating menu/panel (kit
  `DropdownMenu`, `DropdownPanel`, EntityDropdown/SelectDropdown/AutocompleteDropdown, GroupedSelect,
  the Glide editors) positions through kit `useDropdownPosition`
  (`ui-kit/src/useDropdownPosition.ts`, re-exported at `src/lib/useDropdownPosition.ts` — the ONE
  source of truth). Fixed + portaled to the current document body; decisions use the **visual
  viewport** (the iOS keyboard resizes/pans it and fires events there, never on `window`; position is
  top/left only — CSS `bottom` is layout-viewport-relative and lands under the keyboard); it measures
  the panel's real content height, flips above when there's no room below (`bestFit` when neither
  side fits) and clamps the height to the chosen side. Re-measures on scroll/resize/visualViewport/
  ResizeObserver. **MUST NOT hand-position a panel, add a second positioner, or cap a panel's height
  with an `!important` class** (that defeated the clamp — menus hung off-screen). Per-menu ceiling =
  the kit `maxMenuHeight` prop (e.g. 256 for the category menus).
- **Keyboard dismissal (touch)**: `useKeyboardDismissOnScroll` (`src/lib/`) mirrors native
  `UIScrollView.keyboardDismissMode = .onDrag` — a finger drag on a surface the focused field does
  NOT live in dismisses the keyboard (dragging within the field's own scroller keeps it). An
  editor-attached floating panel (`.click-outside-ignore` — the EntityDropdown/Autocomplete/ref list
  the field opened, portaled to `<body>`) counts as the field's own surface: scrolling the
  suggestion list must NOT blur (blur = commit + close, roadmap 206).
- `DropdownMenu`/`DropdownItem`/`DropdownDivider`/`DropdownSubmenu` (Radix click-to-toggle;
  **single-highlight + keys/lock shared with ContextMenu** — one `.ui-item-highlighted` row, the CSS
  `:hover` fill is suppressed while a row is highlighted (kit `tokens.css`), arrows/Enter/typeahead,
  document-level menu key-lock, panel positioning; `ContextMenuSub` = `DropdownSubmenu`),
  `Modal`+`ModalFooter` (draggable; no manual resize — auto-fits content; one `.ui-modal-overlay`
  dim per window — stacked modals zero non-top dims), `ContextMenu`/`ContextMenuItem`/
  `ContextMenuDivider` (fixed-position), `CellInput` (inline text, Enter confirm/Escape cancel;
  **commits on blur only — never per keystroke**), `EntityDropdown` (see below), `PageToolbar`,
  `Button` (ui-kit toolbar button — `subtle`/`primary`/`danger-ghost` variants, `cloud` prop for
  cloud coloring, `theme="dark"`, `iconOnly` for the square icon-only shape; status pills stay
  bespoke), `Seg` (`variant="track"` — padded-track segmented control with the sliding pill,
  `theme="light|dark"`, `stretch`, per-option `icon`/`ariaLabel`, `tablist`; `variant="chrome"`
  stays the Reports Designer look), `FloatingToggle` (the round pinned device toggle),
  `ColorField`, `Tooltip`, `FloatingTooltip`.
- **Modal body rules**: wrap body in `<div className="p-6 space-y-5">`; labeled rows
  `flex items-center justify-between py-1` (label `text-xs text-zinc-300`, annotations
  `text-zinc-500`); segmented toggles = kit `Seg variant="track" theme="dark"` (the hand-rolled
  `p-0.5` recipe is retired). **Footer buttons — one hero, rest ghost**: every modal footer has
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
  (`production/day/`): grouped single/multi-select dropdown rendered through `DropdownPanel` (the one
  positioning engine handles flip/clamp); `EntityItem.group` also renders headers in `DropdownPanel`.
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
