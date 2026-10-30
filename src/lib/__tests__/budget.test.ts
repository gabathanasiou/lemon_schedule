import { describe, it, expect } from 'vitest';
import type { BudgetLine, Project, Scene } from '../../types';
import { makeBlankProject, reducer } from '../../store/reducer';
import { evaluateFormula, evaluateGlobals } from '../budget/formula';
import { formatMoney, parseMoney } from '../budget/format';
import { computeBudget } from '../budget/calc';
import { featureBudget, templateBudget } from '../budget/templates';
import { buildBudgetFromSchedule, previewBudgetFromSchedule } from '../budget/templates/fromSchedule';
import { activeBudgetVersion, cloneBudgetVersion, makeBudgetLine, pruneBudgetVersionTrash } from '../budget/model';
import { computeScheduleQuantities, lockBudgetVersion } from '../budget/scheduleSync';

function scene(partial: Partial<Scene> & { id: string }): Scene {
  return {
    sceneNumber: '1', pageCount: '1', pageCountDecimal: 1, scriptDay: '1',
    intExt: 'INT', set: 'STAGE', location: 'STAGE 5', dayNight: 'DAY',
    description: 'A scene', cast: '', notes: '', backgroundActors: '', stunts: '',
    vehicles: '', props: '', wardrobe: '', makeup: '', sfx: '', vfx: '', sound: '',
    music: '', animalsAndWranglers: '', weapons: '', greenery: '', artDept: '',
    ...partial,
  };
}

/** One production day carrying a cast member, one crew slot and a location. */
function makeTestProject(): Project {
  const p = makeBlankProject('Budget Test');
  p.calendarVersions[0].productionStart = '2026-08-10';
  p.castMembers = [{ id: '1', name: 'MARY' }];
  p.scenes = [scene({ id: 's1', cast: '1' })];
  p.crew = { director: [{ id: 'p1', name: 'JO' }] };
  p.crewTemplate = { slots: [{ id: 'slot1', role: 'director', personId: 'p1' }] };
  p.locations = [{ id: 'loc1', name: 'Stage 5', type: 'set' }];
  const rows = p.versions[0].rows;
  rows[0].daybreakMeta = {
    locationId: 'loc1',
    crewSlots: [{ id: 'slot1', role: 'director', personId: 'p1' }],
  };
  rows.push({ id: 'row1', type: 'SCENE', containerId: 1, order: 1, sceneId: 's1' });
  rows.push({ id: 'db2', type: 'DAYBREAK', containerId: 1, order: 2, daybreakCallTime: '08:00' });
  return p;
}

function accountId(p: Project, number: string): string {
  return p.budget!.accounts.find(a => a.number === number)!.id;
}

function addLine(p: Project, partial: Partial<BudgetLine> & { accountId: string }): BudgetLine {
  const version = activeBudgetVersion(p.budget)!;
  const line = makeBudgetLine({ ...partial, sort: version.lines.length });
  version.lines = [...version.lines, line];
  return line;
}

describe('budget formula', () => {
  it('respects precedence, parentheses and unary minus', () => {
    expect(evaluateFormula('2 + 3 * 4').value).toBe(14);
    expect(evaluateFormula('(2 + 3) * 4').value).toBe(20);
    expect(evaluateFormula('-3 + 10 / 2').value).toBe(2);
    expect(evaluateFormula('SHOOT_DAYS * 2', { SHOOT_DAYS: 12 }).value).toBe(24);
  });

  it('returns explicit errors instead of throwing', () => {
    expect(evaluateFormula('UNKNOWN + 1').error).toBe('#REF!');
    expect(evaluateFormula('1 / 0').error).toBe('#DIV/0!');
    expect(evaluateFormula('2 +').error).toBe('#VALUE!');
    expect(evaluateFormula('2 + 3 extra').error).toBe('#VALUE!');
  });

  it('evaluates globals topologically and flags cycles', () => {
    const { values, errors } = evaluateGlobals([
      { id: 'a', symbol: 'WEEKS', formula: 'DAYS / 5' },
      { id: 'b', symbol: 'DAYS', value: 20 },
      { id: 'c', symbol: 'LOOP_A', formula: 'LOOP_B' },
      { id: 'd', symbol: 'LOOP_B', formula: 'LOOP_A' },
    ], { SHOOT_DAYS: 10 });
    expect(values.WEEKS).toBe(4);
    expect(values.DAYS).toBe(20);
    expect(values.SHOOT_DAYS).toBe(10);
    expect(errors.LOOP_A).toBe('#CYCLE!');
    expect(errors.LOOP_B).toBe('#CYCLE!');
  });
});

