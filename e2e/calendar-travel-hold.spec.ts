import { test, expect } from '@playwright/test';
import { openSeededProject, seedLeadCast, seedDayDates } from './helpers';

// Calendar travel/hold (roadmap 39): day-status dropdown (context menu),
// event cards (shared adder), header icons + tooltip (foreign-type badge),
// body chips, and the DOODS cell letter. Seed-agnostic: the lead cast member
// and DAY 1/DAY 2 dates come from the live bridge.

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255})`;
};

test('calendar travel/hold: status dropdown, event cards, header icons, tooltip, body chips, DOODS cells', async ({ page }) => {
  await openSeededProject(page);

  const cast = await seedLeadCast(page);
  const days = await seedDayDates(page);
  expect(days.length).toBeGreaterThan(1);
  const day1 = days[0];
  const day2 = days[1];
  const travelColor = await page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    return (p.dayTypes || []).find((t: any) => t.key === 'travel')?.color || '#9333ea';
  });

  await page.getByRole('button', { name: 'Calendar' }).click();
  const dayCell = page.locator(`[data-date-key="${day1}"]`);
  await expect(dayCell).toBeVisible();
  const header = dayCell.locator('[class*="flex items-center justify-between"]').first();

  // Double-click a day header opens the day events modal (no events → empty state)
  await header.dblclick();
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
  await expect(page.getByText('No events on this day', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // Add the lead cast's TRAVEL card on a work day — travel is a FOREIGN type
  // there, so the header badge renders the plane icon and the Traveling tooltip.
  await header.click({ button: 'right', force: true });
  await page.getByText('Manage Travel/Hold…').click();
  await page.getByRole('button', { name: 'Add Event' }).click();
  const adder = page.getByRole('dialog').last();
  await expect(adder.getByRole('heading', { name: 'Add Events' })).toBeVisible();
  // The adder defaults to the first markable type — switch it to Travel.
  await adder.getByText('Event Type', { exact: true }).locator('..').getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Travel' }).click();
  // Pick the lead cast member from the open dropdown. The panel is portaled
  // outside the dialog — target the option button that contains the name.
  await adder.locator('input').first().click();
  await page.locator('.click-outside-ignore button', { has: page.getByText(cast.name, { exact: true }) }).first().click();
  await adder.getByRole('button', { name: 'Create', exact: true }).click();
  // The travel card lists the member with its category label
  const travelCard = page.locator('[data-event-card="travel"]');
  await expect(travelCard).toContainText(cast.name);
  await expect(travelCard).toContainText('Cast');
  await page.getByRole('button', { name: 'Done' }).click();

  // Header icon (foreign travel badge) + tooltip
  const badgeIcon = dayCell.locator(`svg.lucide-plane[style*="${hexToRgb(travelColor)}"]`);
  await expect(badgeIcon).toBeVisible();
  await badgeIcon.hover();
  const tip = page.locator('.fixed.px-2\\.5').filter({ hasText: 'Traveling' }).first();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(cast.name);

  // Hold day: label + body chips, then attach ALL cast via the adder's All checkbox
  const day2cell = page.locator(`[data-date-key="${day2}"]`);
  const header2 = day2cell.locator('[class*="flex items-center justify-between"]').first();
  await header2.click({ button: 'right' });
  await page.getByText('Hold', { exact: true }).click();
  await expect(day2cell.getByText('HOLD', { exact: true })).toBeVisible();
  await expect(day2cell.getByText('Double click to set up')).toBeVisible();

  await header2.dblclick({ force: true });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Add Event' }).click();
  const adder2 = page.getByRole('dialog').last();
  await page.getByText('All', { exact: true }).last().click();
  await adder2.getByRole('button', { name: 'Create', exact: true }).click();
  // The hold card shows the whole-category row "All Cast" and the body chip lists it
  await expect(page.locator('[data-event-card="hold"]')).toContainText('All Cast');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(day2cell.getByText('All Cast', { exact: true })).toBeVisible();

  // Conflict flag on the right of the header (if present)
  const flagDay = page.locator('[data-date-key]').filter({ has: page.locator('svg.lucide-flag.fill-red-400') }).first();
  if (await flagDay.count() > 0) {
    const flagBox = await flagDay.locator('svg.lucide-flag.fill-red-400').first().boundingBox();
    const fHeaderBox = await flagDay.locator('[class*="flex items-center justify-between"]').first().boundingBox();
    expect(flagBox!.x + flagBox!.width / 2).toBeGreaterThan(fHeaderBox!.x + fHeaderBox!.width / 2);
  }

  // Reports DOODS shows the H cell for the all-cast hold day
  await page.getByRole('button', { name: 'Reports' }).click();
  const memberRow = page.locator('tr', { hasText: cast.name }).first();
  await expect(memberRow).toContainText('H');
});
