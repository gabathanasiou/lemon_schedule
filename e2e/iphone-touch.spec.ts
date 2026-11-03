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

  /* The version picker keeps its natural size and only opens/closes. */
  await page.locator('[data-presence-anchor="toolbar:schedule:versions"]').tap();
  const menu = page.locator('[role="menu"]').first();
  await expect(menu).toBeVisible();
  await page.getByRole('button', { name: 'Schedule', exact: true }).tap();
  await expect(menu).toBeHidden();
});

test('File → Print → Custom Reports: ONE nested card, normal Back item, one level back (335)', async ({ page }) => {
  await bootPhone(page);
  await page.locator('[data-presence-anchor="toolbar:header:file"]').tap();

  const projectManager = page.getByRole('menuitem', { name: 'Project Manager' });
  await expect(projectManager).toBeVisible();
  const vw = page.viewportSize()!.width;
  const root = page.locator('[role="menu"]').first();
  const rootBox = (await root.boundingBox())!;

  await page.getByRole('menuitem', { name: 'Print', exact: true }).tap();
  const printCard = page.locator('[data-submenu-presentation="replace"]');
  await expect(printCard).toBeVisible();
  await expect(page.locator('[data-submenu-panel]')).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Custom Reports', exact: true }).tap();

  /* ONE painted dropdown at every depth: the ancestors keep layout (their
     rects feed the FLIP) but are fully transparent — no dimmed stack, no
     second shadow. */
  expect(await page.locator('[role="menu"]').evaluateAll(els =>
    els.filter(el => Number(getComputedStyle(el).opacity) > 0).length)).toBe(1);
  const paintedBacks = await page.locator('[data-submenu-back]').evaluateAll(els => els.filter(el => {
    let p: HTMLElement | null = el as HTMLElement;
    while (p) {
      if (Number(getComputedStyle(p).opacity) === 0) return false;
      p = p.parentElement;
    }
    return true;
  }).length);
  expect(paintedBacks).toBe(1);

  // The nested card covers the parent File card's width; height stays natural.
  const deepCard = page.locator('[data-submenu-presentation="replace"]').last();
  const deepBox = (await deepCard.boundingBox())!;
  expect(Math.abs(deepBox.width - rootBox.width)).toBeLessThanOrEqual(2);
  expect(deepBox.x).toBeGreaterThanOrEqual(0);
  expect(deepBox.x + deepBox.width).toBeLessThanOrEqual(vw + 1);

  // Back is a NORMAL item (same height as a menu row), labelled with the card
  // it returns from, with the divider + chevron.
  const back = page.locator('[data-submenu-back]').filter({ hasText: 'Custom Reports' });
  await expect(back).toBeVisible();
  const backBox = (await back.boundingBox())!;
  const reportRow = page.getByRole('menuitem', { name: 'One-Liner' });
  if (await reportRow.count()) {
    const rowBox = (await reportRow.first().boundingBox())!;
    expect(Math.abs(backBox.height - rowBox.height)).toBeLessThanOrEqual(3);
  }

  // One level at a time: Custom Reports → Print → File root.
  await back.tap();
  const printBack = page.locator('[data-submenu-back]').filter({ hasText: 'Print' });
  await expect(printBack).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Schedule...' })).toBeVisible();
  await printBack.tap();
  await expect(projectManager).toBeVisible();

  // Tap outside the card closes the whole menu.
  await page.getByRole('button', { name: 'Schedule', exact: true }).tap();
  await expect(projectManager).toBeHidden();
});

