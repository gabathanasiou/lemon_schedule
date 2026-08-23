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
 * Reads the "Town - Jason" demo project (.lemon = JSON export) from disk.
 * The file lives outside the repo (Downloads), so tests get real data to
 * exercise the schedule/calendar/glide views without committing the file.
 * Cached per mtime — one read + parse per suite run, not per test.
 */
let seedCache: { raw: string; data: any; mtimeMs: number } | null = null;
export function loadSeedProject(): { raw: string; data: any } {
  const candidates = [
    process.env.LEMON_SEED_PATH,
    path.join(os.homedir(), 'Downloads', 'Town - Jason.lemon'),
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

/** Seeds the demo project and opens it from the Project Manager screen. */
export async function openSeededProject(page: Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto('http://localhost:3001/lemon_schedule/');
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
  await expect(APP_BOOT_ANCHOR(page)).toBeVisible({ timeout: 10000 });
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