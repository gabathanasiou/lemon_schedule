import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';

// Built-in element categories — mirrors src/lib/categories.ts ELEMENT_CATEGORIES
// (kept inline so the test computes expectations without importing app code).
const BUILTIN_CATS = ['cast', 'set', 'props', 'backgroundActors', 'stunts', 'vehicles', 'wardrobe', 'makeup', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept'];
const SINGLE_VALUE = new Set(['set']); // only `set` is single-value among built-ins

function fieldItems(cat: string, scene: any, custom: { key: string; multiValue?: boolean }[]): string[] {
  const v = scene?.[cat];
  if (!v || !v.trim()) return [];
  const multi = SINGLE_VALUE.has(cat) ? false : (custom.find(c => c.key === cat)?.multiValue ?? true);
  return multi ? v.split(',').map((x: string) => x.trim()).filter(Boolean) : [v.trim()];
}

function distinctIn(scenes: any[], cats: string[], custom: { key: string; multiValue?: boolean }[]): number {
  const seen = new Set<string>();
  for (const sc of scenes) {
    for (const c of cats) {
      for (const v of fieldItems(c, sc, custom)) seen.add(v.trim().toLowerCase());
    }
  }
  return seen.size;
}

test('smart Element/Scene Count resolve per day and per category (scoped to the day)', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];

  // Replicate the app's scene model: counts run over SCHEDULED scenes only
  // (stripboard rows, containerId != null/-1) — boneyard scenes are excluded
  // by buildReportCtx. DAYBREAK rows split days.
  const rows = version.rows.slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  const scheduledRows = rows.filter((r: any) => r.containerId != null && r.containerId !== -1);
  const boundaries = scheduledRows.filter((r: any) => r.type === 'DAYBREAK').map((r: any) => r.order);
  // buildReportCtx skips rows AFTER the last daybreak (no section) — mirror it.
  const lastBoundary = boundaries[boundaries.length - 1];
  const sceneById = new Map(project.scenes.map((s: any) => [s.id, s]));
  const scheduledScenes = scheduledRows
    .filter((r: any) => r.type === 'SCENE' && r.sceneId && r.order < lastBoundary)
    .map((r: any) => sceneById.get(r.sceneId))
    .filter(Boolean);
  const scenesOfDay = (k: number) =>
    scheduledRows
      .filter((r: any) => r.type === 'SCENE' && r.sceneId && r.order > boundaries[k] && r.order < (boundaries[k + 1] ?? Infinity))
      .map((r: any) => sceneById.get(r.sceneId))
      .filter(Boolean);

  const hidden = new Set(project.hiddenCategories || []);
  const cats = [...BUILTIN_CATS.filter(c => !hidden.has(c)), ...(project.customCategories || []).map((c: any) => c.key)];
  const day1 = scenesOfDay(0);
  const day1Scenes = day1.length;
  const day1Elements = distinctIn(day1, cats, project.customCategories || []);
  // Per-category counts on day 1 — categories NOT used that day are excluded
  // by the day-scoped categories repeat, so only categories with a value render.
  const day1CatCounts = Object.fromEntries(cats.map(c => [c, distinctIn(day1, [c], project.customCategories || [])]));
  const day1CatsRendered = cats.filter(c => day1CatCounts[c] > 0);
  const totalElements = distinctIn(scheduledScenes, cats, project.customCategories || []);
  const totalScenes = scheduledScenes.length;

  expect(day1.length).toBeGreaterThan(0);
  expect(day1CatsRendered.length).toBeGreaterThan(0);

  const design = {
    id: 'counts-test', name: 'Smart Counts', createdAt: Date.now(), page: 'portrait' as const,
    blocks: [
      { id: 'f-top-el', type: 'field', field: 'smartElementCount', prefix: 'Total Elements: ' },
      { id: 'f-top-sc', type: 'field', field: 'smartSceneCount', prefix: 'Total Scenes: ' },
      { id: 'r-days', type: 'repeat', collection: 'days', gap: 8, children: [
        { id: 't-day', type: 'text', text: 'Day {{dayNumber}}' },
        { id: 'f-day-el', type: 'field', field: 'smartElementCount', prefix: 'Day Elements: ' },
        { id: 'f-day-sc', type: 'field', field: 'smartSceneCount', prefix: 'Day Scenes: ' },
        { id: 'r-cats', type: 'repeat', collection: 'categories', gap: 4, children: [
          { id: 'f-cat-el', type: 'field', field: 'smartElementCount', prefix: 'Category Elements: ' },
          { id: 'f-cat-sc', type: 'field', field: 'smartSceneCount', prefix: 'Category Scenes: ' },
        ] },
      ] },
    ],
    header: [], footer: [],
  };

  await page.addInitScript(({ projectJson, meta, designJson }) => {
    const project = JSON.parse(projectJson);
    project.reportDesigns = [JSON.parse(designJson)];
    project.activeReportId = 'counts-test';
    localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
  }, {
    projectJson: JSON.stringify(project),
    meta: { id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() },
    designJson: JSON.stringify(design),
  });

  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
  
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  await page.getByRole('button', { name: 'Preview' }).click();
  
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).toContain(`Total Elements: ${totalElements}`);
  expect(body).toContain(`Total Scenes: ${totalScenes}`);
  expect(body).toContain(`Day Elements: ${day1Elements}`);
  expect(body).toContain(`Day Scenes: ${day1Scenes}`);
  for (const c of day1CatsRendered) {
    expect(body).toContain(`Category Elements: ${day1CatCounts[c]}`);
  }
  // Categories NOT used on day 1 must not render a scoped row.
  for (const c of cats.filter(c => day1CatCounts[c] === 0)) {
    expect(body).not.toContain(`Category Elements: ${day1CatCounts[c]}`);
  }
});