test.describe('Schedule tab with REAL motion', () => {
  /* The nested-card bug only existed with motion ON (the parent card's
     pointer-events flip during the morph dismissed the menu) — the rest of
     this file runs reduced-motion for stability, so this case opts back in. */
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  test('Schedule tab (landscape): views, cell borders and nested menus act on the first tap', async ({ page }) => {
  await bootPhone(page);
  await page.setViewportSize({ width: 852, height: 393 });
  await page.getByRole('button', { name: 'Calendar', exact: true }).waitFor();

  const waitMenusClosed = async () => { await expect(page.locator('[role="menu"]')).toHaveCount(0); };
  const openView = async () => {
    /* DELIBERATELY no "wait for the previous menu to close": a user picks a
       view and immediately reopens the menu while the close morph is still
       playing. That fast path used to leave the menu stuck invisible. */
    await page.locator('[data-presence-anchor="toolbar:schedule:view"]').tap();
    await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeVisible();
  };

  // Stripboard View → A4 Landscape (nested submenu; pref persists in the
  // full landscape chrome).
  await openView();
  await page.getByRole('menuitem', { name: 'Stripboard View' }).tap();
  await page.getByRole('menuitem', { name: 'A4 Landscape' }).tap();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lemon_schedule_view_mode'))).toBe('landscape');

  // Cell Borders → Both.
  await openView();
  await page.getByRole('menuitem', { name: 'Cell Borders' }).tap();
  await page.getByRole('menuitem', { name: 'Both', exact: true }).tap();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lemon_schedule_cell_borders'))).toBe('both');

  // Ribbon Layout → Default (a third submenu in the same View menu).
  await openView();
  await page.getByRole('menuitem', { name: 'Ribbon Layout' }).tap();
  await page.getByRole('menuitem', { name: 'Default', exact: true }).tap();
  await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeHidden();

  // File → Print → Custom Reports: nested card + Back one level at a time.
  await page.locator('[data-presence-anchor="toolbar:header:file"]').tap();
  await page.getByRole('menuitem', { name: 'Print', exact: true }).tap();
  await page.getByRole('menuitem', { name: 'Custom Reports', exact: true }).tap();
  await expect(page.getByRole('menuitem', { name: 'One-Liner' })).toBeVisible();
  await page.locator('[data-submenu-back]').filter({ hasText: 'Custom Reports' }).tap();
  await expect(page.getByRole('menuitem', { name: 'Schedule...' })).toBeVisible();
  await page.locator('[data-submenu-back]').filter({ hasText: 'Print' }).tap();
  await expect(page.getByRole('menuitem', { name: 'Project Manager' })).toBeVisible();
  await page.keyboard.press('Escape');
  await waitMenusClosed();

  // Version picker: selecting a version closes it.
  await page.locator('[data-presence-anchor="toolbar:schedule:versions"]').tap();
  const versionMenu = page.locator('[role="menu"]').first();
  await expect(versionMenu).toBeVisible();
  await page.getByRole('menuitem', { name: 'Actor Scenario' }).tap();
  await expect(versionMenu).toBeHidden();
  });
});

test('landscape: the full chrome returns and a calendar day modal opens', async ({ page }) => {
  await bootPhone(page);
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();

  /* Roadmap 337: a toolbar dropdown must open from the TAP ITSELF, not from a
     click iOS may swallow (a hover reflow or the host toolbar moving). Drive
     pointerdown + pointerup with NO click and expect the menu open. */
  const viewTrigger = page.locator('[data-presence-anchor="toolbar:schedule:view"]');
  await expect(viewTrigger).toBeVisible();
  const vb = (await viewTrigger.boundingBox())!;
  await viewTrigger.evaluate((el, pt) => {
    for (const type of ['pointerdown', 'pointerup']) {
      el.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerdown' ? 1 : 0,
        clientX: pt.x,
        clientY: pt.y,
      }));
    }
  }, { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 });
  await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeHidden();

  await expect(page.getByRole('button', { name: 'Sheet', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Calendar', exact: true }).tap();
  const days = await seedDayDates(page);
  const dayCell = page.locator(`[data-date-key="${days[0]}"]`);
  await expect(dayCell).toBeVisible();
  await dayCell.locator('[data-day-header]').first().tap();
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
});