describe('budget money format', () => {
  it('formats cents with grouping and optional decimals', () => {
    expect(formatMoney(123456789)).toBe('$1,234,568');
    expect(formatMoney(123456789, { decimals: 2 })).toBe('$1,234,567.89');
    expect(formatMoney(-250000)).toBe('-$2,500');
    expect(formatMoney(-250000, { negativeStyle: 'parentheses' })).toBe('($2,500)');
  });

  it('parses typed money including parentheses and grouping', () => {
    expect(parseMoney('$1,200.50')).toBe(120050);
    expect(parseMoney('(300)')).toBe(-30000);
    expect(parseMoney('-75')).toBe(-7500);
    expect(parseMoney('')).toBe(0);
  });
});

describe('budget schedule quantities', () => {
  it('counts production days, cast, crew and locations from the stripboard', () => {
    const q = computeScheduleQuantities(makeTestProject());
    expect(q.shootDays).toBe(1);
    expect(q.castDays['1']).toBe(1);
    expect(q.crewPersonDays['director\u0000p1']).toBe(1);
    expect(q.crewRoleDays.director).toBe(1);
    expect(q.locationDays.loc1).toBe(1);
  });

  it('generates live-linked lines that preview their counts', () => {
    const p = makeTestProject();
    const preview = previewBudgetFromSchedule(p);
    expect(preview.shootDays).toBe(1);
    expect(preview.castLines).toBe(1);
    expect(preview.crewLines).toBe(1);
    expect(preview.locationLines).toBe(1);
    const budget = buildBudgetFromSchedule(p);
    const lines = budget.versions[0].lines;
    expect(lines.every(l => !!l.source)).toBe(true);
    expect(lines.find(l => l.source?.kind === 'cast')?.description).toBe('1. MARY');
    expect(lines.find(l => l.source?.kind === 'shootDays')?.qty).toBe(1);
  });
});

