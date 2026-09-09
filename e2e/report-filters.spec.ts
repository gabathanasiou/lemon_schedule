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

// Item 100 UX: fields with a finite value set get a multi-select dropdown of
// real values; only free-text fields keep the comma box.
test('discrete filter fields use a value dropdown, not a free-text box', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);

  const design = {
    id: 'filter-dd', name: 'Filter Dropdown', createdAt: Date.now(), page: 'portrait' as const,
    blocks: [{
      id: 'rep', type: 'repeat', collection: 'scenes',
      itemFilter: { field: 'intExt', values: [] },
      children: [{ id: 'txt', type: 'text', text: '{{sceneNumber}} {{intExt}}' }],
    }],
    header: [], footer: [],
  };

  await page.addInitScript(({ projectJson, meta, designJson }) => {
    const project = JSON.parse(projectJson);
    project.reportDesigns = [JSON.parse(designJson)];
    project.activeReportId = 'filter-dd';
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
  await page.locator('.block-card.block-type-repeat').first().click({ position: { x: 3, y: 3 } });

  // The values control is the GroupedSelect dropdown trigger, not a text input.
  const trigger = page.getByRole('button', { name: 'Values…' }).first();
  await expect(trigger).toBeVisible({ timeout: 5000 });
  await expect(page.getByPlaceholder('Values…')).toHaveCount(0);

  // Picking a value writes it to the block filter.
  await trigger.click();
  await page.getByText('INT', { exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    return b.getProject().reportDesigns.find((d: any) => d.id === 'filter-dd')?.blocks?.[0]?.itemFilter?.values;
  })).toEqual(['INT']);
});
