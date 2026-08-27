import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/** Calendar Events mode (roadmap item 45): mode toggle + persistence,
 *  attachment cards (type symbol + comma elements), spanning rule chips,
 *  event-type filter, Day Events modal, chip/card/day drags. Whole-day info
 *  (status, conflicts) lives in the day header — no status/flag cards.
 *  State is asserted through the debug bridge. */
test('calendar events: mode toggle, attachment cards, spanning chips, filter, modal', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Calendar' }).click();
  await expect(page.locator('[data-date-key="2026-08-10"]')).toBeVisible();

  // ---- Paint tool row visible in strips mode; hidden in events mode
  await expect(page.locator('button[title="Erase"]')).toBeVisible();
  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await expect(page.locator('button[title="Erase"]')).toHaveCount(0);
  await expect(page.locator('[data-cal-day]').first()).toBeVisible();
  // Whole-day info lives in the day header — no status cards
  await expect(page.locator('[data-event-key^="ev-status-"]')).toHaveCount(0);

  // ---- Inject a travel attachment + a 2-run date rule through the bridge
  await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const ns = (v.nonShootDates || []).map((n: any) => n.date === '2026-08-16'
      ? { date: '2026-08-16', status: 'travel', lists: { travel: { cast: ['1', '2'], wardrobe: ['COAT'] } } }
      : n);
    s.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, nonShootDates: ns } });
    s.dispatch({ type: 'ADD_RULE', payload: { id: 'r-chip-1', type: 'DATE_RESTRICTION', castId: '1', dates: ['2026-08-10', '2026-08-11', '2026-08-12'] } });
    s.dispatch({ type: 'ADD_RULE', payload: { id: 'r-chip-2', type: 'DATE_RESTRICTION', castId: '2', dates: ['2026-08-14'] } });
  });

  // ---- Attachment cards render on the travel day (symbol + comma elements)
  const travelDay = page.locator('[data-date-key="2026-08-16"]');
  await expect(travelDay.getByText(/FISHERMAN/)).toBeVisible();
  await expect(travelDay.getByText(/COAT/)).toBeVisible();
  const attCard = page.locator('[data-date-key="2026-08-16"] [data-event-key^="ev-att-"]').first();
  await expect(attCard.locator('svg')).toBeVisible();

  // ---- Spanning chip: one chip across the 3 consecutive days, wider than one cell
  const chip = page.locator('[data-chip-rule]').first();
  await expect(chip).toBeVisible();
  const chipBox = await chip.boundingBox();
  const cellBox = await page.locator('[data-date-key="2026-08-10"]').boundingBox();
  expect(chipBox!.width).toBeGreaterThan(cellBox!.width * 2);
  expect(await page.locator('[data-chip-rule]').count()).toBe(2);

  // ---- Filter: hiding the Travel status drops its attachment cards; empty days keep the add affordance
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.locator('button:has-text("Travel")').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-date-key="2026-08-16"]').getByText(/FISHERMAN/)).toHaveCount(0);
  await expect(page.locator('button:has-text("Add event")').first()).toBeVisible();
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.locator('button:has-text("Travel")').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-date-key="2026-08-16"]').getByText(/FISHERMAN/)).toBeVisible();

  // ---- Rules filter hides chips
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.locator('button:has-text("Date Restriction")').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-chip-rule]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.locator('button:has-text("Date Restriction")').click();
  await page.keyboard.press('Escape');

  // ---- Day Events modal: rules section, inline rule editor pre-seeded with the date
  await page.locator('[data-date-key="2026-08-10"] > div[role="button"]').first().click();
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
  await expect(page.getByText(/Unavailable/).first()).toBeVisible();
  await page.getByText('Add rule', { exact: true }).click();
  await expect(page.locator('[data-rule-editor]')).toBeVisible();
  await expect(page.getByText('Aug 10', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // ---- Card double-click opens the shared editor focused on that event type
  await page.locator('[data-date-key="2026-08-16"] [data-event-key^="ev-att-"]').first().dblclick();
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
  await expect(page.getByText('Event Types', { exact: true })).toBeVisible();
  await expect(page.locator('[data-event-section]').first()).toContainText('Travel');

  // ---- Per-row comment: add "Traveling from Singapore" to the Cast row
  await page.locator('button[title*="Add a comment"]').first().click();
  const commentInput = page.locator('input[placeholder*="Comment for Cast"]');
  await expect(commentInput).toBeVisible();
  await commentInput.fill('Traveling from Singapore');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const e = (v.nonShootDates || []).find((n: any) => n.date === '2026-08-16');
    return e?.comments?.travel?.cast || '';
  })).toBe('Traveling from Singapore');
  const commentGlyph = page.locator('[data-date-key="2026-08-16"] [data-event-key^="ev-att-"] svg.lucide-message-square');
  await expect(commentGlyph).toBeVisible();
  await commentGlyph.hover();
  await expect(page.getByText('Traveling from Singapore').first()).toBeVisible();

  // ---- Multi-status day: add a Hold event type, mark a cast member, save — both sections persist
  await page.locator('[data-date-key="2026-08-16"] > div[role="button"]').first().click();
  await page.getByText('Add event type', { exact: true }).click();
  await page.getByText('Hold', { exact: true }).last().click();
  const holdSection = page.locator('[data-event-section]').last();
  await expect(holdSection).toContainText('Hold');
  await holdSection.locator('input').first().click();
  await page.getByText('FISHERMAN', { exact: false }).last().click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const e = (v.nonShootDates || []).find((n: any) => n.date === '2026-08-16');
    return Object.keys(e?.lists || {}).sort().join(',');
  })).toBe('hold,travel');

  // ---- Mode persists across reload
  await page.reload();
  await page.getByText('Town - Jason', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Breakdown', exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('[data-cal-day]').first()).toBeVisible();
  await expect(page.locator('button[title="Erase"]')).toHaveCount(0);
});

