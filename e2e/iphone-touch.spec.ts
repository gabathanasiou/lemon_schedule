import { test, expect, type Page } from '@playwright/test';
import { loadSeedProject, seedProjectScript, seedDayDates } from './helpers';

// Roadmap 331/182 — the app's phone surfaces under iPhone WebKit. Run with
// `npx playwright test -c playwright.iphone.config.ts`.
//
// WebKit here is NOT iOS Safari: it does not defer the click to a second tap,
// so the native two-tap model is a device check (see docs/UI-PRIMITIVES.md
// §Hover & Tap Feedback). These tests cover what CAN break silently on the
// phone: the shell tabs, the File menu's nested submenu (accordion + in the
// viewport), a revealed tooltip that must clear on an outside tap, and the
// landscape full chrome.
test.skip(({ browserName, isMobile }) => !(browserName === 'webkit' && isMobile), 'iPhone WebKit only');

/* The iPad project also runs this file (webkit + isMobile); it targets the
   two-tab phone shell, which does not exist at tablet width. */
test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 999) >= 600, 'iPhone portrait shell only');
});

/** Phone boot: the Project Manager → project, then the two-tab header. */
async function bootPhone(page: Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto('/lemon_schedule/');
  await page.getByText(seed.data.title, { exact: true }).first().click({ timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Schedule', exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('phone-splash')).toHaveCount(0, { timeout: 5000 });
}

test('phone shell: Schedule ⇄ Sheet switch on one tap', async ({ page }) => {
  await bootPhone(page);
  const schedule = page.getByRole('button', { name: 'Schedule', exact: true });
  const sheet = page.getByRole('button', { name: 'Sheet', exact: true });
  await expect(schedule).toHaveAttribute('data-active', 'true');

  await sheet.tap();
  await expect(sheet).toHaveAttribute('data-active', 'true');
  await expect(schedule).not.toHaveAttribute('data-active', 'true');
  await expect(page.getByText(/SCENE SHEET/i).first()).toBeVisible();

  await schedule.tap();
  await expect(schedule).toHaveAttribute('data-active', 'true');
  await expect(page.getByText(/START OF DAY 1/i).first()).toBeVisible();
});

test('File → Import: the in-place submenu card covers the parent, stays on screen, and Back returns (182/331)', async ({ page }) => {
  await bootPhone(page);
  await page.locator('[data-presence-anchor="toolbar:header:file"]').tap();

  const projectManager = page.getByRole('menuitem', { name: 'Project Manager' });
  await expect(projectManager).toBeVisible();
  const importRow = page.getByRole('menuitem', { name: 'Import', exact: true });
  await importRow.tap();

  // iPhone default: the in-place card covers the parent exactly, with a Back
  // row (the iPad gets the inline accordion instead).
  const card = page.locator('[data-submenu-presentation="replace"]');
  await expect(card).toBeVisible();
  const back = card.locator('[data-submenu-back]');
  await expect(back).toBeVisible();
  await expect(page.locator('[data-submenu-panel]')).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'New project (.lemon, .msd, .sex, scripts)' })).toBeVisible();

  // The parent card stays mounted behind the child, dimmed.
  const parentOpacity = await page.locator('[role="menu"]').first().evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(parentOpacity).toBeLessThan(0.5);

  const parent = page.locator('[role="menu"]').first();
  const parentBox = (await parent.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  const vw = page.viewportSize()!.width;
  /* Compare with the UNTRANSFORMED parent width: the parent is scaled down
     behind the card, so its bounding box is slightly narrower. */
  const parentWidth = await parent.evaluate((el) => (el as HTMLElement).offsetWidth);
  expect(Math.abs(cardBox.width - parentWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(cardBox.x - parentBox.x)).toBeLessThanOrEqual(12);
  expect(cardBox.x).toBeGreaterThanOrEqual(0);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(vw + 1);

  // Back closes the child and the File rows come back.
  await back.tap();
  await expect(card).toHaveCount(0);
  await expect(projectManager).toBeVisible();

  // Tap outside the card closes the whole menu.
  await page.getByRole('button', { name: 'Schedule', exact: true }).tap();
  await expect(projectManager).toBeHidden();
});

test('landscape: the full chrome returns and a calendar day modal opens', async ({ page }) => {
  await bootPhone(page);
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sheet', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Calendar', exact: true }).tap();
  const days = await seedDayDates(page);
  const dayCell = page.locator(`[data-date-key="${days[0]}"]`);
  await expect(dayCell).toBeVisible();
  await dayCell.locator('[data-day-header]').first().tap();
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
});
