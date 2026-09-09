import { test, expect, Page } from '@playwright/test';
import { openSeededProject } from './helpers';

async function openDays(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Days', exact: true }).click();
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

    // Auto-fit geometry: Name(240) | Role(180) | Call(120), flexing on Role.
    const box = (await scroller.boundingBox())!;
    const target = Math.max(120, Math.floor(box.width) - 1);
    const total = 240 + 180 + 120;
    const widths = [240, 180, 120].map(w => Math.max(40, Math.floor((w / total) * target)));
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
