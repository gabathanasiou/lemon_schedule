import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/** Rules tab (roadmap 46: shared RuleEditorPanel in a dark ui-kit Modal).
 *  Regression guard: DATE_RESTRICTION must always show the date picker —
 *  the old modal made dates mandatory for this type, and the panel must too
 *  (no "every day" state). MAX_HOURS/TIME_WINDOW keep the every-day toggle. */
test('rules tab: date restriction picks dates; max hours + time window keep every-day toggle', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Rules' }).click();
  await page.getByRole('button', { name: 'New Rule' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Rule' })).toBeVisible();

  // DATE_RESTRICTION: DatePicker visible immediately (no "Applies every day.")
  await page.getByRole('button', { name: /Date Restriction/ }).click();
  await expect(page.getByText('Applies every day.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: '17', exact: true })).toBeVisible();

  // Pick a cast member (chip dropdown), then a date (kit calendar grid), save
  await page.getByRole('dialog').locator('input').first().click();
  await page.keyboard.type('1');
  await page.getByText('FISHERMAN', { exact: false }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: '17', exact: true }).click();
  await page.getByRole('button', { name: 'Add Rule' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/1\. FISHERMAN: unavailable/)).toBeVisible();

  // MAX_HOURS keeps the every-day toggle; switching to it preserves a workable state
  await page.getByRole('button', { name: 'New Rule' }).click();
  await page.getByRole('button', { name: /Max Hours/ }).click();
  await expect(page.getByText('Applies every day.', { exact: true })).toBeVisible();
  await page.getByText('Every day', { exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: '18', exact: true })).toBeVisible();
  await page.getByRole('dialog').locator('input').first().click();
  await page.keyboard.type('1');
  await page.getByText('FISHERMAN', { exact: false }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: '18', exact: true }).click();
  await page.getByRole('button', { name: 'Add Rule' }).click();
  await expect(page.getByText(/1\. FISHERMAN: max 8h/)).toBeVisible();

  // TIME_WINDOW window modes (after/before) still render after the toggle refactor
  await page.getByRole('button', { name: 'New Rule' }).click();
  await page.getByRole('button', { name: /Time Window/ }).click();
  await page.getByRole('button', { name: 'After A' }).click();
  await expect(page.getByText('From', { exact: true })).toBeVisible();
  await page.getByRole('dialog').locator('input').first().click();
  await page.keyboard.type('1');
  await page.getByText('FISHERMAN', { exact: false }).last().click();
  await page.getByRole('dialog').locator('input[type="time"]').first().fill('18:00');
  await page.getByRole('button', { name: 'Add Rule' }).click();
  await expect(page.getByText(/1\. FISHERMAN: only after 18:00/)).toBeVisible();

  // All three persisted via the bridge
  const types = await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    return (s.getProject().rules || []).map((r: any) => `${r.type}:${r.dates ? r.dates.join(',') : ''}:${r.windowStart || ''}:${r.windowEnd || ''}`).join('|');
  });
  expect(types).toContain('DATE_RESTRICTION:2026-08-17');
  expect(types).toContain('MAX_HOURS:2026-08-18');
  expect(types).toContain('TIME_WINDOW::18:00');
});
