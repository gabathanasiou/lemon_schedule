import { test, expect, type Page } from '@playwright/test';
import { openSeededProject } from './helpers';

/* Overlay-morph verification (roadmap 58): every dropdown surface — kit
   DropdownMenu / DropdownSubmenu / ContextMenu and the app EntityDropdown /
   Select / Autocomplete dropdown panels — opens with a trigger-anchored
   scale+fade (the modal FLIP language: 220ms cubic-bezier(0.32,0.72,0,1),
   zoom from 94%) and CLOSES with the reverse morph instead of snapping.
   reduced motion and the modal-morph opt-out key skip all of it.
   NOTE: getComputedStyle().transformOrigin resolves to PIXELS, so anchors
   are asserted as fractions of the panel's own box (0/0.5/1). */

const MENU = '[data-radix-menu-content]';

// This spec IS about the morph — re-enable motion (the suite default is
// contextOptions.reducedMotion: 'reduce' so the other ~150 specs don't race
// the close clone; the reduced-motion case below emulates it inline).
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

type MorphSample = { scale: number; opacity: number; origin: string; w: number; h: number; t: number };

/** Sample computed transform/opacity of the LAST matching element every
 *  frame (the last open menu content is the submenu); `untilGone` resolves
 *  as soon as the element leaves the DOM. */
