import { Page, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Committed seed fixture — makes the suite hermetic (CI + any machine).
 *  A demo project ("IT'S A WONDERFUL LIFE"); specs are seed-agnostic. */
const FIXTURE_SEED = fileURLToPath(new URL('./fixtures/seed.lemon', import.meta.url));

/** App boot anchor: the top-tab header only renders once the Project Manager
 *  closes and a project is loaded — a web-first replacement for sleep-boot. */
export const APP_BOOT_ANCHOR = (page: Page) =>
  page.getByRole('button', { name: 'Breakdown', exact: true });

/**
 * Creates a new project from the Project Manager screen if no project is open.
 * The app boots into the Project Manager when localStorage is empty.
 */
export async function ensureProject(page: Page) {
  const newProjectBtn = page.getByRole('button', { name: /New Project/i });
  if (await newProjectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newProjectBtn.click();
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(APP_BOOT_ANCHOR(page)).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Reads the seed project (.lemon = JSON export). Source priority: an explicit
 * `LEMON_SEED_PATH` override → the committed `e2e/fixtures/seed.lemon` (the
 * default, so local runs and CI share the SAME data) → a legacy copy in
 * `~/Downloads`. Cached per mtime (one read + parse per suite run, not per test).
 */
let seedCache: { raw: string; data: any; mtimeMs: number } | null = null;
export function loadSeedProject(): { raw: string; data: any } {
  const candidates = [
    process.env.LEMON_SEED_PATH,
    FIXTURE_SEED,
    path.join(os.homedir(), 'Downloads', "IT'S A WONDERFUL LIFE.lemon"),
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const st = fs.statSync(c);
      if (seedCache && seedCache.mtimeMs === st.mtimeMs) return seedCache;
      const raw = fs.readFileSync(c, 'utf8');
      const data = JSON.parse(raw);
      seedCache = { raw, data, mtimeMs: st.mtimeMs };
      return seedCache;
    } catch {
      /* try next */
    }
  }
  throw new Error('Seed project not found. Set LEMON_SEED_PATH to a .lemon file.');
}

/**
 * Builds an init script that seeds the project into localStorage before the
 * app boots, matching the app's storage contract:
 *  - project key: `lemon_schedule_project_v1_{id}`
 *  - index key:   `lemon_schedule_project_index`
 * The script string is cached per PROJECT JSON (tests share the identical
 * seed object from loadSeedProject — but most tests patch their own copy, so
 * the cache key must be the raw project, never the file mtime).
 */
const scriptCache = new Map<string, string>();
const SCRIPT_CACHE_MAX = 8;
export function seedProjectScript(seed: { raw: string }): string {
  const hit = scriptCache.get(seed.raw);
  if (hit) return hit;
  const project = JSON.parse(seed.raw);
  const meta = JSON.stringify({
    id: project.id,
    title: project.title,
    lastModified: Date.now(),
    createdAt: Date.now(),
  });
  const projectJson = JSON.stringify(project);
  const script = `
    (() => {
      const project = ${projectJson};
      const meta = ${meta};
      localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
      localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
    })();
  `;
  if (scriptCache.size >= SCRIPT_CACHE_MAX) {
    const oldest = scriptCache.keys().next().value;
    scriptCache.delete(oldest);
  }
  scriptCache.set(seed.raw, script);
  return script;
}

/** The seeded project's title (for specs that assert the app header). */
export function seedTitle(): string {
  return loadSeedProject().data.title;
}

/** Escape a string for use inside a `RegExp` (locator text filters, etc.). */
export const escRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Clicks a kit menu/popover row by its exact text via a deferred native click
 *  (the row is often a non-button element the role locator can't reach). */
export async function clickMenuText(page: Page, text: string) {
  await page.getByText(text, { exact: true }).evaluate((el) => (el as HTMLElement).click());
}

/** A manager grid's NAME cell holding the given value. Manager name cells are
 *  auto-wrapping textareas (`data-manager-name`) so long names wrap to two
 *  lines — `input[value=…]` no longer matches them. Matches the value EXACTLY
 *  and case-sensitively (the merge specs distinguish "FISHING BOAT" from
 *  "fishing boat"). */
export function nameCell(page: Page, value: string) {
  return page.locator('textarea[data-manager-name]').filter({ hasText: new RegExp(`^${escRegExp(value)}$`) }).first();
}

/** The app under test (prod-preview `vite preview` on :3001 by default). */
export const APP_URL = `http://localhost:${process.env.PLAYWRIGHT_PORT || '3001'}`;

/** Seeds a full project object into localStorage before the app boots. */
export async function seedProject(page: Page, project: any) {
  const meta = JSON.stringify({
    id: project.id,
    title: project.title,
    lastModified: Date.now(),
    createdAt: Date.now(),
  });
  const projectJson = JSON.stringify(project);
  await page.addInitScript(({ projectJson, meta }) => {
    const p = JSON.parse(projectJson);
    localStorage.setItem('lemon_schedule_project_v1_' + p.id, JSON.stringify(p));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([JSON.parse(meta)]));
  }, { projectJson, meta });
}

/**
 * Seeds the demo project and opens it from the Project Manager screen.
 * Pass `mutate` to patch a copy of the seed (add a report design, point an
 * active id at a new block, …) before it is written — replaces the per-spec
 * `seedWithDesign` / `seedProject` copy-paste.
 */
export async function openSeededProject(page: Page, mutate?: (project: any) => void) {
  if (mutate) {
    const project = JSON.parse(loadSeedProject().raw);
    mutate(project);
    await seedProject(page, project);
    await page.goto(`${APP_URL}/lemon_schedule/`);
    await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
  } else {
    const seed = loadSeedProject();
    await page.addInitScript(seedProjectScript(seed));
    await page.goto(`${APP_URL}/lemon_schedule/`);
    await page.getByText(seed.data.title, { exact: true }).first().click({ timeout: 8000 });
  }
  await expect(APP_BOOT_ANCHOR(page)).toBeVisible({ timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Seed-agnostic data accessors. The suite must not assume the seed project's
// cast/dates/elements (the seed is a real exported .lemon and can change) —
// every spec resolves what it needs from the live debug bridge instead of
// hardcoding "FISHERMAN" / "2026-08-10" / etc.
// ---------------------------------------------------------------------------

/** The seed's lead cast member: the one appearing in the most scheduled
 *  scenes. `{ id, name }` — cast is referenced by ID everywhere. */
export async function seedLeadCast(page: Page): Promise<{ id: string; name: string }> {
  return page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    const cast: any[] = p.castMembers || [];
    const rows = b.getRows();
    const sceneIdByRow = new Map(
      (rows.rows || []).filter((r: any) => r.type === 'SCENE' && r.sceneId).map((r: any) => [r.id, r.sceneId]),
    );
    const counts = new Map<string, number>();
    for (const s of rows.sections || []) {
      if (s.isPinned) continue;
      for (const rid of s.rows || []) {
        const sc = p.scenes.find((x: any) => x.id === sceneIdByRow.get(rid));
        if (!sc) continue;
        for (const id of String(sc.cast || '').split(',').map((x: string) => x.trim()).filter(Boolean)) {
          counts.set(id, (counts.get(id) || 0) + 1);
        }
      }
    }
    let best = cast[0];
    let bestN = -1;
    for (const m of cast) {
      const n = counts.get(String(m.id)) || 0;
      if (n > bestN) { bestN = n; best = m; }
    }
    return { id: String(best?.id ?? ''), name: best?.name ?? '' };
  });
}

/** The active calendar version (production window / nonShootDates source). */
export async function activeCalendar(page: Page): Promise<any> {
  return page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    return (p.calendarVersions || []).find((c: any) => c.id === p.activeCalendarVersionId) || (p.calendarVersions || [])[0] || null;
  });
}

/** The schedule's production day dates (excludes the pinned daybreak anchor),
 *  in calendar order — index 0 is DAY 1. */
export async function seedDayDates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const rows = b.getRows();
    return (rows.sections || []).filter((s: any) => !s.isPinned).map((s: any) => s.date);
  });
}

