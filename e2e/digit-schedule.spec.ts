import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

// The stripboard day model: every row array starts with the pinned DAYBREAK
// (containerId 1, order 0) followed by the production daybreaks. Typing a
// digit on selected boneyard rows schedules them to that section — the
// boundary math must treat the pinned daybreak as non-targetable.

const sectionForLabel = (sections: any[], label: string) => sections.find((s: any) => s.label === label);
const activeVersion = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const p: any = (window as any).__lemonSchedule.getProject();
    return p.versions.find((v: any) => v.id === p.activeVersionId);
  });
const rawRow = (page: import('@playwright/test').Page, id: string) =>
  activeVersion(page).then((v: any) => v.rows.find((r: any) => r.id === id));

test.describe('Digit scheduling to a day (roadmap 47)', () => {
  test('type-a-digit schedules boneyard rows to the section with Enter-commit', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Schedule' }).click();

    const dayCount = await page.evaluate(() => {
      const { sections } = (window as any).__lemonSchedule.getRows();
      return sections.filter((s: any) => !s.isPinned).length;
    });
    expect(dayCount).toBeGreaterThan(2);

    const boneyardRows = page.locator('#boneyard_rows_container [data-row-id]');
    await expect(boneyardRows.first()).toBeAttached({ timeout: 5000 });
    const firstId = await boneyardRows.first().getAttribute('data-row-id');
    const secondId = await boneyardRows.nth(1).getAttribute('data-row-id');
    expect(firstId && secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);

    await boneyardRows.first().click();
    await boneyardRows.nth(1).click({ modifiers: ['Shift'] });

    const targetDay = 3;
    await page.keyboard.type(String(targetDay));
    await page.keyboard.press('Enter');

    await expect.poll(async () => {
      const { sections } = await page.evaluate(() => (window as any).__lemonSchedule.getRows());
      return sectionForLabel(sections, `Day ${targetDay}`)?.rows ?? [];
    }, { timeout: 5000 }).toEqual(expect.arrayContaining([firstId!, secondId!]));

    for (const id of [firstId!, secondId!]) {
      const row = await rawRow(page, id);
      expect(row.containerId).toBe(1);
    }

    const dayOrder = await page.evaluate(([a, b]) => {
      const { sections } = (window as any).__lemonSchedule.getRows();
      const day = sections.find((s: any) => s.label === 'Day 3');
      if (!day) return -1;
      const ia = day.rows.indexOf(a);
      const ib = day.rows.indexOf(b);
      return ia >= 0 && ib >= 0 && ia < ib ? 1 : 0;
    }, [firstId!, secondId!] as const);
    expect(dayOrder).toBe(1);
  });

  test('out-of-range day numbers leave the boneyard untouched (phantom day + far-out)', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Schedule' }).click();

    const dayCount = await page.evaluate(() => {
      const { sections } = (window as any).__lemonSchedule.getRows();
      return sections.filter((s: any) => !s.isPinned).length;
    });

    const boneyardRows = page.locator('#boneyard_rows_container [data-row-id]');
    await expect(boneyardRows.first()).toBeAttached({ timeout: 5000 });
    const firstId = await boneyardRows.first().getAttribute('data-row-id');
    expect(firstId).toBeTruthy();

    const snapshot = () =>
      page.evaluate((rowId) => {
        const p: any = (window as any).__lemonSchedule.getProject();
        const v = p.versions.find((x: any) => x.id === p.activeVersionId);
        const r = v.rows.find((x: any) => x.id === rowId);
        return { containerId: r?.containerId, order: r?.order };
      }, firstId!);

    await boneyardRows.first().click();

    for (const n of [dayCount + 1, 99]) {
      await page.keyboard.type(String(n));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
      const beforeState = await snapshot();
      expect(beforeState.containerId, `day ${n} must not schedule`).toBeNull();
    }
  });

  test('last production day schedules into the final section', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Schedule' }).click();

    const dayCount = await page.evaluate(() => {
      const { sections } = (window as any).__lemonSchedule.getRows();
      return sections.filter((s: any) => !s.isPinned).length;
    });
    expect(dayCount).toBeGreaterThan(1);

    const boneyardRows = page.locator('#boneyard_rows_container [data-row-id]');
    await expect(boneyardRows.first()).toBeAttached({ timeout: 5000 });
    const firstId = await boneyardRows.first().getAttribute('data-row-id');
    expect(firstId).toBeTruthy();

    await boneyardRows.first().click();
    await page.keyboard.type(String(dayCount));
    await page.keyboard.press('Enter');

    await expect.poll(async () => {
      const { sections } = await page.evaluate(() => (window as any).__lemonSchedule.getRows());
      return sectionForLabel(sections, `Day ${dayCount}`)?.rows ?? [];
    }, { timeout: 5000 }).toContain(firstId);

    const row = await rawRow(page, firstId!);
    expect(row.containerId).toBe(1);
  });
});