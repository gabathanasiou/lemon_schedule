import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

// Scene Sheet entity cells (roadmap 95): the closed entity dropdowns WRAP long
// values onto new lines instead of truncating, the whole cell is the write
// hitbox (a textarea covers the box, so click-to-position/selection work), the
// closed cast display resolves to "1. NAME", and Notes/Synopsis auto-grow.

const project = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__lemonSchedule.getProject());

const castBox = (page: import('@playwright/test').Page) =>
  page.locator('[data-scene-field="cast"]').first();

const castEditor = (page: import('@playwright/test').Page) => castBox(page).locator('textarea').first();

const castDisplay = (page: import('@playwright/test').Page) =>
  castBox(page).locator('span.whitespace-pre-wrap').first();

const notesBox = (page: import('@playwright/test').Page) =>
  page.locator('[data-scene-field="notes"]').first();

test.describe('scene sheet entity cell layout (roadmap 95)', () => {
  test('long values wrap in the closed display and the whole box is the write hitbox', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Sheet', exact: true }).click();

    // Seed-agnostic long cast: all cast members on the first scene.
    const castIds = await page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return p.castMembers.map((c: any) => c.id).join(', ');
    });
    await page.evaluate((cast) => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      b.dispatch({ type: 'UPDATE_SCENE', payload: { id: p.scenes[0].id, cast } });
    }, castIds);

    await expect.poll(async () => (await castEditor(page).count()) === 1).toBe(true);

    // 1. Wrapped closed display: the value spans >1 line (no ellipsis truncation).
    const display = castDisplay(page);
    await expect(display).toBeVisible();
    await expect.poll(async () => {
      const box = await castBox(page).boundingBox();
      const span = await display.boundingBox();
      if (!box || !span) return false;
      return span.height > box.height * 0.4;
    }).toBe(true);
    // The value is fully visible: no "…" ellipsis from truncation.
    expect(await display.textContent()).not.toContain('…');

    // 2. Closed cast resolves to "1. NAME" format.
    const firstMember = await page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return p.castMembers[0];
    });
    await expect(display).toContainText(`${firstMember.id}. ${firstMember.name}`);

    // 3. Clicking the box's empty bottom area (padding) focuses the textarea
    //    and opens the picker (whole-box write hitbox). The long cast makes the
    //    box taller than the viewport, so scroll it into view first — otherwise
    //    the bottom-padding click lands off-screen.
    await castBox(page).scrollIntoViewIfNeeded();
    const boxRect = await castBox(page).boundingBox();
    await page.mouse.click(boxRect!.x + boxRect!.width - 20, boxRect!.y + boxRect!.height - 8);
    await expect(castEditor(page)).toBeFocused();
    await expect(page.locator('.z-\\[10010\\]')).toBeVisible();

    // 4. Click-to-position: the click that OPENS the editor parks the caret at
    //    the end (ready to append a segment); while it is already open, a click
    //    ON the text positions the caret natively. Click the first line — the
    //    box is much taller than the raw value (the visible span wraps resolved
    //    names; the editor holds short ids), so a %-of-height point would land
    //    in empty space and put the caret at the end.
    const edRect = await castEditor(page).boundingBox();
    await page.mouse.click(edRect!.x + 24, edRect!.y + 10);
    await page.waitForTimeout(50);
    const sel = await castEditor(page).evaluate((el: HTMLTextAreaElement) => ({
      start: el.selectionStart,
      len: el.value.length,
    }));
    expect(sel.start).toBeGreaterThan(0);
    expect(sel.start).toBeLessThan(sel.len - 1);
  });

  test('notes auto-grow past two rows with multiline content', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Sheet', exact: true }).click();

    // Seed-agnostic: write a multi-line note via the bridge.
    const note = 'Line one\nLine two\nLine three\nLine four\nLine five';
    await page.evaluate((n) => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      b.dispatch({ type: 'UPDATE_SCENE', payload: { id: p.scenes[0].id, notes: n } });
    }, note);

    const box = notesBox(page);
    await expect(box).toBeVisible();
    await expect.poll(async () => {
      const ta = box.locator('textarea');
      if ((await ta.count()) !== 1) return false;
      const bh = await box.boundingBox();
      return bh ? bh.height > 40 : false;
    }).toBe(true);
  });
});
