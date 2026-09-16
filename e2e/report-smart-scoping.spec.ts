import { test, expect } from '@playwright/test';
import { openSeededReportsDesigner } from './helpers';

// cast → days → scenes chain: a `shootTime` field inside a scenes repeat scoped
// under a day must resolve the SCENE's duration, not the day total. The design
// is inline so the spec is hermetic (the previous version read a machine-local
// `~/Downloads/Report 11.report`, so it could not run on CI).

const DESIGN = {
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
    project.reportDesigns = [DESIGN];
    project.activeReportId = DESIGN.id;
  });

  await page.getByRole('button', { name: 'Preview' }).click();

  const body = await page.evaluate(() => document.body.innerText);
  // Per-scene shoot times render (e.g. "30m"); the per-DAY total must NOT leak
  // into a scene row.
  expect(body).toContain('30m');
  expect(body).not.toContain('9h 30m');
});
