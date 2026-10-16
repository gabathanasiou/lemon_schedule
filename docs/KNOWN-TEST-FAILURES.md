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
- E: test-side select-then-double-click fix in `e2e/crew-glide.spec.ts` (see below).

---

## E. Glide double-click editor never opens right after a commit (fixed, test-side)

**Symptom:** in a Glide spec, `await expect(page.locator('#portal textarea, #portal input')).toBeAttached()` times out on the first double-click after a previous cell commit (seen in `e2e/crew-glide.spec.ts` — "range fill…", failing ~3/4 runs, passing on retry). The portal stays empty and focus sits on the grid canvas / a11y cell.

**Cause (not a regression):** Glide's `cellActivationBehavior="double-click"` activates the editor only when the selection captured at the **second** mousedown matches the clicked cell (`data-editor.js`: `mouse.previousSelection.current.cell === gridSelection.current.cell`). Playwright dispatches a dblclick's two clicks back-to-back with no gap; while a re-render from the previous commit is still pending, the second click sees the stale selection and activation is skipped. Real users' double-clicks are ~100 ms+ apart, so only the zero-gap synthetic dblclick hits it.

**Fix recipe (test-side):** select the cell first, wait for the grid to confirm the selection, then double-click — an **already-selected** cell activates regardless of inter-click render timing. The a11y table exposes the committed selection as `#glide-cell-<col>-<row>[aria-selected="true"]` (debounced ~200 ms; `col` counts the row marker, so the crew Name column is `2`). See `e2e/crew-glide.spec.ts` `addMember`. Typing-based helpers (e.g. that spec's `editCell`) are immune because `editOnType` opens the editor on the first typed character when the dblclick didn't.

## Takeaway for future runs

If the full suite goes red, check whether it is one of these drift patterns
before assuming a regression: `wrapValue` entity cells are `<textarea>`, kit
menu/popup rows are `[role="option"]` / `.ui-item` (not `<button>`), tall
content needs `scrollIntoViewIfNeeded` before coordinate clicks, and Glide
double-clicks that fail right after a commit are the zero-gap synthetic-click
race described in §E (select first, then double-click).

---

## F. rich-text-editor class assertions flake under full-suite load (no fix needed)

**Symptom (seen once, follow-completeness run 2026-10-12):** a full-suite pass
failed `rich-text-editor.spec.ts` on a `toHaveClass(/bg-blue-900\/50/)`
assertion (line 87, "bold with empty selection lights the button immediately");
another run of the same spec flaked on line 73 instead. The spec's toggle-class
checks give the editor 3s to repaint and are sensitive to worker load.

**Triage:** identical on clean HEAD (`npm run test:baseline -- e2e/rich-text-editor.spec.ts`
— flaked there too) and green in isolation (6/6, then 12/12 with
`--repeat-each=2`). Not a regression; retries=1 absorbs it. If it recurs,
raise the assertion timeout rather than chasing the app.

**2026-10-15 — recursed (a full run failed `:80` outright, `:137` flaked);
the recommended remedy was applied:** every `timeout: 3000` in
`rich-text-editor.spec.ts` is now 8000, and the post-interaction `.tiptap`
HTML reads use `expect.poll(..., { timeout: 8000 })` instead of unpinned
reads. Verified 18/18 with `--repeat-each=3`; the entry stays in case it
recurs under heavier load.

**2026-10-15 (later) — recursed once more during the roadmap-233 merge suite**
(`:84` failed the attempt AND the retry under 2-worker load; the re-run was
green). Re-triaged to be sure it wasn't the merge: clean `main` gives
1 flaky/2 passed with `--repeat-each=3`, the merged tree 1 failed/1 flaky/1
passed with 2 workers and 3/3 passed with `--workers=1` (file-only 6/6).
Same load-sensitivity, not a regression — if it recurs again, `@quarantine`
it (`docs/TESTING.md`) rather than chasing the app.

**2026-10-15 (roadmap-255 suite) — recursed: `:77` failed the attempt AND the
retry** with a peer agent's preview server and a dev server running on the
machine (271 passed / 1 failed / 1 flaky overall; the day-times flake passed on
retry, §G). Same load-sensitivity class — the branch touches cast naming only.
If it recurs a third time, take the documented remedy and `@quarantine` it.

**2026-10-15 (roadmap-264 worktree suite) — recursed: `:137` flaked once**
(suite 272 passed / 1 flaky / 7 skipped, retry passed) while two peer worktrees
and three dev servers were running on the machine. **Triage:** solo re-run
`--workers=1` green 6/6 on an isolated port; the diff touches chrome bar
spacing only (no editor/canvas code). Same load-sensitivity, not a regression.

## G. day-times-glide editor spec flake under full-suite load (no fix needed)

**2026-10-15 — the roadmap-236 merge suite flaked once** on
`day-times-glide.spec.ts:27` ("editor seeds the default expression…"); the
retry passed (269/270 with 1 flaky) while a dev server + a second browser were
running on the machine. **Triage:** re-ran the spec alone immediately after —
5/5 passed (8.9s). Same load-sensitivity class as section F (Glide overlay
editor interactions under CPU contention), not a regression; retries=1 absorbs
it. If it recurs, re-check with `--workers=1` before touching the app.

**2026-10-15 (roadmap-264 merge suite) — same line, same shape:** `:27` failed
the attempt (`#portal textarea` not attached in 4s — the double-click editor
race) and passed on retry (271 passed / 2 flaky / 0 failed overall; §F's
`:137` was the other). Chrome-spacing diff only; no Glide editor code touched.

**Recurrence — 2026-10-15, the roadmap-252 merge suite flaked the same spec once**
(1 flaky, retry passed, 272 passed); solo re-run `--workers=1 --repeat-each=2` green
(10/10). Same load-sensitivity class, still no fix needed.

**2026-10-16 — recurs most suites now (roadmap-276 suite: retry passed, 273 passed /
1 flaky; roadmap-281 suite: same, 273 passed / 1 flaky):** `:27`'s second double-click
editor (`#portal textarea` not attached in 4s); no Glide/editor code in either diff.
Prescribed re-check after the second occurrence: solo `--workers=1` 5/5 green (13.1s)
— same load-sensitivity class, retries still absorb it, no fix needed.

## H. glide-first-edit spec fails both attempts under full-suite load (no fix needed)

**2026-10-15 — the roadmap-259 merge suite's first full run failed
`glide-first-edit.spec.ts:16` on the attempt AND the retry** ("overlay-editor
chunk is preloaded at boot, and the first edit after a fresh load keeps every
keystroke"; 272 passed / 1 failed / 7 skipped). **Triage:** the spec alone with
`--workers=1` was green immediately (1.9s), and the next full run passed it
outright (271 passed; only the §G day-times flake and one `locations.spec.ts`
flake re-absorbed by retry). Same load-sensitivity class as §F/§G (prod-chunk
preload + first-keystroke timing under CPU contention), not a regression — the
branch touches the File menu only. If it recurs, re-check with `--workers=1`
before touching the app.

**Recurrence — 2026-10-15, the roadmap-263 suite failed `locations.spec.ts:20`
on the attempt AND the retry** (at the second Glide canvas edit — creating the
`Studio` type off the add-row Type cell; 268 passed / 1 failed / 4 flaky). The
first canvas edit in the same test had already committed, so the surface swap
was long done. **Triage:** the spec alone `--workers=1 --repeat-each=2` → 6/6
green (30.1s, incl. the failing test twice). Same class as §H — Glide
overlay-editor timing under full-suite CPU contention, not a regression.

## I. glide-breakdown persistence spec flake under full-suite load (no fix needed)

**2026-10-16 — the roadmap-268 merge suite flaked once on
`glide-breakdown.spec.ts:45:3`** ("adds scene via button and verifies
persistence between views"; 272 passed / 1 flaky / 7 skipped — the retry
passed). **Triage:** solo `--repeat-each=3` green on the merged worktree (3/3)
AND on clean `main` (3/3) — same load-sensitivity class as §F–§H, not a
regression (the branch touches the File menu + the local flush in
`closeProject`). **Caveat:** `test:baseline` cannot triage this spec — it
hardcodes `http://localhost:3001` while the baseline runs an isolated port, so
it fails `ERR_CONNECTION_REFUSED` on HEAD and in a working tree alike; compare
against clean `main` on the normal port instead (see `docs/TESTING.md` §triage).

