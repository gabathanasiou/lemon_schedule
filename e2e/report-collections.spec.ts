import { test, expect } from '@playwright/test';
import { openSeededReportsDesigner, loadSeedProject } from './helpers';

// Reports designer — collection resolution surfaced on the canvas: the
// cast→days→scenes smart scoping, item-100 lookup tokens + filtered badges, and
// the day-scoped call-sheet collections (item 99). Logic-layer coverage lives in
// `src/lib/__tests__/reportResolve.test.ts`; these prove the wiring.

// ---- cast → days → scenes: per-scene Shoot Time, never the day total ----

const SCOPING_DESIGN = {
  id: 'rep11',
  name: 'Report 11',
  page: 'portrait' as const,
  createdAt: Date.now(),
  header: [],
  footer: [],
  blocks: [
    {
      id: 'bmsrbjyuz23',
      type: 'repeat',
      collection: 'elements',
      category: 'cast',
      gap: 8,
      children: [
        { id: 'bmsreb6hw1', type: 'field', field: 'elementName', bold: true },
        {
          id: 'bmsreaeuh1',
          type: 'repeat',
          collection: 'days',
          gap: 8,
          children: [
            { id: 'bmsredhoe2', type: 'field', field: 'dayLabel', bold: true },
            {
              id: 'bmsrebvhf3',
              type: 'repeat',
              collection: 'scenes',
              gap: 8,
              children: [
                {
                  id: 'bmsree9et4',
                  type: 'columns',
                  cols: [
                    { id: 'bmsree9et5', width: 50, blocks: [{ id: 'bmsrec5ck1', type: 'field', field: 'sceneNumber' }] },
                    { id: 'bmsree9et6', width: 50, blocks: [{ id: 'bmsree9et3', type: 'field', field: 'shootTime' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test('cast → days → scenes chain: smart Shoot Time resolves per scene', async ({ page }) => {
  await openSeededReportsDesigner(page, (project) => {
    project.reportDesigns = [SCOPING_DESIGN];
    project.activeReportId = SCOPING_DESIGN.id;
  });

  await page.getByRole('button', { name: 'Preview' }).click();

  const body = await page.evaluate(() => document.body.innerText);
  // Per-scene shoot times render (e.g. "30m"); the per-DAY total must NOT leak
  // into a scene row.
  expect(body).toContain('30m');
  expect(body).not.toContain('9h 30m');
});

// ---- lookup tokens + filtered-block badge ----

test('lookup tokens resolve and filtered blocks badge on the canvas', async ({ page }) => {
  const seed = loadSeedProject().data;
  const firstRole = (seed.crewRoles || [])[0];
  const firstPerson = firstRole ? (seed.crew?.[firstRole.key] || [])[0] : undefined;
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

  await openSeededReportsDesigner(page, (project) => {
    project.reportDesigns = [design];
    project.activeReportId = design.id;
  });

  await expect(page.getByText(/^ROLE:/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(`ROLE:${firstRole.label}`, { exact: false }).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/^DAY:/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('{{lookup', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Filtered', { exact: true }).first()).toBeVisible({ timeout: 8000 });
});

// ---- day-scoped call-sheet collections ----

const DAY_CALLS_DESIGN = {
  id: 'day-calls-test', name: 'Day Calls Test', createdAt: Date.now(), page: 'portrait' as const,
  blocks: [
    {
      id: 'days', type: 'repeat', collection: 'days',
      children: [
        { id: 'ec', type: 'repeat', collection: 'elementCallsOfDay', children: [{ id: 'ect', type: 'text', text: 'EC:{{elementCallName}}={{call_onSet}}' }] },
        { id: 'dc', type: 'repeat', collection: 'departmentCallsOfDay', children: [{ id: 'dct', type: 'text', text: 'DC:{{departmentLabel}}={{departmentCallTime}}' }] },
        { id: 'lc', type: 'repeat', collection: 'locationsOfDay', children: [{ id: 'lct', type: 'text', text: 'LOC:{{locationName}}' }] },
      ],
    },
  ],
  header: [], footer: [],
};

test('day call-sheet collections resolve inside a days repeat', async ({ page }) => {
  await openSeededReportsDesigner(page, (project) => {
    project.reportDesigns = [DAY_CALLS_DESIGN];
    project.activeReportId = DAY_CALLS_DESIGN.id;
    // Deterministic day-1 location + a department precall.
    project.locations = [{ id: 'loc-test', name: 'TEST LOCATION', type: 'set' }];
    project.locationTypes = [{ key: 'set', label: 'Set' }];
    project.crewTemplate = { departmentPrecalls: { Camera: '-30m' } };
    const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];
    const pinned = version.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
    if (pinned) pinned.daybreakMeta = { ...(pinned.daybreakMeta || {}), locationId: 'loc-test' };
  });

  await expect(page.getByText(/^EC:/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/^DC:Camera=/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('LOC:TEST LOCATION', { exact: false }).first()).toBeVisible({ timeout: 8000 });
});
