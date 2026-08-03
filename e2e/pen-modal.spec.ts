import { test, expect, type Page } from '@playwright/test';
import { openSeededProject } from './helpers';

async function penTapAt(page: Page, x: number, y: number, pointerDownOnly = false) {
  await page.evaluate(({ x, y, pointerDownOnly }) => {
    const el = document.elementFromPoint(x, y) as HTMLElement;
    if (!el) return;
    const opts = { pointerType: 'pen', button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
    if (!pointerDownOnly) {
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    }
  }, { x, y, pointerDownOnly });
}

async function penTap(page: Page, locator: import('@playwright/test').Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await penTapAt(page, box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function openApp(page: Page) {
  await openSeededProject(page);
  await page.waitForTimeout(600);
}

const dialogVisible = (page: Page) => page.evaluate(() => !!document.querySelector('[role="dialog"]'));
const customModalVisible = (page: Page) => page.evaluate(() => !!document.querySelector('.fixed.inset-0.z-\\[9999\\]'));

test.describe('Apple Pencil in modals', () => {
  test('shared Modal (Help): item tap stays open, close tap works', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(500);
    await page.getByTitle('Keyboard Shortcuts & Help').click();
    await page.waitForTimeout(400);

    const table = page.locator('[role="dialog"] table').first();
    await expect(table).toBeVisible();
    const tb = await table.boundingBox();
    await penTapAt(page, tb!.x + 50, tb!.y + 20);
    await page.waitForTimeout(400);
    expect(await dialogVisible(page)).toBe(true);

    await penTap(page, page.getByRole('button', { name: 'Close' }));
    await page.waitForTimeout(400);
    expect(await dialogVisible(page)).toBe(false);
  });

  test('note editor (Edit Banner): pen taps work', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(500);

    const noteId = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      if (!key) return null;
      const p = JSON.parse(localStorage.getItem(key)!);
      const v = p.versions?.[p.activeVersionId] || p.versions?.[0];
      return v?.rows?.find((r: any) => r.type === 'NOTE')?.id ?? null;
    });
    expect(noteId).not.toBeNull();

    const noteRow = page.locator(`[data-row-id="${noteId}"]`).first();
    await expect(noteRow).toBeAttached({ timeout: 5000 });
    await noteRow.evaluate(el => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    });
    await page.waitForTimeout(600);

    const title = page.getByText('Edit Banner');
    await expect(title).toBeVisible({ timeout: 5000 });

    // pen tap the note textarea — stays open
    const textarea = page.locator('[role="dialog"] textarea').first();
    await expect(textarea).toBeVisible();
    const ta = await textarea.boundingBox();
    await penTapAt(page, ta!.x + 20, ta!.y + 20);
    await page.waitForTimeout(400);
    expect(await dialogVisible(page)).toBe(true);

    // pen tap Cancel closes
    await penTap(page, page.getByRole('button', { name: 'Cancel' }));
    await page.waitForTimeout(400);
    expect(await dialogVisible(page)).toBe(false);
  });

  test('custom overlay (RuleFormModal): pen taps work', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Rules' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New Rule' }).click();
    await page.waitForTimeout(400);

    const saveBtn = page.getByRole('button', { name: /Add Rule|Save Changes/ });
    await expect(saveBtn).toBeVisible({ timeout: 5000 });

    // pen tap on a neutral form area — modal stays open
    const modal = page.locator('.bg-white.rounded-xl.shadow-2xl').first();
    const mb = await modal.boundingBox();
    expect(mb).not.toBeNull();
    await penTapAt(page, mb!.x + 40, mb!.y + 60);
    await page.waitForTimeout(400);
    expect(await customModalVisible(page)).toBe(true);

    // pen tap the X close button
    const closeBtn = modal.locator('button').first();
    await penTap(page, closeBtn);
    await page.waitForTimeout(400);
    expect(await saveBtn.isVisible().catch(() => false)).toBe(false);
  });

  test('tap flash: pen tap shows the hover background briefly', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(500);

    const noteId = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      if (!key) return null;
      const p = JSON.parse(localStorage.getItem(key)!);
      const v = p.versions?.[p.activeVersionId] || p.versions?.[0];
      return v?.rows?.find((r: any) => r.type === 'NOTE')?.id ?? null;
    });
    const noteRow = page.locator(`[data-row-id="${noteId}"]`).first();
    await expect(noteRow).toBeAttached({ timeout: 5000 });
    await noteRow.evaluate(el => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    });
    await page.waitForTimeout(600);
    await expect(page.getByText('Edit Banner')).toBeVisible({ timeout: 5000 });

    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    await expect(cancelBtn).toBeVisible();

    // pen pointerdown only — the tap-flash highlight should be applied
    const cb = await cancelBtn.boundingBox();
    await penTapAt(page, cb!.x + cb!.width / 2, cb!.y + cb!.height / 2, true);
    const hasFlash = await cancelBtn.evaluate(el =>
      el.classList.contains('tap-flash') || el.classList.contains('tap-flash-dark'));
    console.log('FLASH applied: ' + hasFlash);
    expect(hasFlash).toBe(true);

    // after the flash window, removed
    await page.waitForTimeout(900);
    const after = await cancelBtn.evaluate(el =>
      el.classList.contains('tap-flash') || el.classList.contains('tap-flash-dark'));
    expect(after).toBe(false);
  });

  test('color picker (ColorField): pen tap opens via showPicker', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(500);

    const noteId = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      if (!key) return null;
      const p = JSON.parse(localStorage.getItem(key)!);
      const v = p.versions?.[p.activeVersionId] || p.versions?.[0];
      return v?.rows?.find((r: any) => r.type === 'NOTE')?.id ?? null;
    });
    expect(noteId).not.toBeNull();

    const noteRow = page.locator(`[data-row-id="${noteId}"]`).first();
    await expect(noteRow).toBeAttached({ timeout: 5000 });
    await noteRow.evaluate(el => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    });
    await page.waitForTimeout(600);
    await expect(page.getByText('Edit Banner')).toBeVisible({ timeout: 5000 });

    // spy on showPicker
    await page.evaluate(() => {
      const w = window as any;
      w.__pickerCalls = [];
      const orig = HTMLInputElement.prototype.showPicker;
      HTMLInputElement.prototype.showPicker = function (this: HTMLInputElement) {
        w.__pickerCalls.push(this.type);
        return orig.apply(this);
      };
    });

    const swatch = page.locator('[role="dialog"] input[type="color"]').first();
    await expect(swatch).toBeVisible();
    await penTap(page, swatch);
    await page.waitForTimeout(400);

    const calls = await page.evaluate(() => (window as any).__pickerCalls);
    console.log('PICKER CALLS: ' + JSON.stringify(calls));
    expect(calls).toContain('color');

    // modal still open, no suppressed follow-up
    expect(await dialogVisible(page)).toBe(true);
  });
});
