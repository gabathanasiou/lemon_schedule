import { Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Creates a new project from the Project Manager screen if no project is open.
 * The app boots into the Project Manager when localStorage is empty.
 */
export async function ensureProject(page: Page) {
  const newProjectBtn = page.getByRole('button', { name: /New Project/i });
  if (await newProjectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newProjectBtn.click();
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(800);
  }
}

/**
 * Reads the "Town - Jason" demo project (.lemon = JSON export) from disk.
 * The file lives outside the repo (Downloads), so tests get real data to
 * exercise the schedule/calendar/glide views without committing the file.
 */
export function loadSeedProject(): { raw: string; data: any } {
  const candidates = [
    process.env.LEMON_SEED_PATH,
    path.join(os.homedir(), 'Downloads', 'Town - Jason.lemon'),
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const raw = fs.readFileSync(c, 'utf8');
      return { raw, data: JSON.parse(raw) };
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
 */
export function seedProjectScript(seed: { raw: string }): string {
  const project = JSON.parse(seed.raw);
  const meta = JSON.stringify({
    id: project.id,
    title: project.title,
    lastModified: Date.now(),
    createdAt: Date.now(),
  });
  const projectJson = JSON.stringify(project);
  return `
    (() => {
      const project = ${projectJson};
      const meta = ${meta};
      localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
      localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
    })();
  `;
}

/** Seeds the demo project and opens it from the Project Manager screen. */
export async function openSeededProject(page: Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto('http://localhost:3001/lemon_schedule/');
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
  await page.waitForTimeout(1000);
}