/** A named element in a breakdown category, or the first one when no name is
 *  given. Resolves to `{ id, name }`. */
export async function seedElement(page: Page, category: string, name?: string): Promise<{ id: string; name: string }> {
  return page.evaluate(({ category, name }) => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    let list: any[] = [];
    if (category === 'cast') list = p.castMembers || [];
    else list = (p.breakdownElements || {})[category] || [];
    const found = name ? list.find((e: any) => e.name === name) : list[0];
    return { id: String(found?.id ?? ''), name: found?.name ?? '' };
  }, { category, name });
}

/** Waits until the PERSISTED project in localStorage satisfies `expr` (a
 *  plain-JS expression over `p`, e.g. `'p.scenes.length > 10'`). Replaces
 *  blind sleeps before localStorage reads — the debounced save + any
 *  persist-time normalization (e.g. stripping the legacy cast mirror) landed
 *  by the time the expression holds. */
export async function waitForPersistedProject(page: Page, expr: string, timeout = 8000) {
  await page.waitForFunction((expression) => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    if (!key) return false;
    try {
      const raw = localStorage.getItem(key)!;
      const p = (window as any).__lemonSchedule.decodeProject(raw);
      return new Function('p', `return (${expression})`)(p) === true;
    } catch {
      return false;
    }
  }, expr, { timeout });
}

