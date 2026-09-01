import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/**
 * Glide first-edit keystroke swallow (roadmap 63).
 *
 * Glide's overlay editor is React.lazy()-loaded — a SEPARATE production chunk
 * fetched async on the FIRST editor open after a fresh page load. On a slow
 * (cloud) first load every keystroke typed while that chunk is in flight is
 * swallowed: the grid re-opens the editor per keystroke with a single-key
 * replace, so only the last one survives ("MARY" → "Y"). The app preloads the
 * chunk at boot (BreakdownTabGlide.tsx `import('@glide-overlay-editor')`), so
 * the first edit after a refresh mounts without suspending.
 */
test.describe('Glide first-edit keystrokes (roadmap 63)', () => {
  test('overlay-editor chunk is preloaded at boot, and the first edit after a fresh load keeps every keystroke', async ({ page }) => {
    // Preload proof: the lazy chunk must be fetched at APP BOOT — before any
    // editor has opened (we haven't even navigated to Glide yet). Red before
    // the fix (the chunk was only requested when the first editor opened).
    const chunkResp = page.waitForResponse(
      r => r.url().includes('data-grid-overlay-editor') && r.url().endsWith('.js'),
    );

    await openSeededProject(page);

    // The preload fired during load/navigation; await it so the first edit
    // can never suspend, no matter how slow the server was.
    await chunkResp;

    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    const canvas = page.locator('.dvn-underlay canvas').first();
    await expect(canvas).toBeAttached({ timeout: 5000 });

    // Cell geometry — same math as the app (glide-clipboard.spec.ts pattern):
    // desktop default font size 11 → header 36px, row 34px.
    const scroller = page.locator('.dvn-scroller');
    const sr = await scroller.boundingBox();
    expect(sr).not.toBeNull();
    const headerH = Math.round((36 * 11) / 11);
    const rowH = Math.round((34 * 11) / 11);
    // Set column (single-mode entity dropdown): row marker 50 + actions 36 +
    // sceneNumber 60 + pageCount 80 + scriptDay 80 + intExt 80 = left 386,
    // width 180 → centre 476.
    const setX = sr!.x + 386 + 90;
    const firstRowY = sr!.y + headerH + rowH / 2;

    // Click the first row's set cell, then type with a realistic handoff and
    // cadence. The chunk is warm, so the editor mounts within ~a frame of the
    // first keystroke — the first key is never swallowed by the cold chunk
    // fetch (the reported cloud bug), and later keys land in the focused input.
    await page.mouse.click(setX, firstRowY);
    await page.waitForTimeout(200);
    await page.keyboard.type('MARY', { delay: 250 });

    // Every keystroke must land in the entity dropdown's input.
    const inputValue = await page.evaluate(() => {
      const p = document.getElementById('portal');
      const input = p?.querySelector('input');
      return input ? input.value : null;
    });
    expect(inputValue).toBe('MARY');

    // Commit (Enter) and assert it lands in the store — the edit is real.
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      return b?.getProject()?.scenes?.[0]?.set ?? '';
    }), { timeout: 5000 }).toBe('MARY');
  });
});
