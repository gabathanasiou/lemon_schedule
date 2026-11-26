import { test, expect } from '@playwright/test';
import { openSeededProject, loadSeedProject, seedProjectScript, seedTitle, seedLeadCast, seedElement, waitForPersistedProject } from './helpers';

test('reports designer lives in design tab; collection menu uses submenu', async ({ page }) => {
  await openSeededProject(page, undefined, { editorMode: 'floating' });

  const designTab = page.getByRole('button', { name: 'Design', exact: true });
  await designTab.click();
  const designerSubTab = page.getByRole('button', { name: 'Reports Designer', exact: true });
  await expect(designerSubTab).toBeVisible({ timeout: 5000 });
  await designerSubTab.click();
  await page.waitForSelector('text=Add Report', { timeout: 5000 }).catch(() => {});

  const reportsTab = page.getByRole('button', { name: 'Reports', exact: true });
  await reportsTab.click();
  await expect(page.getByRole('button', { name: 'Reports Designer', exact: true })).toHaveCount(0);
});

test('table over menu drops cast and nests categories in an elements submenu', async ({ page }) => {
  await openSeededProject(page, undefined, { editorMode: 'floating' });

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  
  const tableOver = page.getByRole('button', { name: 'Scenes', exact: true });
  await tableOver.click();

  const menu = page.locator('.ui-menu');
  for (const label of ['Scenes', 'Days', 'Elements', 'Crew']) {
    await expect(menu.getByText(label, { exact: true })).toBeVisible({ timeout: 3000 });
  }
  await expect(menu.getByText('Cast', { exact: true })).toHaveCount(0);

  await menu.getByText('Elements', { exact: true }).click();
  await expect(page.locator('.ui-menu').getByText('Props', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.ui-menu').getByText('Cast', { exact: true })).toBeVisible({ timeout: 3000 });

  await page.locator('.ui-menu').getByText('Cast', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Elements · Cast', exact: true })).toBeVisible({ timeout: 3000 });
});

test('reports designer page renders at the true print width (view modes are display-only)', async ({ page }) => {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.addInitScript(() => localStorage.setItem('lemon_schedule_view_mode', 'portrait'));
  await page.goto('/lemon_schedule/');
  await page.getByText(seed.data.title, { exact: true }).first().click({ timeout: 8000 });

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();

  const sheet = page.getByTestId('report-page');
  const read = () => sheet.evaluate(el => ({
    width: (el as HTMLElement).style.width,
    zoom: parseFloat((el as HTMLElement).style.zoom || '1'),
  }));

  // The seeded design is landscape: the designer page IS the print page
  // (REPORT_PAGE_METRICS.landscape.contentWidth 960 + 28px gutters).
  const first = await read();
  expect(first.width).toBe('1016px');

  // A4 Portrait switches the design page → the portrait print width.
  await page.getByRole('button', { name: /View:/ }).click();
  await page.locator('.ui-menu').getByText('A4 Portrait', { exact: true }).click();
  const portrait = await read();
  expect(portrait.width).toBe('753px');
  expect(portrait.zoom).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: /View:/ }).click();
  await page.locator('.ui-menu').getByText('A4 Landscape', { exact: true }).click();
  const landscape = await read();
  expect(landscape.width).toBe('1016px');
  expect(landscape.zoom).toBeLessThanOrEqual(1);

  // Landscape always fits the viewport now — the canvas never scrolls sideways.
  const canvas = page.getByTestId('report-canvas');
  const maxScroll = await canvas.evaluate(el => el.scrollWidth - el.clientWidth);
  expect(maxScroll).toBeLessThanOrEqual(1);

  // Full Width keeps the print page width; only the display zoom changes.
  await page.getByRole('button', { name: /View:/ }).click();
  await page.locator('.ui-menu').getByText('Full Width', { exact: true }).click();
  const full = await read();
  expect(full.width).toBe('1016px');
  expect(full.zoom).toBeGreaterThan(0);

  await page.getByRole('button', { name: /View:/ }).click();
  await page.locator('.ui-menu').getByText('A4 Portrait', { exact: true }).click();
  expect((await read()).width).toBe('753px');
});

test('image block resize stores imageWidth (aspect-locked) and persists', async ({ page }) => {
  await openSeededProject(page, undefined, { editorMode: 'floating' });
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();

  const ids = await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const project = b.getState().present;
    const stored = localStorage.getItem('lemon_schedule_report_active_design');
    const design = project.reportDesigns.find((d: any) => d.id === stored)
      || project.reportDesigns.find((d: any) => d.id === project.activeReportId)
      || project.reportDesigns[0];
    const block = {
      id: 'e2e-image-block',
      type: 'image',
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      imageWidth: 50,
    };
    b.dispatch({ type: 'UPDATE_REPORT_DESIGN', payload: { id: design.id, blocks: [...design.blocks, block] } });
    return { designId: design.id, blockId: block.id };
  });

  const image = page.locator('[data-image-block]').first();
  await expect(image).toBeVisible();
  await image.click();
  const handle = page.locator('[data-image-resize-handle]').first();
  await expect(handle).toBeVisible();

  const hb = await handle.boundingBox();
  expect(hb).not.toBeNull();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb!.x + hb!.width / 2 + 60, hb!.y + hb!.height / 2, { steps: 5 });
  await page.mouse.up();

  const resized = await page.evaluate((blockId) => {
    const b = (window as any).__lemonSchedule;
    const design = b.getState().present.reportDesigns.find((d: any) =>
      (d.blocks || []).some((x: any) => x.id === blockId));
    const block = design?.blocks.find((x: any) => x.id === blockId);
    return block ? { width: block.imageWidth, height: block.imageHeight } : null;
  }, ids.blockId);
  expect(resized).not.toBeNull();
  expect(resized!.width).toBeGreaterThan(50);
  expect(resized!.width).toBeLessThanOrEqual(100);
  // Aspect-locked drag on a natural-height image stays natural (no px box).
  expect(resized!.height).toBeUndefined();

  await waitForPersistedProject(page, `p.reportDesigns.some(d => (d.blocks || []).some(b => b.id === '${ids.blockId}' && typeof b.imageWidth === 'number' && b.imageWidth > 50))`);
});

