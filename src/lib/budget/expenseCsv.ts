import type { Expense, ExpenseMethod, ExpenseStatus, Project } from '../../types';
import { makeExpense, EXPENSE_METHODS, EXPENSE_STATUSES } from './model';
import { parseMoney } from './format';
import { downloadFile } from './export';

/**
 * Expense CSV import/export (roadmap 334 phase 2). This is a flat ledger
 * exchange, not the scene-breakdown import pipeline (`src/lib/import/`): the
 * columns are human-editable and unmatched accounts/POs stay blank (they are
 * never auto-created from a CSV).
 */

export const EXPENSE_CSV_HEADER = [
  'Date', 'Description', 'Account', 'Vendor', 'Method', 'Status', 'Amount', 'Currency', 'PO', 'Day', 'Notes', 'Receipt URL',
];

function csvCell(value: string | number | undefined): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function moneyText(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function accountLabelForCsv(project: Project, expense: Expense): string {
  if (expense.lineId) {
    const line = project.budget?.versions.flatMap(v => v.lines).find(l => l.id === expense.lineId);
    const account = line ? project.budget?.accounts.find(a => a.id === line.accountId) : undefined;
    if (account) return `${account.number} ${account.name}`.trim();
  }
  const account = project.budget?.accounts.find(a => a.id === expense.accountId);
  return account ? `${account.number} ${account.name}`.trim() : '';
}

export function exportExpensesCsv(project: Project): string {
  const rows = [EXPENSE_CSV_HEADER.join(',')];
  for (const expense of project.expenses || []) {
    const po = expense.poId ? (project.purchaseOrders || []).find(p => p.id === expense.poId) : undefined;
    rows.push([
      expense.date,
      expense.description,
      accountLabelForCsv(project, expense),
      expense.vendor || '',
      expense.method,
      expense.status,
      moneyText(expense.amountCents || 0),
      expense.currency || '',
      po?.number || '',
      expense.dayNumber != null ? expense.dayNumber : (expense.dayDate || ''),
      expense.notes || '',
      expense.receiptUrl || '',
    ].map(csvCell).join(','));
  }
  return rows.join('\n');
}

export function expensesFilename(project: Project, ext = 'csv'): string {
  const base = (project.title || 'Expenses').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  return `${base}-expenses.${ext}`;
}

export function downloadExpensesCsv(project: Project): void {
  downloadFile(exportExpensesCsv(project), expensesFilename(project), 'text/csv');
}

/** RFC-4180-ish line splitter: quoted cells, escaped quotes, CRLF. */
function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const HEADER_ALIASES: Record<string, string> = {
  date: 'date', 'expense date': 'date',
  description: 'description', detail: 'description', 'item': 'description',
  account: 'account', 'account #': 'account', 'account number': 'account',
  vendor: 'vendor', supplier: 'vendor', payee: 'vendor',
  method: 'method', 'payment method': 'method', 'paid by': 'method',
  status: 'status',
  amount: 'amount', total: 'amount', cost: 'amount',
  currency: 'currency', cur: 'currency',
  po: 'po', 'po #': 'po', 'purchase order': 'po',
  day: 'day', 'day #': 'day', 'day number': 'day',
  notes: 'notes', note: 'notes', memo: 'notes',
  receipt: 'receiptUrl', 'receipt url': 'receiptUrl', 'receipt link': 'receiptUrl',
};

function headerKey(raw: string): string | undefined {
  return HEADER_ALIASES[raw.trim().toLowerCase().replace(/\s+/g, ' ')];
}

function normalizeMethod(raw: string): ExpenseMethod | undefined {
  const value = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!value) return undefined;
  if (value === 'pettycash') return 'pettyCash';
  if (value === 'check') return 'cheque';
  return EXPENSE_METHODS.find(m => m.toLowerCase() === value);
}

function normalizeStatus(raw: string): ExpenseStatus | undefined {
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  return EXPENSE_STATUSES.find(s => s === value);
}

export interface ExpenseCsvImportResult {
  expenses: Expense[];
  /** Rows that carried no description/amount — skipped, never silently zeroed. */
  skipped: number;
}

/**
 * Parse an expense CSV exported from (or compatible with) this app. Header
 * names are case-insensitive aliases; missing columns are blank. Account and
 * PO columns match by number or name/number-prefixed label; unmatched values
 * stay Unallocated (no auto-created chart entries).
 */
export function parseExpensesCsv(text: string, project: Project): ExpenseCsvImportResult {
  const lines = parseCsvLines(text);
  if (lines.length < 2) return { expenses: [], skipped: 0 };
  const keys = lines[0].map(headerKey);
  const accounts = project.budget?.accounts || [];
  const purchaseOrders = project.purchaseOrders || [];
  const expenses: Expense[] = [];
  let skipped = 0;

  for (const row of lines.slice(1)) {
    const cell = (key: string): string => {
      const index = keys.indexOf(key);
      return index >= 0 ? (row[index] || '').trim() : '';
    };
    const description = cell('description');
    const amountText = cell('amount');
    if (!description && !amountText) { skipped++; continue; }
    if (!description) { skipped++; continue; }

    const accountText = cell('account');
    const account = accountText
      ? accounts.find(a => `${a.number} ${a.name}`.trim().toLowerCase() === accountText.toLowerCase()
        || a.number.toLowerCase() === accountText.toLowerCase()
        || a.name.toLowerCase() === accountText.toLowerCase())
      : undefined;
    const poText = cell('po').toLowerCase();
    const po = poText ? purchaseOrders.find(p => p.number.toLowerCase() === poText) : undefined;
    const dayText = cell('day');
    const dayNumber = /^\d+$/.test(dayText) ? Number(dayText) : undefined;
    const dayDate = /^\d{4}-\d{2}-\d{2}$/.test(dayText) ? dayText : undefined;
    const receiptUrl = cell('receiptUrl');

    expenses.push(makeExpense({
      date: /^\d{4}-\d{2}-\d{2}$/.test(cell('date')) ? cell('date') : undefined,
      description,
      accountId: account?.id,
      vendor: cell('vendor') || undefined,
      method: normalizeMethod(cell('method')) ?? 'card',
      status: normalizeStatus(cell('status')) ?? 'actual',
      amountCents: parseMoney(amountText),
      currency: cell('currency') || undefined,
      poId: po?.id,
      dayNumber,
      dayDate,
      notes: cell('notes') || undefined,
      receiptUrl: receiptUrl && /^https?:\/\//i.test(receiptUrl) ? receiptUrl : undefined,
    }));
  }
  return { expenses, skipped };
}
