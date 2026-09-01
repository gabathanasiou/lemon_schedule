import { test, expect, type Page } from '@playwright/test';
import { openSeededProject, seedDayDates } from './helpers';

// Roadmap 69-71: iPad WebKit touch/viewport bugs. Run under
// `playwright.ipad.config.ts` (webkit, `devices['iPad Pro 11']`, hasTouch).
// These reproduce real iPad-Safari failures that desktop Chromium can't:
//  - react-remove-scroll (Radix Dialog → kit Modal) cancels touch scroll on
//    portaled dropdown panels inside modals (item 69).
//  - modals + dropdowns position against the LAYOUT viewport (innerHeight),
//    not the visual viewport the software keyboard/chrome live in (item 70).
//  - the stacked day modal can come back invisible-but-clickable after the
//    Add Events modal is cancelled (item 71).
test.skip(({ browserName, isMobile }) => !(browserName === 'webkit' && isMobile), 'iPad WebKit only');

/** Replace window.visualViewport with a controllable mock so tests can drive
 *  the iOS software keyboard: shrink `height` (keyboard slides up from the
 *  bottom) and fire `resize`/`scroll` on the mock exactly like the real
 *  VisualViewport does. The real `visualViewport` is where Safari fires the
 *  keyboard's resize — NOT `window` — which is the crux of item 70. */
async function installKeyboardMock(page: Page) {
  await page.addInitScript(() => {
    const origHeight = window.innerHeight;
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const vv = {
      height: origHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
      pageTop: 0,
      pageLeft: 0,
      addEventListener(t: string, fn: (e: unknown) => void) { (listeners[t] ||= []).push(fn); },
      removeEventListener(t: string, fn: (e: unknown) => void) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
      fire(t: string) { (listeners[t] || []).slice().forEach((fn) => fn({ type: t })); },
      setHeight(h: number) { this.height = h; this.fire('resize'); },
      _origHeight: origHeight,
      _fire: (t: string) => vv.fire(t),
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    (window as unknown as { __mockVV: typeof vv }).__mockVV = vv;
  });
}

async function openDayModalWithAdder(page: Page) {
  await page.getByRole('button', { name: 'Calendar' }).click();
  const days = await seedDayDates(page);
  expect(days.length).toBeGreaterThan(0);
  const dayCell = page.locator(`[data-date-key="${days[0]}"]`);
  await expect(dayCell).toBeVisible();
  const header = dayCell.locator('[class*="flex items-center justify-between"]').first();
  await header.dblclick();
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add Event' }).click();
  const adder = page.getByRole('dialog').last();
  await expect(adder.getByRole('heading', { name: 'Add Events' })).toBeVisible();
  return { dayCell, header, adder };
}

/** Opens the adder's cast-row entity dropdown (dark chip panel). The chip
 *  input never carries a placeholder attribute (the placeholder renders in a
 *  pointer-transparent overlay span), so locate it by its chip-input class. */
async function openAdderEntityDropdown(page: Page, adder: ReturnType<typeof page.getByRole>) {
  const input = adder.locator('input.cursor-pointer').first();
  await input.click();
  const panel = page.locator('.click-outside-ignore').last();
  await expect(panel).toBeVisible();
  return panel;
}

test('entity dropdown inside a modal is touch-scrollable (react-remove-scroll does not cancel it)', async ({ page }) => {
  await installKeyboardMock(page);
  await openSeededProject(page);
  const { adder } = await openDayModalWithAdder(page);
  await openAdderEntityDropdown(page, adder);

  // A finger drag over the panel dispatches touchmove events. If
  // react-remove-scroll (Radix Dialog's scroll lock) preventDefaults them,
  // native touch scrolling never happens and the list feels dead. The panel
  // portals OUTSIDE the dialog content, so the lock considers it "outside" and
  // cancels every touchmove — the exact failure from roadmap item 69.
  const cancelled = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.click-outside-ignore');
    const panel = nodes[nodes.length - 1] as HTMLElement;
    const ev = new Event('touchmove', { bubbles: true, cancelable: true });
    return !panel.dispatchEvent(ev);
  });
  expect(cancelled, 'touchmove inside a modal dropdown must not be defaultPrevented').toBe(false);
});

