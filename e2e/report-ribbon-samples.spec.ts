import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';

// Roadmap 29 Part B — reports ribbon block sample fallbacks:
//  - every cell always shows something on the designer canvas: real value →
//    sample value (PREVIEW_SAMPLES trio) → field label in italic + dimmed;
//  - an empty project (no days) renders the sample trio instead of the
//    "schedule is empty" hint so the design stays visible;
//  - custom category cells fall back to their label in italics.
// Print never renders samples (previewLimit=false) — covered by
// report-pagination.spec.ts which asserts print output stays budgeted.

function sampleRibbonDesign(extraCells: any[] = []) {
  return {
    id: 'samples-ribbon',
    name: 'Samples Test',
    createdAt: Date.now(),
    cellPaddingV: 3,
    cellPaddingH: 3,
    edgePadding: 3,
    colWidths: [20, 40, 40],
    rows: [
      {
        id: 'sr-1',
        name: 'Row 1',
        cells: [
          { id: 'sc-1', field: 'sceneNumber', prefix: 'Sc' },
          { id: 'sc-2', field: 'set' },
          { id: 'sc-3', field: 'props' },
          ...extraCells,
        ],
      },
    ],
  };
}

function sampleReportDesign() {
  return {
    id: 'samples-test',
    name: 'Ribbon Samples',
    createdAt: Date.now(),
    page: 'portrait' as const,
    blocks: [{ id: 'rb-1', type: 'ribbon', ribbonId: 'samples-ribbon', ribbonCallTimes: true }],
    header: [],
    footer: [],
  };
}

async function seedWithRibbon(page: any, mutateProject: (p: any) => void, extraCells: any[] = []) {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  mutateProject(project);
  project.ribbonDesigns = [sampleRibbonDesign(extraCells), ...(project.ribbonDesigns || [])];
  project.reportDesigns = [sampleReportDesign()];
  project.activeReportId = 'samples-test';
  await page.addInitScript(({ projectJson, meta }) => {
    const project = JSON.parse(projectJson);
    localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
  }, {
    projectJson: JSON.stringify(project),
    meta: { id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() },
  });
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
    await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  }

function emptySchedule(p: any) {
  p.scenes = [];
  const v = p.versions.find((x: any) => x.id === p.activeVersionId) || p.versions[0];
  v.rows = []; // no days — the pinned daybreak is re-seeded by LOAD, never a production day
}

test('empty project: ribbon block renders the PREVIEW_SAMPLES trio on the canvas (no empty hint)', async ({ page }) => {
  await seedWithRibbon(page, emptySchedule);

  const ribbon = page.locator('.block-type-ribbon');
  await expect(ribbon.first()).toBeVisible({ timeout: 5000 });

  // The trio: INT DAY 5 / EXT DAY 12 / INT NIGHT 20A with sample set/props.
  await expect(ribbon.getByText('KITCHEN', { exact: true }).first()).toBeVisible();
  await expect(ribbon.getByText('Frying pan, phone, mug', { exact: true }).first()).toBeVisible();
  // Scene numbers from the sample trio (affixed "Sc ").
  await expect(ribbon.getByText(/^Sc 5$/).first()).toBeVisible();
  await expect(ribbon.getByText(/^Sc 12$/).first()).toBeVisible();
  await expect(ribbon.getByText(/^Sc 20A$/).first()).toBeVisible();
  // The empty-schedule hint must NOT appear on the canvas.
  await expect(page.getByText(/schedule is empty/i)).toHaveCount(0);
});

test('seeded project: real values render with their affixes (1:1 with the stripboard)', async ({ page }) => {
  await seedWithRibbon(page, () => {});

  const ribbon = page.locator('.block-type-ribbon');
  await expect(ribbon.first()).toBeVisible({ timeout: 5000 });
  // The sceneNumber cell carries a 'Sc ' prefix — real scene numbers show it.
  await expect(ribbon.getByText(/^Sc \S+/).first()).toBeVisible();
});

test('custom category cell with no value shows its label in italic on the canvas', async ({ page }) => {
  await seedWithRibbon(
    page,
    (p) => {
      emptySchedule(p);
      p.customCategories = [{ key: 'helicopters', label: 'Helicopters', multiValue: true }];
    },
    [{ id: 'sc-4', field: 'helicopters' }],
  );

  const ribbon = page.locator('.block-type-ribbon');
  await expect(ribbon.first()).toBeVisible({ timeout: 5000 });

  // No real value and no built-in sample → the label fallback, italic + dimmed.
  const label = ribbon.getByText('Helicopters', { exact: true }).first();
  await expect(label).toBeVisible();
  const style = await label.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fontStyle: cs.fontStyle, opacity: cs.opacity };
  });
  expect(style.fontStyle).toBe('italic');
  expect(Number(style.opacity)).toBeLessThan(1);
});
