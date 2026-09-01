import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript, seedLeadCast, seedDayDates, activeCalendar } from './helpers';

// Reports designer × day types (roadmap 81): a base `dayTypes` collection (the
// Day Type Breakdown rollup — Work = total shooting days, others count status +
// cards), a `dayTypesOfElement` contextual child (the day types a given element
// has days in, from the events model — status OR card, non-production days
// included), per-day fields (`dayCode` = the DOOD cell letter, work-wins;
// `dayTypeEvents` = every type on a multi-type day), and dynamically-generated
// per-type element columns (`total{Type}Days` / `{Type}DayList` — custom
// attachable types in use only). All resolved through the canonical engines
// (dayTypes.ts / deriveDood / isElementMarked), never re-derived.
//
// Invariants under test:
//  - a statused day is NOT a production day, so the rollup counts it while a
//    `days` repeat never sees it (the section cursor skips statuses);
//  - a card-only entry (lists, no status) on a production day does NOT shift
//    sections and reads as a work day in the DOOD cell (work wins).

function field(id: string, f: string, extra: any = {}): any {
  return { id, type: 'field', field: f, ...extra };
}

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

test('reports designer: day-type rollup, per-element day types, per-type columns', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.dayTypes = [...(project.dayTypes || []), { key: 'rehearsal', label: 'Rehearsal', color: '#16a34a', attachable: true }];
  project.reportDesigns = [{
    id: 'dt-design',
    name: 'Day Type Report',
    createdAt: Date.now(),
    page: 'landscape',
    blocks: [
      // 1. Day Type Breakdown rollup table (Work + in-use types only)
      {
        id: 't-dt', type: 'table', collection: 'dayTypes', showHeader: true,
        columns: [
          { id: 'dt-lbl', field: 'dayTypeLabel', width: 24 },
          { id: 'dt-code', field: 'dayTypeCode', width: 14 },
          { id: 'dt-cnt', field: 'dayTypeDayCount', width: 16 },
          { id: 'dt-days', field: 'dayTypeDays', width: 46 },
        ],
      },
      // 2. Per-type element columns (custom attachable types in use)
      {
        id: 't-cast', type: 'table', collection: 'elements', category: 'cast', showHeader: true,
        columns: [
          { id: 'c-name', field: 'elementName', width: 30 },
          { id: 'c-tot', field: 'totalRehearsalDays', width: 15 },
          { id: 'c-lst', field: 'rehearsalDayList', width: 55 },
        ],
      },
      // 3. dayTypesOfElement child repeat inside a cast repeat
      {
        id: 'r-cast', type: 'repeat', collection: 'elements', category: 'cast', gap: 8,
        children: [
          field('r-name', 'elementName'),
          {
            id: 'r-dtoe', type: 'repeat', collection: 'dayTypesOfElement', gap: 8,
            children: [
              field('d-lbl', 'dayTypeLabel'),
              field('d-cnt', 'dayTypeDayCount'),
              field('d-lst', 'dayTypeDayList'),
            ],
          },
        ],
      },
      // 4. Per-day fields (dayCode work-wins, dayTypeEvents multi-type)
      {
        id: 't-days', type: 'table', collection: 'days', showHeader: true,
        columns: [
          { id: 'dd-num', field: 'dayNumber', width: 15 },
          { id: 'dd-code', field: 'dayCode', width: 15 },
          { id: 'dd-evt', field: 'dayTypeEvents', width: 40 },
          { id: 'dd-date', field: 'dayDate', width: 30 },
        ],
      },
    ],
    header: [], footer: [],
  }];
  project.activeReportId = 'dt-design';
  await page.addInitScript(seedProjectScript({ raw: JSON.stringify(project) }));
  await page.goto('http://localhost:3001/lemon_schedule/');
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Breakdown', exact: true })).toBeVisible({ timeout: 10000 });

  const member = await seedLeadCast(page);
  expect(member.id).toBeTruthy();
  const dayDates = await seedDayDates(page);
  expect(dayDates.length).toBeGreaterThan(0);
  const prodDate = dayDates[0];

  // The Work built-in's label/count are the schedule's production days — resolve
  // the label from the bridge (seed-agnostic; the work type is never hardcoded).
  const workLabel = await page.evaluate(() => {
    const p: any = (window as any).__lemonSchedule.getProject();
    return (p.dayTypes || []).find((t: any) => t.key === 'work')?.label || 'Work';
  });

  // A free, non-production date for the Rehearsal status day (never a section
  // date, never already statused).
  const cal = await activeCalendar(page);
  const rehearsalDate = await page.evaluate(({ prodDates, cal }) => {
    const occupied = new Set([...prodDates, ...((cal?.nonShootDates || []).map((n: any) => n.date))]);
    const start = cal?.productionStart || prodDates[0];
    const d = new Date(start + 'T00:00:00');
    for (let i = 0; i < 500; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!occupied.has(iso)) return iso;
      d.setDate(d.getDate() + 1);
    }
    return prodDates[prodDates.length - 1];
  }, { prodDates: dayDates, cal });

  // Add the events via the bridge (the same dispatch path the UI uses): a
  // Rehearsal status + cast card on a non-production date, and a Travel CARD
  // (lists only, no status) on the first production day — sections don't shift
  // (cards never skip the date cursor) and the DOOD cell stays work (W).
  await page.evaluate(({ calId, rehearsalDate, prodDate, castId }) => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    const cal = (p.calendarVersions || []).find((c: any) => c.id === calId) || (p.calendarVersions || [])[0];
    const dates = [...(cal.nonShootDates || [])];
    if (!dates.find((n: any) => n.date === rehearsalDate)) {
      dates.push({ date: rehearsalDate, status: 'rehearsal', lists: { rehearsal: { cast: [castId] } } });
    }
    if (!dates.find((n: any) => n.date === prodDate)) {
      dates.push({ date: prodDate, lists: { travel: { cast: [castId] } } });
    }
    b.dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: cal.id, nonShootDates: dates } });
  }, { calId: cal.id, rehearsalDate, prodDate, castId: member.id });

  // Open the designer and print
  await page.getByRole('banner').getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.evaluate(() => { (window as any).print = () => {}; });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: /Print \/ Save PDF/ }).click();
  const pages = page.locator('.report-root .report-page');
  await expect(pages.first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.report-root')?.getAttribute('data-paginated') === 'true', null, { timeout: 15000 });

  const rehShort = shortDate(rehearsalDate);
  const prodShort = shortDate(prodDate);

  // 1. Day Type Breakdown: the Rehearsal row carries code R, 1 day, its date
  // (non-production → bare date in the day list); the Work ({workLabel}) row
  // counts the production days (Work is the default state of every shoot day).
  const rehRow = pages.locator('.rm-row', { hasText: 'Rehearsal' }).first();
  await expect(rehRow).toContainText(rehShort);
  const workRow = pages.locator('.rm-row', { hasText: workLabel }).first();
  await expect(workRow).toContainText(String(dayDates.length));

  // 2. Per-type columns on the cast table: the lead cast member's rehearsal
  // day count + day list.
  const castRow = pages.locator('.rm-row', { hasText: member.name }).first();
  await expect(castRow).toContainText(rehShort);

  // 3. dayTypesOfElement child repeat prints the element's day types.
  const pagesText = await pages.evaluateAll(els => (els as HTMLElement[]).map(el => el.innerText || ''));
  const all = pagesText.join('\n');
  expect(all).toContain('Rehearsal');

  // 4. Per-day fields: the travel-card production day is Work (W — work wins)
  // while dayTypeEvents still names the card type.
  const daysTable = pages.locator('.report-table-cols', { hasText: 'Event Types' }).first();
  const travelDay = daysTable.locator('.rm-row', { hasText: 'Travel' }).first();
  await expect(travelDay).toContainText('W');
  await expect(travelDay).toContainText(prodShort);
  // The rehearsal day is NOT a production day — it never appears in the days
  // table (the section cursor skips statused dates; the days collection only
  // holds production sections).
  const dayRows = await daysTable.locator('.rm-row').evaluateAll(rows =>
    (rows as HTMLElement[]).map(r => r.innerText || ''),
  );
  expect(dayRows.some(r => r.includes(rehShort))).toBe(false);

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toBeVisible();
});
