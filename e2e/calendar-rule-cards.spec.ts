import { test, expect } from '@playwright/test';
import { openSeededProject, seedLeadCast } from './helpers';

// Roadmap 65: global (every-day) rules never render a card in Calendar
// Events mode — their home is the Rules tab (they still fire in the
// stripboard/day headers via computeSectionViolationMap). Dated rule cards
// render one card per date with the violation flag on the LEFT and the rule
// icon on the RIGHT; their context menu is always the per-date
// "Remove from this day".

test('events mode: global rule cards hidden; dated rule card is flag-left / icon-right, per-date menu', async ({ page }) => {
  await openSeededProject(page);
  const cast = await seedLeadCast(page);
  await page.getByRole('button', { name: 'Calendar' }).click();

  // One global rule (CAST_SCENE_FLAG — no dates) + one dated MAX_HOURS on a
  // production day where the lead cast actually works — the 1h cap fires
  // there (violated card). Via the bridge, resolved against the seed.
  const added = await page.evaluate((fid) => {
    const v = (window as any).__lemonSchedule;
    const rows = v.getRows();
    const p = v.getProject();
    const secs = (rows?.sections || []).filter((s: any) => !s.isPinned);
    const workDay = secs.find((s: any) => s.rows.some((r: any) => {
      const scene = p.scenes.find((x: any) => x.id === r.sceneId);
      return scene && String(scene.cast || '').split(',').map((x: string) => x.trim()).includes(String(fid));
    }));
    const date = workDay?.date ?? secs[secs.length - 1]?.date ?? '';
    v.dispatch({
      type: 'ADD_RULE',
      payload: { id: 'ev-global', type: 'CAST_SCENE_FLAG', castIds: [String(fid)] },
    });
    v.dispatch({
      type: 'ADD_RULE',
      payload: { id: 'ev-dated', type: 'MAX_HOURS', castId: String(fid), maxHours: 1, dates: [date] },
    });
    return { last: date };
  }, cast.id);
  expect(added.last).toBeTruthy();

  await page.getByRole('button', { name: 'Events', exact: true }).click();

  // Scroll to the bottom so the last production day's month mounts.
  await page.locator('[data-cal-grid]').evaluate(el => { el.scrollTop = el.scrollHeight; });
  const grid = page.locator('[data-cal-grid]');

  // The global rule renders NO card on any rendered day cell.
  await expect(grid.locator('[data-card-rule="ev-global"]')).toHaveCount(0);

  // The dated rule renders exactly one card, on its date, violated (red tint).
  const card = grid.locator('[data-card-rule="ev-dated"]');
  await expect(card).toHaveCount(1);
  const inner = card.locator('div').first();
  await expect(inner).toHaveClass(/bg-red-100/);

  // Violated card: flag on the LEFT (first child), rule icon on the RIGHT.
  // The icon is wrapped in a trailing <span>, so probe inside it.
  const iconOrder = await inner.evaluate(el => {
    const kids = Array.from(el.children) as HTMLElement[];
    const first = kids[0]?.classList.contains('lucide-flag') ?? false;
    const lastWrap = kids[kids.length - 1];
    const last = !!lastWrap?.querySelector('.lucide-clock');
    return { first, last };
  });
  expect(iconOrder).toEqual({ first: true, last: true });

  // Filter: All Rule Types off hides the dated card; back on restores it.
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByText('All Rule Types', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(grid.locator('[data-card-rule="ev-dated"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByText('All Rule Types', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(1);

  // Right-click → "Remove from this day" (no every-day no-op branch): the
  // card's date leaves; the date-optional MAX_HOURS returns to every-day
  // (which renders nothing) and the rule itself survives.
  await card.click({ button: 'right' });
  await page.getByText('Remove from this day', { exact: true }).click();
  await expect(grid.locator('[data-card-rule="ev-dated"]')).toHaveCount(0);
  const rule = await page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    return p.rules.find((r: any) => r.id === 'ev-dated');
  });
  expect(rule?.dates).toBeUndefined();
});