/** Waits for overlay/modal morphs (kit `useOverlayMorph` + the Modal FLIP,
 *  ~220ms trigger-anchored scale+fade) AND the surrounding layout to settle
 *  before the next interaction. The morph keeps a CLOSING menu/panel mounted
 *  with `data-state="open"` for its duration, so fast open→close→open
 *  sequences momentarily see TWO "open" overlays (strict-mode locator
 *  violations); a mid-morph panel sits at a transformed position and an
 *  opacity-0 one is invisible to hit-testing, so a click lands on whatever is
 *  underneath. On iPad a virtualized grid can keep re-rendering UNDER a fixed
 *  menu, nudging it via the scroll-follow re-measure so the item never reads
 *  as stable. Polls every open overlay's rect + opacity and returns once they
 *  hold still for ~150ms — web-first, no fixed sleep. */
export async function waitForOverlaySettle(page: Page, timeout = 3000) {
  const started = Date.now();
  let prev = '';
  let stableCount = 0;
  let seen = false;
  while (Date.now() - started < timeout) {
    const sig = await page.evaluate(() => {
      const open = document.querySelectorAll(
        '[role="menu"][data-state="open"], [data-modal-stack][data-state="open"], .click-outside-ignore',
      );
      return Array.from(open).map((el) => {
        const r = el.getBoundingClientRect();
        const o = getComputedStyle(el).opacity;
        return `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}|${o}`;
      }).join(';');
    });
    // Radix portals the content a commit AFTER the trigger click — an empty
    // sample means the overlay hasn't mounted yet, never a settled state.
    if (sig !== '') seen = true;
    if (seen && sig === prev && ++stableCount >= 3) return;
    if (sig !== prev) {
      stableCount = 0;
      prev = sig;
    }
    await page.waitForTimeout(50);
  }
}

// ---------------------------------------------------------------------------
// Shared navigation + data helpers. Extracted so specs don't each re-invent
// the Design→Reports-Designer / Production→Day-Manager routes, the print-view
// stub, and the raw bridge reads.
// ---------------------------------------------------------------------------

/** Opens Reports Designer (Design tab → Reports Designer sub-tab). Assumes a
 *  project is already open (use {@link openSeededReportsDesigner} to seed too). */
export async function openReportsDesigner(page: Page) {
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
}

/** Seeds the demo project, opens it, and lands in Reports Designer. Pass
 *  `stubPrint` for specs that render the print view (blocks the weather/geocode
 *  fetches that otherwise dangle headless). */
