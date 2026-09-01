import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/**
 * Trash modal (roadmap 67) — the File menu's Trash… now renders on the kit
 * Modal with one collapsible ItemCard section per trash kind. Uses the
 * bridge to populate trash (delete scene/version/rule/element), then
 * verifies sections, restore, and Empty. The seed project carries some
 * trash of its own — every count assertion is a DELTA over the baseline.
 */

async function trashCounts(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    return {
      scene: (p.trash || []).length,
      version: (p.versionTrash || []).length,
      rule: (p.rulesTrash || []).length,
    };
  });
}

async function openTrashModal(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File' }).first().click();
  await page.getByRole('menuitem', { name: 'Trash...' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
}

test('trash modal: sections per kind with counts, restore', async ({ page }) => {
  await openSeededProject(page);

  const before = await trashCounts(page);

  // Populate the trash via the bridge: one scene, one version (a throwaway
  // NON-active one — the active version can't be deleted), one rule.
  await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    let versionId = (p.versions || []).find((v: any) => v.id !== p.activeVersionId)?.id;
    if (!versionId) {
      versionId = 'v-trash-' + Date.now();
      b.dispatch({ type: 'NEW_VERSION', payload: { id: versionId, name: 'Trash Me' } });
    }
    b.batch(() => {
      b.dispatch({ type: 'DELETE_SCENE', payload: p.scenes[0].id });
      b.dispatch({ type: 'DELETE_VERSION', payload: versionId });
      b.dispatch({ type: 'DELETE_RULE', payload: p.rules[0].id });
    });
  });

  await openTrashModal(page);

  // One section per kind, row counts = baseline + the new deletions.
  const sceneSection = page.locator('[data-trash-section="scene"]');
  await expect(sceneSection).toBeVisible();
  await expect(sceneSection.locator('[data-trash-item="scene"]')).toHaveCount(before.scene + 1);
  const versionSection = page.locator('[data-trash-section="version"]');
  await expect(versionSection).toBeVisible();
  await expect(versionSection.locator('[data-trash-item="version"]')).toHaveCount(before.version + 1);
  const ruleSection = page.locator('[data-trash-section="rule"]');
  await expect(ruleSection).toBeVisible();
  await expect(ruleSection.locator('[data-trash-item="rule"]')).toHaveCount(before.rule + 1);

  // Restore the scene — its row leaves the section; the scene returns.
  const sceneId = await page.evaluate(() => (window as any).__lemonSchedule.getProject().scenes[0].id);
  await sceneSection.locator('button[title="Restore"]').first().click();
  await expect(sceneSection.locator('[data-trash-item="scene"]')).toHaveCount(before.scene);
  await expect
    .poll(() => page.evaluate(id => (window as any).__lemonSchedule.getProject().scenes.some(s => s.id === id), sceneId))
    .toBe(true);
});

test('trash modal: Empty with DNWA confirm empties all sections', async ({ page }) => {
  await openSeededProject(page);

  await openTrashModal(page);
  const sectionsBefore = await page.locator('[data-trash-section]').count();
  expect(sectionsBefore).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Empty' }).click();
  const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Permanently delete all trash items?' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.locator('[data-trash-section]')).toHaveCount(0);
  await expect(page.getByText('Trash is empty')).toBeVisible();

  const counts = await trashCounts(page);
  expect(counts).toEqual({ scene: 0, version: 0, rule: 0 });
});

test('trash modal: close button and modal chrome', async ({ page }) => {
  await openSeededProject(page);
  await openTrashModal(page);
  await expect(page.getByText('Items expire after 30 days')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