describe('budget calculation', () => {
  it('computes line maths and rolls up account/category/grand totals', () => {
    const p = makeTestProject();
    p.budget = featureBudget();
    const account = accountId(p, '1100');
    addLine(p, { accountId: account, description: 'Screenplay', qty: 3, rateCents: 100000, multiplier: 2 });
    const model = computeBudget(p)!;
    const line = model.categories.flatMap(c => c.accounts).flatMap(a => a.lines)[0];
    expect(line.localBaseCents).toBe(600000);
    expect(line.totalCents).toBe(600000);
    expect(model.totals.baseCents).toBe(600000);
    // Feature template ships a 10% contingency markup on the whole budget.
    expect(model.totals.markupCents).toBe(60000);
    expect(model.totals.grandTotalCents).toBe(660000);
  });

  it('applies percent, cutoff, fixed and flat fringes', () => {
    const p = makeTestProject();
    p.budget = templateBudget('blank');
    const b = p.budget;
    b.categories = [{ id: 'c1', number: '1000', name: 'ATL', group: 'atl', sort: 0 }];
    b.accounts = [{ id: 'a1', categoryId: 'c1', number: '1100', name: 'Cast', sort: 0 }];
    b.fringes = [
      { id: 'f1', name: 'Payroll', calc: 'percent', percent: 10 },
      { id: 'f2', name: 'Cutoff', calc: 'percent', percent: 10, cutoffCents: 200000 },
      { id: 'f3', name: 'Per unit', calc: 'fixedPerUnit', amountCents: 500 },
      { id: 'f4', name: 'Flat', calc: 'flat', amountCents: 7500 },
    ];
    addLine(p, { accountId: 'a1', qty: 1, rateCents: 1000000, fringes: ['f1'] });
    addLine(p, { accountId: 'a1', qty: 1, rateCents: 1000000, fringes: ['f2'] });
    addLine(p, { accountId: 'a1', qty: 3, rateCents: 100000, fringes: ['f3', 'f4'] });
    const model = computeBudget(p)!;
    const lines = model.categories[0].accounts[0].lines;
    expect(lines[0].fringeCents).toBe(100000);
    expect(lines[1].fringeCents).toBe(20000);
    expect(lines[2].fringeCents).toBe(9000); // 500 × 3 + 7,500 flat
    expect(model.totals.fringeCents).toBe(129000);
  });

  it('applies a percent fringe once over a shared range', () => {
    const p = makeTestProject();
    p.budget = templateBudget('blank');
    const b = p.budget;
    b.categories = [{ id: 'c1', number: '1000', name: 'ATL', group: 'atl', sort: 0 }];
    b.accounts = [{ id: 'a1', categoryId: 'c1', number: '1100', name: 'Cast', sort: 0 }];
    b.fringes = [{ id: 'f1', name: 'Range', calc: 'percent', percent: 10 }];
    addLine(p, { accountId: 'a1', qty: 1, rateCents: 100000, fringes: ['f1'], fringeRangeId: 'r1', sort: 0 });
    addLine(p, { accountId: 'a1', qty: 1, rateCents: 200000, fringes: ['f1'], fringeRangeId: 'r1', sort: 1 });
    const model = computeBudget(p)!;
    const lines = model.categories[0].accounts[0].lines;
    expect(lines[0].fringeCents).toBe(30000);
    expect(lines[1].fringeCents).toBe(0);
    expect(model.totals.fringeCents).toBe(30000);
  });

  it('converts per-line currency and warns instead of assuming 1:1', () => {
    const p = makeTestProject();
    p.budget = templateBudget('blank');
    p.budget.categories = [{ id: 'c1', number: '1000', name: 'ATL', group: 'atl', sort: 0 }];
    p.budget.accounts = [{ id: 'a1', categoryId: 'c1', number: '1100', name: 'Cast', sort: 0 }];
    addLine(p, { accountId: 'a1', qty: 1, rateCents: 100000, currency: 'EUR', fxRate: 1.2, sort: 0 });
    addLine(p, { accountId: 'a1', qty: 1, rateCents: 100000, currency: 'GBP', sort: 1 });
    const model = computeBudget(p)!;
    const lines = model.categories[0].accounts[0].lines;
    expect(lines[0].baseCents).toBe(120000);
    expect(lines[1].baseCents).toBe(0);
    expect(lines[1].errors.some(e => e.includes('Missing FX rate'))).toBe(true);
  });

  it('follows the schedule for linked lines until pinned', () => {
    const p = makeTestProject();
    p.budget = templateBudget('blank');
    p.budget.categories = [{ id: 'c1', number: '1000', name: 'ATL', group: 'atl', sort: 0 }];
    p.budget.accounts = [{ id: 'a1', categoryId: 'c1', number: '1100', name: 'Cast', sort: 0 }];
    const line = addLine(p, {
      accountId: 'a1', qty: 99, rateCents: 1000,
      source: { kind: 'shootDays' },
    });
    let model = computeBudget(p)!;
    expect(model.categories[0].accounts[0].lines[0].qty).toBe(1);
    expect(model.linkedLineCount).toBe(1);
    // A second production day moves the quantity with no sync step.
    p.versions[0].rows.push({ id: 'row2', type: 'SCENE', containerId: 1, order: 3, sceneId: 's1' });
    p.versions[0].rows.push({ id: 'db3', type: 'DAYBREAK', containerId: 1, order: 4 });
    model = computeBudget(p)!;
    expect(model.categories[0].accounts[0].lines[0].qty).toBe(2);
    // Pinning freezes it even when the schedule changes again.
    line.qtyOverride = 2;
    p.versions[0].rows.push({ id: 'row3', type: 'SCENE', containerId: 1, order: 5, sceneId: 's1' });
    p.versions[0].rows.push({ id: 'db4', type: 'DAYBREAK', containerId: 1, order: 6 });
    model = computeBudget(p)!;
    expect(model.categories[0].accounts[0].lines[0].qty).toBe(2);
    expect(model.pinnedLineCount).toBe(1);
  });

  it('locks a version by pinning every live-linked quantity', () => {
    const p = makeTestProject();
    p.budget = templateBudget('blank');
    p.budget.categories = [{ id: 'c1', number: '1000', name: 'ATL', group: 'atl', sort: 0 }];
    p.budget.accounts = [{ id: 'a1', categoryId: 'c1', number: '1100', name: 'Cast', sort: 0 }];
    const line = addLine(p, { accountId: 'a1', qty: 99, rateCents: 1000, source: { kind: 'shootDays' } });
    const lock = lockBudgetVersion(p, p.budget.activeVersionId);
    expect(lock.pinned[line.id]).toBe(1);
  });
});

