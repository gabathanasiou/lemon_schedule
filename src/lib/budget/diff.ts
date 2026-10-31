import type { BudgetLine, BudgetLineSource, MoneyCents, Project } from '../../types';
import { computeBudget, type BudgetModel } from './calc';
import { makeBudgetLine } from './model';
import { departmentOfRole, departmentOrder } from '../dayCrew';
import {
  computeScheduleQuantities, scheduleQtyFor, scheduleSourceDescription, scheduleSourceIssue,
  scheduleSourceKey, SCHEDULE_SOURCE_ACCOUNT, SCHEDULE_SOURCE_UNIT, type ScheduleQuantities,
} from './scheduleSync';

/**
 * Schedule review sync (roadmap 348) — the ONE read model for "what changed in
 * the schedule since this budget version was written". Pure and memoizable.
 *
 * The links stay LIVE (`docs/BUDGETING.md` §1): this diff never gates the
 * quantities the sheet shows. It surfaces the drift between a version's stored
 * line snapshots and the schedule, adds sources the version has no line for,
 * and flags stale links, so the producer can review and apply the changes in
 * one explicit batch. Rates, fringes, globals, the chart and manual lines are
 * outside its scope by construction.
 */

export type ScheduleDiffState = 'add' | 'update' | 'remove' | 'keep' | 'check';

export interface ScheduleDiffRow {
  /** `line:<id>` for existing lines, `add:<sourceKey>` for generated ones. */
  id: string;
  state: ScheduleDiffState;
  label: string;
  categoryId: string;
  categoryNumber: string;
  categoryName: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  department: string;
  /** The stored/effective quantity before the review (0 for an add). */
  currentQty: number;
  /** What the schedule says today. */
  scheduleQty: number;
  beforeCents: MoneyCents;
  afterCents: MoneyCents;
  /** Applies through the review batch (false for kept/check rows). */
  applicable: boolean;
  lineId?: string;
  source?: BudgetLineSource;
  message?: string;
}

export interface ScheduleDiffDepartment {
  department: string;
  rows: ScheduleDiffRow[];
}

export interface ScheduleDiffAccount {
  id: string;
  number: string;
  name: string;
  rows: ScheduleDiffRow[];
  departments: ScheduleDiffDepartment[];
}

export interface ScheduleDiffCategory {
  id: string;
  number: string;
  name: string;
  rows: ScheduleDiffRow[];
  accounts: ScheduleDiffAccount[];
}

export interface ScheduleBudgetDiff {
  versionId: string;
  versionName: string;
  rows: ScheduleDiffRow[];
  categories: ScheduleDiffCategory[];
  counts: Record<ScheduleDiffState, number>;
  /** add + update + remove — the writes a review can apply. */
  changeCount: number;
  /** add + update + remove + check — every row worth opening the review for. */
  totalRows: number;
  beforeTotalCents: MoneyCents;
  /** Default selection (adds + updates; removals stay off until chosen). */
  afterTotalCents: MoneyCents;
}

export interface ScheduleDiffOptions {
  /** Reuse the surface's computed budget when it is the same version. */
  model?: BudgetModel;
  quantities?: ScheduleQuantities;
}

export interface ScheduleDiffApply {
  updates: { id: string; updates: Partial<BudgetLine> }[];
  adds: BudgetLine[];
  deletes: string[];
}

const UNMAPPED = '__unmapped';

function sourceDepartment(project: Project, source: BudgetLineSource): string {
  switch (source.kind) {
    case 'crewRole': return departmentOfRole(project, source.roleKey);
    case 'cast': return 'Cast';
    case 'location': return 'Locations';
    case 'element': return source.category;
    case 'shootDays':
    case 'perDay': return 'Production';
    default: return 'Other';
  }
}

function groupDepartments(project: Project, rows: ScheduleDiffRow[]): ScheduleDiffDepartment[] {
  const map = new Map<string, ScheduleDiffRow[]>();
  for (const row of rows) {
    const department = row.department || 'Other';
    if (!map.has(department)) map.set(department, []);
    map.get(department)!.push(row);
  }
  const order = departmentOrder(project, [...map.keys()]);
  return [...map.keys()]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map(department => ({ department, rows: map.get(department)! }));
}

