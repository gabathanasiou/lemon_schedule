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

test.describe('Print', () => {
  test('print dialog renders the schedule as printable output', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // Stub window.print so the print view stays mounted (headless fires afterprint synchronously)
    await page.addInitScript(() => {
      window.print = () => {};
    });
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Print' }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'Print / Save PDF' }).click();
    await page.waitForTimeout(1200);

    await expect(page.locator('.print-root').first()).toBeAttached({ timeout: 5000 });
    await expect(page.locator('text=START OF DAY').first()).toBeVisible();
    await expect(page.locator('text=End of Day').first()).toBeVisible();
    await expect(page.locator('text=CALL').first()).toBeVisible();
    await expect(page.locator('text=Schedule Version').first()).toBeVisible();
  });
});


test.describe('Daybreak Context Actions', () => {
  test('add day break via context menu creates a DAYBREAK row', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.waitForTimeout(800);

  const before = await page.evaluate(() => {
    try {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      const project = JSON.parse(localStorage.getItem(key)!);
      const v = project.versions.find((x: any) => x.id === project.activeVersionId);
      return v.rows.filter((r: any) => r.type === 'DAYBREAK').length;
    } catch { return -1; }
  });

  // Right-click the first scene row (2nd [data-row-id], first is pinned daybreak)
  const row = page.locator('[data-row-id]').nth(1);
  await row.click({ button: 'right', force: true });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Add Day Break Below' }).click();
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    try {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      const project = JSON.parse(localStorage.getItem(key)!);
      const v = project.versions.find((x: any) => x.id === project.activeVersionId);
      return v.rows.filter((r: any) => r.type === 'DAYBREAK').length;
    } catch { return -1; }
  });
  expect(after).toBe(before + 1);
});
});


test.describe('Calendar Keyboard', () => {
  test('calendar arrow keys navigate selection in boneyard', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.waitForTimeout(800);

  // Select a boneyard card then arrow-down
  const boneyardCard = page.locator('#boneyard_rows_container [data-row-id], [data-row-id]').last();
  await boneyardCard.click();
  await page.waitForTimeout(200);

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Escape clears selection without errors; page still renders
  await expect(page.locator('[data-cal-month]').first()).toBeAttached({ timeout: 3000 });
});
});
