import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test.describe('Seeded Project Smoke Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test('loads the Town - Jason project and renders the schedule stripboard', async ({ page }) => {
    await openSeededProject(page);

    const scheduleBtn = page.getByRole('button', { name: 'Schedule' });
    await expect(scheduleBtn).toBeVisible({ timeout: 8000 });
    await scheduleBtn.click();
    await page.waitForTimeout(800);

    await expect(page.locator('[data-row-id]').first()).toBeAttached({ timeout: 5000 });
    const rowCount = await page.locator('[data-row-id]').count();
    expect(rowCount).toBeGreaterThan(5);

    const boneyard = page.locator('text=BONEYARD').first();
    await expect(boneyard).toBeVisible({ timeout: 3000 });
  });

  test('calendar shows month cells for the project', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Calendar' }).click();
    await page.waitForTimeout(800);

    await expect(page.locator('.dvn-underlay')).not.toBeAttached();
    await expect(page.locator('[data-cal-month]').first()).toBeAttached({ timeout: 5000 });
  });

  test('glide breakdown shows seeded scenes and scene count persists', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    await page.waitForTimeout(1000);

    const scroller = page.locator('.dvn-scroller');
    await expect(scroller).toBeAttached({ timeout: 5000 });

    const sceneCount = await page.evaluate(() => {
      try {
        const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
        if (!key) return -1;
        const project = JSON.parse(localStorage.getItem(key)!);
        return project.scenes?.length || 0;
      } catch { return -1; }
    });
    expect(sceneCount).toBeGreaterThan(0);
  });
});
