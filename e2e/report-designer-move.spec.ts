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

  // Roadmap 366 — the 3×3 anchor + fit gating, through the chrome.
  const chrome = page.locator('.block-chrome');
  await chrome.getByLabel('Image height').fill('160');
  await chrome.getByLabel('Image height').press('Enter');
  await chrome.getByRole('button', { name: 'Cover', exact: true }).click();
  await chrome.getByRole('button', { name: 'Align right, anchor bottom' }).click();

  const imageStyles = await page.locator('[data-image-block]').evaluate(wrap => {
    const img = wrap.querySelector('img')!;
    const card = wrap.closest('[data-block-id]') as HTMLElement | null;
    return {
      fit: getComputedStyle(img).objectFit,
      objectPosition: (img as HTMLImageElement).style.objectPosition,
      // Roadmap 368: the block CARD owns the box alignment, not the wrapper.
      marginLeft: card?.style.marginLeft ?? '',
    };
  });
  expect(imageStyles.fit).toBe('cover');
  expect(imageStyles.objectPosition).toBe('right bottom');
  // Auto margins resolve to px in computed style — read the authored value.
  expect(imageStyles.marginLeft).toBe('auto');
  // Right-aligned images resize from the LEFT edge (the right edge is anchored).
  await expect(page.locator('[data-image-resize-handle="left"]')).toBeVisible();

  await waitForPersistedProject(page, `p.reportDesigns.some(d => (d.blocks || []).some(b => b.id === '${ids.blockId}' && typeof b.imageWidth === 'number' && b.imageWidth > 50 && b.imageAlign === 'right' && b.imageAnchorY === 'bottom' && b.imageHeight === 160))`);

  // Roadmap 369 — the Auto reset clears a frozen height.
  await chrome.getByRole('button', { name: 'Auto', exact: true }).click();
  await waitForPersistedProject(page, `p.reportDesigns.some(d => (d.blocks || []).some(b => b.id === '${ids.blockId}' && b.imageHeight === undefined))`);
});

test('report table column drag to the floor never yields negative widths', async ({ page }) => {
  // Docked inspector: the floating block editor can cover the resize strip.
  await openSeededProject(page, undefined);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();

  const blockId = 'e2e-width-table';
  await page.evaluate((id) => {
    const b = (window as any).__lemonSchedule;
    const project = b.getState().present;
    const stored = localStorage.getItem('lemon_schedule_report_active_design');
    const design = project.reportDesigns.find((d: any) => d.id === stored)
      || project.reportDesigns.find((d: any) => d.id === project.activeReportId)
      || project.reportDesigns[0];
    const block = {
      id,
      type: 'table',
      collection: 'scenes',
      showHeader: true,
      columns: [
        { id: 'w1', field: 'sceneNumber', width: 1 },
        { id: 'w2', field: 'set', width: 1 },
        { id: 'w3', field: 'description', width: 98 },
      ],
    };
    b.dispatch({ type: 'UPDATE_REPORT_DESIGN', payload: { id: design.id, blocks: [...design.blocks, block] } });
  }, blockId);

  const card = page.locator(`[data-block-id="${blockId}"]`);
  await expect(card).toBeVisible();
  await card.getByText('Table: Scenes', { exact: true }).click();

  const handle = card.getByTitle('Resize column 1/2 (double-click to even)');
  await expect(handle).toBeVisible();
  const hb = await handle.boundingBox();
  expect(hb).not.toBeNull();
  const cx = hb!.x + hb!.width / 2;
  const cy = hb!.y + hb!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 240, cy, { steps: 6 });

  // The shared pill follows the drag: one badge per affected column.
  await expect(page.locator('[data-resize-badge]')).toHaveCount(2);
  await expect(page.locator('[data-resize-badge]').first()).toContainText('%');

  await page.mouse.up();
  await expect(page.locator('[data-resize-badge]')).toHaveCount(0);

  const widths = await page.evaluate((id) => {
    const b = (window as any).__lemonSchedule;
    const design = b.getState().present.reportDesigns.find((d: any) =>
      (d.blocks || []).some((x: any) => x.id === id));
    const block = design?.blocks.find((x: any) => x.id === id);
    return block?.columns?.map((c: any) => c.width) ?? null;
  }, blockId);
  expect(widths).not.toBeNull();
  expect(widths.every((w: number) => Number.isFinite(w) && w > 0)).toBe(true);
  expect(Math.round(widths.reduce((s: number, w: number) => s + w, 0) * 100) / 100).toBe(100);
});

test('columns block resize keeps all three columns proportional after release', async ({ page }) => {
  // The columns block writes PERCENT flex live; rendering a fraction made
  // unchanged columns keep the live percent and collapse the row on release.
  await openSeededProject(page, undefined);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();

  const blockId = 'e2e-width-cols';
  await page.evaluate((id) => {
    const b = (window as any).__lemonSchedule;
    const project = b.getState().present;
    const stored = localStorage.getItem('lemon_schedule_report_active_design');
    const design = project.reportDesigns.find((d: any) => d.id === stored)
      || project.reportDesigns.find((d: any) => d.id === project.activeReportId)
      || project.reportDesigns[0];
    const text = (tid: string, label: string) => ({ id: tid, type: 'text', text: `<p>${label}</p>` });
    const block = {
      id,
      type: 'columns',
      cols: [
        { id: 'cc1', width: 33.33, blocks: [text('ct1', 'One')] },
        { id: 'cc2', width: 33.33, blocks: [text('ct2', 'Two')] },
        { id: 'cc3', width: 33.34, blocks: [text('ct3', 'Three')] },
      ],
    };
    b.dispatch({ type: 'UPDATE_REPORT_DESIGN', payload: { id: design.id, blocks: [...design.blocks, block] } });
  }, blockId);

  const card = page.locator(`[data-block-id="${blockId}"]`);
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const gutter = card.locator('.column-gutter.resizable').first();
  const gb = await gutter.boundingBox();
  expect(gb).not.toBeNull();
  await page.mouse.move(gb!.x + gb!.width / 2, gb!.y + gb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb!.x + gb!.width / 2 + 80, gb!.y + gb!.height / 2, { steps: 6 });
  // One percentage pill above each resized column.
  await expect(page.locator('[data-resize-badge]')).toHaveCount(2);
  await page.mouse.up();

  // Release commits and re-renders: wait for every column to carry a percent
  // flex value (the old fraction/percent mix left some at 0.x and collapsed).
  await page.waitForFunction((id) => {
    const el = document.querySelector(`[data-block-id="${id}"]`);
    if (!el) return false;
    const cols = [...el.querySelectorAll('.columns-col')];
    return cols.length === 3 && cols.every(col => parseFloat((col as HTMLElement).style.flex) > 1);
  }, blockId);

  const layout = await card.evaluate(el => [...el.querySelectorAll('.columns-col')].map(col => ({
    width: Math.round(col.getBoundingClientRect().width),
    flex: (col as HTMLElement).style.flex,
  })));
  expect(layout).toHaveLength(3);
  const totalWidth = layout.reduce((sum, col) => sum + col.width, 0);
  for (const col of layout) {
    // No column may collapse to a sliver after release.
    expect(col.width / totalWidth).toBeGreaterThan(0.15);
    // Live and rendered flex use the SAME percent unit (never 0.4 vs 40).
    expect(parseFloat(col.flex)).toBeGreaterThan(1);
  }
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