function accountGroup(project: Project, account: { id: string; number: string; name: string }, rows: ScheduleDiffRow[]): ScheduleDiffAccount {
  return {
    id: account.id,
    number: account.number,
    name: account.name,
    rows,
    departments: groupDepartments(project, rows),
  };
}

function rowAccountKey(row: ScheduleDiffRow): string {
  return row.accountId ? `acc:${row.accountId}` : `missing:${row.accountNumber}`;
}

function rowAccountHeader(row: ScheduleDiffRow): { id: string; number: string; name: string } {
  return {
    id: row.accountId,
    number: row.accountNumber,
    name: row.accountName || (row.accountNumber ? `Missing account ${row.accountNumber}` : 'Missing account'),
  };
}

function addRow(project: Project, source: BudgetLineSource, accountId: string, accountNumber: string, accountName: string, category: { id: string; number: string; name: string } | null, quantities: ScheduleQuantities): ScheduleDiffRow {
  const key = scheduleSourceKey(source);
  const scheduleQty = scheduleQtyFor(source, quantities);
  if (!category) {
    return {
      id: `add:${key}`,
      state: 'check',
      label: scheduleSourceDescription(project, source),
      categoryId: UNMAPPED,
      categoryNumber: '',
      categoryName: 'Unmapped',
      accountId,
      accountNumber,
      accountName: accountNumber ? `Missing account ${accountNumber}` : 'Missing account',
      department: sourceDepartment(project, source),
      currentQty: 0,
      scheduleQty,
      beforeCents: 0,
      afterCents: 0,
      applicable: false,
      source,
      message: accountNumber
        ? `No account ${accountNumber} in the chart — add it before syncing this source`
        : 'No account is mapped for this source',
    };
  }
  return {
    id: `add:${key}`,
    state: 'add',
    label: scheduleSourceDescription(project, source),
    categoryId: category.id,
    categoryNumber: category.number,
    categoryName: category.name,
    accountId,
    accountNumber,
    accountName,
    department: sourceDepartment(project, source),
    currentQty: 0,
    scheduleQty,
    beforeCents: 0,
    afterCents: 0,
    applicable: true,
    source,
  };
}

/** Preview one explicit selection. Returns the grand total after the selected
 *  adds/updates/removes are applied, recomputed by the ONE budget engine. */
function totalAfterSelection(
  project: Project,
  versionId: string,
  rows: ScheduleDiffRow[],
  selected: ReadonlySet<string>,
): MoneyCents | null {
  const budget = project.budget;
  const version = budget?.versions.find(v => v.id === versionId);
  if (!budget || !version) return null;

  const updates = new Map<string, number>();
  const deletes = new Set<string>();
  const adds: ScheduleDiffRow[] = [];
  for (const row of rows) {
    if (!row.applicable || !selected.has(row.id)) continue;
    if (row.state === 'update' && row.lineId) updates.set(row.lineId, row.scheduleQty);
    else if (row.state === 'remove' && row.lineId) deletes.add(row.lineId);
    else if (row.state === 'add' && row.source && row.accountId) adds.push(row);
  }
  if (updates.size === 0 && deletes.size === 0 && adds.length === 0) {
    return computeBudget(project, { versionId })?.totals.grandTotalCents ?? null;
  }

  const lines: BudgetLine[] = [];
  for (const line of version.lines) {
    if (deletes.has(line.id)) continue;
    const qty = updates.get(line.id);
    lines.push(qty == null ? line : { ...line, qty });
  }
  adds.forEach((row, i) => {
    lines.push(makeBudgetLine({
      id: `diff-preview-${i}`,
      accountId: row.accountId,
      description: row.label,
      kind: row.source && (row.source.kind === 'crewRole' || row.source.kind === 'cast') ? 'labor' : 'rental',
      qty: row.scheduleQty,
      unit: SCHEDULE_SOURCE_UNIT,
      rateCents: 0,
      multiplier: 1,
      source: row.source,
    }));
  });

  const patched: Project = {
    ...project,
    budget: {
      ...budget,
      versions: budget.versions.map(v => (v.id === versionId ? { ...v, lines } : v)),
    },
  };
  const quantities = computeScheduleQuantities(project);
  return computeBudget(patched, { versionId, quantities })?.totals.grandTotalCents ?? null;
}

