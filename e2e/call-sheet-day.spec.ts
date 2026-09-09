import { test, expect, Page } from '@playwright/test';
import { loadSeedProject, openSeededProject } from './helpers';

// Call Sheet Designer completion (roadmap 10): day-scoped per-day zone editing
// and rendering. The editor is reached from the Days header's "Call Sheet"
// button; its Preview toggle shows the paginated day report.

async function openDays(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Day Manager', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
}

async function openCallSheetEdit(page: Page) {
  await page.locator('[data-day-manager] header').getByRole('button', { name: /Call Sheet/ }).click();
  await expect(page.locator('[data-call-sheet-edit]')).toBeVisible({ timeout: 8000 });
}

const readPinnedMeta = (page: Page, designId: string) => page.evaluate((id) => {
  const b: any = (window as any).__lemonSchedule;
  const p = b.getProject();
  const v = p.versions.find((x: any) => x.id === p.activeVersionId);
  const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
  return gov?.daybreakMeta?.callSheets?.[id] || null;
}, designId);

async function seedWithDesign(page: Page, raw: string, mutate: (project: any) => void) {
  const project = JSON.parse(raw);
  mutate(project);
  await page.addInitScript(({ projectJson, meta }) => {
    const p = JSON.parse(projectJson);
    localStorage.setItem('lemon_schedule_project_v1_' + p.id, JSON.stringify(p));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
  }, {
    projectJson: JSON.stringify(project),
    meta: { id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() },
  });
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Day Manager', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
}

