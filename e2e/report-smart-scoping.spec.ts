import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('cast → days → scenes chain: smart Shoot Time resolves per scene', async ({ page }) => {
  const seed = loadSeedProject();
  const report = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Downloads', 'Report 11.report'), 'utf8'));

  await page.addInitScript(({ projectJson, meta, design }) => {
    const project = JSON.parse(projectJson);
    project.reportDesigns = [design];
    project.activeReportId = design.id;
    localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
  }, {
    projectJson: JSON.stringify(JSON.parse(seed.raw)),
    meta: { id: seed.data.id, title: seed.data.title, lastModified: Date.now(), createdAt: Date.now() },
    design: { ...report, id: 'rep11', createdAt: Date.now() },
  });

  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(seed.data.title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Preview' }).click();
  await page.waitForTimeout(1500);

  const body = await page.evaluate(() => document.body.innerText);
  const perScene = body.includes('30m');
  const dayTotal = body.includes('9h 30m');
  expect(perScene).toBe(true);
  expect(dayTotal).toBe(false);
  expect(perScene).toBe(true);
  expect(dayTotal).toBe(false);
});
