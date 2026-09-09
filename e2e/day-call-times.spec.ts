import { test, expect, Page } from '@playwright/test';
import { openSeededProject } from './helpers';

async function openDays(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Day Manager', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
}

const expand = async (page: Page, sectionId: string, probe: string) => {
  const section = page.locator(`[data-section="${sectionId}"]`);
  if (!(await section.locator(probe).count())) await section.getByRole('button').first().click();
  return section;
};

test.describe('Day call times + crew (roadmap 99)', () => {
  test('call-times and crew sections render inline Glide grids sized to content', async ({ page }) => {
    await openDays(page);

    const callTimes = await expand(page, 'callTimes', '[data-day-times-glide]');
    const ctGrid = callTimes.locator('[data-day-times-glide]').first();
    await expect(ctGrid).toBeVisible({ timeout: 8000 });
    await expect(ctGrid.locator('.dvn-scroller')).toBeAttached();
    await expect.poll(
      () => ctGrid.locator('.dvn-scroller').evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight),
      { timeout: 5000 },
    ).toBe(true);

    const crew = await expand(page, 'crew', '[data-crew-calls]');
    await expect(crew.locator('[data-crew-calls] .dvn-scroller').first()).toBeAttached({ timeout: 8000 });
  });

  test('call-times settings modal — tabbed redesign, removable category defaults (roadmap 110)', async ({ page }) => {
    await openDays(page);
    await page.getByTitle('Call-stage settings, category defaults and usual crew').click();

    const modal = page.getByRole('dialog').last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Four tabs, one concern each.
    await expect(modal.getByRole('button', { name: 'Call stages' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Category defaults' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Department precalls' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Usual crew' })).toBeVisible();

    // Stage list is the contained Import-style table (default: 5 stages).
    await expect(modal.locator('table tbody tr')).toHaveCount(5);

    // Category defaults: cast is locked, Background Actors is removable.
    await modal.getByRole('button', { name: 'Category defaults' }).click();
    await expect(modal.getByRole('button', { name: 'Remove Cast default' })).toHaveCount(0);
    const castRow = modal.locator('[data-call-category="cast"]');
    const bgRow = modal.locator('[data-call-category="backgroundActors"]');
    await expect(bgRow).toBeVisible();
    await expect(bgRow.getByRole('button', { name: /Remove .* default/ })).toHaveCount(1);

    // Add-category picker is the shared kit CategoryDropdown (menu items with icons).
    await modal.getByRole('button', { name: 'Add category…' }).click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // Multi-select stage dropdown (GroupedSelect → shared DropdownPanel) toggles a stage off cast.
    await castRow.getByRole('button').first().click();
    await page.locator('[data-ei]').filter({ hasText: /^Pickup$/ }).click();
    await expect.poll(() => page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return (p.productionInfo?.callTimes?.categoryStages?.cast || []).includes('pickup');
    }), { timeout: 4000 }).toBe(false);
    await page.keyboard.press('Escape');

    // Removing a non-cast default stores an explicit empty list -> the row
    // disappears (it falls back to the DOOD + first-scene grid on the day).
    await bgRow.getByRole('button', { name: /Remove .* default/ }).click();
    await expect.poll(() => page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return (p.productionInfo?.callTimes?.categoryStages?.backgroundActors || ['x']).length;
    }), { timeout: 4000 }).toBe(0);
    await expect(bgRow).toHaveCount(0);
  });

  test('right-click the call-times grid header opens the stages settings modal (roadmap 110)', async ({ page }) => {
    await openDays(page);
    const section = await expand(page, 'callTimes', '[data-day-times-glide]');
    const grid = section.locator('[data-day-times-glide]').first();
    await expect(grid).toBeVisible({ timeout: 8000 });
    await grid.scrollIntoViewIfNeeded();
    const box = (await grid.boundingBox())!;
    // The grid's header row is the top ~15px of the canvas.
    await page.mouse.click(box.x + 200, box.y + 15, { button: 'right' });

    const item = page.getByRole('menuitem', { name: 'Edit Call Time Stages…' });
    await expect(item).toBeVisible({ timeout: 4000 });
    await item.click();

    const modal = page.getByRole('dialog').last();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByRole('button', { name: 'Call stages' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Category defaults' })).toBeVisible();
  });

  test('crew call override writes through the shared day-meta path', async ({ page }) => {
    await openDays(page);
    const crew = await expand(page, 'crew', '[data-crew-calls]');
    const scroller = crew.locator('[data-crew-calls] .dvn-scroller');
    await expect(scroller).toBeAttached({ timeout: 8000 });
    await crew.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-crew-calls] .dvn-scroller') as HTMLElement | null;
      if (!el) return false;
      const w = el.clientWidth;
      const prev = (window as any).__crewGridWidth;
      (window as any).__crewGridWidth = w;
      return w > 0 && prev === w;
    }, undefined, { timeout: 5000 });

    // Auto-fit geometry: Name(120) | Role(90) | Call(90), flexing on Role.
    const box = (await scroller.boundingBox())!;
    const target = Math.max(120, Math.floor(box.width) - 1);
    const total = 120 + 90 + 90;
    const widths = [120, 90, 90].map(w => Math.max(40, Math.floor((w / total) * target)));
    const sum = widths.reduce((s, w) => s + w, 0);
    widths[1] += target - sum;
    const callX = box.x + widths[0] + widths[1] + widths[2] / 2;
    const callY = box.y + 30 + 14;

    await page.mouse.dblclick(callX, callY);
    const ta = page.locator('#portal textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });
    await ta.click();
    await ta.fill('07:30');
    await expect(ta).toHaveValue('07:30', { timeout: 4000 });
    await ta.press('Enter');

    await expect.poll(() => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
      return (gov?.daybreakMeta?.crewCalls || []).some((c: any) => c.callTime === '07:30');
    }), { timeout: 5000 }).toBe(true);
  });
});