describe('budget versions', () => {
  it('clones copy-on-write (lines are shared by reference)', () => {
    const p = makeTestProject();
    p.budget = featureBudget();
    const source = activeBudgetVersion(p.budget)!;
    addLine(p, { accountId: accountId(p, '1100'), qty: 1, rateCents: 1000 });
    const { version, budgetPatch } = cloneBudgetVersion(p.budget, 'v02');
    expect(version.lines).toBe(source.lines);
    expect(budgetPatch.activeVersionId).toBe(version.id);
    expect(p.budget.accounts).toBe(p.budget.accounts); // chart stays shared
  });

  it('prunes trash by age and keeps the newest ten', () => {
    const now = Date.now();
    const items = Array.from({ length: 14 }, (_, i) => ({
      version: { id: `v${i}`, name: `v${i}`, createdAt: now, updatedAt: now, lines: [] },
      deletedAt: now - i * 1000,
    }));
    items.push({
      version: { id: 'old', name: 'old', createdAt: 0, updatedAt: 0, lines: [] },
      deletedAt: now - 31 * 24 * 60 * 60 * 1000,
    });
    const pruned = pruneBudgetVersionTrash(items, now);
    expect(pruned).toHaveLength(10);
    expect(pruned.some(i => i.version.id === 'old')).toBe(false);
    expect(pruned[0].version.id).toBe('v0');
  });

  it('feature template has unique numbers within each level', () => {
    const b = featureBudget();
    const catNumbers = b.categories.map(c => c.number);
    expect(new Set(catNumbers).size).toBe(catNumbers.length);
    for (const cat of b.categories) {
      const nums = b.accounts.filter(a => a.categoryId === cat.id).map(a => a.number);
      expect(new Set(nums).size).toBe(nums.length);
    }
    expect(b.markups[0].percent).toBe(10);
  });
});

