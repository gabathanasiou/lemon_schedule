# Testing — Agent Manual

Status: **read this before writing, changing, retiring, or debugging e2e tests.**
`playwright.config.ts` and `scripts/smart-test.mjs` are the harness; this file is the policy.

## Mental model

1. **The suite is the app's regression net, not a spec of everything.** ~67 specs run
   against the PRODUCTION preview build; canaries (`seeded-smoke`, `debug-bridge`) prove
   the app boots and the agent bridge works. Keep the suite fast and trustworthy.
2. **Two-run cost is the enemy.** A flaky test that fails honestly-works costs an agent a
   baseline investigation. Retries absorb transient flake; chronic flake is **quarantined**,
   not tolerated.
3. **A red run is not proof of a regression.** Answer "was it me?" from the smart-test
   selection + a baseline run — never by `git checkout` (which destroys uncommitted work).

## Test sizes & the pyramid

The industry model (Google's *test pyramid*, ~70% unit / 20% integration / 10% e2e)
exists because feedback must be **fast, reliable, and failure-isolating**. This repo has
all three layers, but e2e is still over-weighted — every logic bug pays a browser boot.

| Size | Here | Use it for | Cost |
|---|---|---|---|
| **Small / unit** | Vitest — `npm run test:unit`, `src/**/__tests__/*.test.ts`, node env; coverage guide `npm run test:unit:coverage` (scoped to `src/lib/`) | Pure logic: `daybreakUtils`, `callTimes`, `reportBlocks`, `elementLinks`, `rulesEngine`, `legacyMigration`, import parsers (`parseSex`), `sceneNumbering`, … | ~ms, hermetic, pins edge cases |
| **Medium / integration** | e2e specs driven by the debug bridge (`dispatch` → assert state, minimal DOM) | One surface + its state: a day-manager section, a report block, links propagation | seconds |
| **Large / e2e** | canaries + cross-surface flows + real browser behaviour | Boot, persistence round-trip, drag/Glide canvas, print pagination, overlay morph, iPad/pen, focus/CSS | tens of seconds, flaky-prone |

**Rule of thumb:** if a bug can be reproduced without a browser, it belongs in a unit
test; then keep ONE e2e test proving the feature is wired end-to-end. Never assert the
same behaviour at both layers — when you move a case down, **retire the e2e case**.

**Rebalancing (ongoing).** `e2e/` is capped, so moving logic down is how the suite grows
sustainably. A test is a conversion candidate when it only dispatches + inspects state
via `window.__lemonSchedule`; the browser boot is pure overhead. Before converting,
check the logic lives in an importable `src/lib/` module (not buried in a hook/component
— extracting it is the real work); then write the Vitest case and delete the e2e case.
Browser-bound behaviour (canvas geometry, print/pagination, overlay morph, iPad/pen,
focus/CSS) stays in `e2e/`.

**Browser-only APIs block node unit tests.** `parseMsd` uses `DOMParser`, so its golden
test stays e2e (or needs a jsdom environment). `parseSex`/`exportSex` are pure and are
unit-tested against the same fixtures.

## When to add a test (rubric)

Add a test when it changes a future decision — i.e. a reasonable change could break it
without anyone noticing. Concretely, add one when:

1. **New user-visible behavior** or a new invariant (daybreak ordering, call-time chain,
   link propagation, paginator). One focused spec/test, seed-agnostic.
2. **A bug fix** — a regression test that fails before the fix and passes after
   (especially anything that already slipped past the suite).
3. **A hard-won edge case** (date-cursor skipping statused dates, `mod 24` wrap,
   fractional-order identity) — cheap insurance.

Do **not** add a test when:

- **The user can confirm it by looking.** This is the most common mistake: adding a
  Playwright spec for something a glance catches — a new item in a dropdown/menu/palette/
  toolbar, renamed labels/copy, an icon, a color/spacing tweak, a fixed-list order, "the
  panel opens". Writing a browser test for that is pure cost (slower suite, more flake,
  another thing to maintain). **STOP and hand the user a numbered manual check instead**
  (§Manual verification).
- It asserts **implementation detail** (a CSS class, internal state shape) rather than
  user-visible behavior — it will break on every refactor and teach nothing.
- It **duplicates** an existing spec's coverage (extend the existing test instead).
- It's a **one-off probe** for an investigation. That's a scratch file, not a spec —
  delete it, don't commit it (the retired `probe-*`/`edit-toggle-*` specs are the cautionary tale).
- It can only "pass" by sleeping (`waitForTimeout`) — make it deterministic or don't add it.

