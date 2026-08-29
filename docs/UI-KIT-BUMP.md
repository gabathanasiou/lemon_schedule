# Handover — ui-kit v0.1.55 release + app integration

Written for the next agent session (the previous session was compacted after a
long ui-kit working session). The kit work is **fully committed** in
`~/Documents/Software Apps/ui-kit` (working tree clean, `tsc` green, 33/34
playground specs green — one known flaky spec, below).

## 1. Kit release (do FIRST)

In `~/Documents/Software Apps/ui-kit`:

1. `npm run build` (vite es/cjs + tsc types + css copy — dist is committed).
2. Bump `version` in `package.json` to `0.1.55`.
3. Commit (`chore: bump 0.1.55`), tag `v0.1.55`, `git push --tags origin main`
   (remote: `github.com/gabathanasiou/ui-kit`).

## 2. App integration (lemon_schedule)

1. `package.json`: `"@gabriel/ui-kit": "github:gabathanasiou/ui-kit#v0.1.55"`.
2. `npm install`; if the dev server throws `SyntaxError: Indirectly exported
   binding name ... not found` → `rm -rf node_modules/.vite-*` and restart
   (the kit ships a committed dist; the blocked `prepare` script is fine).
3. `npm run lint` + `npx playwright test` (full suite; the app has ~98
   `ContextMenuItem` call sites + menus + DatePicker users — all APIs are
   unchanged/compatible).

## 3. Roadmap + docs updates (same commit as the bump)

- `docs/ROADMAP.md`:
  - **item 59** (modal backdrop dim) → `[x]` Done — implemented in the kit:
    `.ui-modal-overlay` CSS (`src/styles/tokens.css`), one dim layer per
    window, fades 220ms with the close morph, instant stacked swaps.
  - **item 64** (kit DropdownMenu → EntityDropdown-panel behavior) → `[x]`
    Done — single-highlight context, panel positioning, keyboard/typeahead,
    wheel, `initialHighlightIndex`, CategoryDropdown uses it. NOTE: the
    original item text says to DELETE the trigger-reopen (v0.1.54) — instead
    the reopen was KEPT and FIXED (the dismiss-click interleave bug is gone);
    update the item's revert note accordingly.
  - Refresh `docs/ROADMAP-ARCHIVE.md` (index rows for 59 + 64).
- `docs/DESIGN-LANGUAGE.md`: dropdown anatomy — the single-highlight rule now
  covers kit menus AND context menus (`.ui-item-highlighted`, no CSS hover
  fills, Radix `data-highlighted` inert); the primitive matrix row; Modal
  anatomy — the backdrop dim (one layer, `ui-modal-overlay`), remove the
  "transparent — no background dimming" wording; note the menu key-lock
  (mini-modal) + ArrowLeft/Right submenu nav.
- `AGENTS.md` UI-primitives bullet: `DropdownMenu`/`ContextMenu` now share
  the highlight/keys/lock system; `ContextMenuSub` = `DropdownSubmenu`.
- `docs/UI-KIT.md`: note the clone-panel pattern (the app DropdownPanel
  close = cloneOnUnmount; the kit menus close on the live node) + the
  overlay-morph rules (StrictMode deferral — never remove).

## 4. Known loose ends

- `ui-kit/playground/specs/context-menu.spec.ts` "nested subs coexist" —
  occasionally fails: the deeper sub sometimes doesn't close when hovering a
  parent item (Radix grace timing). Everything else is green.
- The kit's playground (port 5183, `npm run playground`) + `npm run
  test:playground` are the debugging ground — read `ui-kit/AGENTS.md` for the
  full debugging guide before touching the kit.

## Key architecture (do not re-derive)

- `ui-kit/src/overlayRegistry.ts` — one-open-overlay-at-a-time registry
  (dropdowns + context menus can never coexist).
- `ui-kit/src/DropdownMenu.tsx` — `SubmenuContext` (open CHAIN + a
  keyboard-opened marker), `MenuHighlightContext` + `useMenuKeys` /
  `useMenuKeyLock` / `useMenuWheel` (attached via the content's composed ref
  — the Radix portal mounts later than the open flip), the highlight state
  (`useMenuHighlightState`).
- `ui-kit/src/overlayMorph.ts` — StrictMode deferral (never remove), clone
  close for unmount-driven surfaces.
- `ui-kit/src/styles/tokens.css` — the shared styling library (`[data-theme]`
  + `.ui-*` classes + `.ui-modal-overlay` dim rules).