function traceMorph(page: Page, selector: string, untilGone = false, frames = 70): Promise<MorphSample[] | null> {
  return page.evaluate(({ selector, untilGone, frames }) => new Promise((resolve) => {
    const samples: MorphSample[] = [];
    const start = performance.now();
    let count = 0;
    const tick = () => {
      const all = document.querySelectorAll(selector);
      const el = all.length > 0 ? all[all.length - 1] as HTMLElement : null;
      if (el) {
        const s = getComputedStyle(el);
        const m = new DOMMatrixReadOnly(s.transform || 'none');
        const r = el.getBoundingClientRect();
        samples.push({ scale: m.a, opacity: parseFloat(s.opacity), origin: s.transformOrigin, w: r.width, h: r.height, t: performance.now() - start });
      } else if (untilGone && samples.length > 0) {
        resolve(samples);
        return;
      }
      if (++count >= frames) { resolve(samples); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { selector, untilGone, frames });
}

function originFrac(s: MorphSample): { x: number; y: number } {
  const [x, y] = s.origin.split(' ').map(v => parseFloat(v));
  return { x: x / s.w, y: y / s.h };
}

/** Frames caught mid-morph (while the scale is still animating). */
function midMorph(samples: MorphSample[]): MorphSample[] {
  return samples.filter(s => s.scale < 0.995);
}

async function openScheduleViewMenu(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.locator(MENU).last()).toBeAttached();
}

test.describe('overlay morph — dropdowns, submenus, context menus', () => {

  test('dropdown menu opens with a trigger-anchored scale morph and settles at identity', async ({ page }) => {
    await openScheduleViewMenu(page);
    const samples = (await traceMorph(page, MENU))!;
    expect(samples.length).toBeGreaterThan(5);
    const mids = midMorph(samples);
    expect(mids.length).toBeGreaterThan(0); // scaled mid-morph
    expect(samples[samples.length - 1].scale).toBeCloseTo(1, 2); // settled
    // anchored at the trigger's edge, not the panel center
    expect(mids.some(s => {
      const o = originFrac(s);
      return Math.abs(o.x - 0.5) > 0.05 || Math.abs(o.y - 0.5) > 0.05;
    })).toBe(true);
  });

  test('dropdown menu closes with the reverse morph instead of snapping', async ({ page }) => {
    await openScheduleViewMenu(page);
    // wait for the open morph to settle
    await expect.poll(() => page.evaluate(
      () => getComputedStyle(document.querySelector('[data-radix-menu-content]') as HTMLElement).transform,
    )).toBe('none');
    const trace = traceMorph(page, MENU, true);
    await page.keyboard.press('Escape');
    const samples = await trace;
    expect(samples).not.toBeNull();
    expect(midMorph(samples!).length).toBeGreaterThan(0); // shrunk back, not snapped
    // close-flash regression: the final frame before unmount must still be
    // faded out — never a repaint at full opacity (the classic flash).
    expect(samples![samples!.length - 1].opacity).toBeLessThan(0.05);
    await expect(page.locator(MENU)).toHaveCount(0); // then unmounted
  });

  test('submenu grows from its entry edge', async ({ page }) => {
    await openScheduleViewMenu(page);
    await page.getByRole('menuitem', { name: 'Stripboard View' }).hover();
    // Start the trace immediately (no awaits) so the submenu's open morph is caught.
    const tracePromise = traceMorph(page, MENU);
    const sub = page.locator(MENU).last();
    await expect(sub).toBeAttached();
    await expect(sub).toContainText('Full Width');
    const samples = (await tracePromise)!;
    const mids = midMorph(samples);
    expect(mids.length).toBeGreaterThan(0);
    // anchored at the left/right entry edge (the edge facing the trigger row)
    expect(mids.some(s => {
      const o = originFrac(s);
      return o.x < 0.05 || o.x > 0.95;
    })).toBe(true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toHaveCount(0);
  });

  test('context menu morphs from the press point and stays fixed at the click spot', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Schedule' }).click();

    const row = page.locator('[data-row-id]').nth(1);
    const rowBox = (await row.boundingBox())!;
    // Start the trace right after the click so the 220ms open morph is caught.
    await row.click({ button: 'right', force: true, position: { x: 30, y: 10 } });
    const tracePromise = traceMorph(page, '.ui-menu');
    const menu = page.locator('.ui-menu').last();
    await expect(menu).toBeAttached();
    await expect(page.getByRole('button', { name: 'Add Note Below' })).toBeVisible();

    const samples = (await tracePromise)!;
    const mids = midMorph(samples);
    expect(mids.length).toBeGreaterThan(0); // grew out of the press point
    // anchored at the corner nearest the press point, not the panel center
    expect(mids.some(s => {
      const o = originFrac(s);
      return Math.abs(o.x - 0.5) > 0.05 || Math.abs(o.y - 0.5) > 0.05;
    })).toBe(true);

    // fixed-position, right at the press point (+ MARGIN 8; small tolerance
    // for fractional client coords)
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.x).toBeGreaterThanOrEqual(rowBox.x + 20);
    expect(menuBox.y).toBeGreaterThanOrEqual(rowBox.y + 5);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ui-menu')).toHaveCount(0);
  });

  test('EntityDropdown chip panel (dark) morphs open and closes with the reverse morph', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
    await page.getByRole('button', { name: 'Element Manager' }).click();
    await page.getByRole('button', { name: 'Links', exact: true }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    const input = modal.locator('[data-el-dropdown] input').first();
    await input.click();
    const panel = page.locator('.click-outside-ignore').last();
    await expect(panel).toBeAttached();

    const samples = (await traceMorph(page, '.click-outside-ignore'))!;
    const mids = midMorph(samples);
    expect(mids.length).toBeGreaterThan(0); // open morph
    expect(mids.some(s => {
      const o = originFrac(s);
      return Math.abs(o.x - 0.5) > 0.05 || Math.abs(o.y - 0.5) > 0.05;
    })).toBe(true); // anchored at the chip trigger

    const trace = traceMorph(page, '.click-outside-ignore', true);
    await page.keyboard.press('Escape'); // dismisses ONLY the dropdown
    const closeSamples = await trace;
    expect(closeSamples).not.toBeNull();
    expect(midMorph(closeSamples!).length).toBeGreaterThan(0); // reverse morph, not a snap
    await expect(page.locator('.click-outside-ignore')).toHaveCount(0);
    await expect(modal).toBeVisible(); // and the modal survived the dropdown's own Escape
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(modal).toBeHidden();
  });

  test('stripboard INT/EXT cell editor (SelectDropdown) morphs open and closes', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.locator('button:has-text("Edit")').last().click(); // cell editors need edit mode

    // In edit mode clicking the cell makes it the editing target — the
    // INT/EXT SelectDropdown mounts with autoFocus and opens itself.
    const intCell = page.locator('[data-ribbon-field="intExt"]').first();
    await intCell.click();
    const panel = page.locator('[data-row-id] div[style*="position: fixed"]').first();
    await expect(panel).toBeAttached();
    await expect(panel).toBeVisible(); // visibility gate flipped once positioned

    const samples = (await traceMorph(page, '[data-row-id] div[style*="position: fixed"]'))!;
    const mids = midMorph(samples);
    expect(mids.length).toBeGreaterThan(0); // open morph (grew out of the cell)
    expect(mids.some(s => {
      const o = originFrac(s);
      return Math.abs(o.x - 0.5) > 0.05 || Math.abs(o.y - 0.5) > 0.05;
    })).toBe(true);

    const trace = traceMorph(page, '[data-morph-clone]', true);
    await page.keyboard.press('Escape');
    const closeSamples = await trace;
    expect(closeSamples).not.toBeNull();
    expect(midMorph(closeSamples!).length).toBeGreaterThan(0); // reverse morph, not a snap
    await expect(page.locator('[data-row-id] div[style*="position: fixed"]')).toHaveCount(0);
  });

  test('Scene Sheet INT/EXT field (AutocompleteDropdown) morphs open and closes', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
    await page.getByRole('button', { name: 'Sheet', exact: true }).click();
    const navInput = page.locator('input[class*="w-10"]').first();
    await navInput.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');

    const intField = page.locator('tr', { hasText: 'Int/Ext' }).locator('input').first();
    await intField.click();
    const panel = page.locator('div.absolute.top-full').last();
    await expect(panel).toBeAttached();

    const samples = (await traceMorph(page, 'div.absolute.top-full'))!;
    const mids = midMorph(samples);
    expect(mids.length).toBeGreaterThan(0);
    expect(mids.some(s => {
      const o = originFrac(s);
      return Math.abs(o.x - 0.5) > 0.05 || Math.abs(o.y - 0.5) > 0.05;
    })).toBe(true);

    const trace = traceMorph(page, '[data-morph-clone]', true);
    await page.keyboard.press('Escape');
    const closeSamples = await trace;
    expect(closeSamples).not.toBeNull();
    expect(midMorph(closeSamples!).length).toBeGreaterThan(0); // reverse morph on the clone
    await expect(page.locator('div.absolute.top-full')).toHaveCount(0);
  });

  test('prefers-reduced-motion: menus snap open/close instantly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openScheduleViewMenu(page);
    const samples = (await traceMorph(page, MENU))!;
    expect(samples.length).toBeGreaterThan(3);
    expect(samples.every(s => s.scale === 1 && s.opacity === 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toHaveCount(0);
  });

  test('the modal-morph opt-out key also disables menu animations', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lemon_schedule_modal_morph', '0'));
    await openScheduleViewMenu(page);
    const samples = (await traceMorph(page, MENU))!;
    expect(samples.length).toBeGreaterThan(3);
    expect(samples.every(s => s.scale === 1 && s.opacity === 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toHaveCount(0);
  });

  test('keyboard nav and typeahead still work in animated menus', async ({ page }) => {
    await openScheduleViewMenu(page);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('c');
    await expect(page.getByRole('menuitem', { name: 'Cell Borders' })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(page.locator(MENU)).toHaveCount(0);
  });
});
