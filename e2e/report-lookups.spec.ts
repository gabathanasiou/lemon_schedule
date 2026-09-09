import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';

// Reports designer — item 100 lookup tokens resolve a specific item's
// attribute anywhere, and a filtered block shows its canvas badge.

test('lookup tokens resolve and filtered blocks badge on the canvas', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);

  const firstRole = (project.crewRoles || [])[0];
  const firstPerson = firstRole ? (project.crew?.[firstRole.key] || [])[0] : undefined;
  expect(firstPerson, 'seed has crew').toBeTruthy();

  const design = {
    id: 'lookup-test', name: 'Lookup Test', createdAt: Date.now(), page: 'portrait' as const,
    blocks: [
      { id: 't1', type: 'text', text: `ROLE:{{lookup.crew.role.${firstPerson.id}}}` },
      { id: 't2', type: 'text', text: 'DAY:{{lookup.days.dayDate.1}}' },
      {
        id: 'rep', type: 'repeat', collection: 'crew',
        itemFilter: { field: 'role', values: ['__no_such_role__'] },
        children: [{ id: 'tx', type: 'text', text: 'x' }],
      },
    ],
    header: [], footer: [],
  };

  project.reportDesigns = [design];
  project.activeReportId = design.id;

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

  await expect(page.getByText(/^ROLE:/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(`ROLE:${firstRole.label}`, { exact: false }).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/^DAY:/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('{{lookup', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Filtered', { exact: true }).first()).toBeVisible({ timeout: 8000 });
});
