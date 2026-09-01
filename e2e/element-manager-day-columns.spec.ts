import { test, expect } from '@playwright/test';
import { openSeededProject, seedLeadCast } from './helpers';

// Element Manager day columns (roadmap 42): Start/Finish Date, Total Days +
// one column per day type — derived from `project.dayTypes` so custom Calendar
// day types appear automatically. Company travel shows under the Travel type
// column (no separate "Co. Tra" column). Production counts come from section
// dates (scene → stripboard section → date); statused days from the element's
// `nonShootDates.lists` attachment.

test('element manager: date range, total days and per-day-type columns', async ({ page }) => {
  await openSeededProject(page);
  const member = await seedLeadCast(page);

  // Custom day type + statused days attached to the lead cast member —
  // through the same dispatches the UI uses (SET_DAY_TYPES /
  // UPDATE_CALENDAR_VERSION with nonShootDates).
  const seedInfo = await page.evaluate(({ fid, fname }) => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const rows = b.getRows();
    const sections = (rows?.sections || []).filter((s: any) => s.isPinned === false);
    const lastSectionDate = sections[sections.length - 1]?.date ?? '';
    const addDays = (date: string, n: number) => {
      const [y, m, d] = date.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    };
    b.dispatch({ type: 'SET_DAY_TYPES', payload: { dayTypes: [...(p.dayTypes || []), { key: 'rehearsal', label: 'Rehearsal', color: '#16a34a', icon: 'Music', attachable: true }] } });
    const cal = (p.calendarVersions || []).find((c: any) => c.id === p.activeCalendarVersionId) || (p.calendarVersions || [])[0];
    b.dispatch({
      type: 'UPDATE_CALENDAR_VERSION', payload: {
        id: cal.id,
        nonShootDates: [...(cal.nonShootDates || []),
          { date: lastSectionDate, status: 'rehearsal', lists: { rehearsal: { cast: [fid] } } },
          { date: addDays(lastSectionDate, 1), status: 'travel', lists: { travel: { cast: [fid] } } },
          { date: addDays(lastSectionDate, 2), status: 'rehearsal', lists: { rehearsal: { cast: [fid] } } },
        ],
      },
    });
    return { fid, fname };
  }, { fid: member.id, fname: member.name });
  expect(seedInfo.fid).toBeTruthy();

  // Expected numbers straight from the store (the section cursor skips statused
  // dates, so work dates are whatever the shifted schedule says — never assumed).
  const expected = await page.evaluate((fisherId) => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const rows = b.getRows();
    const cal = (p.calendarVersions || []).find((c: any) => c.id === p.activeCalendarVersionId) || (p.calendarVersions || [])[0];
    const workDates: string[] = [];
    const sceneIdByRowId = new Map(
      (rows.rows || []).filter((r: any) => r.type === 'SCENE' && r.sceneId).map((r: any) => [r.id, r.sceneId]),
    );
    for (const s of rows.sections) {
      if (s.isPinned) continue;
      for (const rid of s.rows) {
        const sceneId = sceneIdByRowId.get(rid);
        if (!sceneId) continue;
        const scene = p.scenes.find((sc: any) => sc.id === sceneId);
        if (scene && (scene.cast || '').split(',').map((x: string) => x.trim()).includes(String(fisherId))) {
          workDates.push(s.date);
          break;
        }
      }
    }
    const statuses: Record<string, string[]> = {};
    for (const n of cal?.nonShootDates || []) {
      const cat = n.lists?.[n.status]?.cast;
      if (cat && (cat.includes('*') || cat.includes(String(fisherId)))) {
        (statuses[n.status] = statuses[n.status] || []).push(n.date);
      }
    }
    const all = [...new Set([...workDates, ...Object.values(statuses).flat()])].sort();
    return {
      workDays: workDates.length,
      statusCounts: Object.fromEntries(Object.entries(statuses).map(([k, d]) => [k, d.length])),
      totalDays: all.length,
      startDate: all[0] || '',
      finishDate: all[all.length - 1] || '',
      dayTypes: p.dayTypes.map((t: any) => t.key),
      dayTypeLabels: p.dayTypes.map((t: any) => t.label),
    };
  }, seedInfo.fid);

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();
  await page.locator('aside').getByRole('button', { name: /Cast/ }).click();

  // Header: built-in + custom day-type columns.
  const thead = page.locator('thead').first();
  for (const label of ['Start Date', 'Finish Date', 'Total Days']) {
    await expect(thead.getByText(label, { exact: true })).toBeVisible();
  }
  for (const t of expected.dayTypeLabels) {
    await expect(thead.getByText(t, { exact: true })).toBeVisible();
  }
  await expect(thead.getByText('Rehearsal', { exact: true })).toBeVisible();

  // The member's row: dates + counts per column (Board ID=0, Name=1, Occ=2,
  // Start=3, Finish=4, Total Days=5, then day types in order).
  const row = page.locator('tr', { has: page.locator(`input[value="${member.name}"]`) });
  await expect(row).toBeVisible();
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  await expect(row.locator('td').nth(3)).toHaveText(fmt(expected.startDate));
  await expect(row.locator('td').nth(4)).toHaveText(fmt(expected.finishDate));
  await expect(row.locator('td').nth(5)).toHaveText(String(expected.totalDays));
  const dayTypeCols = expected.dayTypes;
  for (let i = 0; i < dayTypeCols.length; i++) {
    const key = dayTypeCols[i];
    const val = key === 'work' ? expected.workDays : (expected.statusCounts[key] || 0);
    await expect(row.locator('td').nth(6 + i)).toHaveText(String(val));
  }

  // Sanity: FISHERMAN has rehearsals + travel attached and appears on the schedule.
  expect(expected.statusCounts['rehearsal']).toBe(2);
  expect(expected.statusCounts['travel']).toBe(1);
  expect(expected.workDays).toBeGreaterThan(0);

  // Other categories get the same columns (elements appear on schedule days too).
  await page.locator('aside').getByRole('button', { name: /Vehicles/ }).click();
  await expect(page.locator('thead').first().getByText('Total Days', { exact: true })).toBeVisible();
  await expect(page.locator('thead').first().getByText('Rehearsal', { exact: true })).toBeVisible();
});