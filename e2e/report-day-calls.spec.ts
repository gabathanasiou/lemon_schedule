import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';

// Reports designer — item 99's day-scoped call-sheet collections:
// elementCallsOfDay, departmentCallsOfDay, locationsOfDay resolve inside a
// days repeat and render through the normal block tree.

const design = {
  id: 'day-calls-test', name: 'Day Calls Test', createdAt: Date.now(), page: 'portrait' as const,
  blocks: [
    {
      id: 'days', type: 'repeat', collection: 'days',
      children: [
        {
          id: 'ec', type: 'repeat', collection: 'elementCallsOfDay',
          children: [
            { id: 'ect', type: 'text', text: 'EC:{{elementCallName}}={{call_onSet}}' },
          ],
        },
        {
          id: 'dc', type: 'repeat', collection: 'departmentCallsOfDay',
          children: [
            { id: 'dct', type: 'text', text: 'DC:{{departmentLabel}}={{departmentCallTime}}' },
          ],
        },
        {
          id: 'lc', type: 'repeat', collection: 'locationsOfDay',
          children: [
            { id: 'lct', type: 'text', text: 'LOC:{{locationName}}' },
          ],
        },
      ],
    },
  ],
  header: [], footer: [],
};

test('day call-sheet collections resolve inside a days repeat', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);

  // A location on day 1's governing (pinned) daybreak + a department precall
  // give the department/location collections deterministic data.
  project.reportDesigns = [design];
  project.activeReportId = design.id;
  project.locations = [{ id: 'loc-test', name: 'TEST LOCATION', type: 'set' }];
  project.locationTypes = [{ key: 'set', label: 'Set' }];
  project.crewTemplate = { departmentPrecalls: { Camera: '-30m' } };
  const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];
  const pinned = version.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
  if (pinned) pinned.daybreakMeta = { ...(pinned.daybreakMeta || {}), locationId: 'loc-test' };

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

  await expect(page.getByText(/^EC:/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/^DC:Camera=/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('LOC:TEST LOCATION', { exact: false }).first()).toBeVisible({ timeout: 8000 });
});
