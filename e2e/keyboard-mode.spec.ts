import { test, expect, devices, type Page } from '@playwright/test';
import { ensureProject } from './helpers';

const COL_WIDTHS = [48, 60, 80, 80, 80, 180, 90, 300, 120, 200];
const COL_KEYS = ['actions', 'sceneNumber', 'pageCount', 'scriptDay', 'intExt', 'set', 'dayNight', 'description', 'cast', 'notes'];

// Coarse-pointer (mobile) media queries with a wide viewport so grid columns
// are visible without scrolling. Keeps desktop mouse semantics for cell clicks.
test.use({ ...devices['Pixel 7'], viewport: { width: 1280, height: 800 } });

async function openGlideWithScene(page: Page) {
  await page.goto('http://localhost:3001/lemon_schedule/');
  await ensureProject(page);
  const glideBtn = page.getByRole('button', { name: 'Glide Breakdown' });
  await expect(glideBtn).toBeVisible({ timeout: 5000 });
  await glideBtn.click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Add Scene/ }).click();
  await page.waitForTimeout(500);
}

async function cellCenter(page: Page, colKey: string, row = 0): Promise<{ x: number; y: number }> {
  const scale = await page.evaluate(() => {
    const s = parseInt(localStorage.getItem('lemon_schedule_ss_font_size') || '', 10);
    return (s >= 8 && s <= 20 ? s : 12.5) / 11;
  });
  const idx = COL_KEYS.indexOf(colKey);
  const start = COL_WIDTHS.slice(0, idx).reduce((a, b) => a + b, 0);
  const x = (start + COL_WIDTHS[idx] / 2) * scale;
  const y = (36 * scale) + (34 * scale) * (row + 0.5);
  const canvas = page.locator('.dvn-underlay canvas').first();
  await expect(canvas).toBeAttached({ timeout: 3000 });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + x, y: box!.y + y };
}

async function editorState(page: Page): Promise<{ hasEditor: boolean; readOnly: boolean | null }> {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('input, textarea')).filter(i => (i as HTMLElement).offsetParent !== null);
    if (els.length === 0) return { hasEditor: false, readOnly: null };
    return { hasEditor: true, readOnly: els.every(i => (i as HTMLInputElement).readOnly) };
  });
}

test.describe('Keyboard Mode (coarse pointer)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lemon_schedule_keyboard_mode', 'off');
    });
  });

  test('keyboard off: text cells do not open editors, entity cells open readonly pickers', async ({ page }) => {
    await openGlideWithScene(page);

    const toggle = page.getByRole('button', { name: /Keyboard input/ });
    await expect(toggle).toBeVisible();

    // Entity cell opens the picker with a read-only input (no text entry)
    const setPos = await cellCenter(page, 'set');
    await page.mouse.dblclick(setPos.x, setPos.y);
    await page.waitForTimeout(500);

    let state = await editorState(page);
    expect(state.hasEditor).toBe(true);
    expect(state.readOnly).toBe(true);

    // Dismiss picker by clicking outside the grid
    await page.mouse.click(640, 700);
    await page.waitForTimeout(300);

    // Text cell (Description) must NOT open an editor when keyboard is off
    const descPos = await cellCenter(page, 'description');
    await page.mouse.dblclick(descPos.x, descPos.y);
    await page.waitForTimeout(500);
    state = await editorState(page);
    expect(state.hasEditor).toBe(false);
  });

  test('keyboard on: text cells open normal editable editors', async ({ page }) => {
    await openGlideWithScene(page);

    const toggle = page.getByRole('button', { name: /Keyboard input/ });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await page.waitForTimeout(300);

    const descPos = await cellCenter(page, 'description');
    await page.mouse.dblclick(descPos.x, descPos.y);
    await page.waitForTimeout(500);

    const state = await editorState(page);
    expect(state.hasEditor).toBe(true);
    expect(state.readOnly).toBe(false);
  });

  test('hardware keyboard detected: toggle shows the amber state but stays tappable', async ({ page }) => {
    await openGlideWithScene(page);

    const toggle = page.getByRole('button', { name: /Keyboard input/ });
    await expect(toggle).toBeVisible();

    // A real keydown (non-229, non-Enter/Backspace) implies a physical keyboard
    await page.keyboard.press('a');
    await page.waitForTimeout(300);

    const hwToggle = page.getByRole('button', { name: 'Hardware keyboard detected' });
    await expect(hwToggle).toBeVisible();
    await expect(toggle).toHaveCount(0);

    // The amber state is still tappable: toggling flips the stored mode
    await hwToggle.click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.evaluate(() => localStorage.getItem('lemon_schedule_keyboard_mode'))).resolves.toBe('on');

    await hwToggle.click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.evaluate(() => localStorage.getItem('lemon_schedule_keyboard_mode'))).resolves.toBe('off');
  });
});