test('keys/values toggle switches text blocks and table cells', async ({ page }) => {
  await openSeededProject(page, undefined, { editorMode: 'floating' });
  const lead = await seedLeadCast(page);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  await expect(page.getByText(`${seedTitle()} — One-Liner`)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(lead.name).first()).toBeVisible({ timeout: 3000 });

  await page.getByRole('button', { name: 'Fields', exact: true }).click();

  // Fields: text blocks become live chip editors (field labels), collection
  // tables render raw {{keys}} — no resolved values anywhere.
  const titleCard = page.locator('.block-card.block-type-text').filter({ hasText: 'One-Liner' }).first();
  await expect(titleCard.locator('.rt-token').first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('{{cast}}').first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(lead.name)).toHaveCount(0);

  await page.getByRole('button', { name: 'Values', exact: true }).click();

  await expect(page.getByText(`${seedTitle()} — One-Liner`)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(lead.name).first()).toBeVisible({ timeout: 3000 });
});

test('repeat nested in a categories repeat offers Elements (of this category)', async ({ page }) => {
  await openSeededProject(page, undefined, { editorMode: 'floating' });

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  await page.getByText('Editing:', { exact: false }).click();
  await page.locator('.ui-menu').getByText('Category Breakdown', { exact: true }).click();
  
  await page.getByText('Repeat: Categories', { exact: true }).click();
  
  await page.getByRole('button', { name: 'Repeat', exact: true }).dragTo(page.locator('.repeat-children .block-dropzone').last());
  
  const repeatOver = page.getByRole('button', { name: 'Scenes (of this category)', exact: true });
  await expect(repeatOver).toBeVisible({ timeout: 3000 });
  await repeatOver.click();

  const menu = page.locator('.ui-menu');
  await expect(menu.getByText('Elements (of this category)', { exact: true })).toBeVisible({ timeout: 3000 });

  await menu.getByText('Elements (of this category)', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Elements (of this category)', exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('Repeat: Elements (of this category)', { exact: true })).toBeVisible({ timeout: 3000 });
});

test('cast repeat exposes Cast ID / Cast ID & Name attributes and renders them', async ({ page }) => {
  await openSeededProject(page, undefined, { editorMode: 'floating' });
  const lead = await seedLeadCast(page);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
  
  const paletteCast = page.getByRole('button', { name: 'Cast ID', exact: true });
  await expect(paletteCast).toHaveCount(0);

  const repeatOver = page.getByRole('button', { name: 'Scenes', exact: true });
  await repeatOver.click();
  await page.locator('.ui-menu').getByText('Elements', { exact: true }).click();
  await page.locator('.ui-menu').getByText('Cast', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Elements · Cast', exact: true })).toBeVisible({ timeout: 3000 });

  await expect(page.getByRole('button', { name: 'Cast ID', exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole('button', { name: 'Cast ID & Name', exact: true })).toBeVisible({ timeout: 3000 });

  await page.getByRole('button', { name: 'Cast ID & Name', exact: true }).dragTo(page.getByText('Drop inside repeat (or click to add text)').last());
    await expect(page.getByText(`${lead.id}. ${lead.name}`, { exact: true })).toBeVisible({ timeout: 3000 });
});

test('element work/shoot day attributes fill for mixed-case elements', async ({ page }) => {
  await openSeededProject(page, undefined, { editorMode: 'floating' });
  const prop = await seedElement(page, 'props');
  expect(prop.name).toBeTruthy();

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  await page.getByText('Editing:', { exact: false }).click();
  await page.locator('.ui-menu').getByText('Category Breakdown', { exact: true }).click();
  
  await page.getByRole('button', { name: 'Preview' }).click();
  
  // A props element's Shoot Days cell lists real production days (the
  // category breakdown resolves elements case-insensitively against scenes).
  const row = page.locator('.report-table-cols > div').filter({ hasText: prop.name }).first();
  await expect(row).toBeVisible({ timeout: 3000 });
  await expect(row).toContainText(/Day \d+/, { timeout: 3000 });
});

test('category breakdown template iterates categories; skip empty + exclude work', async ({ page }) => {
  await openSeededProject(page, undefined, { editorMode: 'floating' });
  const lead = await seedLeadCast(page);

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  await page.getByText('Editing:', { exact: false }).click();
  await page.locator('.ui-menu').getByText('Category Breakdown', { exact: true }).click();
  
  await page.getByRole('button', { name: 'Preview' }).click();
    for (const label of ['Cast', 'Props', 'Wardrobe']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 3000 });
  }
  await expect(page.getByText(lead.name, { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('Set', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByText('Repeat: Categories').click();
  
  const skipEmpty = page.getByText('Skip categories with no elements');
  await expect(skipEmpty).toBeVisible({ timeout: 3000 });

  await page.getByRole('button', { name: 'None' }).click();
  await page.locator('.ui-menu').getByText('Cast', { exact: true }).click();
  await page.keyboard.press('Escape');
  
  await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Props', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('Cast', { exact: true })).toHaveCount(0);
});
