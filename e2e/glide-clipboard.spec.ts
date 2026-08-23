import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

/**
 * Glide Breakdown copy/cut/paste must behave 1:1 on iPad (touch + hardware
 * keyboard) and desktop:
 *  - Context menu Copy/Cut/Paste (row-marker tap on iPad, right-click desktop)
 *  - Physical keyboard Cmd/Ctrl+C/X/V with a selected cell
 *
 * iPad project = WebKit + iPad Pro 11 touch. A Magic Keyboard is emulated by
 * stubbing the hover/fine media queries the app uses for hardware-keyboard
 * detection (primary pointer stays coarse/touch — the broken path where
 * tapping the grid never focuses the canvas, which is exactly why Glide's own
 * shortcuts are dead there).
 */
test.describe('Glide Breakdown clipboard', () => {
  test.beforeEach(async ({ page, browserName }) => {
    for (const p of ['clipboard-read', 'clipboard-write']) {
      try {
        await page.context().grantPermissions([p], { origin: 'http://localhost:3001' });
      } catch {
        /* unsupported permission — skip */
      }
    }
    if (browserName === 'webkit') {
      await page.addInitScript(() => {
        const real = window.matchMedia.bind(window);
        const TRUE_QUERIES = new Set(['(any-hover: hover)', '(any-pointer: fine)', '(hover: hover)', '(pointer: fine)']);
        window.matchMedia = (q: string): MediaQueryList => {
          if (TRUE_QUERIES.has(q)) {
            return {
              matches: true,
              media: q,
              onchange: null,
              addListener() {},
              removeListener() {},
              addEventListener() {},
              removeEventListener() {},
              dispatchEvent: () => false,
            } as unknown as MediaQueryList;
          }
          return real(q);
        };
      });
    }
  });

  const openGlide = async (page: any) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Glide Breakdown' }).click();
    };

  const isCoarse = (page: any) => page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);

  /** Geometry of grid cells, recomputed like the app does from its font size. */
  const gridGeo = async (page: any) => {
    const scroller = page.locator('.dvn-scroller');
    const sr = await scroller.boundingBox();
    const coarse = await isCoarse(page);
    const fs = await page.evaluate(() => {
      const v = parseFloat(localStorage.getItem('lemon_schedule_glide_font_size') || '');
      return Number.isFinite(v) ? v : null;
    });
    const size = fs ?? (coarse ? 12.5 : 11);
    const headerH = Math.round((36 * size) / 11);
    const rowH = Math.round((34 * size) / 11);
    // Column 0 is the actions (delete) column, then sceneNumber (60 wide)
    const actionsW = Math.round(((coarse ? 48 : 36) * size) / 11);
    return { x: sr!.x, y: sr!.y, headerH, rowH, markerW: coarse ? 72 : 50, actionsW, colW: Math.round((60 * size) / 11) };
  };

  const tapAt = async (page: any, x: number, y: number, button: 'left' | 'right' = 'left') => {
    if (await isCoarse(page)) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y, { button });
  };

  const tapRowMarker = async (page: any, row: number) => {
    const g = await gridGeo(page);
    const coarse = await isCoarse(page);
    if (coarse) {
      await page.touchscreen.tap(g.x + g.markerW / 2, g.y + g.headerH + row * g.rowH + g.rowH / 2);
    } else {
      await page.mouse.click(g.x + g.markerW / 2, g.y + g.headerH + row * g.rowH + g.rowH / 2, { button: 'right' });
    }
    };

  const tapCell = async (page: any, row: number, colIndex: number) => {
    const g = await gridGeo(page);
    await tapAt(page, g.x + g.markerW + g.actionsW + colIndex * g.colW + g.colW / 2, g.y + g.headerH + row * g.rowH + g.rowH / 2);
    };

  const clipRead = (page: any) =>
    page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (e: any) {
        return `ERROR:${e?.name ?? e}`;
      }
    });

  const clipWrite = (page: any, text: string) =>
    page.evaluate(async (t) => {
      try {
        await navigator.clipboard.writeText(t);
        return 'ok';
      } catch (e: any) {
        return `ERROR:${e?.name ?? e}`;
      }
    }, text);

  const sceneData = (page: any, row: number) =>
    page.evaluate((r) => {
      try {
        const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
        if (!key) return null;
        const project = JSON.parse(localStorage.getItem(key)!);
        const s = project.scenes?.[r];
        return s ? { num: s.sceneNumber, set: s.set, pages: s.pageCount } : null;
      } catch { return null; }
    }, row);

  /** Waits for the debounced localStorage save to land (poll instead of sleep). */
  const expectSceneNum = async (page: any, row: number, num: string) => {
    await expect.poll(async () => (await sceneData(page, row))?.num, { timeout: 8000 }).toBe(num);
  };

  const FIRST_ROW_CLIP = /^1\t7\/8\t\tEXT\tCITY STREET\tDAY\t\t4, 11\t/;

  test('CTX: Copy row', async ({ page }) => {
    await openGlide(page);
    await tapRowMarker(page, 0);
    const copyItem = page.getByText('Copy', { exact: true }).last();
    await expect(copyItem).toBeVisible();
    await copyItem.click();
        await expect.poll(() => clipRead(page), { timeout: 5000 }).toMatch(FIRST_ROW_CLIP);
  });

  test('CTX: Cut row clears it and copies to clipboard', async ({ page }) => {
    await openGlide(page);
    await tapRowMarker(page, 0);
    const cutItem = page.getByText('Cut', { exact: true }).last();
    await expect(cutItem).toBeVisible();
    await cutItem.click();
        await expect.poll(() => clipRead(page), { timeout: 5000 }).toMatch(FIRST_ROW_CLIP);
    await expectSceneNum(page, 0, '');
  });

  test('CTX: Paste overwrites the row', async ({ page }) => {
    await openGlide(page);
    expect(await clipWrite(page, '42\t2\tEXT\tCITY STREET\tDAY\tA pasted row\t9\t')).toBe('ok');
    await tapRowMarker(page, 0);
    const pasteItem = page.getByText('Paste', { exact: true }).last();
    await expect(pasteItem).toBeVisible();
    await pasteItem.click();
    await expectSceneNum(page, 0, '42');
  });

  test('CTX: Copy then Paste round-trips', async ({ page }) => {
    await openGlide(page);
    await tapRowMarker(page, 0);
    await page.getByText('Copy', { exact: true }).last().click();
    await page.waitForTimeout(500);
    await tapRowMarker(page, 1);
    await page.getByText('Paste', { exact: true }).last().click();
    const src = await sceneData(page, 0);
    await expect.poll(async () => (await sceneData(page, 1))?.num, { timeout: 8000 }).toBe(src?.num);
    await expect.poll(async () => (await sceneData(page, 1))?.set, { timeout: 8000 }).toBe(src?.set);
  });

  test('KB: Cmd+C copies the focused cell', async ({ page }) => {
    await openGlide(page);
    await tapCell(page, 0, 0);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+c' : 'Control+c');
        await expect.poll(() => clipRead(page), { timeout: 5000 }).toBe('1');
  });

  test('KB: Cmd+V pastes into the focused cell', async ({ page }) => {
    await openGlide(page);
    expect(await clipWrite(page, '42\t2\tEXT\tCITY STREET\tDAY\tA pasted row\t9\t')).toBe('ok');
    await tapCell(page, 0, 0);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
    await expectSceneNum(page, 0, '42');
  });

  test('KB: Cmd+X cuts the focused cell', async ({ page }) => {
    await openGlide(page);
    await tapCell(page, 0, 0);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+x' : 'Control+x');
        await expect.poll(() => clipRead(page), { timeout: 5000 }).toBe('1');
    await expectSceneNum(page, 0, '');
  });

  test('KB: native paste event path also works (clipboardData)', async ({ page }) => {
    await openGlide(page);
    await tapCell(page, 0, 0);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', '77\t1\tINT\tOFFICE\tNIGHT\tPasted via event\t3\t');
      const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      document.dispatchEvent(evt);
    });
    await expectSceneNum(page, 0, '77');
  });
});
