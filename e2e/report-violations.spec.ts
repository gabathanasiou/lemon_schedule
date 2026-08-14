import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';

// Expected values are computed by REPLICATING checkSection's logic for the two
// injected rules (MAX_HOURS cast '1', CAST_CONFLICT A=['1','2'] vs B=['3','4'])
// over the app's section model (day N = content between daybreak N-1 and N;
// trailing content after the last daybreak is excluded).

const MAX_HOURS = 1; // hours — flags days where cast '1' exceeds 60min
const RULES = [
  { id: 'r-max', type: 'MAX_HOURS', castId: '1', maxHours: MAX_HOURS },
  { id: 'r-conf', type: 'CAST_CONFLICT', castIds: ['1', '2'], conflictCastIds: ['3', '4'] },
];

function expectedDayViolations(dayRows: any[], sceneById: Map<string, any>): number {
  let total = 0;
  for (const r of dayRows) {
    const sc = sceneById.get(r.sceneId);
    if (sc && sc.cast.split(',').map((c: string) => c.trim()).includes('1')) total += r.estimatedDuration || 0;
  }
  const maxHoursFlag = total > MAX_HOURS * 60 ? 1 : 0;
  const castSet = new Set<string>();
  for (const r of dayRows) {
    const sc = sceneById.get(r.sceneId);
    if (!sc) continue;
    for (const c of sc.cast.split(',').map((x: string) => x.trim())) if (c) castSet.add(c);
  }
  const conflictFlag = (['1', '2'].some(c => castSet.has(c)) && ['3', '4'].some(c => castSet.has(c))) ? 1 : 0;
  return maxHoursFlag + conflictFlag;
}

test('violation count/details render smart per day and grouped per rule type', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.rules = RULES;
  const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];

  const rows = version.rows.filter((r: any) => r.containerId != null && r.containerId !== -1).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  const boundaries = rows.filter((r: any) => r.type === 'DAYBREAK').map((r: any) => r.order);
  const sceneById = new Map<string, any>(project.scenes.map((s: any) => [s.id, s]));
  const dayRowsOf = (k: number) =>
    rows.filter((r: any) => r.type === 'SCENE' && r.sceneId && r.order > boundaries[k] && r.order < boundaries[k + 1]);

  const perDay = [];
  let maxHoursTotal = 0;
  let conflictTotal = 0;
  for (let k = 0; k < boundaries.length - 1; k++) {
    const dr = dayRowsOf(k);
    perDay.push(expectedDayViolations(dr, sceneById));
    let total = 0;
    for (const r of dr) {
      const sc = sceneById.get(r.sceneId);
      if (sc && sc.cast.split(',').map((c: string) => c.trim()).includes('1')) total += r.estimatedDuration || 0;
    }
    if (total > MAX_HOURS * 60) maxHoursTotal++;
    const castSet = new Set<string>();
    for (const r of dr) {
      const sc = sceneById.get(r.sceneId);
      if (!sc) continue;
      for (const c of sc.cast.split(',').map((x: string) => x.trim())) if (c) castSet.add(c);
    }
    if (['1', '2'].some(c => castSet.has(c)) && ['3', '4'].some(c => castSet.has(c))) conflictTotal++;
  }

  const total = maxHoursTotal + conflictTotal;
  const day1 = perDay[0];

  const design = {
    id: 'viol-test', name: 'Violations', createdAt: Date.now(), page: 'portrait' as const,
    blocks: [
      { id: 'f-total', type: 'field', field: 'smartViolationCount', prefix: 'Total Violations: ' },
      { id: 'r-days', type: 'repeat', collection: 'days', gap: 8, children: [
        { id: 't-day', type: 'text', text: 'Day {{dayNumber}}' },
        { id: 'f-day-v', type: 'field', field: 'smartViolationCount', prefix: 'Day Violations: ' },
      ] },
      { id: 'r-types', type: 'repeat', collection: 'violationTypes', gap: 6, children: [
        { id: 'f-type', type: 'field', field: 'violationType' },
        { id: 'f-type-c', type: 'field', field: 'violationTypeCount', prefix: 'Count: ' },
        { id: 'f-type-m', type: 'field', field: 'violationTypeMessages', prefix: 'Details: ' },
      ] },
    ],
    header: [], footer: [],
  };

  await page.addInitScript(({ projectJson, meta, designJson }) => {
    const project = JSON.parse(projectJson);
    project.reportDesigns = [JSON.parse(designJson)];
    project.activeReportId = 'viol-test';
    localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
  }, {
    projectJson: JSON.stringify(project),
    meta: { id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() },
    designJson: JSON.stringify(design),
  });

  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Preview' }).click();
  await page.waitForTimeout(1500);

  const body = await page.evaluate(() => document.body.innerText);
  expect(maxHoursTotal).toBeGreaterThan(0);
  expect(conflictTotal).toBeGreaterThan(0);
  expect(body).toContain(`Total Violations: ${total}`);
  expect(body).toContain(`Day Violations: ${day1}`);
  expect(body).toContain('Max Hours');
  expect(body).toContain(`Count: ${maxHoursTotal}`);
  expect(body).toContain('Can only work 1h');
  expect(body).toContain('Cast Conflict');
  expect(body).toContain(`Count: ${conflictTotal}`);
  expect(body).toContain('Cast conflict:');
});