/** Rows selected by default when the review opens: the additions and quantity
 *  refreshes. Removals are destructive and always start unchecked. */
export function defaultScheduleDiffSelection(diff: ScheduleBudgetDiff): string[] {
  return diff.rows
    .filter(row => row.applicable && (row.state === 'add' || row.state === 'update'))
    .map(row => row.id);
}

/** Live before/after summary for an explicit selection (the modal re-runs this
 *  when a checkbox changes). */
export function previewScheduleBudgetDiff(
  project: Project,
  diff: ScheduleBudgetDiff,
  selectedIds: readonly string[],
): { beforeTotalCents: MoneyCents; afterTotalCents: MoneyCents; deltaCents: MoneyCents } {
  const after = totalAfterSelection(project, diff.versionId, diff.rows, new Set(selectedIds)) ?? diff.afterTotalCents;
  return {
    beforeTotalCents: diff.beforeTotalCents,
    afterTotalCents: after,
    deltaCents: after - diff.beforeTotalCents,
  };
}

export function computeScheduleBudgetDiff(
  project: Project,
  versionId: string,
  options: ScheduleDiffOptions = {},
): ScheduleBudgetDiff | null {
  const budget = project.budget;
  const version = budget?.versions.find(v => v.id === versionId);
  if (!budget || !version) return null;

  const quantities = options.quantities ?? options.model?.quantities ?? computeScheduleQuantities(project);
  const model = options.model && options.model.version.id === versionId
    ? options.model
    : computeBudget(project, { versionId, quantities });
  if (!model) return null;

  const existingKeys = new Set<string>();
  // Every line in the version, including ones the engine dropped — a source
  // already present must never be added a second time under another account.
  for (const line of version.lines) {
    if (!line.source) continue;
    existingKeys.add(scheduleSourceKey(line.source));
    // `perDay` and `shootDays` are the same schedule fact.
    if (line.source.kind === 'perDay') existingKeys.add('shootDays');
  }
  const computedRows: ScheduleDiffRow[] = [];
  const computedIds = new Set<string>();

  for (const cat of model.categories) {
    for (const acc of cat.accounts) {
      for (const computed of acc.lines) {
        const line = computed.line;
        computedIds.add(line.id);
        if (!line.source) continue;

        const scheduleQty = scheduleQtyFor(line.source, quantities);
        const issue = scheduleSourceIssue(project, line.source);
        const base = {
          categoryId: cat.category.id,
          categoryNumber: cat.category.number,
          categoryName: cat.category.name,
          accountId: acc.account.id,
          accountNumber: acc.account.number,
          accountName: acc.account.name,
          department: sourceDepartment(project, line.source),
          label: line.description,
          lineId: line.id,
          source: line.source,
          beforeCents: computed.totalCents,
          afterCents: computed.totalCents,
          scheduleQty,
        } as const;

        if (issue) {
          computedRows.push({
            ...base,
            id: `line:${line.id}`,
            state: 'check',
            currentQty: line.qty,
            applicable: false,
            message: issue,
          });
          continue;
        }
        if (line.qtyFormula) {
          if (scheduleQty === computed.qty) continue;
          computedRows.push({
            ...base,
            id: `line:${line.id}`,
            state: 'keep',
            currentQty: computed.qty,
            applicable: false,
            message: 'A quantity formula controls this line',
          });
          continue;
        }
        if (line.qtyOverride != null) {
          if (scheduleQty === line.qtyOverride) continue;
          computedRows.push({
            ...base,
            id: `line:${line.id}`,
            state: 'keep',
            currentQty: line.qtyOverride,
            applicable: false,
            message: `Pinned at ${line.qtyOverride} — the schedule now counts ${scheduleQty}`,
          });
          continue;
        }
        if (scheduleQty === 0) {
          if (line.qty === 0 && computed.qty === 0) continue;
          computedRows.push({
            ...base,
            id: `line:${line.id}`,
            state: 'remove',
            currentQty: line.qty,
            applicable: true,
            afterCents: 0,
            message: 'The schedule no longer counts this source',
          });
          continue;
        }
        if (line.qty !== scheduleQty) {
          computedRows.push({
            ...base,
            id: `line:${line.id}`,
            state: 'update',
            currentQty: line.qty,
            applicable: true,
          });
        }
      }
    }
  }

  // Lines the engine dropped entirely (missing account/category) still deserve
  // a check row rather than silently disappearing from the review.
  const orphanRows: ScheduleDiffRow[] = [];
  for (const line of version.lines) {
    if (computedIds.has(line.id)) continue;
    orphanRows.push({
      id: `line:${line.id}`,
      state: 'check',
      label: line.description,
      categoryId: UNMAPPED,
      categoryNumber: '',
      categoryName: 'Unmapped',
      accountId: line.accountId,
      accountNumber: '',
      accountName: 'Missing account',
      department: 'Other',
      currentQty: line.qty,
      scheduleQty: line.source ? scheduleQtyFor(line.source, quantities) : 0,
      beforeCents: 0,
      afterCents: 0,
      applicable: false,
      lineId: line.id,
      message: 'This line is outside the account chart',
    });
  }

  // Sources that work on the schedule but have no line in this version yet.
  const candidates: { source: BudgetLineSource; department: string }[] = [];
  const addCandidate = (source: BudgetLineSource, department: string) => {
    const key = scheduleSourceKey(source);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    candidates.push({ source, department });
  };
  if (quantities.shootDays > 0) addCandidate({ kind: 'shootDays' }, 'Production');
  for (const role of project.crewRoles || []) {
    // A role-level line budgets the whole department; per-person adds would
    // double-count it.
    if (existingKeys.has(`role:${role.key}`)) continue;
    for (const person of project.crew?.[role.key] || []) {
      const days = quantities.crewPersonDays[`${role.key}\u0000${person.id}`] || 0;
      if (days <= 0) continue;
      addCandidate(
        { kind: 'crewRole', roleKey: role.key, personId: person.id },
        departmentOfRole(project, role.key),
      );
    }
  }
  for (const member of project.castMembers || []) {
    if ((quantities.castDays[member.id] || 0) <= 0) continue;
    addCandidate({ kind: 'cast', castId: member.id }, 'Cast');
  }
  for (const location of project.locations || []) {
    if ((quantities.locationDays[location.id] || 0) <= 0) continue;
    addCandidate({ kind: 'location', locationId: location.id }, 'Locations');
  }

  const accountByNumber = new Map(budget.accounts.map(a => [a.number, a]));
  const categoryById = new Map(budget.categories.map(c => [c.id, c]));
  const addsByAccount = new Map<string, ScheduleDiffRow[]>();
  const unmappedAdds: ScheduleDiffRow[] = [];
  for (const candidate of candidates) {
    const number = SCHEDULE_SOURCE_ACCOUNT[candidate.source.kind];
    const account = accountByNumber.get(number);
    const category = account ? categoryById.get(account.categoryId) : undefined;
    if (!account || !category) {
      unmappedAdds.push(addRow(project, candidate.source, '', number, '', null, quantities));
      continue;
    }
    const row = addRow(project, candidate.source, account.id, account.number, account.name,
      { id: category.id, number: category.number, name: category.name }, quantities);
    if (!addsByAccount.has(account.id)) addsByAccount.set(account.id, []);
    addsByAccount.get(account.id)!.push(row);
  }

  const existingByAccount = new Map<string, ScheduleDiffRow[]>();
  for (const row of computedRows) {
    if (!existingByAccount.has(row.accountId)) existingByAccount.set(row.accountId, []);
    existingByAccount.get(row.accountId)!.push(row);
  }

  const categories: ScheduleDiffCategory[] = [];
  for (const cat of model.categories) {
    const accounts: ScheduleDiffAccount[] = [];
    for (const acc of cat.accounts) {
      const accRows = [
        ...(existingByAccount.get(acc.account.id) || []),
        ...(addsByAccount.get(acc.account.id) || []),
      ];
      if (accRows.length === 0) continue;
      accounts.push(accountGroup(project, { id: acc.account.id, number: acc.account.number, name: acc.account.name }, accRows));
    }
    if (accounts.length === 0) continue;
    categories.push({
      id: cat.category.id,
      number: cat.category.number,
      name: cat.category.name,
      rows: accounts.flatMap(a => a.rows),
      accounts,
    });
  }

  const unmappedRows = [...orphanRows, ...unmappedAdds];
  if (unmappedRows.length > 0) {
    const groups = new Map<string, ScheduleDiffRow[]>();
    for (const row of unmappedRows) {
      const key = rowAccountKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    const accounts = [...groups.values()].map(rows => accountGroup(project, rowAccountHeader(rows[0]), rows));
    categories.push({
      id: UNMAPPED,
      number: '',
      name: 'Unmapped',
      rows: unmappedRows,
      accounts,
    });
  }

  const rows = categories.flatMap(cat => cat.rows);
  const counts: Record<ScheduleDiffState, number> = { add: 0, update: 0, remove: 0, keep: 0, check: 0 };
  for (const row of rows) counts[row.state]++;

  const defaultSelection = new Set(
    rows.filter(row => row.applicable && (row.state === 'add' || row.state === 'update')).map(row => row.id),
  );
  const beforeTotalCents = model.totals.grandTotalCents;
  const afterTotalCents = totalAfterSelection(project, versionId, rows, defaultSelection) ?? beforeTotalCents;

  return {
    versionId,
    versionName: version.name,
    rows,
    categories,
    counts,
    changeCount: counts.add + counts.update + counts.remove,
    totalRows: counts.add + counts.update + counts.remove + counts.check,
    beforeTotalCents,
    afterTotalCents,
  };
}

/**
 * Turn an explicit selection into the writes the review may perform. Refuses a
 * locked version and any non-active version (the store's line actions only
 * target the active version — no cross-version writes). Pure; the caller wraps
 * the returned writes in ONE `BATCH_START`/`BATCH_COMMIT`.
 */
export function buildScheduleDiffApply(
  project: Project,
  diff: ScheduleBudgetDiff,
  selectedIds: readonly string[],
): ScheduleDiffApply | null {
  const budget = project.budget;
  const version = budget?.versions.find(v => v.id === diff.versionId);
  if (!budget || !version) return null;
  if (budget.activeVersionId !== diff.versionId || version.locked) return null;

  const selected = new Set(selectedIds);
  const updates: ScheduleDiffApply['updates'] = [];
  const deletes: string[] = [];
  const adds: BudgetLine[] = [];

  const maxSort = new Map<string, number>();
  for (const line of version.lines) {
    maxSort.set(line.accountId, Math.max(maxSort.get(line.accountId) ?? 0, line.sort));
  }

  for (const row of diff.rows) {
    if (!row.applicable || !selected.has(row.id)) continue;
    if (row.state === 'update' && row.lineId) {
      updates.push({ id: row.lineId, updates: { qty: row.scheduleQty } });
    } else if (row.state === 'remove' && row.lineId) {
      deletes.push(row.lineId);
    } else if (row.state === 'add' && row.source && row.accountId) {
      const sort = (maxSort.get(row.accountId) ?? 0) + 1;
      maxSort.set(row.accountId, sort);
      adds.push(makeBudgetLine({
        accountId: row.accountId,
        description: row.label,
        kind: row.source.kind === 'crewRole' || row.source.kind === 'cast' ? 'labor' : 'rental',
        qty: row.scheduleQty,
        unit: SCHEDULE_SOURCE_UNIT,
        rateCents: 0,
        multiplier: 1,
        source: row.source,
        sort,
      }));
    }
  }

  return { updates, adds, deletes };
}
