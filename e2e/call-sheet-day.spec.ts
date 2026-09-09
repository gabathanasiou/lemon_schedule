import { test, expect, Page } from '@playwright/test';
import { loadSeedProject, openSeededProject } from './helpers';

// Call Sheet Designer completion (roadmap 10): day-scoped per-day zone editing
// and rendering.

async function openDays(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Days', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
}

async function openCallSheetEdit(page: Page) {
  const section = page.locator('[data-section="callSheet"]');
  if (!(await section.locator('button', { hasText: 'Edit' }).count())) {
    await section.getByRole('button').first().click();
  }
  await section.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('[data-call-sheet-edit]')).toBeVisible({ timeout: 8000 });
}

const readPinnedMeta = (page: Page, designId: string) => page.evaluate((id) => {
  const b: any = (window as any).__lemonSchedule;
  const p = b.getProject();
  const v = p.versions.find((x: any) => x.id === p.activeVersionId);
  const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
  return gov?.daybreakMeta?.callSheets?.[id] || null;
}, designId);

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

    // Add a text block into the zone via the palette → per-day storage.
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
    const seed = loadSeedProject();
    const project = JSON.parse(seed.raw);
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
    await page.getByRole('button', { name: 'Days', exact: true }).click();
    await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });

    const pane = page.locator('[data-day-callsheet-pane]');
    await expect(pane.getByText('TRANSPORT', { exact: true }).first()).toBeVisible({ timeout: 8000 });
    await expect(pane.getByText('Van 1', { exact: true }).first()).toBeVisible({ timeout: 8000 });
    await expect(pane.getByText('07:30', { exact: true }).first()).toBeVisible({ timeout: 8000 });
    // {{title}} resolves (token no longer printed raw).
    await expect(pane.getByText('{{title}}')).toHaveCount(0);
  });

  test('call-sheet edit shows the full day page read-only with an editable zone', async ({ page }) => {
    const seed = loadSeedProject();
    const project = JSON.parse(seed.raw);
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
    await page.getByRole('button', { name: 'Days', exact: true }).click();
    await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });

    // Call Sheet is the FIRST card now.
    const firstCard = page.locator('[data-section]').first();
    await expect(firstCard).toHaveAttribute('data-section', 'callSheet', { timeout: 8000 });

    // Open Edit → the WYSIWYG page: read-only template resolved for the day.
    const section = page.locator('[data-section="callSheet"]');
    await section.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('[data-call-sheet-page]')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/^DAY HEADER /).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('{{dayNumber}}')).toHaveCount(0);

    // The empty zone is the designer's drop target — click it to add a text block.
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
    await page.getByRole('button', { name: /^DAY / }).first().click();
    await expect(page.getByRole('menuitem').filter({ hasText: /^DAY \d/ })).toHaveCount(dayCount, { timeout: 4000 });
    await page.keyboard.press('Escape');
  });

  test('palette drag-and-drop adds a zone block in the page editor', async ({ page }) => {
    const seed = loadSeedProject();
    const project = JSON.parse(seed.raw);
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
    await page.getByRole('button', { name: 'Days', exact: true }).click();
    await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });

    await page.locator('[data-section="callSheet"]').getByRole('button', { name: 'Edit', exact: true }).click();
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

  test('stored per-day zone content renders in the day-scoped preview', async ({ page }) => {
    const seed = loadSeedProject();
    const project = JSON.parse(seed.raw);
    const design = (project.reportDesigns || []).find((d: any) => /call\s*sheet/i.test(d.name));
    expect(design, 'seed has a Call Sheet design').toBeTruthy();

    design.blocks = [{
      id: 'days', type: 'repeat', collection: 'days', children: [
        { id: 'zone', type: 'callSheetEdit', children: [{ id: 'tpl', type: 'text', text: 'TEMPLATE ZONE' }] },
      ],
    }];
    const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];
    const pinned = version.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
    pinned.daybreakMeta = { ...(pinned.daybreakMeta || {}), callSheets: { [design.id]: [{ id: 'day-t', type: 'text', text: 'PER-DAY CONTENT' }] } };

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
    await page.getByRole('button', { name: 'Days', exact: true }).click();
    await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });

    await expect(page.getByText('PER-DAY CONTENT', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('TEMPLATE ZONE', { exact: false })).toHaveCount(0);
  });
});
