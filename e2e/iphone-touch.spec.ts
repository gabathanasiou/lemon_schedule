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
  const viewTrigger = page.locator('[data-presence-anchor="toolbar:schedule:view"]');
  const openView = async () => {
    /* DELIBERATELY no "wait for the previous menu to close": a user picks a
       view and immediately reopens the menu while the close morph is still
       playing. That fast path used to leave the menu stuck invisible. */
    await viewTrigger.tap();
    await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeVisible();
  };

  /* The trigger is the MORPHING icon-first Button (icon alone at rest →
     icon+label while its menu is OPEN). The reveal is state-driven on touch
     (hover would reflow under the finger and drop the click): the first tap
     must open the menu, and only then may the button grow — never before. */
  const collapsedW = await viewTrigger.evaluate(el => el.getBoundingClientRect().width);
  expect(collapsedW).toBeLessThan(60);
  await viewTrigger.tap();
  await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeVisible();
  await expect.poll(() => viewTrigger.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(collapsedW + 20);
  const [triggerBox, menuBox] = await Promise.all([
    viewTrigger.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, w: r.width }; }),
    page.locator('[role="menu"]').first().evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, w: r.width }; }),
  ]);
  // Anchored to the (expanded) trigger's left edge and on screen.
  expect(Math.abs(menuBox.x - triggerBox.x)).toBeLessThanOrEqual(8);
  expect(menuBox.x + menuBox.w).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  // …and the trigger STAYED expanded while the menu is open.
  expect(triggerBox.w).toBeGreaterThan(collapsedW + 20);
  await page.keyboard.press('Escape');
  await waitMenusClosed();

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

  /* Roadmap 338 — the "nested menu dismisses itself on a tap" bug. iOS can
     deliver the click for a tap late (tap-to-hover deferral / retargeting
     after the card under the finger changed). The nested card opens EXACTLY
     over the row that was tapped, so that click used to land on a different
     row (the first child item, or the Back row) and run it: the menu closed
     and sometimes a setting changed. The invariant is per-row: a click may
     only act if the SAME row received this gesture's pointerdown. */
  test('a deferred click never activates the row that replaced the tapped one (338)', async ({ page }) => {
    await bootPhone(page);
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    const trigger = page.locator('[data-presence-anchor="toolbar:schedule:view"]');
    const viewMode = () => page.evaluate(() => localStorage.getItem('lemon_schedule_view_mode'));
    const before = await viewMode();

    /* A tap as iOS delivers it in the tap-to-hover model: pointer events,
       click deferred. This opens the child card over the row. */
    const tapNoClick = async (locator: import('@playwright/test').Locator) => {
      const b = (await locator.boundingBox())!;
      const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      const pressedAt = await page.evaluate(() => performance.now());
      await locator.evaluate((el, p) => {
        for (const type of ['pointerdown', 'pointerup']) {
          el.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1,
            isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
            clientX: p.x, clientY: p.y,
          }));
        }
      }, pt);
      return { pt, pressedAt };
    };
    /* The deferred click for that tap, landing where the finger was. The next
       touch clears the one-shot swallow (exactly like the user's next tap),
       so only the per-row guard can stop it. */
    const ghostClick = async (pt: { x: number; y: number }, pressedAt: number) => {
      /* The deferred click, landing on the row that replaced the tapped one.
         It arrives AFTER the old one-shot 600ms swallow expired but inside the
         ghost window — only the per-row guard can stop it. */
      await page.waitForFunction((t) => performance.now() > t, pressedAt + 750);
      await page.evaluate((p) => {
        const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: p.x, clientY: p.y }));
      }, pt);
    };

    // 1) Second row → the point under the finger is the first child item.
    await trigger.tap();
    const sub = page.getByRole('menuitem', { name: 'Stripboard View' });
    let tap = await tapNoClick(sub);
    await expect(page.getByRole('menuitem', { name: 'A4 Landscape' })).toBeVisible();
    await ghostClick(tap.pt, tap.pressedAt);
    await expect(page.getByRole('menuitem', { name: 'A4 Landscape' })).toBeVisible();
    expect(await viewMode()).toBe(before);

    // Back to the root with a real tap, then the first row → the point under
    // the finger is now the Back row: a ghost must not "go back".
    await page.locator('[data-submenu-back]').first().tap();
    await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeVisible();
    const first = page.getByRole('menuitem', { name: 'Ribbon Layout' });
    tap = await tapNoClick(first);
    await expect(page.getByRole('menuitem', { name: 'Default', exact: true })).toBeVisible();
    await ghostClick(tap.pt, tap.pressedAt);
    await expect(page.getByRole('menuitem', { name: 'Default', exact: true })).toBeVisible();
  });

  /* Roadmap 338b — the second-tap killer. iOS sometimes delivers the trigger
     tap with NO click (tap-to-hover), so PageToolbar's pending gesture was
     never cleared. The next tap is a menu ROW — portaled inside the toolbar's
     React tree — whose pointerup replayed that stale trigger pointerdown and
     toggled the whole menu shut ("open the submenu, tap an option, it's
     already dismissed"). */
  test('a swallowed trigger click must not re-fire on the next menu-row tap (338)', async ({ page }) => {
    await bootPhone(page);
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    const trigger = page.locator('[data-presence-anchor="toolbar:schedule:view"]');
    const b = (await trigger.boundingBox())!;
    const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    // A tap as the iOS tap-to-hover model delivers it: pointer events, no click.
    await trigger.evaluate((el, p) => {
      for (const type of ['pointerdown', 'pointerup']) {
        el.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1,
          isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
          clientX: p.x, clientY: p.y,
        }));
      }
    }, pt);
    await expect(page.getByRole('menuitem', { name: 'Ribbon Layout' })).toBeVisible();

    // The next tap is a nested row. Its pointerup must not replay the old
    // toolbar gesture: the child card must open, not the whole menu close.
    await page.getByRole('menuitem', { name: 'Stripboard View' }).tap();
    await expect(page.getByRole('menuitem', { name: 'A4 Portrait' })).toBeVisible();
    // The Back row is labelled with the parent card: proves the child replaced it.
    await expect(page.locator('[data-submenu-back]').filter({ hasText: 'Stripboard View' })).toBeVisible();
  });

  /* Roadmap 338c — header icon tabs. iOS drops the tap's click when the
     label reveal reflows the tab row, so a click-only tab only expanded its
     text on tap 1 and switched on tap 2. Coarse tabs now switch on pointerup;
     a drag is still a scroll, never a switch. */
  test('header icon tab switches on the FIRST tap; a drag never switches (338)', async ({ page }) => {
    await bootPhone(page);
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    const calendar = page.locator('[data-presence-anchor="nav:tab:calendar"]');
    const design = page.locator('[data-presence-anchor="nav:tab:design"]');
    await expect(page.locator('[data-presence-anchor="nav:tab:schedule"]')).toHaveAttribute('data-active', 'true');
    await expect(calendar).not.toHaveAttribute('data-active', 'true');

    const noClickTap = async (loc: import('@playwright/test').Locator, dx = 0) => {
      const b = (await loc.boundingBox())!;
      const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      await loc.evaluate((el, q) => {
        el.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1,
          isPrimary: true, button: 0, buttons: 1, clientX: q.x, clientY: q.y,
        }));
        el.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1,
          isPrimary: true, button: 0, buttons: 0, clientX: q.x + q.dx, clientY: q.y,
        }));
      }, { ...p, dx });
    };

    // A tap as iOS often delivers it: no click at all.
    await noClickTap(calendar);
    await expect(calendar).toHaveAttribute('data-active', 'true');

    // A DRAG is a scroll: it must not switch the tab under it.
    await noClickTap(design, 30);
    await expect(design).not.toHaveAttribute('data-active', 'true');

    // A normal tap still works.
    await design.tap();
    await expect(design).toHaveAttribute('data-active', 'true');
  });

  /* Roadmap 338d — toolbar buttons that depend on the CLICK still lose taps
     on iOS (identical coordinates, no overlay, no long task — the trace shows
     pointerdown/up with no click at all). The kit Button now activates on
     pointerup for coarse pointers, so Edit / help / Print never wait for a
     click; a drag stays a scroll. */
  test('toolbar buttons act on the TAP, not the click (338)', async ({ page }) => {
    await bootPhone(page);
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    const edit = page.locator('[data-presence-anchor="toolbar:schedule:edit"]');
    const help = page.locator('[data-presence-anchor="toolbar:schedule:help"]');

    const noClickTap = async (loc: import('@playwright/test').Locator, dx = 0) => {
      const b = (await loc.boundingBox())!;
      const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      await loc.evaluate((el, q) => {
        el.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1,
          isPrimary: true, button: 0, buttons: 1, clientX: q.x, clientY: q.y,
        }));
        el.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1,
          isPrimary: true, button: 0, buttons: 0, clientX: q.x + q.dx, clientY: q.y,
        }));
      }, { ...p, dx });
    };

    // No click at all: Edit must turn on, then off, on the tap itself.
    await noClickTap(edit);
    await expect(edit).toHaveAttribute('data-active', 'true');
    await noClickTap(edit);
    await expect(edit).not.toHaveAttribute('data-active', 'true');

    // A dragged tap is a scroll, never a toggle.
    await noClickTap(edit, 30);
    await expect(edit).not.toHaveAttribute('data-active', 'true');

    // The help button (a kit Button) opens on the tap alone.
    await noClickTap(help);
    await expect(page.getByText('Stripboard Controls')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Stripboard Controls')).toBeHidden();
  });

  /* Roadmap 338 — rapid trigger taps. An open landing inside a close morph
     used to finish by restoring the CLOSE's inline `opacity: 0`, leaving the
     menu mounted, "open" and permanently invisible (the classic "tap, nothing
     happens, tap again"). */
  test('a reopen during the close morph leaves a painted, interactive menu (338)', async ({ page }) => {
    await bootPhone(page);
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    const trigger = page.locator('[data-presence-anchor="toolbar:schedule:view"]');
    for (let i = 0; i < 6; i++) {
      // open → close → open, as fast as a finger can tap.
      await trigger.tap();
      await trigger.tap();
      await trigger.tap();
      await expect.poll(
        () => page.locator('[role="menu"]').first().evaluate(el => Number(getComputedStyle(el).opacity)),
        { timeout: 2000, message: `round ${i}: three taps must leave a painted menu` },
      ).toBe(1);
      // …and it must actually work.
      await page.getByRole('menuitem', { name: 'Ribbon Layout' }).tap();
      await expect(page.getByRole('menuitem', { name: 'Default', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[role="menu"]')).toHaveCount(0, { timeout: 2000 });
    }
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
