# UI Kit Note (read before building UI)

**New shared package: `@gabriel/ui-kit`** — the interaction primitives (dropdowns,
menus, dialogs, touch/device handling) extracted from THIS app.

## Rule of thumb

Before building any of these by hand again, check the kit first:

- Dropdown menus, submenus, item lists → `DropdownMenu / DropdownItem / DropdownSubmenu`
- Right-click / long-press menus → `ContextMenu` + `LongPressMenuProvider` (add `data-context-menu` to a target)
- confirm/prompt/alert dialogs → `DialogProvider` + `useDialog()`
- Touch/pointer detection, touch-first variants → `device.ts` + `useTouchMode()`
- Popups above the keyboard → `useSmartPosition / useFixedPosition`

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