## Manual verification (the user has eyes)

When a change is visually verifiable, **do not write a test — ask the user to verify it.**
End the task with a short, numbered check (exact clicks + expected result), and keep it
copy-pasteable. Example:

> **Please verify manually (~30s):**
> 1. Open Production → Day Manager → the ⋯ menu.
> 2. Confirm "Import DOODs" sits above "Export DOODs".
> 3. Click it — the file picker opens.

Automate **only** when a silent break is plausible — i.e. the user *couldn't* tell from
looking: data loss, a wrong computed value, persistence/round-trip, cross-surface
propagation (one edit must appear on another surface), or geometry that only fails at
scale. If in doubt, prefer the manual hand-off.

## Selector strategy (keeps tests from drifting)

Prefer, in order: `getByRole`/`getByLabel`/`getByText` → `getByTestId`/`TEST_IDS`
(`src/lib/testIds.ts`) → `[data-*]` → **last resort** `locator('.class')`. Class selectors
are the #1 documented drift cause here (`docs/KNOWN-TEST-FAILURES.md`).

- **Stable app classes ARE a contract** in the reports designer (`.block-chrome`,
  `.report-table-cols`, `.ui-menu`, `.report-zone[data-zone-list]`, `[data-block-id]`) —
  the canvas has no natural roles. Using them is fine; renaming one is a breaking change.
- **Never add these** (the lint warns on them): inline-style (`[style*=…]`), utility-class
  (`locator('div.flex-…')`), parent (`locator('..')`), `[class*=…]`. Target the canvas via
  `data-testid="report-canvas"` (`TEST_IDS.reportCanvas`).
- When a component has no stable hook, add a `TEST_IDS` entry + `data-testid` rather than
  a structural selector.

## Harness facts

- **CI runs no tests** — local gates suffice. `.github/workflows/deploy.yml` only
  builds/deploys to Pages. Run `npm run lint` + `npm run test:unit` + the Playwright
  suite (or `npm run test:smart`) locally before done/commit (AGENTS.md rule 7).
- `playwright.config.ts`: prod-preview webServer on :3001, `reducedMotion: 'reduce'`,
  `retries: 1` locally / `2` on CI, `trace: 'on-first-retry'`, `grepInvert: /@perf|@quarantine/`.
  `PLAYWRIGHT_PORT=<n>` isolates the server (owned, no reuse); `PLAYWRIGHT_DEV=1` runs the dev server.
- **Parallelism**: each worker is a full Chromium, so N workers pins ~N cores and spins
  the laptop fans. The config defaults to **5 workers** (clamped to the core count) —
  the proven baseline. 7+ pins most of the CPU and ramps the fans; 8 is a bit faster
  when you don't mind the heat. Raise deliberately:
  `PLAYWRIGHT_WORKERS=8 npx playwright test`. Heavy contention also raises flake risk
  (morph/canvas specs).
- **`fullyParallel: true`** — tests run in parallel across workers even within one spec
  file (fresh context per test; the few order-dependent specs opt out with
  `test.describe.configure({ mode: 'serial' })`). Better load balancing, ~12% shorter
  wall time at the same worker count.
- **Duration**: a custom reporter (`scripts/pw-duration-reporter.mjs`) prints
  `[timing] N tests in Xs across W worker(s)` on the final line, so runs are comparable.
- **`npm run test:smart`** selects only specs your diff can affect (RULES map), plus the
  canaries and the last run's failures. `ALL`-marked core files force the full suite.
  `--list` prints the selection; `--full` runs everything; `npm run test:full` = full suite.
- `@perf` tests (timing/memory harnesses) and `@quarantine` tests are excluded from the
  default suite. Run them explicitly: `npx playwright test --grep @perf` /
  `--grep @quarantine`; perf configs: `playwright.perf.config.ts` / `playwright.perf-prod.config.ts`.
- iPad touch/keyboard specs are gated to `playwright.ipad.config.ts` (webkit iPad project).

## Rules (MUST NOT)

1. **Seed-agnostic specs.** Resolve cast/dates/elements/counts from the debug bridge
   (`seedLeadCast`, `seedDayDates`, `seedElement`, `activeCalendar`, `seedTitle`) — never
   hardcode the seed's content. The seed is the committed `e2e/fixtures/seed.lemon` (a
   hermetic demo project; override with `LEMON_SEED_PATH`), so it can be swapped without
   editing specs.
