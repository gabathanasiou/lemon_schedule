import { test, expect } from '@playwright/test';
import { ensureProject, waitForPersistedProject } from './helpers';

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

    await test.step('the Day Manager Expenses card adds, edits and persists a day cost', async () => {
      await page.getByRole('button', { name: 'Production', exact: true }).click();
      await page.locator('[data-day-tab="expenses"]').click();
      const day = await page.evaluate(() => (window as any).__lemonSchedule.getDays().days[0]);
      expect(day).toBeTruthy();

      await page.locator('[data-expenses-section]').getByRole('button', { name: 'Add expense' }).click();
      await page.getByRole('textbox', { name: 'What was bought' }).fill('Craft service');
      await page.getByRole('textbox', { name: 'What was bought' }).blur();
      const amount = page.getByRole('spinbutton', { name: 'Expense amount' });
      await amount.fill('750');
      await amount.blur();
      await page.getByRole('button', { name: 'Done', exact: true }).click();

      await expect(page.locator('[data-expenses-section]')).toContainText('$750');
      const attributed = await page.evaluate(() => {
        const expenses = (window as any).__lemonSchedule.getProject().expenses;
        return expenses[expenses.length - 1];
      });
      expect(attributed.dayNumber).toBe(day.chronoDay);
      expect(attributed.dayDate).toBe(day.date);

      // Edit through the same shared modal, then prove the card survives reload.
      await page.locator('[data-expenses-section]').getByText('Craft service', { exact: true }).click();
      const editAmount = page.getByRole('spinbutton', { name: 'Expense amount' });
      await editAmount.fill('800');
      await editAmount.blur();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.locator('[data-expenses-section]')).toContainText('$800');

      await waitForPersistedProject(page, 'p.expenses && p.expenses.some(e => e.description === "Craft service" && e.amountCents === 80000)');
      await page.reload();
      await ensureProject(page);
      await page.getByRole('button', { name: 'Production', exact: true }).click();
      await page.locator('[data-day-tab="expenses"]').click();
      await expect(page.locator('[data-expenses-section]')).toContainText('$800');
    });
  });
});
