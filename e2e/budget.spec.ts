import { test, expect } from '@playwright/test';
import { ensureProject, waitForPersistedProject, glideCellId, waitForGlideCellSelected } from './helpers';

/**
 * Budgeting phase 1 (roadmap 334) — the authoring loop end to end: the empty
 * state creates a real budget from the Feature template, the sheet/library
 * render, and the result persists. The linked-line test proves the schedule
 * loop: a linked quantity follows the stripboard with no sync step, and a
 * version lock freezes it. Pure maths lives in `src/lib/__tests__/budget.test.ts`.
 */

const budgetTab = '[data-presence-anchor="nav:tab:budget"]';
const librarySubTab = '[data-presence-anchor="nav:subtab:library"]';

test.describe('Budget', () => {
  test.describe.configure({ mode: 'serial' });

  test('creates a Feature budget from the empty state and persists it', async ({ page }) => {
    await page.goto('/lemon_schedule/');
    await ensureProject(page);
    await page.locator(budgetTab).click();
    await expect(page.getByText('Build a budget')).toBeVisible({ timeout: 8000 });

    await page.getByRole('button', { name: /Feature/ }).click();
    await expect(page.locator('[data-budget-grid]')).toBeVisible({ timeout: 5000 });

    const summary = await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary());
    expect(summary.categories).toBe(4);
    expect(summary.accounts).toBe(25);
    expect(summary.lines).toBe(0);
    expect(summary.totals.grandTotalCents).toBe(0);

    // The shared library/settings surface is reachable and shows live values.
    await page.locator(librarySubTab).click();
    await expect(page.getByText('Budget settings')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('SHOOT_DAYS')).toBeVisible();

    await test.step('(i) inspects/edits each row kind — it never quick-adds', async () => {
      await page.locator('[data-presence-anchor="nav:subtab:budget"]').click();
      const box = await page.locator('[data-budget-grid] .dvn-scroller').first().boundingBox();
      expect(box).toBeTruthy();
      // Trailing lanes are fixed-width: info 30px, then actions 56px.
      const infoX = box!.x + box!.width - 56 - 15;
      const rowY = (row: number) => box!.y + 30 + row * 26 + 13;
      const linesBefore = (await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary())).lines;

      await page.mouse.click(infoX, rowY(0));
      await expect(page.getByRole('heading', { name: /^Category —/ })).toBeVisible({ timeout: 5000 });
      await page.getByRole('button', { name: 'Done', exact: true }).click();

      await page.mouse.click(infoX, rowY(1));
      await expect(page.getByRole('heading', { name: /^Account —/ })).toBeVisible({ timeout: 5000 });
      await page.getByRole('button', { name: 'Done', exact: true }).click();

      // A line in the first account sits directly under it (row 2).
      const lineId = await page.evaluate(() => {
        const b = (window as any).__lemonSchedule;
        const account = b.getProject().budget.accounts[0];
        const line = b.makeBudgetLine({ accountId: account.id, description: 'Info row proof', qty: 1, rateCents: 100 });
        b.dispatch({ type: 'ADD_BUDGET_LINE', payload: line });
        return line.id;
      });
      await page.mouse.click(infoX, rowY(2));
      await expect(page.getByRole('heading', { name: 'Line — Info row proof' })).toBeVisible({ timeout: 5000 });
      await page.getByRole('button', { name: 'Done', exact: true }).click();

      const after = await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary());
      expect(after.lines).toBe(linesBefore + 1);
      expect(after.lineItems.some((l: any) => l.id === lineId)).toBe(true);

      await page.evaluate((id) => {
        (window as any).__lemonSchedule.dispatch({ type: 'DELETE_BUDGET_LINE', payload: id });
      }, lineId);
    });

    await test.step('Shift+Enter and the context menu add lines without the modal', async () => {
      const box = await page.locator('[data-budget-grid] .dvn-scroller').first().boundingBox();
      expect(box).toBeTruthy();
      const rowY = (row: number) => box!.y + 30 + row * 26 + 13;
      const before = (await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary())).lines;

      // Focus the category row, then Shift+Enter — one line, no modal, the
      // selection lands on the new row.
      await page.mouse.click(box!.x + 100, rowY(0));
      await waitForGlideCellSelected(page, glideCellId(1, 0));
      await page.keyboard.press('Shift+Enter');
      await expect.poll(async () => (await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary())).lines).toBe(before + 1);
      await expect(page.getByRole('heading', { name: /^Line —/ })).toHaveCount(0);

      // Context menu → "Add line…" asks a count and commits N lines as ONE
      // undo entry.
      await page.mouse.click(box!.x + 100, rowY(0), { button: 'right' });
      await page.getByText('Add line…', { exact: true }).click();
      const prompt = page.getByRole('dialog').locator('input').first();
      await expect(prompt).toBeVisible({ timeout: 5000 });
      await prompt.fill('3');
      await prompt.press('Enter');
      await expect.poll(async () => (await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary())).lines).toBe(before + 4);

      await page.evaluate(() => (window as any).__lemonSchedule.undo());
      await expect.poll(async () => (await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary())).lines).toBe(before + 1);
    });

    await waitForPersistedProject(page, 'p.budget && p.budget.categories.length === 4 && p.budget.versions.length === 1');
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__lemonSchedule, undefined, { timeout: 10000 });
    const afterReload = await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary());
    expect(afterReload.categories).toBe(4);
    expect(afterReload.accounts).toBe(25);

    await test.step('an expense becomes Actual spend in the cost report', async () => {
      await page.locator('[data-presence-anchor="nav:subtab:expenses"]').click();
      await page.getByRole('button', { name: 'Add expense' }).click();
      await expect(page.getByRole('heading', { name: /Expense —/ })).toBeVisible({ timeout: 5000 });

      await page.getByRole('textbox', { name: 'What was bought' }).fill('Lens rental');
      await page.getByRole('textbox', { name: 'What was bought' }).blur();
      const amount = page.getByRole('spinbutton', { name: 'Expense amount' });
      await amount.fill('1200');
      await amount.blur();

      // Charge the chart's first account (seed-agnostic: resolve via the bridge).
      const accountLabel = await page.evaluate(() => {
        const b = (window as any).__lemonSchedule;
        const account = b.getProject().budget.accounts.find((a: any) => a.number === '1100');
        return `${account.number} ${account.name}`.trim();
      });
      await page.locator('[data-presence-anchor="ui:text:Unallocated"]').click();
      await page.getByText(accountLabel, { exact: true }).click();
      await page.getByRole('button', { name: 'Done', exact: true }).click();

      await expect.poll(async () => (await page.evaluate(() => (window as any).__lemonSchedule.costReportSummary())).totals.actualCents).toBe(120000);
      const cost = await page.evaluate(() => (window as any).__lemonSchedule.costReportSummary());
      const unallocated = cost.rows.find((r: any) => r.kind === 'unallocated' && r.number === '1100');
      expect(unallocated.actualCents).toBe(120000);
      expect(cost.totals.efcCents).toBeGreaterThanOrEqual(120000);

      await page.locator('[data-presence-anchor="nav:subtab:cost"]').click();
      await expect(page.locator('[data-cost-report]')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('$1,200', { exact: true }).first()).toBeVisible();
    });
  });

  test('linked lines follow the schedule, pin freezes them, and a locked version cannot drift', async ({ page }) => {
    await page.goto('/lemon_schedule/');
    await ensureProject(page);
    await page.locator(budgetTab).click();
    await page.getByRole('button', { name: /Feature/ }).click();
    await expect(page.locator('[data-budget-grid]')).toBeVisible({ timeout: 5000 });

    const first = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const p = b.getProject();
      const budget = p.budget;
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      // One extra production day (a daybreak opens a section below it).
      b.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, rows: [...v.rows, { id: b.newId(), type: 'DAYBREAK', containerId: 1, order: 99999, daybreakCallTime: '08:00' }] } });
      const account = budget.accounts.find((a: any) => a.number === '2400');
      const line = b.makeBudgetLine({
        accountId: account.id,
        description: 'Set operations day rate',
        qty: 0,
        rateCents: 50000,
        unit: 'unit-day',
        source: { kind: 'shootDays' },
      });
      b.dispatch({ type: 'ADD_BUDGET_LINE', payload: line });
      return { lineId: line.id, summary: b.budgetSummary() };
    });
    expect(first.summary.linkedLines).toBe(1);
    expect(first.summary.lines).toBe(1);
    const q1 = first.summary.totals.baseCents;
    const linkedQty = first.summary.lineItems[0].qty;
    expect(q1).toBeGreaterThan(0);
    expect(linkedQty).toBeGreaterThan(0);

    // A schedule change moves the linked quantity with no sync button.
    const second = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      b.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, rows: [...v.rows, { id: b.newId(), type: 'DAYBREAK', containerId: 1, order: 99999, daybreakCallTime: '08:00' }] } });
      return b.budgetSummary();
    });
    expect(second.totals.baseCents).toBe(q1 + 50000);

    await test.step('the schedule review applies drifted quantities as one undo entry', async () => {
      const pastBefore = await page.evaluate(() => (window as any).__lemonSchedule.pastCount());
      const storedQty = async () => page.evaluate(() => {
        const p = (window as any).__lemonSchedule.getProject();
        return p.budget.versions.find((v: any) => v.id === p.budget.activeVersionId).lines[0].qty;
      });
      expect(await storedQty()).toBe(0);

      // The toolbar advertises the drift; the modal reviews it before writing.
      await page.getByRole('button', { name: /1 update from the schedule/ }).click();
      await expect(page.getByRole('heading', { name: 'Updates from the schedule' })).toBeVisible();
      await expect(page.getByText('No cost change')).toBeVisible();
      await page.getByRole('button', { name: 'Apply 1 change' }).click();

      await expect.poll(storedQty).toBe(2);
      expect(await page.evaluate(() => (window as any).__lemonSchedule.pastCount())).toBe(pastBefore + 1);
      // The review cleared; the live quantity is unchanged.
      await expect(page.getByRole('button', { name: 'Up to date' })).toBeVisible();
      expect((await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary())).totals.baseCents).toBe(q1 + 50000);

      // One batch = one undo entry; the stored snapshot returns to 0.
      await page.evaluate(() => (window as any).__lemonSchedule.undo());
      await expect.poll(storedQty).toBe(0);
    });

    // Pin the current quantity, then move the schedule again: the line holds.
    await page.evaluate(({ lineId, qty }) => {
      const b = (window as any).__lemonSchedule;
      b.dispatch({ type: 'PIN_BUDGET_LINE', payload: { lineId, qty } });
    }, { lineId: first.lineId, qty: linkedQty });
    const pin = await page.evaluate(() => (window as any).__lemonSchedule.getProject().budget.versions[0].lines.find((l: any) => l.source));
    expect(pin.qtyOverride).toBe(linkedQty);
    const pinnedTotal = await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary().totals.baseCents);

    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      b.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, rows: [...v.rows, { id: b.newId(), type: 'DAYBREAK', containerId: 1, order: 99999, daybreakCallTime: '08:00' }] } });
    });
    expect((await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary().totals.baseCents))).toBe(pinnedTotal);

    // Locking through the UI pins every live-linked quantity and freezes edits.
    await page.getByRole('button', { name: 'Lock budget version' }).click();
    await page.getByText('Lock version…').click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(async () => (await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary())).locked).toBe(true);
    const lockedTotal = await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary().totals.baseCents);
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId);
      b.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, rows: [...v.rows, { id: b.newId(), type: 'DAYBREAK', containerId: 1, order: 99999, daybreakCallTime: '08:00' }] } });
    });
    expect((await page.evaluate(() => (window as any).__lemonSchedule.budgetSummary().totals.baseCents))).toBe(lockedTotal);

    await test.step('the Day Manager Expenses card quick-adds, edits via (i), and persists', async () => {
      await page.getByRole('button', { name: 'Production', exact: true }).click();
      await page.locator('[data-day-tab="expenses"]').click();
      const day = await page.evaluate(() => (window as any).__lemonSchedule.getDays().days[0]);
      expect(day).toBeTruthy();

      const before = await page.evaluate(() => (window as any).__lemonSchedule.getProject().expenses?.length || 0);
      await page.locator('[data-expenses-section]').getByRole('button', { name: 'Add expense' }).click();
      // Quick add: an editable row appears — the modal stays closed.
      await expect.poll(async () => (await page.evaluate(() => (window as any).__lemonSchedule.getProject().expenses?.length || 0))).toBe(before + 1);
      await expect(page.getByRole('heading', { name: /^Expense —/ })).toHaveCount(0);
      const attributed = await page.evaluate(() => {
        const expenses = (window as any).__lemonSchedule.getProject().expenses;
        return expenses[expenses.length - 1];
      });
      expect(attributed.dayNumber).toBe(day.chronoDay);
      expect(attributed.dayDate).toBe(day.date);

      // (i) opens the SAME shared modal (commit-on-blur fields inside).
      const section = page.locator('[data-expenses-section]');
      await section.locator('[data-expenses-grid] .dvn-scroller').first().scrollIntoViewIfNeeded();
      const box = await section.locator('[data-expenses-grid] .dvn-scroller').first().boundingBox();
      expect(box).toBeTruthy();
      // Trailing lanes: info 30px, then actions 56px; 30px header, 26px rows.
      await page.mouse.click(box!.x + box!.width - 56 - 15, box!.y + 30 + 13);
      await expect(page.getByRole('heading', { name: /^Expense —/ })).toBeVisible({ timeout: 5000 });

      await page.getByRole('textbox', { name: 'What was bought' }).fill('Craft service');
      await page.getByRole('textbox', { name: 'What was bought' }).blur();
      const amount = page.getByRole('spinbutton', { name: 'Expense amount' });
      await amount.fill('750');
      await amount.blur();
      await page.getByRole('button', { name: 'Done', exact: true }).click();

      await expect(section).toContainText('$750');
      expect((await page.evaluate(() => (window as any).__lemonSchedule.getProject().expenses)).find((e: any) => e.id === attributed.id).description).toBe('Craft service');

      // Re-open the same row through (i) and edit it.
      await page.mouse.click(box!.x + box!.width - 56 - 15, box!.y + 30 + 13);
      const editAmount = page.getByRole('spinbutton', { name: 'Expense amount' });
      await editAmount.fill('800');
      await editAmount.blur();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(section).toContainText('$800');

      await waitForPersistedProject(page, 'p.expenses && p.expenses.some(e => e.description === "Craft service" && e.amountCents === 80000)');
      await page.reload();
      await ensureProject(page);
      await page.getByRole('button', { name: 'Production', exact: true }).click();
      await page.locator('[data-day-tab="expenses"]').click();
      await expect(page.locator('[data-expenses-section]')).toContainText('$800');
    });

    await test.step('crew overtime computes, posts to expenses and persists', async () => {
      await page.locator('[data-day-tab="crew"]').click();
      const seeded = await page.evaluate(() => {
        const b = (window as any).__lemonSchedule;
        const p = b.getProject();
        b.dispatch({ type: 'ADD_CREW_PERSON', payload: { role: 'cameraOperator', person: { id: 'ot-p1', name: 'OT ALEX', rateCents: 10000, rateUnit: 'day' } } });
        const version = p.versions.find((v: any) => v.id === p.activeVersionId);
        const pinned = version.rows.find((r: any) => r.type === 'DAYBREAK' && (r.pinned || (r.containerId === 1 && r.order === 0)));
        b.dispatch({
          type: 'UPDATE_ROW',
          payload: {
            versionId: p.activeVersionId,
            rowId: pinned.id,
            updates: { daybreakMeta: { ...(pinned.daybreakMeta || {}), crewSlots: [{ id: 'slot-ot', role: 'cameraOperator', personId: 'ot-p1' }], overtime: { actualWrap: '21:00' } } },
          },
        });
        return b.overtimeSummary();
      });
      // Day 1 call 08:00 → actual wrap 21:00 = 13h; 3h OT at $50 (10h paid, 2h×1.5 + 1h×2).
      expect(seeded[0].otHours).toBe(3);
      expect(seeded[0].costCents).toBe(5000);
      expect(seeded[0].noRate).toEqual([]);

      const badge = page.locator('[data-crew-overtime]');
      await expect(badge).toContainText('3h · $50', { timeout: 5000 });
      await badge.click();
      await expect(page.getByRole('heading', { name: /^Overtime —/ })).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('3h OT')).toBeVisible();

      await page.getByRole('button', { name: 'Post to expenses' }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect.poll(async () => {
        const expenses = await page.evaluate(() => (window as any).__lemonSchedule.getProject().expenses || []);
        const ot = expenses.find((e: any) => String(e.description).startsWith('Overtime — OT ALEX'));
        return ot ? ot.amountCents : 0;
      }).toBe(5000);
      const posted = await page.evaluate(() => (window as any).__lemonSchedule.getProject().expenses.find((e: any) => String(e.description).startsWith('Overtime —')));
      expect(posted.method).toBe('payroll');
      expect(posted.status).toBe('actual');
      expect(posted.dayNumber).toBe(1);
      await page.getByRole('button', { name: 'Done', exact: true }).click();

      await waitForPersistedProject(page, 'p.expenses && p.expenses.some(e => String(e.description).startsWith("Overtime —")) && p.versions[0].rows.some(r => r.daybreakMeta && r.daybreakMeta.overtime)');
      await page.reload();
      await ensureProject(page);
      await page.getByRole('button', { name: 'Production', exact: true }).click();
      await page.locator('[data-day-tab="crew"]').click();
      await expect(page.locator('[data-crew-overtime]')).toContainText('3h · $50');
      const afterReload = await page.evaluate(() => (window as any).__lemonSchedule.overtimeSummary());
      expect(afterReload[0].costCents).toBe(5000);
    });
  });
});