2. **Web-first assertions.** Prefer `expect` / `expect.poll` / `waitForFunction` /
   `toBeVisible` over `waitForTimeout`. Only true interaction pacing (drag settle, canvas
   repaint, morph) may use a timeout, with a comment saying why.
3. **Debug bridge over DOM/localStorage** for state reads — sync, no debounced-save waits.
   `waitForPersistedProject` when persistence itself is under test. A persisted project
   string is `gzip/base64` (roadmap 124) — decode it with
   `window.__lemonSchedule.decodeProject(raw)`, never `JSON.parse` (legacy plain entries
   decode too).
4. **One spec base name per feature**, registered in `scripts/smart-test.mjs` RULES. A spec
   not in the map is an orphan: `npm run lint` fails (see `check-doc-budget.mjs`).
5. **Never `git checkout` / `git stash` to test a baseline.** Use `npm run test:baseline`
   (throwaway HEAD worktree) — see below.
6. **Never leave a chronically flaky test retrying forever.** Quarantine it (tag + registry).
7. **Retire dead specs.** A spec for removed behavior (or one pinned to a removed helper /
   selector contract) is deleted — git preserves it. Don't accumulate editorially-dead tests.

## Flake policy

- **Transient** (passes on retry): leave it. The retry + `trace: 'on-first-retry'` handles it.
- **Chronic** (fails on repeated runs, unrelated to the current diff):
  1. Tag every test in the spec `@quarantine` (or the single test) — excluded from the default
     suite immediately.
  2. Record it in the **Quarantine registry** below: spec · test · why · date · owner.
  3. File/fix or delete it. A quarantined test that nobody fixes is technical debt with a name.
- **Known drift causes** (from `docs/KNOWN-TEST-FAILURES.md`): `wrapValue` entity cells are
  `<textarea>` (not `<input>`); kit menu/popup rows are `[role="option"]` / `.ui-item` (not
  `<button>`); tall content needs `scrollIntoViewIfNeeded()` before coordinate clicks; the
  viewport is 1280×720.

### Quarantine registry

| Spec · test | Why | Since |
|---|---|---|
| _(none)_ | | |

## "Was it me?" workflow (red run)

1. **Did smart-test select it?** If the failing spec isn't in `npm run test:smart -- --list`,
   your change can't reach it — it's pre-existing/flaky. Don't chase it.
2. **Re-run just that spec** (`npx playwright test e2e/<spec>.spec.ts`). The retry often clears it.
3. **Baseline it without touching your tree**:
   `npm run test:baseline -- e2e/<spec>.spec.ts`
   Runs the spec against a clean `HEAD` worktree (symlinked `node_modules`). Fails there too →
   pre-existing; passes there → your diff. (Also: `SMART_BASE=<ref> npm run test:smart` diffs a branch.)
4. **Read the trace** from the first retry (`test-results/**/trace.zip`) before guessing.
5. Only if it's genuinely yours: fix it; if it's flaky, quarantine it (above) in the same change.

## Adding a spec

Adding is **deliberate, not automatic** — e2e is the expensive layer, so the suite is **capped**
(enforced by `npm run lint`): **≤ 70 specs / ≤ 268 tests** (`scripts/check-doc-budget.mjs`).
More features means more tests; unbounded growth means a prune. When a new case is needed, in
order of preference:

1. **Extend an existing spec** in the same area — don't create a near-duplicate file.
2. **Push the logic down to a unit test** (`npm run test:unit`) — a missed edge case usually
   belongs there, not in the browser.
3. **Merge** two tiny single-test specs for the same surface into one.
4. Only if the behavior is genuinely new and UI-wired: add the spec, then **prune something or
   consciously raise the cap** in `scripts/check-doc-budget.mjs` with a one-line reason.

Never test the same behavior at two layers (unit + e2e). Retire a spec when its behavior is gone
(git keeps it); quarantine chronic flake rather than silently deleting coverage.

Mechanics for any new spec:

- Use the shared seed helpers (`openSeededProject`, bridge getters). Keep it under ~300 lines.
- Register its base name in the matching bucket in `scripts/smart-test.mjs` (orphan specs fail lint)
  and, if it guards a new module, add a RULES entry mapping that module → the spec (or `ALL` for core).
- `npm run lint` must pass; run the spec + canaries before done.

## Verification

1. `npm run lint` — tsc + `scripts/check-doc-budget.mjs` (doc budget, roadmap open-only,
   unique archive ids, **no orphan specs**).
2. The touched spec(s) + the two canaries: `npx playwright test e2e/<spec>.spec.ts`.
3. Full suite before done for logic/store changes (`npx playwright test` or `npm run test:smart`).
