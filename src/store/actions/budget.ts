import type {
  Budget, BudgetAccount, BudgetCategory, BudgetCurrency, BudgetFringe,
  BudgetFringeRange, BudgetGlobal, BudgetGroup, BudgetLine,
  BudgetMarkup, BudgetSettings, BudgetUnit, BudgetVersion, BudgetVersionTrashItem, Project,
} from '../../types';
import type { Action, State } from '../reducer';
import { cloneBudgetVersion, nextBudgetNumber, pruneBudgetVersionTrash } from '../../lib/budget/model';
import { templateBudget } from '../../lib/budget/templates';

export type ApplyChange = (p: Project) => State;

export type BudgetLibraryKey = 'fringes' | 'groups' | 'globals' | 'units' | 'currencies' | 'markups' | 'fringeRanges';
export type BudgetLibraryPayload =
  | { key: 'fringes'; value: BudgetFringe[] }
  | { key: 'groups'; value: BudgetGroup[] }
  | { key: 'globals'; value: BudgetGlobal[] }
  | { key: 'units'; value: BudgetUnit[] }
  | { key: 'currencies'; value: BudgetCurrency[] }
  | { key: 'markups'; value: BudgetMarkup[] }
  | { key: 'fringeRanges'; value: BudgetFringeRange[] };

function stamp(budget: Budget): Budget {
  return { ...budget, updatedAt: Date.now() };
}

function withBudget(state: State, applyChange: ApplyChange, fn: (b: Budget) => Budget): State {
  const budget = state.present.budget;
  if (!budget) return state;
  return applyChange({ ...state.present, budget: stamp(fn(budget)) });
}

function activeVersion(budget: Budget): BudgetVersion | undefined {
  return budget.versions.find(v => v.id === budget.activeVersionId) || budget.versions[0];
}

function withActiveVersion(state: State, applyChange: ApplyChange, fn: (v: BudgetVersion) => BudgetVersion): State {
  return withBudget(state, applyChange, b => {
    const active = activeVersion(b);
    if (!active) return b;
    return {
      ...b,
      versions: b.versions.map(v => (v.id === active.id ? { ...fn(v), updatedAt: Date.now() } : v)),
    };
  });
}

function updateActiveLines(state: State, applyChange: ApplyChange, fn: (lines: BudgetLine[]) => BudgetLine[]): State {
  return withActiveVersion(state, applyChange, v => ({ ...v, lines: fn(v.lines || []) }));
}

// ---- chart of accounts -------------------------------------------------------

export function caseAddBudgetCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_BUDGET_CATEGORY') return state;
  return withBudget(state, applyChange, b => {
    const category: BudgetCategory = {
      ...action.payload,
      number: action.payload.number || nextBudgetNumber(b.categories.map(c => c.number)),
      sort: action.payload.sort ?? b.categories.length,
    };
    return { ...b, categories: [...b.categories, category] };
  });
}

export function caseUpdateBudgetCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_BUDGET_CATEGORY') return state;
  const { id, updates } = action.payload;
  return withBudget(state, applyChange, b => ({
    ...b,
    categories: b.categories.map(c => (c.id === id ? { ...c, ...updates, id } : c)),
  }));
}

export function caseDeleteBudgetCategory(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_BUDGET_CATEGORY') return state;
  const id = action.payload;
  return withBudget(state, applyChange, b => {
    const accountIds = new Set(b.accounts.filter(a => a.categoryId === id).map(a => a.id));
    return {
      ...b,
      categories: b.categories.filter(c => c.id !== id),
      accounts: b.accounts.filter(a => a.categoryId !== id),
      versions: b.versions.map(v => ({
        ...v,
        lines: v.lines.filter(l => !accountIds.has(l.accountId)),
      })),
    };
  });
}

export function caseAddBudgetAccount(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_BUDGET_ACCOUNT') return state;
  return withBudget(state, applyChange, b => {
    const siblings = b.accounts.filter(a => a.categoryId === action.payload.categoryId);
    const account: BudgetAccount = {
      ...action.payload,
      number: action.payload.number || nextBudgetNumber(siblings.map(a => a.number)),
      sort: action.payload.sort ?? siblings.length,
    };
    return { ...b, accounts: [...b.accounts, account] };
  });
}

