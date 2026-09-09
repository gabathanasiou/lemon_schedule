import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';

// Reports designer — per-block item filter (roadmap 100): a crew repeat
// filtered to one role renders only that role's people.

test('report item filter narrows a repeat to the chosen field values', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);

  const design = {
    id: 'filter-test', name: 'Filter Test', createdAt: Date.now(), page: 'portrait' as const,
    blocks: [
      {
        id: 'rep', type: 'repeat', collection: 'crew',
        itemFilter: { field: 'role', values: ['Producer'] },
        children: [{ id: 'txt', type: 'text', text: '{{crewName}}|{{role}}' }],
      },
    ],
    header: [], footer: [],
  };

  await page.addInitScript(({ projectJson, meta, designJson }) => {
    const project = JSON.parse(projectJson);
    project.reportDesigns = [JSON.parse(designJson)];
    project.activeReportId = 'filter-test';
    project.crewRoles = [{ key: 'director', label: 'Director' }, { key: 'producer', label: 'Producer' }];
    project.crew = { director: [{ id: 'c1', name: 'Alice' }], producer: [{ id: 'c2', name: 'Bob' }] };
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

  await expect(page.getByText('Bob|Producer', { exact: false })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Alice|Director', { exact: false })).toHaveCount(0);
});
