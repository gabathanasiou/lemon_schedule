# UI Kit Note (read before building UI)

**New shared package: `@gabriel/ui-kit`** — the interaction primitives (dropdowns,
menus, dialogs, touch/device handling) extracted from THIS app.

## Rule of thumb

Before building any of these by hand again, check the kit first:

- Dropdown menus, submenus, item lists → `DropdownMenu / DropdownItem / DropdownSubmenu`
- Right-click / long-press menus → `ContextMenu` + `LongPressMenuProvider` (add `data-context-menu` to a target)
- confirm/prompt/alert dialogs → `DialogProvider` + `useDialog()` (renders through the kit Modal's `flat` chrome — dialogs inherit the morph/dim/coarse sizing; `Modal` accepts a `flat` prop for dialog-style chrome without header/footer bars) — render **through the kit Modal** (`flat` chrome, v0.1.60): morph, one-dim backdrop, coarse sizing, Enter always = primary action
- Touch/pointer detection, touch-first variants → `device.ts` + `useTouchMode()`
- Popups above the keyboard / menu positioning → `useDropdownPosition` (below)

**v0.1.64 (iPad touch + keyboard)**: `useOverlayMorph` gained the touchmove twin of the v0.1.52 wheel interceptor — overlays inside modals are finger-scrollable on iPad (react-remove-scroll used to cancel every touchmove outside the dialog content). The positioner and the `Modal` use the **visual viewport** (`window.visualViewport.height`/`offsetTop`) and re-measure on its resize/scroll — the iOS keyboard lives there (it fires resize on `visualViewport`, never `window`), so modals centre into the visible area and dropdown panels stay above the keyboard. The `Modal` also pins a stacked modal's survivor back to full opacity after the `:has` stack-fade window (iOS Safari can leave it stuck invisible after a child unmounts).

**v0.1.65 (touch dismissal parity)**: `DropdownMenu` gained a document-**capture** `pointerdown` listener (popout-aware) that dismisses a **touch** pointerdown outside the menu content/trigger/open-submenus — matching the app `DropdownPanel` model (roadmap 78). Why: the app's Radix (`react-dismissable-layer` 1.1.12) defers TOUCH outside-dismissal to the `click` event, so a **modal drag** (pointerdown + move + up, no click) left the menu open on iPad; mouse/pen already dismissed immediately. Gated on `pointerType === 'touch'` so it never double-dismisses with Radix's own mouse/pen handling. **The real fix (roadmap 71)**: the app bumped `@radix-ui/react-dialog` → 1.1.23 + `@radix-ui/react-dropdown-menu` → 2.1.24 TOGETHER (single `react-dismissable-layer` 1.1.19, touch dismisses on pointerdown — no deferral), which also fixed the stacked-modal "Cancel freezes the day modal" bug. Never bump one without the other — a partial bump forks the shared dismissable-layer and breaks menu-inside-modal stacking (the app's `package-lock` must stay on ≥1.1.23/2.1.24; see AGENTS.md "Radix pins").

**v0.1.81 (ContextMenu theme)**: `ContextMenu` gained a `theme?: DropdownTheme` prop (default `'light'`) — it now sets `DropdownThemeContext` + `data-theme` from it, mirroring `DropdownMenu`. Pass `theme="dark"` when the menu opens over dark chrome (the ribbon designer cell menu); light-anchored menus (tabs / Glide / PageToolbar) keep the default.

**v0.1.82 (menu scroll breathing room)**: menu items carry `scroll-margin-block: 16px` (`.ui-item` in `ui-kit.css` + `scroll-my-4` on `ItemManagerDropdown` rows) so the open-scroll-to-highlighted/selected/active row (`scrollIntoView({block:'nearest'})`) leaves a gap at the panel edge instead of pinning the row flush — the surrounding rows stay visible. The app's `DropdownPanel` items mirror it with `scroll-my-4`.

**v0.1.83 (one positioning engine — roadmap 165)**: `useSmartPosition`/`useFixedPosition` are replaced by `useDropdownPosition` (floating-ui `flip`/`shift`/`size` against the visual viewport; fixed strategy; top/left only — never CSS `bottom`; natural content height drives the flip, `bestFit` when neither side fits; re-measures on scroll/resize/visualViewport/ResizeObserver). `DropdownMenu` gained `maxMenuHeight` (px ceiling, default 384) and no longer self-caps; the app re-exports the hook at `src/lib/useDropdownPosition.ts` and every panel (DropdownPanel/EntityDropdown/SelectDropdown/AutocompleteDropdown/GroupedSelect/AsyncResultsDropdown) uses it, portaled to the current document body. **MUST NOT add a second positioner or an `!important` height cap on a panel** (an `!important` cap beats the engine's inline clamp). Playground: `playground/specs/dropdown-flip.spec.ts`; app: `e2e/dropdown-positioning.spec.ts`.

**v0.1.84 (Seg stretch)**: `Seg` gained `stretch?: boolean` — `w-full` container + `flex-1` segments (labels stay centered). Used where the control should fill a column rather than hug its content (the Reports Designer docked inspector). Content-width remains the default everywhere else.

**v0.1.85 (hover never scrolls menus)**: pointer-driven highlights no longer run `scrollIntoView` — hovering a clipped edge row used to move the list under the cursor while aiming at it. Keyboard arrows/typeahead (and open-scroll-to-active) still keep the active row visible. Covers `DropdownMenu`, `DropdownSubmenu` and the rich-text suggestion popup; the app's `EntityDropdown` mirrors it (roadmap 187).

**v0.1.87 (contextual font family/size + clear formatting)**: `RichTextState` gained the run's `fontFamily`/`fontSize` (the `textStyle` mark attrs at the caret) and `exec()` gained `fontFamily`/`unsetFontFamily`/`fontSize`/`unsetFontSize` + `clearFormatting` (unsets every inline mark and normalizes the block). `FormatToolbar` gained optional `font` (`{ value, onChange }` — a consumer-owned contextual family picker) and `showClearFormatting`. Run overrides persist as sanitized `<span style="font-family/font-size">` (the storage sanitizer already whitelists both).

**v0.1.88 (selection Mixed + focus intent)**: `RichTextState.hasSelection` — a ranged selection means "style the RUN", a collapsed caret means "style the consumer's object default"; `fontFamilyMixed`/`fontSizeMixed` report a range spanning different run values, and `FontMenu`/the size input render "Mixed" (italic, no check) instead of a misleading first-mark value.

**v0.1.89 (consumer size slot + non-focusing exec)**: `FormatToolbar.fontSizeSlot` replaces the kit's size input — the consumer passes its own (the app uses `LiveNumberInput`, the ribbon number recipe). `exec(cmd, val, { focus: false })` applies the command WITHOUT stealing focus, so a live-committing input can patch a run while it keeps the selection and its own focus. `FontMenu`'s trigger restyled to the app-picker (`TB_PICKER`) look.

**v0.1.90 (linked named-style runs + held selection)**: a `reportTextStyle` TipTap mark (`attr styleId`, priority 102 so direct formatting nests inside and wins) with `exec('textStyle', id)` (also clears direct font family/size on the range) / `exec('unsetTextStyle')`, `RichTextState.textStyle` + `textStyleMixed`; the sanitizer keeps `data-text-style` on spans (the consumer resolves the id at render time — editing the style updates every run). `RichTextEditorHandle.holdSelectionHighlight(on)` paints a ghost highlight (`.rt-retained-selection`, OS `Highlight` colors) over the current range while a consumer control (font-size box, style picker) holds focus.

**v0.1.91 (one prosemirror-view)**: `@tiptap/pm/view` added to the kit build's externals — bundling it gave the editor a SECOND prosemirror-view copy, so the new plugin `DecorationSet` failed `instanceof` and the editor crashed at mount (`DecorationGroup` member undefined). Never bundle a `@tiptap/pm` subpath the consumer's editor also uses.

**v0.1.92 (suggestion popup follows the caret)**: the TipTap suggestion mount positions once on open; the decoration rect widens with each keystroke but autoUpdate can't observe the virtual reference, so the `@` autocomplete trailed the caret by the last keystrokes. The token popup re-mounts per update (old autoUpdate/dismiss listeners cleaned first), re-running computePosition against the current decoration.

**v0.1.93 (focus position)**: `RichTextEditorHandle.focus(position?: 'start' | 'end')` — wraps TipTap's focus-command position so consumers entering edit mode land the caret at the textblock edge. Needed because a plain DOM range after programmatic focus is clobbered by the editor's own selection sync (the Reports Designer's inline text blocks focus with `focus('end')`).

**v0.1.94 (Seg per-option title)**: `Seg` options accept `title?: string` — the button gets the native tooltip while its label stays the accessible name (the Reports Designer's Fields/Values toggle explains each mode on hover).

**v0.1.95 (Seg dense)**: `Seg` gained `dense?: boolean` — 24px control height on fine pointers so the toggle rides a plain toolbar row next to `text-xs`/`py-1` buttons (the Reports Designer header); ignored on coarse pointers, which keep the editor-chrome touch size.

**v0.1.96 (wrapping editor chrome)**: `FormatToolbar` wraps its control clusters (`flex-wrap`; marks · link · color · font/size · trailing stay whole — a line break only lands between clusters) and `ChromeHeader` wraps its leading/trailing instead of forcing `min-w-max`. The Reports Designer's docked inspector no longer clips or scrolls horizontally; the floating chrome is unchanged at natural widths. The app keeps cluster dividers on every surface.

**v0.1.97 (FormatToolbar dividers opt-out)**: `FormatToolbar` gained `dividers?: boolean` (default true) — `false` renders gap-only clusters for a wrapping surface (no divider can strand at a wrapped line end). Shipped for the inspector experiment; the app currently uses the default (dividers on).

**v0.1.98 (header actions wrap + group)**: `ChromeHeader`'s trailing cluster now wraps internally (`flex-wrap`, right-aligned) so a narrow rail lays the actions out in two rows instead of clipping, and `StructureControls` renders as ONE unbreakable cluster (move pair + duplicate/delete stay together). The Reports Designer's rail header actions (surface switch + collapse) ride inside this trailing slot.

**v0.1.99 (NumberInput — the shared numeric box, roadmap 202)**: the number recipe promoted to the kit: `NumberInput` = free-typed draft + live clamp + Enter/blur finalize + Escape revert (the old `LiveNumberInput` contract — the app module is now a 1-line shim, call sites untouched), PLUS stacked chevron steppers (±`step`, disabled at the bounds; pointerdown prevented so they never steal the draft's focus mid-typing), ArrowUp/ArrowDown stepping, and mouse drag-to-scrub (Premiere/Resolve — drag up = increase, 2px per step, commits live, focus dropped; touch/pen keep scrolling). Default look = the bordered `.ui-number-box` (border-only at rest → hover fill → muted focus border, the `.ui-input`/Checkbox language) with an explicit `theme="dark|light|blue"`; a consumer `className` keeps owning the input's look (bare wrapper — chevrons mirror the input's computed text color). Native number spinners are hidden (the chevrons replace them). Pure math in `numberInputMath.ts` (Vitest); playground `number-input.spec.ts` covers steppers/bounds/draft/Escape + the drag wiring.

**v0.1.100-104 (Seg track + sliding pill, icon-only Button, FloatingToggle, Checklist trailing — roadmap 216)**: the segmented-control/toggle pass.
- `Seg variant="track"` (v0.1.100): the padded-track segmented control — `p-0.5` border container + one **sliding pill** behind the segments (`transform`/`width` transition ~200ms; measured active segment, re-measured on container resize; skipped under `prefers-reduced-motion`; pill `aria-hidden`, focus/keys untouched). `theme="light|dark"` (light = dark active pill on a `border-zinc-200` track; dark = raised `bg-zinc-800` pill on a `border-zinc-700`/`bg-zinc-950` track — the modal chip recipe), `stretch` fills the row, per-option `icon` + explicit per-option `ariaLabel` (v0.1.101, icon-only segments whose spoken name differs from the tooltip), `tablist` gives role=tablist/tab semantics, default stays a button group with `aria-pressed`. The `chrome` variant (Reports Designer) is unchanged.
- `Button iconOnly` (v0.1.100): square icon-only toolbar shape (28px / 40 coarse), contents centered — the icon-only recipe.
- `FloatingToggle` (v0.1.100): the round 48px pinned device-mode toggle (idle white / lit blue / `warn` amber frames), position via `style`.
- `Checklist checkPosition="trailing"` (v0.1.100): the check box on the right (row lists); `ChecklistItem.dataProps` for `data-*` hooks; rows now expose `aria-pressed`.
- **v0.1.103**: `dense` applies to `track` too — 26px on fine pointers (the Reports Designer header rides its toolbar row).
- **v0.1.105**: fixed track segment heights on fine pointers — text and icon segments agree (toolbar-dense container 26px, comfortable/modal container 36px); coarse keeps the padding-driven touch size.
- **v0.1.104**: the **`chrome` variant animates too** — the blue `bg-blue-900/50` highlight glides between the joined cells (the container carries `bg-zinc-800`, cells are transparent, dividers untouched). Every `Seg` now animates.
- Playground `seg.spec.ts` (pill position, palettes, tablist, FloatingToggle, Checklist trailing); suite caps raised 13/73 → 14/78 with the ledger note.

**v0.1.108 (emerald project-chrome theme — roadmap 248)**: the kit's second colored chrome, for shared (collaborative) projects — Drive stays blue. `DropdownTheme` gained `'emerald'` (tokens.css `[data-theme="emerald"]` = the blue block with emerald-tinted menu/panel fills and the emerald-500 checkbox accent; `DropdownMenu`/`ContextMenu`/`Checkbox`/`Checklist`/`NumberInput`/`RadioList` inherit it); kit `Button`'s `cloud` prop accepts `'emerald'` (`true` stays blue) tinting the `tab`/`tab-header`/light-`primary` palettes; `Seg`'s `track` variant themes gained `'blue'` + `'emerald'` (tinted border, `bg-{blue,emerald}-950` pill, `text-{blue,emerald}-50` active, tinted idle/hover). The app maps a project through ONE `useProjectTheme()` → `projectAccentOf` / `projectMenuThemeOf` / `projectSegThemeOf` (`src/lib/projectTheme.ts`).

**v0.1.109-112 (icon-first tab face + shared sliding pill — roadmap 258)**: the tab-dock pass.
- `Button` gained `icon` + `collapse` + `iconWithLabel` (v0.1.109): tab variants can rest as icon-only pills whose label animates back over hover / `focus-visible` / `active` / an open dropdown (the label rides a `grid-template-columns` 0fr↔1fr column; ~150ms in / 200ms out, skipped under `prefers-reduced-motion`). **The label stays in the DOM while collapsed** — the accessible name (role/name queries, screen readers) never disappears. `iconWithLabel={false}` swaps the pair (the label replaces the icon; a labeled non-collapsing tab drops its icon entirely). `tab-header`'s active fill moved to the row's pill — the variant carries only the dark text, so the selection can glide.
- `TabFace` (v0.1.110): that face extracted as a shared component — `Seg` options (or any custom tab shell) can adopt the same mechanics; the shell owns the `group` class + `gap: 0` while collapsing.
- `useSlidingPill` (v0.1.109): the measured-highlight mechanism extracted from `Seg` and exported — glides `transform`/`width` ~200ms between measured items (relative container + the active item's `offsetLeft`/`offsetWidth`) and **chases the live geometry while the container reflows** (label animations, dock shifts) so it never lags; reduced motion jumps instantly. `Seg` now rides it.
- `ButtonProps.ref` (v0.1.111): React 19 ref-as-prop typed (the ref lands on the underlying `<button>`; tab rows measure their own buttons for the pill).
- Playground: header-tabs demo + `header-tabs.spec.ts`; suite caps raised 14/78 → 15/82 (ledger note in `scripts/check-test-hygiene.mjs`). App wiring: `docs/UI-PRIMITIVES.md` §Tabs & Toolbars.
- **v0.1.112**: `useSlidingPill` observes the ITEMS too — a row that clamps to its scroller (`w-fit` inside `overflow-x-auto`) never resizes its container while a label animates, so the pill's target went stale and it settled off the active tab. `TAB_PILL` (exported fill table: `light/dark` × `plain/blue/emerald`) is the mini-tab row's moving fill; the `tab` variant's active classes are text-only now (same move as `tab-header`).

**v0.1.115-116 (two-axis theming: mode × accent + theme lab; grouped menus — roadmap 302)**: theming is now a pair, not a theme list.
- **`[data-mode]` (light/dark) × `[data-accent]` (zinc/blue/emerald)** in `tokens.css`. Mode owns the neutral ladder; accent owns the chrome tint + interaction accent. `--ui-chrome-bg` is derived with `color-mix(in oklab, var(--ui-chrome-accent) var(--ui-chrome-tint), var(--ui-modal-header-base))`, so a new project colour is ONE token block. `[data-theme]` presets remain for legacy menus/dialogs, and `[data-mode="dark"]` resets inside a light scope.
- **`ThemeScope`** (`mode`, `accent`) + `useKitTheme` / `menuThemeOf` / `segThemeOf` / `buttonCloudOf`: ambient scope for token-driven primitives; explicit props still win. No scope = the historical defaults (light toolbars, dark modals, dark menus).
- **`Modal`** gained `theme`, `accent`, `surface="neutral | accent"` and a fully tokenised shell (header/body/footer/close/reset + `color-scheme`). `surface="neutral"` (every normal app modal) keeps the light/dark shell and **suppresses the accent inside** — selection, checks, Seg and date chips are neutral. `surface="accent"` is the opt-in project ladder: `accent-950` header (the app-header colour) with white title, NEUTRAL body, `accent-100` wells/footer; card + calendar headers wear `accent-900`, the calendar body and checklists stay neutral. A nested accent-only `ThemeProvider`/`ThemeScope` is a manual Lego override. `ModalFooterButton` hero/ghost/danger read tokens, and `tone="accent"` follows the project accent.
- **Chrome vs surface menus (v0.1.116)**: a menu opened from a coloured **chrome** context is fully themed (deep blue/emerald panel); one opened **inside a modal/panel** stays light/dark — accent states only on an accent surface or a manual override; a neutral surface is fully neutral. Explicit `theme="…"` still forces a preset. Portaled menus carry `data-mode`/`data-accent` themselves.
- **Accent scale + neutral outlines**: `--ui-accent-50…950`; selection/hover/checked/button hovers/active derive from the accent; `zinc` = neutral selection (kit default, no blue). Outlines always use neutral `--ui-border`/`--ui-border-strong` — colour is fills/bands only. `Seg` track border + labels are neutral (accent pill only); `DatePicker` body is neutral (accent header/footer); `CardSection` has an accent header + count chip; text/hover contrast is tuned per mode.
- **Ambient defaults**: `Button` (mode + `cloud` accent), `Seg` (track preset), `DatePicker` (mode + accent-selected days), `DropdownMenu` (preset). `Tooltip`/`CardSection`/inputs tokenised (tooltips carry the scope on their portal root). RichTextEditor/FormatToolbar/`TB_*` remain dark-only (follow-up).
- **Playground — Theme lab** (top section): mode/accent/header-band controls, live preview and a fully themed dummy modal (buttons, menu, Seg, date picker, number input, checklist, radio list, card section, tooltip, footer, a blue Lego override). `modal-portal.spec.ts` covers neutral-surface suppression + the override; `searchable-dropdown.spec.ts` covers grouped searchable + plain menus (category headers, search-by-category). Suite caps 15/82 → 15/85.
- **App**: `projectModalThemeOf` (`src/lib/projectTheme.ts`) keeps every project kind on a NEUTRAL modal surface — Drive/shared keep blue/emerald chrome only; local is zinc. Consumed by the `Modal` shim; per-modal overrides can still pass `surface="accent"` or a local accent. Grouped `DropdownMenu` (`DropdownItem group=…`) is available for the locations picker. `docs/THEMING.md` in the kit is the model + migration checklist.

**v0.1.117-120 (SearchMenu + MorphSearchField — roadmaps 172/318)**: the record-search primitive moved into the kit.
- **`SearchMenu` (v0.1.119)** — ONE catalogue-search surface, `inline` (always-visible manager field) or `expandable` (primary `triggerLabel` button that MORPHS into the field: cross-fade + animated width, collapses on select/Esc/outside click). Items × groups: category rows with icon + count, `expandableGroups` + `groupExpandMode` (tree/accordion, ← → keyboard), comma tags AND-matching label/detail/category/`fields`/`keywords`, `emptyActions` (no-match state only), `renderEmpty`, panel width/height/theme props. **`browseExpanded` (v0.1.122)** renders every group's records under a plain, non-clickable header — short catalogues in one glance; accordion remains for long lists. **`triggerIcon` (v0.1.123)** puts the domain icon on the expandable button (MapPin/UserPlus/Plus) while the field keeps the magnifier. Single-select, synchronous, no inline create/rename (by design). Full app reference: `UI-PRIMITIVES.md` §SearchMenu.
- **`MorphSearchField` (v0.1.120, NOT in this app's pinned 0.1.119)** — the FILTER counterpart: a toolbar button that morphs into a text field, keeps its term when collapsing, Esc clears + collapses. Use it for Glide/toolbar row filtering once the dependency is bumped — it is not a record picker (no results panel).
- Exported model helpers `parseSearchTags` / `matchSearchItem` / `searchMenuContent` / `buildSearchMenuRows` — reuse them for any jump/highlight bookkeeping; never a second matcher.

## Location & install

- Repo: `github.com/gabathanasiou/ui-kit` (private, git dependency)
- Install: `npm install github:gabathanasiou/ui-kit#v0.1.34` (bump the `#v0.x.y` ref when you update it)
- Setup: import `@gabriel/ui-kit/ui-kit.css` + `@source` the package in Tailwind + the `@custom-variant hover` gate — full steps in the kit's README.

## Making changes / improvements

The kit is the single source of truth. If you improve a component there:

1. Edit in `~/Documents/Software Apps/ui-kit`
2. `npm run build` (runs vite + strict `tsc` typecheck — catches what this repo's vite-only build misses)
3. Bump `version` in package.json → commit → `git tag v0.1.1 && git push --tags`
4. Update the pinned ref in whichever app needs it, then `npm install`

**About this app:** lemon_schedule is being migrated incrementally (roadmap
item 56, `docs/ROADMAP.md`). So far the kit's `Button` (all tab toolbars) and
`DropdownItem`/`DropdownMenu` pieces are in use; remaining in-app copies stay
until swapped. Each migration step must pass the Playwright suite. Until a
component is migrated, if you fix a bug in the in-app copy, consider porting
the fix to the kit so it doesn't resurface.

**Design language:** every kit change that alters visuals or APIs must be
reflected in `docs/DESIGN-LANGUAGE.md` (the canonical booklet — class recipes +
primitive matrix) in the same change, per its "Keeping this doc current" section.

## Theming

Kit components are 100% themeable via `--ui-*` CSS variables
(`[data-theme]` = dark/light/blue; defaults match lemon's zinc look exactly).
Override the vars to re-skin without touching component code.
