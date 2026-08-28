import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

// Element Manager Events (roadmap item 46): the per-row Events button opens
// the element events manager — one collapsible card per day type with only
// this element's dates (comment inline, Edit/Remove per group), a collapsed
// Add-Event picker, a Violations section, and rules with Add Rule (pre-scoped
// to the element). Cards count like day statuses everywhere: FISHERMAN's
// Travel column drops when the travel card is removed. State is asserted
// through the debug bridge.
test('element manager events: type cards, add/remove, violations, rules, count columns', async ({ page }) => {
  await openSeededProject(page);

  // Deterministic fixture: FISHERMAN has a CARD-ONLY travel event on Aug 16
  // (no day status — a travel card on a normal day, wardrobe pair of boxing gloves proves
  // group scoping), a dated DATE_RESTRICTION on Aug 10+12, and a MAX_HOURS
  // that guarantees a violation on the first day FISHERMAN works. Seed rules
  // referencing FISHERMAN are deleted so only our rules feed the surfaces.
  const seedInfo = await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    const fisher = p.castMembers.find((m: any) => m.name === 'FISHERMAN');
    const fid = String(fisher ? fisher.id : '1');
    const refs = (r: any) => r.type === 'CAST_CONFLICT'
      ? [...(r.castIds || []), ...(r.conflictCastIds || [])]
      : (r.castId ? [r.castId] : (r.castIds || []));
    for (const r of (p.rules || [])) {
      if (refs(r).includes(fid)) b.dispatch({ type: 'DELETE_RULE', payload: r.id });
    }
    const ns = (v.nonShootDates || []).filter((n: any) => n.date !== '2026-08-16')
      .concat([{ date: '2026-08-16', lists: { travel: { cast: [fid], wardrobe: ['pair of boxing gloves'] } } }]);
    b.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, nonShootDates: ns } });
    b.dispatch({ type: 'ADD_RULE', payload: { id: 'ee-rule-1', type: 'DATE_RESTRICTION', castId: fid, dates: ['2026-08-10', '2026-08-12'] } });
    const rows = b.getRows();
    const sceneByRow = new Map(
      (rows.rows || []).filter((r: any) => r.type === 'SCENE' && r.sceneId).map((r: any) => [r.id, r.sceneId]),
    );
    const workDates: string[] = [];
    for (const s of rows.sections) {
      if (s.isPinned) continue;
      const hasFisher = (s.rows || []).some((rid: any) => {
        const sc = p.scenes.find((x: any) => x.id === sceneByRow.get(rid));
        return sc && (sc.cast || '').split(',').map((x: string) => x.trim()).includes(fid);
      });
      if (hasFisher) workDates.push(s.date);
    }
    const violationDate = workDates[0] || '';
    if (violationDate) {
      b.dispatch({ type: 'ADD_RULE', payload: { id: 'ee-max-1', type: 'MAX_HOURS', castId: fid, maxHours: 0.1, dates: [violationDate] } });
    }
    const travelIdx = p.dayTypes.findIndex((t: any) => t.key === 'travel');
    const holdIdx = p.dayTypes.findIndex((t: any) => t.key === 'hold');
    return { fid, violationDate, workCount: workDates.length, travelIdx, holdIdx };
  });
  expect(seedInfo.workCount).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();

  const fisherRow = page.locator('tr', { has: page.locator('input[value="FISHERMAN"]') });
  await expect(fisherRow).toBeVisible();
  await fisherRow.locator('button[title^="Events"]').click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading', { name: /FISHERMAN — Events/ })).toBeVisible();
  const travelCol = 6 + seedInfo.travelIdx;

  // ---- Events: one Travel card, one day row — plain date + actions (no
  //     element name in the rows; it's in the modal title)
  const travelCard = modal.locator('[data-element-event-type="travel"]');
  await expect(travelCard).toBeVisible();
  await expect(travelCard.locator('[data-element-event-date]')).toHaveCount(1);
  const row16 = travelCard.locator('[data-element-event-date="2026-08-16"]');
  await expect(row16).toContainText('Aug');
  await expect(row16.locator('button[title="Edit this event"]')).toBeVisible();
  await expect(row16.locator('button[aria-label="Remove 1. FISHERMAN from this day"]')).toBeVisible();
  await expect(travelCard.locator('[data-element-event-group]')).toHaveCount(0);

  // ---- Inline note: add "Packing the gloves" to the Aug 16 travel event
  await row16.getByRole('button', { name: /Add note/ }).click();
  const noteInput = row16.locator('input');
  await noteInput.fill('Packing the gloves');
  await noteInput.press('Enter');
  await expect.poll(() => page.evaluate((fid) => {
    const st = (window as any).__lemonSchedule.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const e = (v.nonShootDates || []).find((n: any) => n.date === '2026-08-16');
    return e?.comments?.travel?.cast?.[fid] || '';
  }, seedInfo.fid)).toBe('Packing the gloves');
  await expect(row16.getByText('Packing the gloves')).toBeVisible();

  // ---- NO rows for rule coverage (dated rules don't list their dates)
  await expect(modal.locator('[data-element-event-date="2026-08-10"]')).toHaveCount(0);

  // ---- Violations section lists the element's firing days
  await expect(modal.locator(`[data-element-violation="${seedInfo.violationDate}"]`).first()).toBeVisible();

  // ---- Rules: both element rules + Add Rule saves a pre-scoped rule
  await expect(modal.getByText(/unavailable/).first()).toBeVisible();
  await expect(modal.getByText(/max 0\.1h/).first()).toBeVisible();
  await modal.getByRole('button', { name: 'Add Rule' }).click();
  const ruleEditor = page.locator('[data-rule-editor]').last();
  await expect(ruleEditor).toBeVisible();
  // Pre-scoped: the element's cast member is already in the form
  await expect(ruleEditor.locator(`input[value="${seedInfo.fid}"]`)).toBeVisible();
  await ruleEditor.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => page.evaluate((fid) => {
    const s = (window as any).__lemonSchedule;
    return (s.getState().present.rules || []).filter((r: any) => r.castId === fid).length;
  }, seedInfo.fid)).toBe(3);

  // ---- Add Event on a new date: the shared adder opens ELEMENT-LOCKED (the
  //     element in its category), the date is picked inside, Create merges it
  //     onto the day as a per-element card
  await modal.getByRole('button', { name: 'Add Event on a Date' }).click();
  const adder = page.getByRole('dialog').last();
  await expect(adder.getByRole('heading', { name: /1\. FISHERMAN/ })).toBeVisible();
  // The kit DatePicker opens on the current month — navigate to August 2026
  // whenever we land elsewhere (the fixture dates live in August).
  let guard = 0;
  while (!(await adder.getByText(/August 2026/).isVisible().catch(() => false)) && guard++ < 24) {
    await adder.getByRole('button', { name: 'Previous month' }).click();
  }
  await adder.getByRole('button', { name: '17', exact: true }).click();
  await adder.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: /1\. FISHERMAN — Events/ })).toBeVisible();
  await expect.poll(() => page.evaluate((fid) => {
    const st = (window as any).__lemonSchedule.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const e = (v.nonShootDates || []).find((n: any) => n.date === '2026-08-17');
    return Object.values(e?.lists || {}).flatMap((l: any) => l.cast || []).join(',');
  }, seedInfo.fid)).toBe(seedInfo.fid);
  // The new HOLD card appears; the travel card keeps Aug 16 only
  await expect(modal.locator('[data-element-event-type="hold"] [data-element-event-date="2026-08-17"]')).toBeVisible();
  await expect(travelCard.locator('[data-element-event-date]')).toHaveCount(1);
  // Cards count in their manager columns (events count like day status)
  const holdCol = 6 + seedInfo.holdIdx;
  await expect(fisherRow.locator('td').nth(travelCol)).toHaveText('1');
  await expect(fisherRow.locator('td').nth(holdCol)).toHaveText('1');

  // ---- Remove drops only the cast group: the Travel column drops, the day
  //     keeps its Wardrobe group (pair of boxing gloves survives in the store)
  await row16.getByRole('button', { name: 'Remove 1. FISHERMAN from this day' }).click();
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const v = st.versions.find((x: any) => x.id === st.activeVersionId);
    const e = (v.nonShootDates || []).find((n: any) => n.date === '2026-08-16');
    return e ? JSON.stringify({ cast: e.lists?.travel?.cast || [], wardrobe: e.lists?.travel?.wardrobe || [] }) : 'gone';
  })).toBe(JSON.stringify({ cast: [], wardrobe: ['pair of boxing gloves'] }));
  await expect(fisherRow.locator('td').nth(travelCol)).toHaveText('0');
  // Wardrobe pair of boxing gloves still on the day (only the cast group was removed)
  await expect(page.locator('[data-element-event-date="2026-08-16"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();

  // ---- Non-cast elements: day rows render, rules are cast-only
  await page.locator('aside').getByRole('button', { name: /Wardrobe/ }).click();
  const glovesRow = page.locator('tr', { has: page.locator('input[value="pair of boxing gloves"]') });
  await expect(glovesRow).toBeVisible();
  await glovesRow.locator('button[title^="Events"]').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /pair of boxing gloves — Events/ })).toBeVisible();
  await expect(page.getByRole('dialog').getByText("can't carry rules", { exact: false })).toBeVisible();
  await expect(page.locator('[data-element-event-type="travel"] [data-element-event-date]')).toHaveCount(1);
  await expect(page.locator('[data-element-event-type="travel"] [data-element-event-date="2026-08-16"]')).toContainText('Aug');
});