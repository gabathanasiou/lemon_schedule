# UI Kit Note (read before building UI)

**New shared package: `@gabriel/ui-kit`** — the interaction primitives (dropdowns,
menus, dialogs, touch/device handling) extracted from THIS app.

## Rule of thumb

Before building any of these by hand again, check the kit first:

- Dropdown menus, submenus, item lists → `DropdownMenu / DropdownItem / DropdownSubmenu`
- Right-click / long-press menus → `ContextMenu` + `LongPressMenuProvider` (add `data-context-menu` to a target)
- confirm/prompt/alert dialogs → `DialogProvider` + `useDialog()` (renders through the kit Modal's `flat` chrome — dialogs inherit the morph/dim/coarse sizing; `Modal` accepts a `flat` prop for dialog-style chrome without header/footer bars) — render **through the kit Modal** (`flat` chrome, v0.1.60): morph, one-dim backdrop, coarse sizing, Enter always = primary action
- Touch/pointer detection, touch-first variants → `device.ts` + `useTouchMode()`
- Popups above the keyboard → `useSmartPosition / useFixedPosition`

**v0.1.64 (iPad touch + keyboard)**: `useOverlayMorph` gained the touchmove twin of the v0.1.52 wheel interceptor — overlays inside modals are finger-scrollable on iPad (react-remove-scroll used to cancel every touchmove outside the dialog content). `useSmartPosition`/`useFixedPosition` and the `Modal` position against the **visual viewport** (`window.visualViewport.height`/`offsetTop`) and re-measure on its resize/scroll — the iOS keyboard lives there (it fires resize on `visualViewport`, never `window`), so modals centre into the visible area and dropdown panels stay above the keyboard. The `Modal` also pins a stacked modal's survivor back to full opacity after the `:has` stack-fade window (iOS Safari can leave it stuck invisible after a child unmounts).

**v0.1.65 (touch dismissal parity)**: `DropdownMenu` gained a document-**capture** `pointerdown` listener (popout-aware) that dismisses a **touch** pointerdown outside the menu content/trigger/open-submenus — matching the app `DropdownPanel` model (roadmap 78). Why: the app's Radix (`react-dismissable-layer` 1.1.12) defers TOUCH outside-dismissal to the `click` event, so a **modal drag** (pointerdown + move + up, no click) left the menu open on iPad; mouse/pen already dismissed immediately. Gated on `pointerType === 'touch'` so it never double-dismisses with Radix's own mouse/pen handling. **The real fix (roadmap 71)**: the app bumped `@radix-ui/react-dialog` → 1.1.23 + `@radix-ui/react-dropdown-menu` → 2.1.24 TOGETHER (single `react-dismissable-layer` 1.1.19, touch dismisses on pointerdown — no deferral), which also fixed the stacked-modal "Cancel freezes the day modal" bug. Never bump one without the other — a partial bump forks the shared dismissable-layer and breaks menu-inside-modal stacking (the app's `package-lock` must stay on ≥1.1.23/2.1.24; see AGENTS.md "Radix pins").

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