test('calendar events: chip drag remaps dates; attachment card drag moves the group; day drag permutes', async ({ page }) => {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Calendar' }).click();
  await expect(page.locator('[data-date-key="2026-08-10"]')).toBeVisible();

  await page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const ns = (v.nonShootDates || []).map((n: any) =>
      n.date === '2026-08-16'
        ? { date: '2026-08-16', status: 'travel', lists: { travel: { cast: ['1'], wardrobe: ['COAT'] } } }
        : n);
    s.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, nonShootDates: ns } });
    s.dispatch({ type: 'ADD_RULE', payload: { id: 'r-chip-1', type: 'DATE_RESTRICTION', castId: '1', dates: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-14'] } });
  });

  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await expect(page.locator('[data-chip-rule]')).toHaveCount(2);

  // ---- Chip body drag: move run A (10-12) to 08-20; run B stays
  const chip = await page.locator('[data-chip-rule]').nth(0).boundingBox();
  const t20 = await page.locator('[data-date-key="2026-08-20"]').boundingBox();
  await page.mouse.move(chip!.x + chip!.width / 2, chip!.y + chip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(t20!.x + t20!.width / 2, t20!.y + t20!.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const r = (window as any).__lemonSchedule.getState().present.rules.find((x: any) => x.id === 'r-chip-1');
    return r ? r.dates.join(',') : '';
  })).toBe('2026-08-14,2026-08-20');

  // ---- Attachment card drag: the Cast group (first card) moves to 08-21,
  // the source day keeps its Wardrobe group
  const attCard = await page.locator('[data-date-key="2026-08-16"] [data-event-key^="ev-att-"]').first().boundingBox();
  const t21 = await page.locator('[data-date-key="2026-08-21"]').boundingBox();
  await page.mouse.move(attCard!.x + attCard!.width / 2, attCard!.y + attCard!.height / 2);
  await page.mouse.down();
  await page.mouse.move(t21!.x + t21!.width / 2, t21!.y + t21!.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const tgt = (v.nonShootDates || []).find((n: any) => n.date === '2026-08-21');
    const src = (v.nonShootDates || []).find((n: any) => n.date === '2026-08-16');
    return JSON.stringify({
      tgt: tgt ? Object.keys(tgt.lists?.travel || {}) : [],
      srcCast: src ? (src.lists?.travel?.cast || []) : [],
      srcWardrobe: src ? (src.lists?.travel?.wardrobe || []) : [],
    });
  })).toBe(JSON.stringify({ tgt: ['cast'], srcCast: [], srcWardrobe: ['COAT'] }));

  // ---- Day header drag in events mode: swap 08-15 (holiday) with 08-22 (holiday)
  const hdr = await page.locator('[data-date-key="2026-08-15"] > div[role="button"]').first().boundingBox();
  const t22 = await page.locator('[data-date-key="2026-08-22"]').boundingBox();
  await page.mouse.move(hdr!.x + hdr!.width / 2, hdr!.y + hdr!.height / 2);
  await page.mouse.down();
  await page.mouse.move(t22!.x + t22!.width / 2, t22!.y + t22!.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const entries = (v.nonShootDates || []).filter((n: any) => ['2026-08-15', '2026-08-22'].includes(n.date));
    return entries.map((n: any) => n.date + '=' + n.status).sort().join('|');
  })).toBe('2026-08-15=holiday|2026-08-22=holiday');

  // ---- Strips mode regression: paint row back; strip cards render
  await page.getByRole('button', { name: 'Strips', exact: true }).click();
  await expect(page.locator('button[title="Erase"]')).toBeVisible();
  const s10 = page.locator('[data-date-key="2026-08-10"]');
  await expect(s10.locator('[data-row-id]').first()).toBeVisible();
});