describe('budget store actions', () => {
  function stateWithBudget() {
    const p = makeTestProject();
    p.budget = featureBudget();
    const account = accountId(p, '1100');
    const line = addLine(p, { accountId: account, qty: 2, rateCents: 1000, source: { kind: 'shootDays' } });
    return {
      p,
      lineId: line.id,
      state: { past: [], present: p, future: [], _batchDepth: 0 } as Parameters<typeof reducer>[0],
    };
  }

  it('creates, deletes and restores versions without touching the shared chart', () => {
    const { state, p } = stateWithBudget();
    const active = p.budget!.activeVersionId;
    const next = reducer(state, { type: 'NEW_BUDGET_VERSION', payload: { name: 'v02' } });
    expect(next.present.budget!.versions).toHaveLength(2);
    expect(next.present.budget!.activeVersionId).not.toBe(active);
    expect(next.present.budget!.accounts).toBe(p.budget!.accounts);
    const deleted = reducer(next, { type: 'DELETE_BUDGET_VERSION', payload: next.present.budget!.activeVersionId });
    expect(deleted.present.budget!.versions).toHaveLength(1);
    expect(deleted.present.budget!.versionTrash).toHaveLength(1);
    const trashedId = deleted.present.budget!.versionTrash![0].version.id;
    const restored = reducer(deleted, { type: 'RESTORE_BUDGET_VERSION_FROM_TRASH', payload: trashedId });
    expect(restored.present.budget!.versions).toHaveLength(2);
    expect(restored.present.budget!.versionTrash).toHaveLength(0);
  });

  it('never deletes the last version', () => {
    const { state, p } = stateWithBudget();
    const next = reducer(state, { type: 'DELETE_BUDGET_VERSION', payload: p.budget!.activeVersionId });
    expect(next.present.budget!.versions).toHaveLength(1);
    expect(next.present.budget!.versionTrash || []).toHaveLength(0);
  });

  it('locks by pinning linked quantities; unlocking keeps the pins', () => {
    const { state, lineId } = stateWithBudget();
    const id = state.present.budget!.activeVersionId;
    const locked = reducer(state, { type: 'LOCK_BUDGET_VERSION', payload: { id, pinned: { [lineId]: 1 } } });
    const v = locked.present.budget!.versions.find(x => x.id === id)!;
    expect(v.locked).toBe(true);
    expect(v.lines.find(l => l.id === lineId)!.qtyOverride).toBe(1);
    const unlocked = reducer(locked, { type: 'UNLOCK_BUDGET_VERSION', payload: id });
    expect(unlocked.present.budget!.versions.find(x => x.id === id)!.locked).toBe(false);
    expect(unlocked.present.budget!.versions.find(x => x.id === id)!.lines.find(l => l.id === lineId)!.qtyOverride).toBe(1);
  });

  it('links/unlinks and pins/unpins a line', () => {
    const { state, lineId } = stateWithBudget();
    const unlinked = reducer(state, { type: 'UNLINK_BUDGET_LINE', payload: { lineId, keepQty: 1 } });
    const line = unlinked.present.budget!.versions[0].lines.find(l => l.id === lineId)!;
    expect(line.source).toBeUndefined();
    expect(line.qty).toBe(1);
    const linked = reducer(unlinked, { type: 'LINK_BUDGET_LINE', payload: { lineId, source: { kind: 'shootDays' } } });
    expect(linked.present.budget!.versions[0].lines.find(l => l.id === lineId)!.source).toEqual({ kind: 'shootDays' });
    const pinned = reducer(linked, { type: 'PIN_BUDGET_LINE', payload: { lineId, qty: 3 } });
    expect(pinned.present.budget!.versions[0].lines.find(l => l.id === lineId)!.qtyOverride).toBe(3);
    const unpinned = reducer(pinned, { type: 'UNPIN_BUDGET_LINE', payload: lineId });
    expect(unpinned.present.budget!.versions[0].lines.find(l => l.id === lineId)!.qtyOverride).toBeUndefined();
  });

  it('reassigns or deletes lines when an account is deleted', () => {
    const { state, p } = stateWithBudget();
    const from = accountId(p, '1100');
    const to = accountId(p, '1200');
    const next = reducer(state, { type: 'DELETE_BUDGET_ACCOUNT', payload: { id: from, reassignToId: to } });
    expect(next.present.budget!.accounts.some(a => a.id === from)).toBe(false);
    expect(next.present.budget!.versions[0].lines[0].accountId).toBe(to);
    const gone = reducer(next, { type: 'DELETE_BUDGET_ACCOUNT', payload: { id: to } });
    expect(gone.present.budget!.versions[0].lines).toHaveLength(0);
  });
});