test.describe('Call Sheet Designer (roadmap 10)', () => {
  test('per-day zone edit writes daybreakMeta.callSheets and resets to template', async ({ page }) => {
    await openDays(page);
    await openCallSheetEdit(page);

    const designId = await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const d = (p.reportDesigns || []).find((x: any) => /call\s*sheet/i.test(x.name)) || (p.reportDesigns || [])[0];
      return d?.id || '';
    });
    expect(designId).not.toBe('');

    // The zone-less seed design falls back to the zone-mode designer: add a
    // text block via its palette → per-day storage.
    await page.getByRole('button', { name: 'Text', exact: true }).first().click();
    await expect.poll(async () => {
      const blocks = await readPinnedMeta(page, designId);
      return Array.isArray(blocks) && blocks.length > 0;
    }, { timeout: 5000 }).toBe(true);

    // Reset to template clears the override.
    await page.getByRole('button', { name: /Reset to template/ }).click();
    await expect.poll(async () => (await readPinnedMeta(page, designId)) === null, { timeout: 5000 }).toBe(true);
  });

  test('custom-rows table renders literal cells and resolves tokens', async ({ page }) => {
    await seedWithDesign(page, loadSeedProject().raw, project => {
      project.reportDesigns = [{
        id: 'cs-custom', name: 'Call Sheet', createdAt: Date.now(), page: 'portrait',
        blocks: [{
          id: 'days', type: 'repeat', collection: 'days', children: [{
            id: 't', type: 'table', custom: true, showHeader: true, collection: 'days',
            columns: [
              { id: 'c1', field: '', label: 'TRANSPORT', width: 50, align: 'left' },
              { id: 'c2', field: '', label: 'TIME', width: 50, align: 'center' },
            ],
            customRows: [
              { id: 'r1', cells: ['Van 1', '07:30'] },
              { id: 'r2', cells: ['{{title}}', '08:00'] },
            ],
          }],
        }],
        header: [], footer: [],
      }];
      project.activeReportId = 'cs-custom';
    });

    await openCallSheetEdit(page);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const editor = page.locator('[data-call-sheet-edit]');
    await expect(editor.getByText('TRANSPORT', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(editor.getByText('Van 1', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(editor.getByText('07:30', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(editor.getByText('{{title}}')).toHaveCount(0);
  });

  test('call-sheet edit shows the full day page read-only with an editable zone', async ({ page }) => {
    await seedWithDesign(page, loadSeedProject().raw, project => {
      project.reportDesigns = [{
        id: 'cs-wysiwyg', name: 'Call Sheet', createdAt: Date.now(), page: 'portrait',
        blocks: [{
          id: 'days', type: 'repeat', collection: 'days', children: [
            { id: 'hdr', type: 'text', text: 'DAY HEADER {{dayNumber}} {{dayDate}}' },
            { id: 'zone', type: 'callSheetEdit', children: [] },
          ],
        }],
        header: [], footer: [],
      }];
      project.activeReportId = 'cs-wysiwyg';
    });

    await openCallSheetEdit(page);

    // WYSIWYG page: read-only template resolved for the day.
    await expect(page.locator('[data-call-sheet-page]')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/^DAY HEADER /).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('{{dayNumber}}')).toHaveCount(0);

    // The empty zone is the designer's drop target — click it to add a block.
    await page.getByText(/No blocks yet/).click();
    await expect(page.locator('[data-call-sheet-page] [data-block-id]').first()).toBeAttached({ timeout: 8000 });
    await expect.poll(() => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const d = (p.reportDesigns || []).find((x: any) => x.id === 'cs-wysiwyg');
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
      const blocks = gov?.daybreakMeta?.callSheets?.[d?.id] || [];
      return Array.isArray(blocks) && blocks.length === 1;
    }), { timeout: 5000 }).toBe(true);

    // Preview toggles to the paginated day-scoped report and back.
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('[data-call-sheet-edit] .report-page').first()).toBeAttached({ timeout: 8000 });
    await expect(page.getByText(/^DAY HEADER /).first()).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('[data-call-sheet-page]')).toBeVisible({ timeout: 8000 });

    // The day switcher lists every production day (dark dropdown).
    const dayCount = await page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const rows = b.getRows();
      return (rows.sections || []).filter((s: any) => !s.isPinned).length;
    });
    await page.getByRole('button', { name: /Select day/ }).first().click();
    await expect(page.getByRole('menuitem').filter({ hasText: /^DAY \d/ })).toHaveCount(dayCount, { timeout: 4000 });
    await page.keyboard.press('Escape');
  });

  test('palette drag-and-drop adds a zone block in the page editor', async ({ page }) => {
    await seedWithDesign(page, loadSeedProject().raw, project => {
      project.reportDesigns = [{
        id: 'cs-dnd', name: 'Call Sheet', createdAt: Date.now(), page: 'portrait',
        blocks: [{
          id: 'days', type: 'repeat', collection: 'days', children: [
            { id: 'hdr', type: 'text', text: 'DAY HEADER {{dayNumber}}' },
            { id: 'zone', type: 'callSheetEdit', children: [] },
          ],
        }],
        header: [], footer: [],
      }];
      project.activeReportId = 'cs-dnd';
    });

    await openCallSheetEdit(page);
    await expect(page.locator('[data-call-sheet-page]')).toBeVisible({ timeout: 8000 });

    // Drag the palette's Text block onto the empty zone drop target.
    await page.getByRole('button', { name: 'Text', exact: true }).first().dragTo(page.getByText(/No blocks yet/));

    await expect(page.locator('[data-call-sheet-page] [data-block-id]').first()).toBeAttached({ timeout: 8000 });
    await expect.poll(() => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const d = (p.reportDesigns || []).find((x: any) => x.id === 'cs-dnd');
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
      const blocks = gov?.daybreakMeta?.callSheets?.[d?.id] || [];
      return Array.isArray(blocks) && blocks.length === 1;
    }), { timeout: 5000 }).toBe(true);
  });

  test('stored per-day zone content renders in the editor preview', async ({ page }) => {
    await seedWithDesign(page, loadSeedProject().raw, project => {
      const design = {
        id: 'cs-store', name: 'Call Sheet', createdAt: Date.now(), page: 'portrait' as const,
        blocks: [{
          id: 'days', type: 'repeat', collection: 'days', children: [
            { id: 'zone', type: 'callSheetEdit', children: [{ id: 'tpl', type: 'text', text: 'TEMPLATE ZONE' }] },
          ],
        }],
        header: [], footer: [],
      };
      project.reportDesigns = [design];
      project.activeReportId = design.id;
      const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];
      const pinned = version.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
      pinned.daybreakMeta = { ...(pinned.daybreakMeta || {}), callSheets: { [design.id]: [{ id: 'day-t', type: 'text', text: 'PER-DAY CONTENT' }] } };
    });

    await openCallSheetEdit(page);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('[data-call-sheet-edit]').getByText('PER-DAY CONTENT', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[data-call-sheet-edit]').getByText('TEMPLATE ZONE', { exact: false })).toHaveCount(0);
  });

  test('header right-click on a live call-sheet grid opens the stages settings modal (roadmap 110)', async ({ page }) => {
    await seedWithDesign(page, loadSeedProject().raw, project => {
      project.reportDesigns = [{
        id: 'cs-grids', name: 'Call Sheet', createdAt: Date.now(), page: 'portrait',
        blocks: [{
          id: 'days', type: 'repeat', collection: 'days', children: [
            { id: 'ct', type: 'callTimes', collection: 'elementCallsOfDay' },
            { id: 'zone', type: 'callSheetEdit', children: [] },
          ],
        }],
        header: [], footer: [],
      }];
      project.activeReportId = 'cs-grids';
    });

    await openCallSheetEdit(page);
    const grid = page.locator('[data-call-sheet-page] [data-day-times-glide]').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
    await grid.scrollIntoViewIfNeeded();
    const box = (await grid.boundingBox())!;
    await page.mouse.click(box.x + 120, box.y + 15, { button: 'right' });

    const item = page.getByRole('menuitem', { name: 'Edit Call Time Stages…' });
    await expect(item).toBeVisible({ timeout: 4000 });
    await item.click();

    const modal = page.getByRole('dialog').last();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByRole('button', { name: 'Call stages' })).toBeVisible();
  });
});
