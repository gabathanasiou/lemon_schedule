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

test.describe('Schedule Tab Toolbar & Context Menu', () => {
  test('toolbar renders with days count, Edit, Print, Day Breaks and Banners', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(800);

    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Day Breaks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Banners' })).toBeVisible();
    await expect(page.locator('text=days').first()).toBeVisible();
  });

  test('context menu opens on right-click of a strip', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(800);

    const row = page.locator('[data-row-id]').first();
    await row.click({ button: 'right', force: true });
    await page.waitForTimeout(300);

    await expect(page.getByRole('button', { name: 'Add Note Below' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Day Break Below' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('view menu shows ribbon layouts and stripboard view', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Cell Borders' })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

test.describe('Design Tab', () => {
  test('design tab renders ribbon designer with palette and toolbar', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Design' }).click();
  await page.waitForTimeout(800);

  await expect(page.getByText('Editing:')).toBeVisible();
  await expect(page.getByText('Fields')).toBeVisible();
  await expect(page.getByText('Structure', { exact: true })).toBeVisible();
  await expect(page.getByText('Designer', { exact: true })).toBeVisible();
  await expect(page.getByText('Live Preview')).toBeVisible();
});
});
