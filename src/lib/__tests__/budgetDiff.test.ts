import { describe, it, expect } from 'vitest';
import type { BudgetLine, Project, Scene } from '../../types';
import { makeBlankProject } from '../../store/reducer';
import { activeBudgetVersion, makeBudgetLine } from '../budget/model';
import { featureBudget, templateBudget } from '../budget/templates';
import {
  buildScheduleDiffApply, computeScheduleBudgetDiff, defaultScheduleDiffSelection,
  previewScheduleBudgetDiff,
} from '../budget/diff';

/**
 * Roadmap 348 — the review diff is the one place that decides what a schedule
 * change means for a budget version. These tests pin the states, the grouping,
 * the manual-line protections and the apply payload; the modal never re-derives
 * any of it.
 */

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

/** One production day: cast 1, crew person JO (director), location loc1. */
function makeTestProject(): Project {
  const p = makeBlankProject('Budget Diff Test');
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

function withFeature(p: Project): Project {
  p.budget = featureBudget();
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

function diffOf(p: Project) {
  const diff = computeScheduleBudgetDiff(p, p.budget!.activeVersionId);
  expect(diff).not.toBeNull();
  return diff!;
}

describe('schedule budget diff — additions', () => {
  it('offers one add per working source mapped to its chart account', () => {
    const p = withFeature(makeTestProject());
    const diff = diffOf(p);

    expect(diff.counts).toMatchObject({ add: 4, update: 0, remove: 0, keep: 0, check: 0 });
    expect(diff.changeCount).toBe(4);
    expect(diff.totalRows).toBe(4);
    const byKind = Object.fromEntries(diff.rows.map(row => [row.source?.kind, row]));
    expect(byKind.shootDays?.accountNumber).toBe('2400');
    expect(byKind.crewRole?.accountNumber).toBe('2100');
    expect(byKind.cast?.accountNumber).toBe('1400');
    expect(byKind.location?.accountNumber).toBe('3200');
    expect(byKind.cast?.label).toBe('1. MARY');
    expect(byKind.cast?.department).toBe('Cast');
    expect(byKind.location?.department).toBe('Locations');
    expect(diff.rows.every(row => row.applicable)).toBe(true);
    expect(diff.rows.every(row => row.currentQty === 0 && row.scheduleQty === 1)).toBe(true);
  });

  it('groups category → account → department → line', () => {
    const p = withFeature(makeTestProject());
    const diff = diffOf(p);
    const castCategory = diff.categories.find(cat => cat.number === '1000')!;
    const castAccount = castCategory.accounts.find(acc => acc.number === '1400')!;
    expect(castAccount.departments.map(d => d.department)).toEqual(['Cast']);
    expect(castAccount.departments[0].rows[0].label).toBe('1. MARY');
    const crewAccount = diff.categories
      .flatMap(cat => cat.accounts)
      .find(acc => acc.number === '2100')!;
    expect(crewAccount.departments[0].department).not.toBe('');
    expect(crewAccount.departments[0].rows[0].source?.kind).toBe('crewRole');
  });

  it('never offers an add for a source that already has a line, including a role-level or per-day line', () => {
    const p = withFeature(makeTestProject());
    addLine(p, {
      accountId: accountId(p, '2400'), description: 'Days', qty: 1, rateCents: 0,
      source: { kind: 'perDay' },
    });
    addLine(p, {
      accountId: accountId(p, '2100'), description: 'Directors', qty: 1, rateCents: 0,
      source: { kind: 'crewRole', roleKey: 'director' },
    });
    const diff = diffOf(p);
    expect(diff.rows.some(row => row.source?.kind === 'shootDays')).toBe(false);
    expect(diff.rows.some(row => row.source?.kind === 'crewRole')).toBe(false);
    // Cast + location remain.
    expect(diff.counts.add).toBe(2);
  });

  it('adds carry rate 0 so the grand total does not move', () => {
    const p = withFeature(makeTestProject());
    const diff = diffOf(p);
    const selection = defaultScheduleDiffSelection(diff);
    const preview = previewScheduleBudgetDiff(p, diff, selection);
    expect(preview.afterTotalCents).toBe(preview.beforeTotalCents);
    const apply = buildScheduleDiffApply(p, diff, selection)!;
    expect(apply.adds).toHaveLength(4);
    expect(apply.adds.every(line => line.rateCents === 0 && line.source)).toBe(true);
    expect(apply.updates).toHaveLength(0);
    expect(apply.deletes).toHaveLength(0);
  });
});

describe('schedule budget diff — quantity refresh', () => {
  it('flags a linked line whose stored snapshot drifted and applies the new quantity', () => {
    const p = withFeature(makeTestProject());
    const line = addLine(p, {
      accountId: accountId(p, '2400'), description: 'Production days', qty: 0,
      rateCents: 50000, source: { kind: 'shootDays' },
    });
    const diff = diffOf(p);
    const row = diff.rows.find(r => r.lineId === line.id)!;
    expect(row.state).toBe('update');
    expect(row.currentQty).toBe(0);
    expect(row.scheduleQty).toBe(1);
    expect(row.applicable).toBe(true);

    const apply = buildScheduleDiffApply(p, diff, defaultScheduleDiffSelection(diff))!;
    expect(apply.updates).toEqual([{ id: line.id, updates: { qty: 1 } }]);
    // The live link already used the schedule quantity; the review only
    // refreshes the stored snapshot.
    expect(previewScheduleBudgetDiff(p, diff, defaultScheduleDiffSelection(diff)).afterTotalCents)
      .toBe(diff.beforeTotalCents);
  });

  it('leaves an already-fresh line out of the diff', () => {
    const p = withFeature(makeTestProject());
    addLine(p, {
      accountId: accountId(p, '2400'), description: 'Production days', qty: 1,
      rateCents: 50000, source: { kind: 'shootDays' },
    });
    const diff = diffOf(p);
    expect(diff.rows.some(row => row.source?.kind === 'shootDays')).toBe(false);
  });
});

describe('schedule budget diff — removals and checks', () => {
  it('offers a removal for a source the schedule no longer counts, unchecked by default', () => {
    const p = withFeature(makeTestProject());
    p.castMembers = [...p.castMembers, { id: '2', name: 'JOHN' }];
    const line = addLine(p, {
      accountId: accountId(p, '1400'), description: '2. JOHN', qty: 5,
      rateCents: 10000, source: { kind: 'cast', castId: '2' },
    });
    const diff = diffOf(p);
    const row = diff.rows.find(r => r.lineId === line.id)!;
    expect(row.state).toBe('remove');
    expect(row.afterCents).toBe(0);
    // The live link already counts the source as 0, so the removal changes no
    // money — the review only removes the dead line.
    expect(row.beforeCents).toBe(0);
    expect(defaultScheduleDiffSelection(diff)).not.toContain(row.id);

    const apply = buildScheduleDiffApply(p, diff, defaultScheduleDiffSelection(diff))!;
    expect(apply.deletes).not.toContain(line.id);
    const preview = previewScheduleBudgetDiff(p, diff, [row.id]);
    expect(preview.afterTotalCents).toBe(preview.beforeTotalCents);
    const removeApply = buildScheduleDiffApply(p, diff, [row.id])!;
    expect(removeApply.deletes).toEqual([line.id]);
  });

  it('keeps pinned and formula-driven lines out of the writes', () => {
    const p = withFeature(makeTestProject());
    const pinned = addLine(p, {
      accountId: accountId(p, '1400'), description: '1. MARY', qty: 1, qtyOverride: 3,
      rateCents: 10000, source: { kind: 'cast', castId: '1' },
    });
    const formula = addLine(p, {
      accountId: accountId(p, '3200'), description: 'Stage 5', qty: 1,
      qtyFormula: 'SHOOT_DAYS * 2', rateCents: 1000,
      source: { kind: 'location', locationId: 'loc1' },
    });
    const diff = diffOf(p);
    const pinnedRow = diff.rows.find(r => r.lineId === pinned.id)!;
    const formulaRow = diff.rows.find(r => r.lineId === formula.id)!;
    expect(pinnedRow.state).toBe('keep');
    expect(pinnedRow.applicable).toBe(false);
    expect(pinnedRow.message).toContain('Pinned at 3');
    expect(formulaRow.state).toBe('keep');
    expect(formulaRow.message).toContain('formula');
    const apply = buildScheduleDiffApply(p, diff, [pinned.id, formula.id])!;
    expect(apply.updates.map(u => u.id)).not.toContain(pinned.id);
    expect(apply.updates.map(u => u.id)).not.toContain(formula.id);
    expect(apply.deletes).toHaveLength(0);
  });

  it('flags a stale target and a missing account mapping as check rows', () => {
    const p = withFeature(makeTestProject());
    addLine(p, {
      accountId: accountId(p, '1400'), description: 'Gone', qty: 2,
      source: { kind: 'cast', castId: 'deleted' },
    });
    addLine(p, {
      accountId: 'missing-account', description: 'Orphan', qty: 1, rateCents: 100,
    });
    const diff = diffOf(p);
    const stale = diff.rows.find(r => r.label === 'Gone')!;
    const orphan = diff.rows.find(r => r.label === 'Orphan')!;
    expect(stale.state).toBe('check');
    expect(stale.message).toContain('no longer exists');
    expect(stale.applicable).toBe(false);
    expect(orphan.state).toBe('check');
    expect(orphan.message).toContain('account chart');
  });

  it('turns an add with no mapped account into a check instead of creating it', () => {
    const p = makeTestProject();
    p.budget = templateBudget('blank');
    const diff = diffOf(p);
    expect(diff.counts.add).toBe(0);
    expect(diff.counts.check).toBe(4);
    expect(diff.changeCount).toBe(0);
    expect(diff.totalRows).toBe(4);
    expect(diff.categories.find(cat => cat.id === '__unmapped')).toBeTruthy();
    expect(diff.rows.every(row => row.message?.includes('No account'))).toBe(true);
    const apply = buildScheduleDiffApply(p, diff, diff.rows.map(row => row.id))!;
    expect(apply.adds).toHaveLength(0);
  });
});

describe('schedule budget diff — apply guardrails', () => {
  it('refuses a locked version', () => {
    const p = withFeature(makeTestProject());
    activeBudgetVersion(p.budget)!.locked = true;
    const diff = diffOf(p);
    expect(buildScheduleDiffApply(p, diff, defaultScheduleDiffSelection(diff))).toBeNull();
  });

  it('refuses a version that is not the active one (no cross-version writes)', () => {
    const p = withFeature(makeTestProject());
    const active = activeBudgetVersion(p.budget)!;
    const other = { ...active, id: 'other-version', name: 'v02' };
    p.budget!.versions = [...p.budget!.versions, other];
    const diff = computeScheduleBudgetDiff(p, other.id)!;
    expect(diff.versionId).toBe('other-version');
    expect(buildScheduleDiffApply(p, diff, defaultScheduleDiffSelection(diff))).toBeNull();
  });

  it('returns null when the budget or version is gone', () => {
    const p = makeTestProject();
    expect(computeScheduleBudgetDiff(p, 'nothing')).toBeNull();
    p.budget = featureBudget();
    expect(computeScheduleBudgetDiff(p, 'nothing')).toBeNull();
    expect(buildScheduleDiffApply(p, computeScheduleBudgetDiff(p, p.budget.activeVersionId)!, [])).toEqual({
      updates: [], adds: [], deletes: [],
    });
  });
});
