import { Page, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
 * Reads the "IT'S A WONDERFUL LIFE" demo project (.lemon = JSON export) from
 * disk. The file lives outside the repo (Downloads), so tests get real data to
 * exercise the schedule/calendar/glide views without committing the file.
 * Cached per mtime — one read + parse per suite run, not per test.
 */
let seedCache: { raw: string; data: any; mtimeMs: number } | null = null;
export function loadSeedProject(): { raw: string; data: any } {
  const candidates = [
    process.env.LEMON_SEED_PATH,
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

const escRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A manager grid's NAME cell holding the given value. Manager name cells are
 *  auto-wrapping textareas (`data-manager-name`) so long names wrap to two
 *  lines — `input[value=…]` no longer matches them. Matches the value EXACTLY
 *  and case-sensitively (the merge specs distinguish "FISHING BOAT" from
 *  "fishing boat"). */
export function nameCell(page: Page, value: string) {
  return page.locator('textarea[data-manager-name]').filter({ hasText: new RegExp(`^${escRegExp(value)}$`) }).first();
}

/** Seeds the demo project and opens it from the Project Manager screen. */
export async function openSeededProject(page: Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto('http://localhost:3001/lemon_schedule/');
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
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
      const p = JSON.parse(localStorage.getItem(key)!);
      // eslint-disable-next-line no-new-func
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