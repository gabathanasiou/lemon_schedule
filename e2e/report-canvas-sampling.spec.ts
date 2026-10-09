import { test, expect } from '@playwright/test';
import { openSeededReportsDesigner, selectReportDesign, openReportsDesigner, reloadProject, waitForOverlaySettle } from './helpers';

async function openSceneBreakdown(page: any, mutate: (project: any) => void) {
  await openSeededReportsDesigner(page, mutate);
  await selectReportDesign(page, 'Scene Breakdown');
}

test('canvas repeat samples the first scene WITH data, not the first row', async ({ page }) => {
  await openSceneBreakdown(page, (project) => {
    const scenes: any[] = project.scenes;
    // The first scene the canvas samples (empirically SC 22 in this seed) is
    // emptied; EVERY other scene gets data. The canvas must sample a data-ful
    // scene instead of showing raw tokens.
    const s22 = scenes.find((s: any) => String(s.sceneNumber) === '22');
    s22.cast = ''; s22.props = ''; s22.description = ''; s22.set = '';
    for (const s of scenes) {
      if (s === s22) continue;
      if (!s.cast) s.cast = 'JASON, MARIA';
      if (!s.props) s.props = 'Chairs, Coffee table';
      if (!s.description) s.description = 'A fully broken-down scene.';
      if (!s.set) s.set = 'The Filled Set';
    }
  });

  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.block-card.block-type-text, .report-repeat .report-text-block'))
      .map(el => (el as HTMLElement).innerText?.trim())
      .filter(Boolean)
      .join('\n'),
  );
  console.log('CANVAS-TEXT:', text);
  // the sample must resolve real values, not raw tokens, and must not be the
  // emptied first scene (SC 22)
  expect(text).not.toContain('SC 22 —');
  expect(text).not.toContain('{{set}}');
  expect(text).not.toContain('{{props}}');
  expect(text).not.toContain('{{cast}}');
  expect(text).toContain('Cast:');
});

test('the View menu\'s Report day scopes a day-scoped design and survives reload (roadmap 198)', async ({ page }) => {
  await openSeededReportsDesigner(page);
  await selectReportDesign(page, 'Call Sheet');
  const viewTrigger = page.getByRole('button', { name: /View:/ });

  const canvasText = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.block-card.block-type-text, .report-repeat .report-text-block'))
        .map(el => (el as HTMLElement).innerText?.trim())
        .filter(Boolean)
        .join('\n'),
    );
  // All days (the default) still samples Day 1 — roadmap 197 parity.
  await expect(viewTrigger).not.toContainText('Day 1');
  await expect.poll(canvasText).toContain('Day 1');

  // View → Report day → DAY 2 scopes the canvas sample AND the preview.
  // Radix submenus reposition between open and first click (the house flake,
  // see location-types.spec.ts) — hover-open, settle, then pick.
  await viewTrigger.click();
  await page.locator('.ui-menu [role="menuitem"]').getByText('Report day', { exact: true }).hover();
  const day2Item = page.getByRole('menuitem', { name: /^DAY 2 ·/ });
  await expect(day2Item).toBeVisible({ timeout: 3000 });
  await waitForOverlaySettle(page);
  // Deferred native click (the clickMenuText technique): the morphing panel
  // sits under a document-level capture layer, so a pointer click can land on
  // `<html>` while the submenu is opening.
  await day2Item.evaluate(el => (el as HTMLElement).click());
  await expect(viewTrigger).toContainText('· Day 2');
  await expect.poll(canvasText).toContain('Day 2');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.report-page').first()).toBeVisible({ timeout: 15000 });
  const pages = page.locator('.report-page');
  await expect(pages).toHaveCount(1);
  expect(await pages.first().innerText()).toContain('Day 2');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  // The picked day is a preference — reload keeps the canvas on it.
  await reloadProject(page);
  await openReportsDesigner(page);
  await selectReportDesign(page, 'Call Sheet');
  await expect(page.getByRole('button', { name: /View:/ })).toContainText('· Day 2');
  await expect.poll(canvasText).toContain('Day 2');
});

test('canvas falls back to the first item when no scene has data', async ({ page }) => {
  await openSceneBreakdown(page, (project) => {
    for (const s of project.scenes as any[]) { s.cast = ''; s.props = ''; s.description = ''; s.set = ''; }
  });
  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.block-card.block-type-text, .report-repeat .report-text-block'))
      .map(el => (el as HTMLElement).innerText?.trim())
      .filter(Boolean)
      .join('\n'),
  );
  // still renders the template (raw tokens for the empty values), no crash
  expect(text).toContain('SC ');
});