export async function openSeededReportsDesigner(
  page: Page,
  mutate?: (project: any) => void,
  opts: { stubPrint?: boolean } = {},
) {
  if (opts.stubPrint) await stubPrintNetwork(page);
  await openSeededProject(page, mutate);
  await openReportsDesigner(page);
}

/** Selects a report design by name from the "Editing: …" picker. */
export async function selectReportDesign(page: Page, name: string) {
  await page.getByText(/^Editing: /).click();
  await page.getByRole('menuitem', { name }).click();
}

/** Stubs `window.print` and fails the sun/weather + geocode fetches (they
 *  dangle headless and block handleReportPrint's print-view handoff). */
export async function stubPrintNetwork(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {};
    const realFetch = window.fetch.bind(window);
    window.fetch = (input: any, init?: any) => {
      const url = String(typeof input === 'string' ? input : input?.url || input);
      if (url.includes('open-meteo') || url.includes('nominatim')) return Promise.reject(new Error('blocked for test'));
      return realFetch(input as any, init as any);
    };
  });
}

/** From Reports Designer: Print → Print / Save PDF, then waits for the
 *  paginated `.report-page` divs. Returns the page locator. */
export async function openReportPrintView(page: Page, minPages = 1) {
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: /Print \/ Save PDF/ }).click();
  const pages = page.locator('.report-root .report-page');
  await expect(pages.first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    (n) => document.querySelectorAll('.report-root .report-page').length >= n
      && document.querySelector('.report-root')?.getAttribute('data-paginated') === 'true',
    minPages,
    { timeout: 15000 },
  );
  return pages;
}

/** Navigates Production → Day Manager from an already-open project and waits
 *  for the page shell (use when the spec seeded its own custom project). */
export async function gotoDayManager(page: Page) {
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Day Manager', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
}

/** Seeds the project (optionally mutating it) and opens Production → Day
 *  Manager, waiting for the page shell. */
export async function openDayManager(page: Page, mutate?: (project: any) => void) {
  await openSeededProject(page, mutate);
  await gotoDayManager(page);
}

/** Opens the full-surface call-sheet editor from the Day Manager header. */
export async function openCallSheetEdit(page: Page) {
  await page.locator('[data-day-manager] header').getByRole('button', { name: /Call Sheet/ }).click();
  await expect(page.locator('[data-call-sheet-edit]')).toBeVisible({ timeout: 8000 });
}

/** Expands a collapsible Day Manager section and returns it. */
export async function expandDaySection(page: Page, sectionId: string, probe: string) {
  const section = page.locator(`[data-section="${sectionId}"]`);
  if (!(await section.locator(probe).count())) await section.getByRole('button').first().click();
  return section;
}

/** Opens Day Manager, expands the Call Times grid, and waits for it to settle. */
export async function openCallTimesSection(page: Page) {
  await openDayManager(page);
  await expandDaySection(page, 'callTimes', '[data-day-times-glide]');
  const grid = page.locator('[data-day-times-glide]').first();
  await expect(grid).toBeVisible({ timeout: 8000 });
  await expect(grid.locator('.dvn-scroller').first()).toBeAttached({ timeout: 8000 });
  await grid.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-day-times-glide] .dvn-scroller') as HTMLElement | null;
    if (!el) return false;
    const w = el.clientWidth;
    const prev = (window as any).__dtgWidth;
    (window as any).__dtgWidth = w;
    return w > 0 && prev === w;
  }, undefined, { timeout: 5000 });
}

/** The live project straight from the store (sync post-dispatch) — prefer
 *  over decoding localStorage, which waits on the debounced save. */
export async function bridgeProject(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__lemonSchedule?.getProject());
}

/** Runs a plain-JS expression against the debug bridge `b` in the page. */
export async function bridgeEval<T = any>(page: Page, expr: string): Promise<T> {
  return page.evaluate((body) => {
    const b: any = (window as any).__lemonSchedule;
    return new Function('b', `return (${body})`)(b);
  }, expr) as Promise<T>;
}

