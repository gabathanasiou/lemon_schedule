# Known Test Failures — Triage & Fix Plan

**Status: RESOLVED.** All 11 fixed — full suite **187 passed / 6 skipped /
0 failed**. Kept as a reference for the recurring drift causes.

They were verified **identical with and without** the roadmap-94 paginator fix
(run the failing specs with the change stashed — same 11 failed), so none were
caused by work under test. The fixes were selector/geometry drift (10) plus one
real kit Modal bug (1).

**Boot/viewport:** specs run Desktop Chrome at **1280×720** (see
`playwright.config.ts`); a few failures are 720px-height geometry.

---

## Summary

| Spec | Test | Root cause | Kind |
|---|---|---|---|
| `new-cast-naming.spec.ts:62,84,99,113` | 4 tests | SceneSheet editor is now a `<textarea>`, spec queries `<input>` | Test selector |
| `linked-elements.spec.ts:83,104,311` | 3 tests | same | Test selector |
| `cast-single-source.spec.ts:169` | 1 test | same | Test selector |
| `report-chrome.spec.ts:77` | 1 test | kit token popup items are `[role="option"]`, spec queries `<button>` | Test selector |
| `scene-sheet-cell-layout.spec.ts:24` | 1 test | cast box is 429px tall → click point off-screen | Test geometry |
| `rules-tab.spec.ts:40` | 1 test | rule modal grows past the 720px viewport; footer unreachable | **Real UI bug** |

---

## A. SceneSheet `wrapValue` changed `<input>` → `<textarea>` (8 tests)

**Cause:** roadmap 95 gave the SceneSheet entity dropdowns `wrapValue`
(`SceneSheetFields.tsx:56,58,91,93`). In `EntityDropdown.tsx:753-762`, when
`wrapValue` is set the editor renders a wrapping `<textarea>` instead of an
`<input>`. The specs still do `.locator('input')` on the closed Cast/Props box,
so the editor is never found and the click times out.

**Fix (test-only, exact edits):**

- `e2e/new-cast-naming.spec.ts:26` — `castBox.locator('input').first()` →
  `castBox.locator('textarea').first()`
- `e2e/new-cast-naming.spec.ts:127` — `propsBox.locator('input').first()` →
  `propsBox.locator('textarea').first()`
- `e2e/linked-elements.spec.ts:68` — `castBox.locator('input').first()` →
  `castBox.locator('textarea').first()`
- `e2e/linked-elements.spec.ts:355` — `castBox.locator('input').first()` →
  `castBox.locator('textarea').first()`
- `e2e/cast-single-source.spec.ts:177` — `.locator('input')` →
  `.locator('textarea')` (inside the `div.grid > div` Cast locator)

Prefer `textarea` over `'input, textarea'`: the SceneSheet **always** passes
`wrapValue`, so `textarea` is the explicit contract and won't silently match a
future inner input. Update the `setCast` doc comments ("one input event") to
say "one textarea event".

**Verify:** `npx playwright test e2e/new-cast-naming.spec.ts e2e/linked-elements.spec.ts e2e/cast-single-source.spec.ts`

---

## B. Token popup items are `[role="option"]`, not `<button>` (1 test)

**Cause:** `report-chrome.spec.ts:119` asserts
`popover.locator('button').count() > 1`. The token autocomplete is now the kit
`RichTextEditor` popup, whose rows are `<div role="option">`
(`@gabriel/ui-kit` dist, the `li` component) — 0 buttons. Probe on `@sh`
returned `{ buttons: 0, options: 3 }`.

**Fix (test-only):** `e2e/report-chrome.spec.ts:119` —
`popover.locator('button')` → `popover.locator('[role="option"]')`.

**Verify:** `npx playwright test e2e/report-chrome.spec.ts`

---

## C. Scene Sheet cast box taller than the viewport (1 test)

**Cause:** `scene-sheet-cell-layout.spec.ts:24` sets a long cast (all ~59
members), so the closed display wraps and the cast box grows to **429px**,
starting at y≈367 → bottom ≈796 (viewport 720). The test clicks
`boxRect.y + height - 8` ≈ y 788, **off-screen**; `document.elementFromPoint`
returns `null`, so the textarea never focuses and `toBeFocused()` fails.

**Fix (test-only):** scroll the box into view before measuring/clicking, e.g.
before `const boxRect = await castBox(page).boundingBox();` (line 62):

```ts
await castBox(page).scrollIntoViewIfNeeded();
const boxRect = await castBox(page).boundingBox();
```

(429px fits in 720px, so the whole box becomes visible and the bottom-padding
click lands.) Do **not** shorten the cast — the long-wrap case is the point.

**Verify:** `npx playwright test e2e/scene-sheet-cell-layout.spec.ts`

---

## D. Rules-tab rule editor overflows the viewport — REAL UI BUG (1 test)

**Cause (probed):** with `DATE_RESTRICTION` selected the DatePicker makes the
rule editor taller. The kit Modal positions itself at inline `top: 86px` and
sets `max-height: calc(100dvh - 16px)` (=704px). The content is **677px**, so no
internal scroll kicks in, but `top(86) + 677 = 763 > 720` → the footer's
**Add Rule** button sits at y 704–738 (center 721, just past the 720px edge).
The modal body scroll container has `scrollHeight === clientHeight` (636), so
`scrollIntoViewIfNeeded()` — the current WIP patch in `rules-tab.spec.ts:19-23`
— **cannot** help. This is a genuine UX bug: on a 720px-tall window the Add
Rule button is unreachable.

**The kit's clamp ignores the top offset:** it caps height to
`100dvh - 2*edge` but never ensures `top + height <= vh - edge`, and it does not
re-center/re-clamp when content grows (only on keyboard show/hide — see the
`visualViewport` logic in `@gabriel/ui-kit` `Modal`).

**Fix (done):** the kit `Modal` now re-clamps top/left to the visible viewport
on content growth whenever the animated FLIP path is inactive (reduced motion
or morph off) — `ui-kit/src/Modal.tsx`, shipped as **kit v0.1.79**. The
`playwright.config.ts` `reducedMotion: 'reduce'` (and real users with OS
"Reduce Motion") no longer skip the re-anchor. `rules-tab.spec.ts` reverted to
a plain click.

**Verify:** `npx playwright test e2e/rules-tab.spec.ts`.

---

## Resolution

- A/B/C: test-only selector/geometry fixes (three commits).
- D: kit `Modal` re-clamp fix, **kit v0.1.79** + app dep bump.
- Full suite re-run → **0 failed**.

## Takeaway for future runs

If the full suite goes red, check whether it is one of these drift patterns
before assuming a regression: `wrapValue` entity cells are `<textarea>`, kit
menu/popup rows are `[role="option"]` / `.ui-item` (not `<button>`), and tall
content needs `scrollIntoViewIfNeeded` before coordinate clicks.
