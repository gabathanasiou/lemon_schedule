import { test, expect } from '@playwright/test';
import { openSeededProject, seedLeadCast } from './helpers';

/** Rules tab (roadmap 46: shared RuleEditorPanel in a dark ui-kit Modal).
 *  Regression guard: DATE_RESTRICTION must always show the date picker —
 *  the old modal made dates mandatory for this type, and the panel must too
 *  (no "every day" state). MAX_HOURS/TIME_WINDOW keep the every-day toggle.
 *  Seed-agnostic: two production dates from the active calendar window drive
 *  the DatePicker picks and the persisted assertions. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The kit DatePicker opens on the current month — step it to the target
 *  month (direction-aware) before clicking a day. */
async function navPickerTo(page: import('@playwright/test').Page, target: string) {
  const header = page.getByRole('dialog').getByRole('button', { name: 'Select year and month' });
  for (let i = 0; i < 24; i++) {
    const txt = ((await header.textContent()) || '').trim();
    if (txt === target) return;
    const want = new Date(target + ' 1');
    const cur = new Date(txt + ' 1');
    if (want > cur) await page.getByRole('dialog').getByRole('button', { name: 'Next month' }).click();
    else await page.getByRole('dialog').getByRole('button', { name: 'Previous month' }).click();
  }
  throw new Error(`DatePicker nav to ${target} exceeded`);
}

test('rules tab: date restriction picks dates; max hours + time window keep every-day toggle', async ({ page }) => {
  await openSeededProject(page);
  const member = await seedLeadCast(page);
  const display = `${member.id}. ${member.name}`;

  /** Selects the lead cast member in the rule editor's chip dropdown. */
  const pickMember = async () => {
    await page.getByRole('dialog').locator('input').first().click();
    await page.locator('.click-outside-ignore button', { has: page.getByText(member.name, { exact: true }) }).first().click();
  };

  // Two consecutive production days in the same month (the picker navigates
  // once per dialog; same-month keeps it simple).
  const { date1, date2 } = await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const rows = b.getRows();
    const secs = (rows.sections || []).filter((s: any) => !s.isPinned);
    let a = secs[0]?.date, c = secs[0]?.date;
    for (let i = 0; i + 1 < secs.length; i++) {
      if (secs[i].date.slice(0, 7) === secs[i + 1].date.slice(0, 7)) { a = secs[i].date; c = secs[i + 1].date; break; }
    }
    return { date1: a, date2: c };
  });
  const [yy, mm] = date1.split('-').map(Number);
  const monthLabel = `${MONTHS[mm - 1]} ${yy}`;
  const day1 = Number(date1.split('-')[2]);
  const day2 = Number(date2.split('-')[2]);

  await page.getByRole('button', { name: 'Rules' }).click();
  await page.getByRole('button', { name: 'New Rule' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Rule' })).toBeVisible();

  // DATE_RESTRICTION: DatePicker visible immediately (no "Applies every day.")
  await page.getByRole('dialog').getByRole('button', { name: /Max Hours/ }).click();
  await page.getByText('Date Restriction', { exact: true }).click();
  await expect(page.getByText('Applies every day.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: String(day1), exact: true })).toBeVisible();

  // Pick a cast member (chip dropdown), then a date (kit calendar grid), save
  await pickMember();
  await page.keyboard.press('Escape');
  await navPickerTo(page, monthLabel);
  await page.getByRole('dialog').getByRole('button', { name: String(day1), exact: true }).click();
  await page.getByRole('button', { name: 'Add Rule' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(new RegExp(`${esc(display)}: unavailable`)).first()).toBeVisible();

  // MAX_HOURS keeps the every-day toggle; switching to it preserves a workable state
  await page.getByRole('button', { name: 'New Rule' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Max Hours/ })).toBeVisible();
  await expect(page.getByText('Applies every day.', { exact: true })).toBeVisible();
  await page.getByText('Every day', { exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: String(day2), exact: true })).toBeVisible();
  await pickMember();
  await page.keyboard.press('Escape');
  await navPickerTo(page, monthLabel);
  await page.getByRole('dialog').getByRole('button', { name: String(day2), exact: true }).click();
  await page.getByRole('button', { name: 'Add Rule' }).click();
  await expect(page.getByText(new RegExp(`${esc(display)}: max 8h`)).first()).toBeVisible();

  // TIME_WINDOW window modes (after/before) still render after the toggle refactor
  await page.getByRole('button', { name: 'New Rule' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Max Hours/ }).click();
  await page.getByText('Time Window', { exact: true }).click();
  await page.getByRole('button', { name: 'After A' }).click();
  await expect(page.getByText('From', { exact: true })).toBeVisible();
  await pickMember();
  await page.getByRole('dialog').locator('input[type="time"]').first().fill('18:00');
  await page.getByRole('button', { name: 'Add Rule' }).click();
  await expect(page.getByText(new RegExp(`${esc(display)}: only after 18:00`)).first()).toBeVisible();

  // All three persisted via the bridge
  const types = await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    return (s.getProject().rules || []).map((r: any) => `${r.type}:${r.dates ? r.dates.join(',') : ''}:${r.windowStart || ''}:${r.windowEnd || ''}`).join('|');
  });
  expect(types).toContain(`DATE_RESTRICTION:${date1}`);
  expect(types).toContain(`MAX_HOURS:${date2}`);
  expect(types).toContain('TIME_WINDOW::18:00');
});