/** Day 1's cast ids in first-appearance order (the sheet's row order). */
export async function day1CastIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const rows = b.getRows();
    const p = b.getProject();
    const sceneIdByRow = new Map(
      (rows.rows || []).filter((r: any) => r.type === 'SCENE' && r.sceneId).map((r: any) => [r.id, r.sceneId]),
    );
    const sec = (rows.sections || []).filter((s: any) => !s.isPinned)[0];
    const out: string[] = [];
    for (const rid of sec?.rows || []) {
      const sc = p.scenes.find((x: any) => x.id === sceneIdByRow.get(rid));
      if (!sc) continue;
      for (const id of String(sc.cast || '').split(',').map((x: string) => x.trim()).filter(Boolean)) {
        if (!out.includes(id)) out.push(id);
      }
    }
    return out;
  });
}

/** The pinned daybreak's stored `elementCalls.cast[id]` override, or null. */
export async function callsFor(page: Page, castId: string) {
  return page.evaluate((id) => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
    return gov?.daybreakMeta?.elementCalls?.cast?.[id] || null;
  }, castId);
}

/** First stage column label from the project's call-time settings. */
export async function firstStageLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    const s = p.productionInfo?.callTimes;
    const stages = (s?.stages?.length ? s.stages : [
      { key: 'pickup', label: 'Pickup' }, { key: 'arrive', label: 'Arrive' },
      { key: 'hmua', label: 'HMU' }, { key: 'costume', label: 'Costume' }, { key: 'onSet', label: 'On Set' },
    ]);
    return stages[0]?.label || '';
  });
}

const STAGE_BASE_WIDTHS = [48, 220, 48, 88, 88, 88, 88, 88];

/** Center of a stage cell in a day-times Glide grid. Mirrors the component's
 *  fit-to-card column math (desktop defaults: 11px font → 30px header, 28px
 *  rows). `scope` narrows to one grid (defaults to the first on the page). */
export async function stageCellPoint(
  page: Page,
  row: number,
  stageIndex: number,
  scope?: import('@playwright/test').Locator,
) {
  const base = (scope || page).locator('[data-day-times-glide] .dvn-scroller').first();
  const box = (await base.boundingBox())!;
  const target = Math.max(120, Math.floor(box.width) - 1);
  const total = STAGE_BASE_WIDTHS.reduce((s, w) => s + w, 0);
  const widths = STAGE_BASE_WIDTHS.map(w => Math.max(40, Math.floor((w / total) * target)));
  const sum = widths.reduce((s, w) => s + w, 0);
  widths[1] += target - sum;
  const before = widths[0] + widths[1] + widths[2];
  const rowH = 28;
  const headerH = 30;
  return {
    x: box.x + before + stageIndex * widths[3] + widths[3] / 2,
    y: box.y + headerH + row * rowH + rowH / 2,
    stageW: widths[3],
    rowH,
  };
}

// ---------------------------------------------------------------------------
// Import flow helpers (File → Import → screenplay file → picker).
// ---------------------------------------------------------------------------

/** Writes `contents` to a temp file and returns its path. */
export function writeTempFile(name: string, contents: string): string {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, contents);
  return p;
}

/** Opens the APPEND screenplay import picker (File → Import → .fdx/.fountain/.csv)
 *  and attaches `filePath`. The review dialog is left for the caller to drive. */
export async function importFileViaMenu(page: Page, filePath: string) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: /\.fdx, \.fountain, \.csv/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
}

/** File ▸ Import ▸ screenplay → picker, then confirm the "Import/Update N
 *  Scenes" review dialog. */
export async function importScenesViaMenu(page: Page, filePath: string) {
  await importFileViaMenu(page, filePath);
  const submit = page.getByRole('button', { name: /(?:Import|Update) \d+ Scenes/ });
  await expect(submit).toBeVisible({ timeout: 8000 });
  await submit.click();
}

/** Opens the "Update script…" review modal with `filePath` and waits for it. */
export async function openUpdateScriptModal(page: Page, filePath: string) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: /Update script/ }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles(filePath);
  await expect(page.getByRole('dialog').getByText(/Update Script/)).toBeVisible({ timeout: 8000 });
}