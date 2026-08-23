import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

// Roadmap 31 — location types. Verifies:
//  A. the collection menu's "All types" option clears the type filter
//  B. per-type ("Locations (of this type)") tables warm ALL pins for the
//     weather prefetch (only flat `locations` blocks filter by type)
//  C. deleting a type records its human label on the trashed locations

const MOCK_WEATHER = {
  latitude: 51.5, longitude: -0.1, generationtime_ms: 1, utc_offset_seconds: 0,
  timezone: 'GMT', elevation: 0, current_weather: { temperature: 18, windspeed: 10, winddirection: 90, weathercode: 2, time: '2026-08-23T12:00' },
  daily_units: { time: 'iso8601', weather_code: 'wmo code', sunrise: 'iso8601', sunset: 'iso8601', temperature_2m_max: '°C', temperature_2m_min: '°C' },
  daily: {},
};

function mockWeatherBody(url: string) {
  const u = new URL(url);
  const start = u.searchParams.get('start_date')!;
  const end = u.searchParams.get('end_date')!;
  const days: string[] = [];
  const d = new Date(start + 'T12:00:00Z');
  const endDate = new Date(end + 'T12:00:00Z');
  while (d <= endDate) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return {
    ...MOCK_WEATHER,
    daily: {
      time: days,
      weather_code: days.map(() => 2),
      sunrise: days.map(x => x + 'T05:44'),
      sunset: days.map(x => x + 'T20:25'),
      temperature_2m_max: days.map(() => 24),
      temperature_2m_min: days.map(() => 18),
    },
  };
}

const design = {
  id: 'loc-test', name: 'Loc Test', createdAt: Date.now(), page: 'portrait' as const,
  header: [], footer: [],
  blocks: [
    // flat Locations repeat FILTERED to Studio — only warms Studio pins
    {
      id: 'rep-loc', type: 'repeat', collection: 'locations', category: 'studio', gap: 8,
      children: [{ id: 'loc-name', type: 'text', text: '{{locationName}}' }],
    },
    // Location Types repeat → per-type locations table (no type picker):
    // the prefetch must warm ALL pins — including Unit Base's.
    {
      id: 'rep-types', type: 'repeat', collection: 'locationTypes', gap: 8,
      children: [
        {
          id: 'tbl-loc', type: 'table', collection: 'locationsOfType', showHeader: true,
          columns: [
            { id: 'l1', field: 'locationName', width: 60 },
            { id: 'l2', field: 'weather', width: 40 },
          ],
        },
      ],
    },
  ],
};

function locCategory(page: any) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    const p = JSON.parse(localStorage.getItem(key)!);
    const d = p.reportDesigns.find((x: any) => x.id === p.activeReportId);
    return d.blocks.find((b: any) => b.id === 'rep-loc').category as string | undefined;
  });
}

