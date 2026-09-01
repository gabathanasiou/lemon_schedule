import { test, expect } from '@playwright/test';
import { openSeededProject, seedLeadCast, seedElement, seedDayDates } from './helpers';

// Element Manager Events (roadmap item 46): the per-row Events button opens
// the element events manager — one collapsible card per day type with only
// this element's dates (comment inline, Edit/Remove per group), a collapsed
// Add-Event picker, a Violations section, and rules with Add Rule (pre-scoped
// to the element). Cards count like day statuses everywhere: the member's
// Travel column drops when the travel card is removed. State is asserted
// through the debug bridge. Seed-agnostic: the member, a wardrobe element and
// the production-day dates are resolved from the live bridge.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

test('element manager events: type cards, add/remove, violations, rules, count columns', async ({ page }) => {
  await openSeededProject(page);

  const member = await seedLeadCast(page);
  const wardrobe = await seedElement(page, 'wardrobe');
  const days = await seedDayDates(page);
  expect(days.length).toBeGreaterThan(3);
  const travelDate = days[0];
  const ruleDate = days[1];
  const addedDate = days[2];
  expect(wardrobe.name).toBeTruthy();

  // Deterministic fixture: the member has a CARD-ONLY travel event on
  // travelDate (no day status — a travel card on a normal day, a wardrobe
  // element proves group scoping), a dated DATE_RESTRICTION, and a MAX_HOURS
  // that guarantees a violation on the first day the member works. Seed rules
  // referencing the member are deleted so only our rules feed the surfaces.
  const seedInfo = await page.evaluate(({ fid, travelDate, ruleDate, wardrobeName }) => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const cal = (p.calendarVersions || []).find((c: any) => c.id === p.activeCalendarVersionId) || (p.calendarVersions || [])[0];
    const refs = (r: any) => r.type === 'CAST_CONFLICT'
      ? [...(r.castIds || []), ...(r.conflictCastIds || [])]
      : (r.castId ? [r.castId] : (r.castIds || []));
    for (const r of (p.rules || [])) {
      if (refs(r).includes(fid)) b.dispatch({ type: 'DELETE_RULE', payload: r.id });
    }
    const ns = (cal.nonShootDates || []).filter((n: any) => n.date !== travelDate)
      .concat([{ date: travelDate, lists: { travel: { cast: [fid], wardrobe: [wardrobeName] } } }]);
    b.dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: cal.id, nonShootDates: ns } });
    b.dispatch({ type: 'ADD_RULE', payload: { id: 'ee-rule-1', type: 'DATE_RESTRICTION', castId: fid, dates: [ruleDate] } });
    const rows = b.getRows();
    const sceneByRow = new Map(
      (rows.rows || []).filter((r: any) => r.type === 'SCENE' && r.sceneId).map((r: any) => [r.id, r.sceneId]),
    );
    const workDates: string[] = [];
    for (const s of rows.sections) {
      if (s.isPinned) continue;
      const hasMember = (s.rows || []).some((rid: any) => {
        const sc = p.scenes.find((x: any) => x.id === sceneByRow.get(rid));
        return sc && (sc.cast || '').split(',').map((x: string) => x.trim()).includes(fid);
      });
      if (hasMember) workDates.push(s.date);
    }
    const violationDate = workDates[0] || '';
    if (violationDate) {
      b.dispatch({ type: 'ADD_RULE', payload: { id: 'ee-max-1', type: 'MAX_HOURS', castId: fid, maxHours: 0.1, dates: [violationDate] } });
    }
    const travelIdx = p.dayTypes.findIndex((t: any) => t.key === 'travel');
    const defaultType = (p.dayTypes || []).filter((t: any) => t.key !== 'work' && t.attachable !== false)[0]?.key || 'hold';
    return { fid, violationDate, workCount: workDates.length, travelIdx, defaultType };
  }, { fid: member.id, travelDate, ruleDate, wardrobeName: wardrobe.name });
  expect(seedInfo.workCount).toBeGreaterThan(0);

  const display = `${member.id}. ${member.name}`;

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();

  const memberRow = page.locator('tr', { has: page.locator(`input[value="${member.name}"]`) });
  await expect(memberRow).toBeVisible();
  await memberRow.locator('button[title^="Events"]').click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading', { name: new RegExp(`${esc(member.name)} — Events`) })).toBeVisible();
  const travelCol = 6 + seedInfo.travelIdx;

  // ---- Events: one Travel card, one day row — plain date + actions (no
  //     element name in the rows; it's in the modal title)
  const travelCard = modal.locator('[data-element-event-type="travel"]');
  await expect(travelCard).toBeVisible();
  await expect(travelCard.locator('[data-element-event-date]')).toHaveCount(1);
  const travelRow = travelCard.locator(`[data-element-event-date="${travelDate}"]`);
  await expect(travelRow).toContainText('Aug');
  // The whole row is the editor trigger (title on the row); the remove X is trailing
  await expect(travelRow).toHaveAttribute('title', `Edit ${display}'s event on this day`);
  await expect(travelRow.locator(`button[aria-label="Remove ${display} from this day"]`)).toBeVisible();
  await expect(travelCard.locator('[data-element-event-group]')).toHaveCount(0);

  // ---- Inline note: add "Packing the gear" to the travel event
  await travelRow.getByRole('button', { name: /Add note/ }).click();
  const noteInput = travelRow.locator('input');
  await noteInput.fill('Packing the gear');
  await noteInput.press('Enter');
  await expect.poll(() => page.evaluate(({ fid, travelDate }) => {
    const st = (window as any).__lemonSchedule.getState().present;
    const cal = (st.calendarVersions || []).find((c: any) => c.id === st.activeCalendarVersionId) || (st.calendarVersions || [])[0];
    const e = (cal.nonShootDates || []).find((n: any) => n.date === travelDate);
    return e?.comments?.travel?.cast?.[fid] || '';
  }, { fid: seedInfo.fid, travelDate })).toBe('Packing the gear');
  await expect(travelRow.getByText('Packing the gear')).toBeVisible();

  // ---- NO rows for rule coverage (dated rules don't list their dates)
  await expect(modal.locator(`[data-element-event-date="${ruleDate}"]`)).toHaveCount(0);

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
  //     element in its category) with the calendar INLINE (multi-pick),
  //     Create merges it onto the day as a per-element card
  await modal.getByRole('button', { name: 'Add Event' }).click();
  const adder = page.getByRole('dialog').last();
  await expect(adder.getByRole('heading', { name: new RegExp(esc(display)) })).toBeVisible();
  // Navigate the inline DatePicker to the target day's month.
  const [yy, mm, dd] = addedDate.split('-').map(Number);
  const target = `${MONTHS[mm - 1]} ${yy}`;
  const pickerHeader = adder.getByRole('button', { name: 'Select year and month' });
  let guard = 0;
  while (guard++ < 24) {
    const txt = ((await pickerHeader.textContent()) || '').trim();
    if (txt === target) break;
    const want = new Date(yy, mm - 1, 1);
    const cur = new Date(txt + ' 1');
    if (want > cur) await adder.getByRole('button', { name: 'Next month' }).click();
    else await adder.getByRole('button', { name: 'Previous month' }).click();
  }
  await adder.getByRole('button', { name: String(dd), exact: true }).click();
  await adder.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`${esc(member.name)} — Events`) })).toBeVisible();
  await expect.poll(() => page.evaluate(({ fid, addedDate }) => {
    const st = (window as any).__lemonSchedule.getState().present;
    const cal = (st.calendarVersions || []).find((c: any) => c.id === st.activeCalendarVersionId) || (st.calendarVersions || [])[0];
    const e = (cal.nonShootDates || []).find((n: any) => n.date === addedDate);
    return Object.values(e?.lists || {}).flatMap((l: any) => l.cast || []).join(',');
  }, { fid: seedInfo.fid, addedDate })).toBe(seedInfo.fid);
  // The new default-type card appears; the travel card keeps its date only
  await expect(modal.locator(`[data-element-event-type="${seedInfo.defaultType}"] [data-element-event-date="${addedDate}"]`)).toBeVisible();
  await expect(travelCard.locator('[data-element-event-date]')).toHaveCount(1);
  // Cards count in their manager columns (events count like day status)
  const defaultCol = 6 + (await page.evaluate((t) => {
    const p = (window as any).__lemonSchedule.getProject();
    return p.dayTypes.findIndex((x: any) => x.key === t);
  }, seedInfo.defaultType));
  await expect(memberRow.locator('td').nth(travelCol)).toHaveText('1');
  await expect(memberRow.locator('td').nth(defaultCol)).toHaveText('1');

  // ---- Remove drops only the cast group: the Travel column drops, the day
  //     keeps its Wardrobe group (the wardrobe element survives in the store)
  await travelRow.getByRole('button', { name: `Remove ${display} from this day` }).click();
  await expect.poll(() => page.evaluate(({ travelDate, wardrobeName }) => {
    const s = (window as any).__lemonSchedule;
    const st = s.getState().present;
    const cal = (st.calendarVersions || []).find((c: any) => c.id === st.activeCalendarVersionId) || (st.calendarVersions || [])[0];
    const e = (cal.nonShootDates || []).find((n: any) => n.date === travelDate);
    return e ? JSON.stringify({ cast: e.lists?.travel?.cast || [], wardrobe: e.lists?.travel?.wardrobe || [] }) : 'gone';
  }, { travelDate, wardrobeName: wardrobe.name })).toBe(JSON.stringify({ cast: [], wardrobe: [wardrobe.name] }));
  await expect(memberRow.locator('td').nth(travelCol)).toHaveText('0');
  // The wardrobe element is still on the day (only the cast group was removed)
  await expect(page.locator(`[data-element-event-date="${travelDate}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();

  // ---- Non-cast elements: day rows render, rules are cast-only (the Rules
  //     section is hidden entirely — it can never carry rules)
  await page.locator('aside').getByRole('button', { name: /Wardrobe/ }).click();
  const wardrobeRow = page.locator('tr', { has: page.locator(`input[value="${wardrobe.name}"]`) });
  await expect(wardrobeRow).toBeVisible();
  await wardrobeRow.locator('button[title^="Events"]').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: new RegExp(`${esc(wardrobe.name)} — Events`) })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Rules', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-element-event-type="travel"] [data-element-event-date]')).toHaveCount(1);
  await expect(page.locator(`[data-element-event-type="travel"] [data-element-event-date="${travelDate}"]`)).toContainText('Aug');
});
