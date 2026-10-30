import type { Expense, PurchaseOrder } from '../../types';
import type { Action, State } from '../reducer';
import type { ApplyChange } from './budget';
import { makeExpense, makePurchaseOrder, nextPurchaseOrderNumber } from '../../lib/budget/model';

/**
 * Cost-tracking store cases (roadmap 334 phase 2). Expenses and purchase
 * orders are PROJECT state — undoable, synced, shared, in `.lemon`. They are
 * never stored in day meta: the Day Manager filters by `dayDate`/`dayNumber`.
 * Every case is pure and DOM-free (the room worker folds the same reducer).
 */

function withExpenses(state: State, applyChange: ApplyChange, fn: (list: Expense[]) => Expense[]): State {
  const list = state.present.expenses || [];
  return applyChange({ ...state.present, expenses: fn(list) });
}

function withPurchaseOrders(state: State, applyChange: ApplyChange, fn: (list: PurchaseOrder[]) => PurchaseOrder[]): State {
  const list = state.present.purchaseOrders || [];
  return applyChange({ ...state.present, purchaseOrders: fn(list) });
}

export function caseAddExpense(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_EXPENSE') return state;
  const expense = makeExpense(action.payload);
  return withExpenses(state, applyChange, list => [...list, expense]);
}

export function caseUpdateExpense(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_EXPENSE') return state;
  const { id, updates } = action.payload;
  return withExpenses(state, applyChange, list => list.map(e =>
    e.id === id ? { ...e, ...updates, id, updatedAt: Date.now() } : e));
}

export function caseDeleteExpense(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_EXPENSE') return state;
  const id = action.payload;
  return withExpenses(state, applyChange, list => list.filter(e => e.id !== id));
}

/** Paste/import/overtime posting: every new expense lands as ONE undo entry. */
export function caseBulkAddExpenses(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'BULK_ADD_EXPENSES') return state;
  const incoming = (action.payload || []).map(e => makeExpense(e));
  if (incoming.length === 0) return state;
  return withExpenses(state, applyChange, list => [...list, ...incoming]);
}

export function caseAddPurchaseOrder(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_PURCHASE_ORDER') return state;
  const po = makePurchaseOrder({
    ...action.payload,
    number: action.payload.number || nextPurchaseOrderNumber((state.present.purchaseOrders || []).map(p => p.number)),
  });
  return withPurchaseOrders(state, applyChange, list => [...list, po]);
}

export function caseUpdatePurchaseOrder(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_PURCHASE_ORDER') return state;
  const { id, updates } = action.payload;
  return withPurchaseOrders(state, applyChange, list => list.map(po =>
    po.id === id ? { ...po, ...updates, id, updatedAt: Date.now() } : po));
}

export function caseDeletePurchaseOrder(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_PURCHASE_ORDER') return state;
  const id = action.payload;
  return withPurchaseOrders(state, applyChange, list => list.filter(po => po.id !== id));
}
