import { test, expect, Page } from '@playwright/test';
import { openSeededProject } from './helpers';

async function openDays(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Days', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
}

test.describe('Day call times + crew (roadmap 99)', () => {
  test('call-times section stores an On Set override and crew section renders', async ({ page }) => {
    await openDays(page);

    const section = page.locator('[data-section="callTimes"]');
    await expect(section).toBeVisible();
    // Expand if collapsed.
    if (!(await section.locator('table').count())) {
      await section.getByRole('button').first().click();
    }

    // First cast row's On Set cell (last stage column of the call-times table).
    const onSetCell = section.locator('table').first().locator('tbody tr').first().locator('td').last();
    await onSetCell.locator('[data-timefield]').first().click();
    const onSet = onSetCell.locator('input').first();
    await expect(onSet).toBeVisible({ timeout: 5000 });
    await onSet.fill('07:00');
    await onSet.press('Enter');

    await expect.poll(async () => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned) || v.rows.find((r: any) => r.type === 'DAYBREAK');
      const calls = gov?.daybreakMeta?.elementCalls || {};
      for (const cat of Object.keys(calls)) {
        for (const key of Object.keys(calls[cat])) {
          if (calls[cat][key].onSet === '07:00') return true;
        }
      }
      return false;
    }), { timeout: 5000 }).toBe(true);

    await expect(page.locator('[data-section="crew"]')).toBeVisible();
  });
});