test('location types: All-types clear, per-type prefetch, delete records the label', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  project.locationTypes = [
    { key: 'unitbase', label: 'Unit Base' },
    { key: 'studio', label: 'Studio' },
  ];
  project.locations = [
    { id: 'loc-1', type: 'unitbase', name: 'Unit Base A', address: '1 Maryland St', place: 'Unit Base A, London', lat: 51.501, lng: -0.101 },
    { id: 'loc-2', type: 'unitbase', name: 'Unit Base B', address: '2 Maryland St', place: 'Unit Base B, London', lat: 51.502, lng: -0.102 },
    { id: 'loc-3', type: 'studio', name: 'Studio S', address: '3 Maryland St', place: 'Studio S, London', lat: 51.503, lng: -0.103 },
  ];
  project.reportDesigns = [design];
  project.activeReportId = design.id;

  const weatherRequests: string[] = [];
  await page.route('**://api.open-meteo.com/**', route => {
    weatherRequests.push(route.request().url());
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockWeatherBody(route.request().url())) });
  });
  await page.route('**://archive-api.open-meteo.com/**', route => {
    weatherRequests.push(route.request().url());
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockWeatherBody(route.request().url())) });
  });
  await page.route('**://tile.openstreetmap.org/**', route => route.abort());
  await page.route('**://nominatim.openstreetmap.org/**', route => route.abort());

  await page.addInitScript(seedProjectScript({ raw: JSON.stringify(project) }));
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(seed.data.title, { exact: true }).first().click({ timeout: 8000 });
    await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  
  // ---- B. prefetch warms the per-type table's pins (Unit Base coords) ----
  await expect.poll(() => weatherRequests.length, { timeout: 8000 }).toBeGreaterThan(0);
  const coords = weatherRequests.map(u => {
    const p = new URL(u).searchParams;
    return [Number(p.get('latitude')), Number(p.get('longitude'))];
  });
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-2;
  expect(coords.some(([la, lo]) => near(la, 51.501) && near(lo, -0.101))).toBe(true); // locationsOfType table warms ALL pins
  expect(coords.some(([la, lo]) => near(la, 51.502) && near(lo, -0.102))).toBe(true);
  expect(coords.some(([la, lo]) => near(la, 51.503) && near(lo, -0.103))).toBe(true); // flat locations (studio) warms its own

  // ---- A. All-types clear option ----
  // select the repeat card via its LABEL row (the card's center hits the inner
  // text block)
  await page.locator('[data-block-id="rep-loc"]').getByText('Repeat: Locations (Studio)', { exact: true }).click();
  
  const pickMenu = async (itemName: string) => {
    // Radix submenus reposition between open and first click (a known flake —
    // the panel re-renders under the cursor) — retry the pick until the
    // design state actually changes.
    const goal = itemName === 'All types' ? undefined : 'unitbase';
    for (let attempt = 0; attempt < 2; attempt++) {
      const trigger = page.getByRole('button', { name: /Locations( · .*)?/ });
      await trigger.click();
      const locItem = page.locator('.ui-menu [role="menuitem"]').getByText('Locations', { exact: true });
      await locItem.hover();
      const item = page.locator('.ui-menu [role="menuitem"]').getByText(itemName, { exact: true });
      await expect(item).toBeVisible({ timeout: 3000 });
      await item.click();
      await expect.poll(() => locCategory(page), { timeout: 5000 }).toBe(goal as never);
      return;
    }
    throw new Error('menu pick did not apply: ' + itemName);
  };;

  await pickMenu('Unit Base');
  await expect(page.getByRole('button', { name: 'Locations · Unit Base', exact: true })).toBeVisible({ timeout: 3000 });
  await expect.poll(() => locCategory(page), { timeout: 5000 }).toBe('unitbase');

  await pickMenu('All types');
  await expect(page.getByRole('button', { name: 'Locations', exact: true })).toBeVisible({ timeout: 3000 });
  await expect.poll(() => locCategory(page), { timeout: 5000 }).toBeUndefined();

  // ---- C. delete-type records the human label in trash ----
  await page.getByRole('button', { name: 'Production', exact: true }).click();
  await page.getByRole('button', { name: 'Locations', exact: true }).first().click();
  await page.getByTitle('Delete type').first().click();
  await expect(page.getByText('Delete "Unit Base"?', { exact: true })).toBeVisible({ timeout: 3000 });
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    const p = JSON.parse(localStorage.getItem(key)!);
    return (p.locationsTrash || []).length;
  }), { timeout: 5000 }).toBe(2);

  const trash = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    const p = JSON.parse(localStorage.getItem(key)!);
    return (p.locationsTrash || []).map((t: any) => ({ type: t.location.type, typeLabel: t.typeLabel }));
  });
  expect(trash.length).toBe(2);
  expect(trash.every((t: any) => t.type === 'unitbase')).toBe(true);
  expect(trash.every((t: any) => t.typeLabel === 'Unit Base')).toBe(true); // human label, not the slug
});