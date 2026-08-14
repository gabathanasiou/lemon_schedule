import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';

// Sun & Weather fields + Image/Map blocks in the Reports Designer.
// Network is fully mocked: Open-Meteo (sun/weather), Nominatim (geocoding),
// OSM tiles (aborted — the map container still renders).

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const MOCK_WEATHER = {
  daily_units: { time: 'iso8601', weather_code: 'wmo code', sunrise: 'iso8601', sunset: 'iso8601', temperature_2m_max: '°C', temperature_2m_min: '°C' },
  daily: {
    time: [] as string[],
    weather_code: [] as number[],
    sunrise: [] as string[],
    sunset: [] as string[],
    temperature_2m_max: [] as number[],
    temperature_2m_min: [] as number[],
  },
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

const BIG_BEN = {
  place_id: 1, lat: '51.5007042', lon: '-0.1245721', display_name: 'Big Ben, Bridge Street, Westminster, London SW1A 2JR, United Kingdom',
};

test.describe('Reports Designer — Sun & Weather, Image, Map', () => {
  test('resolves day weather tokens, attaches an image, renders maps and the location picker', async ({ page }) => {
    const seed = loadSeedProject();
    const project = JSON.parse(seed.raw);

    const design = {
      id: 'swm-test', name: 'Sun Weather Map', createdAt: Date.now(), page: 'portrait' as const,
      blocks: [
        {
          id: 'r-days', type: 'repeat', collection: 'days', gap: 8,
          children: [
            { id: 't-env', type: 'text', text: 'Sunrise {{sunrise}} · Sunset {{sunset}} · Weather {{weather}}' },
            { id: 'addr-field', type: 'field', field: 'dayLocationAddress' },
            { id: 'city-field', type: 'field', field: 'dayLocationCity' },
            { id: 'postcode-field', type: 'field', field: 'dayLocationPostcode' },
            { id: 'country-field', type: 'field', field: 'dayLocationCountry' },
            { id: 'link-block', type: 'link', text: 'Open in Google Maps', url: '{{dayLocationLink}}' },
            { id: 'map-inherit', type: 'map', mapInheritLocation: true, mapShowAddress: true, mapHeight: 120, mapZoom: 12 },
          ],
        },
        { id: 'img-block', type: 'image' },
        { id: 'map-block', type: 'map', mapLat: 51.5074, mapLng: -0.1278, mapPlace: 'London', mapShowAddress: true, mapOpenLink: 'google', mapHeight: 160, mapZoom: 13 },
      ],
      header: [], footer: [],
    };

    await page.route('**://api.open-meteo.com/**', route => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockWeatherBody(route.request().url())) });
    });
    await page.route('**://archive-api.open-meteo.com/**', route => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockWeatherBody(route.request().url())) });
    });
    await page.route('**://tile.openstreetmap.org/**', route => route.abort());
    await page.route('**://nominatim.openstreetmap.org/search**', route => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([BIG_BEN]) });
    });
    await page.route('**://nominatim.openstreetmap.org/reverse**', route => {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ display_name: BIG_BEN.display_name }) });
    });

    await page.addInitScript(({ projectJson, meta, designJson }) => {
      const project = JSON.parse(projectJson);
      project.reportDesigns = [JSON.parse(designJson)];
      project.activeReportId = 'swm-test';
      localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
      localStorage.setItem('lemon_schedule_project_index', JSON.stringify([meta]));
    }, {
      projectJson: JSON.stringify(project),
      meta: { id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() },
      designJson: JSON.stringify(design),
    });

    await page.goto('http://localhost:3001/lemon_schedule/');
    await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
    await page.waitForTimeout(500);

    // ---- Sun & Weather: day tokens resolve from the (mocked) cache ----
    await expect(page.getByText('Sunrise 05:44 · Sunset 20:25 · Weather Partly cloudy · 18–24°C', { exact: false })).toBeVisible({ timeout: 8000 });

    // ---- location attributes resolve to the dummy address (structured) ----
    await expect(page.locator('[data-block-id="addr-field"]')).toContainText('112 Maryland Street', { timeout: 8000 });
    await expect(page.locator('[data-block-id="city-field"]')).toContainText('London');
    await expect(page.locator('[data-block-id="postcode-field"]')).toContainText('E15 1QD');
    await expect(page.locator('[data-block-id="country-field"]')).toContainText('United Kingdom');

    // ---- inherited-location map inside the days repeat renders (dummy addr) ----
    await expect(page.locator('[data-block-id="map-inherit"] .leaflet-container')).toBeAttached({ timeout: 8000 });
    await expect(page.locator('[data-block-id="map-inherit"]')).toContainText('112 Maryland Street');

    // ---- link block inside the days repeat: label + resolved day link ----
    const DUMMY_HREF = 'https://www.google.com/maps?q=112%20Maryland%20Street%2C%20London%20E15%201QD%2C%20United%20Kingdom';
    const linkBlock = page.locator('[data-block-id="link-block"]');
    await expect(linkBlock).toContainText('Open in Google Maps');
    await expect(linkBlock.locator('a[href^="https://www.google.com/maps"]')).toHaveAttribute('href', DUMMY_HREF);

    // ---- map block: address bar + open-in-maps link ----
    await expect(page.locator('[data-block-id="map-block"] .leaflet-container')).toBeAttached({ timeout: 8000 });
    const openLink = page.locator('[data-block-id="map-block"] a[href^="https://www.google.com/maps"]');
    await expect(openLink).toBeAttached();
    await expect(openLink).toHaveAttribute('href', 'https://www.google.com/maps?q=London');
    await expect(page.locator('[data-block-id="map-block"]')).toContainText('London');

    // ---- location picker: search → pin → attach ----
    await page.locator('[data-block-id="map-block"]').click({ force: true });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Change location' }).click();
    await expect(page.getByText('Attach a location')).toBeVisible();
    await page.getByPlaceholder('Search an address or place…').fill('Big Ben');
    await page.waitForTimeout(700);
    await page.getByText('Big Ben, Bridge Street', { exact: false }).click();
    await page.getByRole('button', { name: 'Attach pin' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-block-id="map-block"]')).toContainText('Big Ben, Bridge Street');

    // ---- image block: attach a file → data URL renders in the block ----
    // Deselect first: the map block's floating chrome overlaps the image card.
    await page.locator('.flex-1.overflow-auto.p-8').click({ position: { x: 8, y: 300 } });
    await page.waitForTimeout(200);
    await page.locator('[data-block-id="img-block"]').click();
    await page.waitForTimeout(300);
    await page.locator('#report-image-input-img-block').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1PX });
    await expect(page.locator('[data-block-id="img-block"] img[src^="data:image/png"]')).toBeVisible({ timeout: 5000 });

    // ---- preview: same values in the print-preview path ----
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Sunrise 05:44', { exact: false }).first()).toBeVisible({ timeout: 5000 });
  });
});
