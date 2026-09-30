import { test, expect } from '@playwright/test';
import { openDayManager, expandDaySection as expand } from './helpers';

test.describe('Day call times + crew (roadmap 99)', () => {
  test('call-times and crew sections render inline Glide grids sized to content', async ({ page }) => {
    await openDayManager(page);

    const callTimes = await expand(page, 'callTimes', '[data-day-times-glide]');
    const ctGrid = callTimes.locator('[data-day-times-glide]').first();
    await expect(ctGrid).toBeVisible({ timeout: 8000 });
    await expect(ctGrid.locator('.dvn-scroller')).toBeAttached();
    await expect.poll(
      () => ctGrid.locator('.dvn-scroller').evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight),
      { timeout: 5000 },
    ).toBe(true);

    const crew = await expand(page, 'crew', '[data-crew-calls]');
    await expect(crew.locator('[data-crew-calls] .dvn-scroller').first()).toBeAttached({ timeout: 8000 });
  
    // Roadmap 149 — typing in the crew Person cell survives a Shift-triggered
    // app re-render (the editor used to remount and snap back to the seed).
    const roster = crew.locator('[data-crew-roster-glide] .dvn-scroller').first();
    await expect(roster).toBeAttached({ timeout: 8000 });
    await crew.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-crew-roster-glide] .dvn-scroller') as HTMLElement | null;
      if (!el) return false;
      const w = el.clientWidth;
      const prev = (window as any).__crewPersonWidth;
      (window as any).__crewPersonWidth = w;
      return w > 0 && prev === w;
    }, undefined, { timeout: 5000 });
    const personBox = (await roster.boundingBox())!;
    const personTarget = Math.max(120, Math.floor(personBox.width) - 1) - 34;
    const personCols = [150, 170, 90].map(w => Math.max(40, Math.floor((w / (150 + 170 + 90)) * personTarget)));
    personCols[1] += personTarget - personCols.reduce((a, b) => a + b, 0);
    await page.mouse.dblclick(personBox.x + personCols[0] + personCols[1] / 2, personBox.y + 30 + 14);
    const personInput = page.locator('#portal input').first();
    await expect(personInput).toBeAttached({ timeout: 4000 });
    await personInput.click();
    await personInput.fill('ZZ');
    await expect(personInput).toHaveValue('ZZ', { timeout: 4000 });
    await page.keyboard.press('Shift');
    await expect(personInput).toHaveValue('ZZ', { timeout: 4000 });
  });


  test('call-times settings modal — tabbed redesign, removable category defaults (roadmap 110)', async ({ page }) => {
    await openDayManager(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Call Times' }).click();

    const modal = page.getByRole('dialog').last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Four tabs, one concern each.
    await expect(modal.getByRole('button', { name: 'Call stages' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Category defaults' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Department precalls' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Crew template' })).toBeVisible();

    // Stage list is the contained Import-style table (default: 5 stages).
    await expect(modal.locator('table tbody tr')).toHaveCount(5);

    // Category defaults: cast is locked, Background Actors is removable.
    await modal.getByRole('button', { name: 'Category defaults' }).click();
    await expect(modal.getByRole('button', { name: 'Remove Cast default' })).toHaveCount(0);
    const castRow = modal.locator('[data-call-category="cast"]');
    const bgRow = modal.locator('[data-call-category="backgroundActors"]');
    await expect(bgRow).toBeVisible();
    await expect(bgRow.getByRole('button', { name: /Remove .* default/ })).toHaveCount(1);

    // Add-category picker is the shared kit CategoryDropdown (menu items with icons).
    await modal.getByRole('button', { name: 'Add category…' }).click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // Multi-select stage dropdown (GroupedSelect → shared DropdownPanel) toggles a stage off cast.
    await castRow.getByRole('button').first().click();
    await page.locator('[data-ei]').filter({ hasText: /^Pickup$/ }).click();
    await expect.poll(() => page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return (p.productionInfo?.callTimes?.categoryStages?.cast || []).includes('pickup');
    }), { timeout: 4000 }).toBe(false);
    await page.keyboard.press('Escape');

    // Removing a non-cast default stores an explicit empty list -> the row
    // disappears (it falls back to the DOOD + first-scene grid on the day).
    await bgRow.getByRole('button', { name: /Remove .* default/ }).click();
    await expect.poll(() => page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return (p.productionInfo?.callTimes?.categoryStages?.backgroundActors || ['x']).length;
    }), { timeout: 4000 }).toBe(0);
    await expect(bgRow).toHaveCount(0);
  
    // Crew template (roadmap 155): the person editor opens ABOVE the modal with
    // its dropdown; Esc dismisses ONLY the dropdown; "Add new crew member…"
    // opens the shared modal and assigns the created person to the slot.
    await modal.getByRole('button', { name: 'Crew template' }).click();
    const tmplScroller = modal.locator('[data-crew-template-editor] .dvn-scroller').first();
    await expect(tmplScroller).toBeAttached({ timeout: 8000 });
    await tmplScroller.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-crew-template-editor] .dvn-scroller') as HTMLElement | null;
      if (!el) return false;
      const w = el.clientWidth;
      const prev = (window as any).__crewTemplatePersonWidth;
      (window as any).__crewTemplatePersonWidth = w;
      return w > 0 && prev === w;
    }, undefined, { timeout: 5000 });
    const tBox = (await tmplScroller.boundingBox())!;
    const tTarget = Math.max(120, Math.floor(tBox.width) - 1) - 34;
    const tCols = [150, 170, 90].map(w => Math.max(40, Math.floor((w / (150 + 170 + 90)) * tTarget)));
    tCols[1] += tTarget - tCols.reduce((a, b) => a + b, 0);
    await page.mouse.dblclick(tBox.x + tCols[0] + tCols[1] / 2, tBox.y + 30 + 14);
    const layer = page.locator('[data-glide-overlay-layer]');
    await expect(layer.locator('input').first()).toBeAttached({ timeout: 4000 });
    const addItem = layer.getByText('Add new crew member…');
    await expect(addItem).toBeVisible({ timeout: 4000 });
    await page.keyboard.press('Escape');
    await expect(addItem).toBeHidden();
    // Escape closes the whole editing session: the cell editor box goes too.
    await expect(layer.locator('input')).toHaveCount(0);
    await expect(modal).toBeVisible();
    // Reopen the person editor for the Add-new flow (click to re-select, then
    // edit-on-type — dblclick is flaky right after an overlay-cancel).
    await page.mouse.click(tBox.x + tCols[0] + tCols[1] / 2, tBox.y + 30 + 14);
    await page.keyboard.press('a');
    await expect(addItem).toBeVisible({ timeout: 4000 });
    await addItem.click();
    const addModal = page.getByRole('dialog').filter({ hasText: 'Add Crew Member' });
    await expect(addModal).toBeVisible({ timeout: 4000 });
    await addModal.getByPlaceholder('Full name').fill('TEST NEWBIE');
    await addModal.getByRole('button', { name: 'Add member' }).click();
    await expect(addModal).toBeHidden();
    await expect.poll(() => page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      const person = Object.values(p.crew || {}).flat().find((x: any) => x.name === 'TEST NEWBIE');
      if (!person) return false;
      return (p.crewTemplate?.slots || []).some((s: any) => s.personId === (person as any).id);
    }), { timeout: 5000 }).toBe(true);
  });


  test('right-click the call-times grid header opens the stages settings modal (roadmap 110)', async ({ page }) => {
    await openDayManager(page);
    const section = await expand(page, 'callTimes', '[data-day-times-glide]');
    const grid = section.locator('[data-day-times-glide]').first();
    await expect(grid).toBeVisible({ timeout: 8000 });
    await grid.scrollIntoViewIfNeeded();
    const box = (await grid.boundingBox())!;
    // The grid's header row is the top ~15px of the canvas.
    await page.mouse.click(box.x + 200, box.y + 15, { button: 'right' });

    const item = page.getByRole('menuitem', { name: 'Edit Call Time Stages…' });
    await expect(item).toBeVisible({ timeout: 4000 });
    await item.click();

    const modal = page.getByRole('dialog').last();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByRole('button', { name: 'Call stages' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Category defaults' })).toBeVisible();
  });

  test('crew call override writes through the shared day-meta path', async ({ page }) => {
    await openDayManager(page);
    const crew = await expand(page, 'crew', '[data-crew-roster-glide]');
    const scroller = crew.locator('[data-crew-roster-glide] .dvn-scroller').first();
    await expect(scroller).toBeAttached({ timeout: 8000 });
    await crew.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-crew-roster-glide] .dvn-scroller') as HTMLElement | null;
      if (!el) return false;
      const w = el.clientWidth;
      const prev = (window as any).__crewGridWidth;
      (window as any).__crewGridWidth = w;
      return w > 0 && prev === w;
    }, undefined, { timeout: 5000 });

    // Auto-fit geometry: Role(150) | Person(170) | Call(90) + delete(34),
    // flexing on Person.
    const box = (await scroller.boundingBox())!;
    const target = Math.max(120, Math.floor(box.width) - 1) - 34;
    const total = 150 + 170 + 90;
    const widths = [150, 170, 90].map(w => Math.max(40, Math.floor((w / total) * target)));
    const sum = widths.reduce((s, w) => s + w, 0);
    widths[1] += target - sum;
    const callX = box.x + widths[0] + widths[1] + widths[2] / 2;
    const callY = box.y + 30 + 14;

    await page.mouse.dblclick(callX, callY);
    const ta = page.locator('#portal textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });
    await ta.click();
    await ta.fill('07:30');
    await expect(ta).toHaveValue('07:30', { timeout: 4000 });
    await ta.press('Enter');

    await expect.poll(() => page.evaluate(() => {
      const b: any = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
      return (gov?.daybreakMeta?.crewSlots || []).some((s: any) => s.callTime === '07:30');
    }), { timeout: 5000 }).toBe(true);
  });

  test('crew template call override accepts typing (roadmap 155)', async ({ page }) => {
    page.on('console', m => { if (m.text().startsWith('DBG')) console.log('PAGE:', m.text()); });
    await openDayManager(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Call Times' }).click();

    const modal = page.getByRole('dialog').filter({ hasText: 'Call Times' });
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Crew template' }).click();

    const scroller = modal.locator('[data-crew-template-editor] .dvn-scroller').first();
    await expect(scroller).toBeAttached({ timeout: 8000 });
    await scroller.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-crew-template-editor] .dvn-scroller') as HTMLElement | null;
      if (!el) return false;
      const w = el.clientWidth;
      const prev = (window as any).__crewTemplateGridWidth;
      (window as any).__crewTemplateGridWidth = w;
      return w > 0 && prev === w;
    }, undefined, { timeout: 5000 });

    // Auto-fit geometry: Role(150) | Person(170) | Call(90) + delete(34).
    const box = (await scroller.boundingBox())!;
    const target = Math.max(120, Math.floor(box.width) - 1) - 34;
    const total = 150 + 170 + 90;
    const widths = [150, 170, 90].map(w => Math.max(40, Math.floor((w / total) * target)));
    const sum = widths.reduce((s, w) => s + w, 0);
    widths[1] += target - sum;
    const callX = box.x + widths[0] + widths[1] + widths[2] / 2;
    const callY = box.y + 30 + 14;

    // Escape cancels JUST the edit: the editor closes, nothing commits, and
    // the Call Times modal stays open.
    await page.mouse.dblclick(callX, callY);
    const ta = page.locator('[data-glide-overlay-layer] textarea').first();
    await expect(ta).toBeAttached({ timeout: 4000 });
    await ta.click();
    await ta.fill('06:00');
    await expect(ta).toHaveValue('06:00', { timeout: 4000 });
    await page.keyboard.press('Escape');
    await expect(ta).toHaveCount(0, { timeout: 4000 });
    await expect(modal).toBeVisible();
    expect(await page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return (p.crewTemplate?.slots || []).some((s: any) => s.callTime === '06:00');
    })).toBe(false);

    // Reopen (edit-on-type) and commit for real.
    await page.mouse.click(callX, callY);
    await page.keyboard.press('0');
    const ta2 = page.locator('[data-glide-overlay-layer] textarea').first();
    await expect(ta2).toBeAttached({ timeout: 4000 });
    await ta2.click();
    await ta2.fill('07:30');
    await expect(ta2).toHaveValue('07:30', { timeout: 4000 });
    await ta2.press('Enter');

    await expect.poll(() => page.evaluate(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return (p.crewTemplate?.slots || []).some((s: any) => s.callTime === '07:30');
    }), { timeout: 5000 }).toBe(true);
  });
});
