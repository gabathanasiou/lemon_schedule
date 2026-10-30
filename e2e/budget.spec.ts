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
  });
});
