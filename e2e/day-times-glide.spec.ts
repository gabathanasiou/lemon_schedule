import { test, expect } from '@playwright/test';
import { openCallTimesSection as openCallTimes, day1CastIds as day1Cast, callsFor, stageCellPoint } from './helpers';

/**
 * Day Times Glide (roadmap 101) — the inline spreadsheet editor for a day's
 * call-time overrides. Drives the real Glide canvas by geometry (the component
 * auto-fits columns to the card and sizes rows to content), asserts the SAME
 * `daybreakMeta.elementCalls` path the rest of the app uses, and that every
 * grid operation is ONE undo entry.
 */

test.describe('Day Times Glide (roadmap 101)', () => {
  test('renders an inline grid per category, sized to content with no scrolling', async ({ page }) => {
    await openCallTimes(page);
    const first = page.locator('[data-day-times-glide]').first();
    await expect(first).toBeVisible();
    await expect(page.locator('[data-section="callTimes"]')).toContainText('Cast');

    // Auto-fit: no horizontal or vertical overflow anywhere in the grid.
    const box = await first.locator('.dvn-scroller').evaluate((el) => ({
      sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
    }));
    expect(box.sw).toBeLessThanOrEqual(box.cw);
    expect(box.sh).toBeLessThanOrEqual(box.ch);
  });

  test('editor seeds the default expression / resolved time, fully selected; Enter stores no override (roadmap 141)', async ({ page }) => {
    await openCallTimes(page);
    const cast = await day1Cast(page);
    expect(cast.length).toBeGreaterThan(0);
    expect(await callsFor(page, cast[0])).toBeNull();

    const cell = await stageCellPoint(page, 0, 0);
    await page.mouse.dblclick(cell.x, cell.y);
    const ta = page.locator('#portal textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });

    // The overlay opens with the whole seed selected — not blank, so typing
    // replaces it instead of requiring a retype. A non-anchor stage seeds with
    // its default lead expression (`-1h`), an anchor/override with a time.
    await expect.poll(() => ta.evaluate((el: HTMLTextAreaElement) =>
      el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length,
    ), { timeout: 4000 }).toBe(true);
    expect(await ta.inputValue()).toMatch(/^(\d{1,2}:\d{2}|[+-]\d+(?:h|m))$/);

    // Enter without typing must NOT pin a spurious override (or an undo entry).
    await ta.press('Enter');
    await expect.poll(() => callsFor(page, cast[0]), { timeout: 4000 }).toBeNull();
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(0);
  });

  test('edits a cell, pastes a block, and each op is one undo entry', async ({ page }) => {
    await openCallTimes(page);
    const cast = await day1Cast(page);
    expect(cast.length).toBeGreaterThan(0);

    // --- edit the first stage cell of row 0 (overlay editor) ---
    const first = await stageCellPoint(page, 0, 0);
    await page.mouse.dblclick(first.x, first.y);
    const ta = page.locator('#portal textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });
    await ta.click();
    await ta.fill('07:00');
    await expect(ta).toHaveValue('07:00', { timeout: 4000 });
    await ta.press('Enter');

    await expect.poll(() => callsFor(page, cast[0]), { timeout: 5000 }).toEqual({ pickup: '07:00' });
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(1);

    // --- paste a 2x2 block from the same anchor (native paste event path) ---
    if (cast.length >= 2) {
      await page.mouse.click(first.x, first.y);
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData('text/plain', '08:00\t-45m\n07:30\t-1h');
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      });
      await expect.poll(() => callsFor(page, cast[0]), { timeout: 5000 }).toEqual({ pickup: '08:00', arrive: '-45m' });
      await expect.poll(() => callsFor(page, cast[1]), { timeout: 5000 }).toEqual({ pickup: '07:30', arrive: '-1h' });
      // One undo entry for the whole paste.
      expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(2);

      // Undo restores the pre-paste state (first edit survives).
      await page.evaluate(() => (window as any).__lemonSchedule.undo());
      await expect.poll(() => callsFor(page, cast[0]), { timeout: 5000 }).toEqual({ pickup: '07:00' });
      expect(await callsFor(page, cast[1])).toBeNull();
    }

    // The Call Times card summary reflects the surviving override.
    await expect(page.locator('[data-section="callTimes"]')).toContainText('1 override');
  });

  test('editing one cell writes the value across the selected range in one undo (roadmap 139)', async ({ page }) => {
    await openCallTimes(page);
    const cast = await day1Cast(page);
    test.skip(cast.length < 3, 'seed day needs at least 3 cast for a range fill');

    // Drag a 3-row range down the first stage column.
    const a = await stageCellPoint(page, 0, 0);
    const b = await stageCellPoint(page, 2, 0);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();

    // Type over the anchored cell; committing spreads to the whole selection.
    await page.keyboard.type('06:00');
    const ta = page.locator('#portal textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });
    await ta.fill('06:00');
    await ta.press('Enter');

    await expect.poll(() => callsFor(page, cast[0]), { timeout: 5000 }).toEqual({ pickup: '06:00' });
    await expect.poll(() => callsFor(page, cast[1]), { timeout: 5000 }).toEqual({ pickup: '06:00' });
    await expect.poll(() => callsFor(page, cast[2]), { timeout: 5000 }).toEqual({ pickup: '06:00' });
    // The whole spread is ONE undo entry.
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(1);
  });

  test('fill-down copies an expression across rows in one undo entry', async ({ page }) => {
    await openCallTimes(page);
    const cast = await day1Cast(page);
    test.skip(cast.length < 3, 'seed day needs at least 3 cast for a fill-down');

    const src = await stageCellPoint(page, 0, 0);
    await page.mouse.dblclick(src.x, src.y);
    const ta = page.locator('#portal textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });
    await ta.click();
    await ta.fill('06:00');
    await expect(ta).toHaveValue('06:00', { timeout: 4000 });
    await ta.press('Enter');
    await expect.poll(() => callsFor(page, cast[0]), { timeout: 5000 }).toEqual({ pickup: '06:00' });

    // Select the source cell, then drag the fill handle down two rows.
    await page.mouse.click(src.x, src.y);
    await page.mouse.move(src.x + src.stageW / 2, src.y + src.rowH / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + src.stageW / 2, src.y + src.rowH * 2, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => callsFor(page, cast[1]), { timeout: 5000 }).toEqual({ pickup: '06:00' });
    await expect.poll(() => callsFor(page, cast[2]), { timeout: 5000 }).toEqual({ pickup: '06:00' });
    expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(2);

    await page.evaluate(() => (window as any).__lemonSchedule.undo());
    await expect.poll(() => callsFor(page, cast[0]), { timeout: 5000 }).toEqual({ pickup: '06:00' });
    expect(await callsFor(page, cast[1])).toBeNull();
  });
});