export function caseUpdateBudgetAccount(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_BUDGET_ACCOUNT') return state;
  const { id, updates } = action.payload;
  return withBudget(state, applyChange, b => ({
    ...b,
    accounts: b.accounts.map(a => (a.id === id ? { ...a, ...updates, id } : a)),
  }));
}

/** Deleting an account either reassigns its lines to another account or
 *  deletes them explicitly — lines are never left orphaned. */
export function caseDeleteBudgetAccount(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_BUDGET_ACCOUNT') return state;
  const { id, reassignToId } = action.payload;
  return withBudget(state, applyChange, b => {
    const target = reassignToId && reassignToId !== id && b.accounts.some(a => a.id === reassignToId)
      ? reassignToId
      : null;
    return {
      ...b,
      accounts: b.accounts.filter(a => a.id !== id),
      versions: b.versions.map(v => ({
        ...v,
        lines: target
          ? v.lines.map(l => (l.accountId === id ? { ...l, accountId: target } : l))
          : v.lines.filter(l => l.accountId !== id),
      })),
    };
  });
}

// ---- lines -------------------------------------------------------------------

export function caseAddBudgetLine(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_BUDGET_LINE') return state;
  return updateActiveLines(state, applyChange, lines => {
    const line: BudgetLine = {
      ...action.payload,
      sort: action.payload.sort ?? lines.filter(l => l.accountId === action.payload.accountId).length,
    };
    return [...lines, line];
  });
}

export function caseUpdateBudgetLine(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_BUDGET_LINE') return state;
  const { id, updates } = action.payload;
  return updateActiveLines(state, applyChange, lines =>
    lines.map(l => (l.id === id ? { ...l, ...updates, id } : l)));
}

export function caseDeleteBudgetLine(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_BUDGET_LINE') return state;
  return updateActiveLines(state, applyChange, lines => lines.filter(l => l.id !== action.payload));
}

/** Paste/fill/apply-fringe: every line edit lands as ONE undo entry. */
export function caseBulkUpdateBudgetLines(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'BULK_UPDATE_BUDGET_LINES') return state;
  const byId = new Map(action.payload.updates.map(u => [u.id, u.updates]));
  if (byId.size === 0) return state;
  return updateActiveLines(state, applyChange, lines =>
    lines.map(l => (byId.has(l.id) ? { ...l, ...byId.get(l.id)!, id: l.id } : l)));
}

export function caseLinkBudgetLine(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'LINK_BUDGET_LINE') return state;
  const { lineId, source } = action.payload;
  return updateActiveLines(state, applyChange, lines => lines.map(l =>
    l.id === lineId ? { ...l, source, qtyOverride: undefined, rateOverride: l.rateOverride } : l));
}

export function caseUnlinkBudgetLine(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UNLINK_BUDGET_LINE') return state;
  const { lineId, keepQty } = action.payload;
  return updateActiveLines(state, applyChange, lines => lines.map(l => {
    if (l.id !== lineId) return l;
    const qty = keepQty ?? l.qtyOverride ?? l.qty;
    return { ...l, source: undefined, qtyOverride: undefined, qty };
  }));
}

export function casePinBudgetLine(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'PIN_BUDGET_LINE') return state;
  const { lineId, qty } = action.payload;
  return updateActiveLines(state, applyChange, lines => lines.map(l =>
    l.id === lineId ? { ...l, qtyOverride: qty ?? l.qtyOverride ?? l.qty } : l));
}

export function caseUnpinBudgetLine(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UNPIN_BUDGET_LINE') return state;
  const lineId = action.payload;
  return updateActiveLines(state, applyChange, lines => lines.map(l =>
    l.id === lineId ? { ...l, qtyOverride: undefined } : l));
}

// ---- library & settings ------------------------------------------------------

export function caseSetBudgetLibrary(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_BUDGET_LIBRARY') return state;
  const payload = action.payload;
  return withBudget(state, applyChange, b => {
    switch (payload.key) {
      case 'fringes': return { ...b, fringes: payload.value };
      case 'groups': return { ...b, groups: payload.value };
      case 'globals': return { ...b, globals: payload.value };
      case 'units': return { ...b, units: payload.value };
      case 'currencies': return { ...b, currencies: payload.value };
      case 'markups': return { ...b, markups: payload.value };
      case 'fringeRanges': return { ...b, fringeRanges: payload.value };
      default: return b;
    }
  });
}

