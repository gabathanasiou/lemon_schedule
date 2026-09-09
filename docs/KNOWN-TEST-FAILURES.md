# Known Test Failures — Triage & Fix Plan

**Status:** 11 specs fail on HEAD. Verified **identical with and without** the
roadmap-94 paginator fix (run the failing specs with the change stashed — same
11 fail), so they are **not** caused by recent work under test. Full suite:
`172 passed / 11 failed / 6 skipped`.

**Why this matters:** agents can't tell "my change broke this" from "this was
already red", so every full-suite run burns tokens on triage. Fix (or skip with
a reason) before other work.

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

**Fix options (pick one; the first is the real fix):**

1. **Product (preferred):** make the kit `Modal` clamp so
   `top + height <= visualViewport.height - edge` (or set
   `maxHeight = calc(100dvh - top - edge)` and make the body `overflow-y:auto`),
   and re-clamp on content growth (ResizeObserver on the modal content). Needs
   an `@gabriel/ui-kit` bump + DESIGN-LANGUAGE/UI-KIT note + re-run the
   playground `modal` specs. File a roadmap item for this.
2. **Test unblock (interim):** give this spec a taller viewport —
   `test.use({ viewport: { width: 1280, height: 900 } });` at the top of
   `rules-tab.spec.ts` — so 677px fits. This hides the UX bug, so pair it with
   (1) and a `test.fixme`/comment referencing the roadmap item. `click({ force:
   true })` also passes but is the weakest option (bypasses actionability and
   hides real breakage).

**Verify:** `npx playwright test e2e/rules-tab.spec.ts` (and the kit playground
suite if option 1).

---

## Recommended order

1. **A + B + C** — pure test selector/geometry fixes, low risk, unblocks 10 of
   11. One commit.
2. **D** — decide product vs interim. If product, do the kit fix + bump + a
   roadmap item; if interim, taller viewport + comment + roadmap item so it
   isn't forgotten.
3. Re-run the **full suite** (`npx playwright test`) → expect 0 failures. If any
   remain, they are genuinely new and worth stopping for.

## Verification checklist

- `npm run lint`
- `npx playwright test e2e/new-cast-naming.spec.ts e2e/linked-elements.spec.ts e2e/cast-single-source.spec.ts e2e/report-chrome.spec.ts e2e/scene-sheet-cell-layout.spec.ts e2e/rules-tab.spec.ts`
- `npx playwright test` (full) — expect **0 failed** (baseline: 172 passed /
  11 failed / 6 skipped).