test('dropdown inside a modal re-clamps when the iPad keyboard opens', async ({ page }) => {
  await installKeyboardMock(page);
  await openSeededProject(page);
  const { adder } = await openDayModalWithAdder(page);
  const panel = await openAdderEntityDropdown(page, adder);

  const boxBefore = await panel.boundingBox();
  expect(boxBefore).toBeTruthy();

  // The keyboard slides up from the bottom: Safari fires resize on
  // window.visualViewport (never on window). A keyboard-aware panel must
  // re-measure and stay inside the visible area.
  await page.evaluate(() => {
    const vv = (window as unknown as { __mockVV: { setHeight: (h: number) => void; _origHeight: number } }).__mockVV;
    vv.setHeight(Math.round(vv._origHeight * 0.55));
  });
  const visibleBottom = await page.evaluate(() =>
    (window as unknown as { __mockVV: { height: number } }).__mockVV.height,
  );

  const box = await panel.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y + box!.height, 'panel must not extend past the keyboard').toBeLessThanOrEqual(visibleBottom + 1);
});

test('Project Manager centres within the visible viewport', async ({ page }) => {
  await installKeyboardMock(page);
  // Boot with NO seeded project → the Project Manager is locked open at start.
  await page.goto('http://localhost:3001/lemon_schedule/');
  const pm = page.getByText('Project Manager', { exact: true });
  await expect(pm).toBeVisible();

  // Safari chrome + keyboard leave a visible area that is NOT the full layout
  // viewport: mock the visual viewport as a 500px-tall strip starting at y=50.
  // A keyboard-aware modal must centre inside it (centre = 50 + 500/2 = 300),
  // not at innerHeight/2 (≈597 on the iPad Pro 11 layout viewport).
  await page.evaluate(() => {
    const vv = (window as unknown as { __mockVV: { offsetTop: number; setHeight: (h: number) => void } }).__mockVV;
    vv.offsetTop = 50;
    vv.setHeight(500);
  });

  const modal = page.locator('[data-modal-stack]').last();
  await expect(modal).toBeVisible();
  const box = await modal.boundingBox();
  expect(box).toBeTruthy();

  const expectedCenter = await page.evaluate(() => {
    const vv = (window as unknown as { __mockVV: { height: number; offsetTop: number } }).__mockVV;
    return vv.offsetTop + vv.height / 2;
  });
  const actualCenter = box!.y + box!.height / 2;
  expect(Math.abs(actualCenter - expectedCenter), 'modal centre must follow the visible viewport centre').toBeLessThan(40);
});

test('Cancel on the Add Events modal returns to a visible, interactive day modal', async ({ page }) => {
  await installKeyboardMock(page);
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Calendar' }).click();
  const days = await seedDayDates(page);
  expect(days.length).toBeGreaterThan(0);
  const dayCell = page.locator(`[data-date-key="${days[0]}"]`);
  await expect(dayCell).toBeVisible();
  const header = dayCell.locator('[class*="flex items-center justify-between"]').first();

  // Repeat to catch the intermittent freeze (roadmap item 71).
  for (let i = 0; i < 6; i++) {
    await header.dblclick();
    await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Add Event' }).click();
    const adder = page.getByRole('dialog').last();
    await expect(adder.getByRole('heading', { name: 'Add Events' })).toBeVisible();

    // The adder's search input holds focus → the software keyboard is up.
    // Cancel blurs it → the keyboard retracts right around the modal swap.
    await page.evaluate(() => {
      const vv = (window as unknown as { __mockVV: { setHeight: (h: number) => void; _origHeight: number } }).__mockVV;
      vv.setHeight(Math.round(vv._origHeight * 0.55));
    });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => {
      const vv = (window as unknown as { __mockVV: { setHeight: (h: number) => void; _origHeight: number } }).__mockVV;
      vv.setHeight(vv._origHeight);
    });

    const dayHeading = page.getByText('Day Events —', { exact: false });
    await expect(dayHeading).toBeVisible();

    // The previous modal must come back VISIBLE (opacity 1) and on-screen —
    // the reported freeze leaves it invisible-but-clickable (the `:has()`
    // stack fade in tokens.css stays applied → opacity 0 forever).
    const dayModal = page.locator('[data-modal-stack]').last();
    await expect.poll(
      async () => dayModal.evaluate((el) => getComputedStyle(el).opacity),
      { timeout: 1500 },
    ).toBe('1');
    const box = await dayModal.boundingBox();
    expect(box).toBeTruthy();
    const vh = page.viewportSize()!.height;
    expect(box!.y + box!.height, 'day modal must sit inside the viewport').toBeLessThanOrEqual(vh + 1);

    // And it must be interactive: the Done button closes it.
    await dayModal.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Day Events —', { exact: false })).toBeHidden();
  }
});