export function caseUpdateBudgetSettings(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_BUDGET_SETTINGS') return state;
  const updates: Partial<BudgetSettings> = action.payload;
  return withBudget(state, applyChange, b => ({ ...b, settings: { ...b.settings, ...updates } }));
}

export function caseApplyBudgetTemplate(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'APPLY_BUDGET_TEMPLATE') return state;
  const template = templateBudget(action.payload.key);
  return applyChange({ ...state.present, budget: template });
}

export function caseImportBudget(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'IMPORT_BUDGET') return state;
  const budget = action.payload.budget;
  if (!budget || !Array.isArray(budget.versions) || budget.versions.length === 0) return state;
  return applyChange({ ...state.present, budget });
}

// ---- versions ----------------------------------------------------------------

export function caseNewBudgetVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'NEW_BUDGET_VERSION') return state;
  const { name, cloneFromId, id } = action.payload;
  return withBudget(state, applyChange, b => {
    const { budgetPatch } = cloneBudgetVersion(b, name, cloneFromId ?? b.activeVersionId, id);
    return { ...b, ...budgetPatch };
  });
}

export function caseRenameBudgetVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RENAME_BUDGET_VERSION') return state;
  const { id, name } = action.payload;
  const trimmed = name.trim() || 'Budget';
  return withBudget(state, applyChange, b => ({
    ...b,
    versions: b.versions.map(v => (v.id === id ? { ...v, name: trimmed, updatedAt: Date.now() } : v)),
  }));
}

export function caseDeleteBudgetVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_BUDGET_VERSION') return state;
  const id = action.payload;
  return withBudget(state, applyChange, b => {
    if (b.versions.length <= 1) return b;
    const version = b.versions.find(v => v.id === id);
    if (!version) return b;
    const trashItem: BudgetVersionTrashItem = { version, deletedAt: Date.now() };
    const versions = b.versions.filter(v => v.id !== id);
    return {
      ...b,
      versions,
      activeVersionId: b.activeVersionId === id ? versions[0].id : b.activeVersionId,
      versionTrash: pruneBudgetVersionTrash([...(b.versionTrash || []), trashItem]),
    };
  });
}

export function caseRestoreBudgetVersionFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_BUDGET_VERSION_FROM_TRASH') return state;
  const id = action.payload;
  return withBudget(state, applyChange, b => {
    const item = (b.versionTrash || []).find(t => t.version.id === id);
    if (!item) return b;
    const exists = b.versions.some(v => v.id === id);
    return {
      ...b,
      versions: exists ? b.versions : [...b.versions, item.version],
      activeVersionId: exists ? b.activeVersionId : item.version.id,
      versionTrash: (b.versionTrash || []).filter(t => t.version.id !== id),
    };
  });
}

export function caseSetActiveBudgetVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_ACTIVE_BUDGET_VERSION') return state;
  const id = action.payload;
  return withBudget(state, applyChange, b => (
    b.versions.some(v => v.id === id) ? { ...b, activeVersionId: id } : b
  ));
}

/** Lock pins every live-linked quantity the UI computed from the schedule; the
 *  reducer never derives schedule data itself. */
export function caseLockBudgetVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'LOCK_BUDGET_VERSION') return state;
  const { id, pinned } = action.payload;
  return withBudget(state, applyChange, b => ({
    ...b,
    versions: b.versions.map(v => {
      if (v.id !== id) return v;
      const lines = pinned
        ? v.lines.map(l => (
          l.source && l.qtyOverride == null && pinned[l.id] != null
            ? { ...l, qtyOverride: pinned[l.id] }
            : l
        ))
        : v.lines;
      return { ...v, lines, locked: true, lockedAt: Date.now(), updatedAt: Date.now() };
    }),
  }));
}

/** Unlocking re-enables editing but never silently unpins quantities. */
export function caseUnlockBudgetVersion(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UNLOCK_BUDGET_VERSION') return state;
  const id = action.payload;
  return withBudget(state, applyChange, b => ({
    ...b,
    versions: b.versions.map(v => (v.id === id ? { ...v, locked: false, lockedAt: undefined, updatedAt: Date.now() } : v)),
  }));
}
