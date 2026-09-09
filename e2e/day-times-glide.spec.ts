import { test, expect, Page } from '@playwright/test';
import { openSeededProject } from './helpers';

/**
 * Day Times Glide (roadmap 101) — the inline spreadsheet editor for a day's
 * call-time overrides. Drives the real Glide canvas by geometry (the component
 * auto-fits columns to the card and sizes rows to content), asserts the SAME
 * `daybreakMeta.elementCalls` path the rest of the app uses, and that every
 * grid operation is ONE undo entry.
 */

async function openCallTimes(page: Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Day Manager', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });

  const section = page.locator('[data-section="callTimes"]');
  if (!(await section.locator('[data-day-times-glide]').count())) await section.getByRole('button').first().click();
  await expect(page.locator('[data-day-times-glide]').first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-day-times-glide] .dvn-scroller').first()).toBeAttached({ timeout: 8000 });
  await page.locator('[data-day-times-glide]').first().scrollIntoViewIfNeeded();
  // Wait for the auto-fit columns to settle (the grid re-measures its card and
  // redistributes widths) before computing any cell geometry.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-day-times-glide] .dvn-scroller') as HTMLElement | null;
    if (!el) return false;
    const w = el.clientWidth;
    const prev = (window as any).__dtgWidth;
    (window as any).__dtgWidth = w;
    return w > 0 && prev === w;
  }, undefined, { timeout: 5000 });
}

/** Day 1's cast, in first-appearance order (the sheet's row order). */
async function day1Cast(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const rows = b.getRows();
    const p = b.getProject();
    const sceneIdByRow = new Map(
      (rows.rows || []).filter((r: any) => r.type === 'SCENE' && r.sceneId).map((r: any) => [r.id, r.sceneId]),
    );
    const sec = (rows.sections || []).filter((s: any) => !s.isPinned)[0];
    const out: string[] = [];
    for (const rid of sec?.rows || []) {
      const sc = p.scenes.find((x: any) => x.id === sceneIdByRow.get(rid));
      if (!sc) continue;
      for (const id of String(sc.cast || '').split(',').map((x: string) => x.trim()).filter(Boolean)) {
        if (!out.includes(id)) out.push(id);
      }
    }
    return out;
  });
}

const BASE_WIDTHS = [48, 220, 48, 88, 88, 88, 88, 88];

/** Center of a stage cell in the FIRST grid (cast). Mirrors the component's
 *  fit-to-card column math (desktop defaults: 11px font → 30px header, 28px
 *  rows). */
async function stageCellPoint(page: Page, row: number, stageIndex: number) {
  const box = (await page.locator('[data-day-times-glide] .dvn-scroller').first().boundingBox())!;
  const target = Math.max(120, Math.floor(box.width) - 1);
  const total = BASE_WIDTHS.reduce((s, w) => s + w, 0);
  const widths = BASE_WIDTHS.map(w => Math.max(40, Math.floor((w / total) * target)));
  const sum = widths.reduce((s, w) => s + w, 0);
  widths[1] += target - sum;
  const before = widths[0] + widths[1] + widths[2];
  const rowH = 28;
  const headerH = 30;
  return {
    x: box.x + before + stageIndex * widths[3] + widths[3] / 2,
    y: box.y + headerH + row * rowH + rowH / 2,
    stageW: widths[3],
    rowH,
  };
}

const callsFor = (page: Page, castId: string) =>
  page.evaluate((id) => {
    const b: any = (window as any).__lemonSchedule;
    const p = b.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
    return gov?.daybreakMeta?.elementCalls?.cast?.[id] || null;
  }, castId);

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
        dt.setData('text/plain', '08:00\t-30m\n07:30\t-1h');
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      });
      await expect.poll(() => callsFor(page, cast[0]), { timeout: 5000 }).toEqual({ pickup: '08:00', arrive: '-30m' });
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
