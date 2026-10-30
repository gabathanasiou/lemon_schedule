import React from 'react';
import { Plus } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import { Seg, type PickerItem } from '@gabriel/ui-kit';
import { ChevronDown } from 'lucide-react';
import type {
  BudgetCurrency, BudgetFringe, BudgetGlobal, BudgetGroup, BudgetMarkup,
  BudgetUnit, Project,
} from '../../types';
import type { BudgetModel } from '../../lib/budget/calc';
import { activeBudgetVersion } from '../../lib/budget/model';
import {
  makeBudgetFringe, makeBudgetGlobal, makeBudgetGroup, makeBudgetMarkup,
  makeBudgetUnit,
} from '../../lib/budget/model';
import { formatMoney, parseMoney } from '../../lib/budget/format';
import { SYSTEM_GLOBAL_KEYS } from '../../lib/budget/scheduleSync';
import { useProject } from '../../store';
import { useDialog } from '../Dialog';
import { ContextMenuItem } from '../ContextMenu';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { BudgetGroupModal } from './BudgetGroupModal';
import Button from '../Button';
import { InlineGlideTable, type InlineGlideColumn, type InlineGlideEdit, type InlineGlideRowAction } from '../InlineGlideTable';
import { textCell, colorSwatchCell } from '../../lib/glideCells';
import type { GlideColumnEditor } from '../../lib/glideEditor';
import { BudgetInput } from './fields';

type LibraryKey = 'fringes' | 'groups' | 'globals' | 'units' | 'currencies' | 'markups';

interface LibraryRow extends Record<string, string> {
  key: string;
  id: string;
}

function LibraryTable({
  title, hint, columns, rows, readOnly, onCommit, onAdd, onDelete, addLabel, editors, onEdit,
}: {
  title: string;
  hint?: string;
  columns: (InlineGlideColumn & { editable?: boolean; swatch?: boolean })[];
  rows: LibraryRow[];
  readOnly: boolean;
  onCommit: (edits: InlineGlideEdit[]) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  addLabel: string;
  editors?: Record<string, GlideColumnEditor>;
  onEdit?: (id: string) => void;
}) {
  const editable = React.useMemo(() => new Set(columns.filter(c => c.editable).map(c => c.key)), [columns]);
  const getCellContent = React.useCallback((col: InlineGlideColumn & { swatch?: boolean }, row: LibraryRow): GridCell => {
    if (col.swatch) {
      return colorSwatchCell({
        color: row[col.key] || '#d4d4d8',
        label: row[col.key] || 'No colour',
        onActivate: onEdit ? () => onEdit(row.id) : undefined,
      });
    }
    const canEdit = !readOnly && editable.has(col.key);
    return textCell(row[col.key] ?? '', {
      readonly: !canEdit,
      align: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
    });
  }, [editable, readOnly, onEdit]);
  const rowInfo = React.useCallback((rowIndex: number) => {
    if (!onEdit) return null;
    const row = rows[rowIndex];
    if (!row) return null;
    return { title: `Edit ${row[columns[0].key] || 'row'}`, onClick: () => onEdit(row.id) };
  }, [rows, columns, onEdit]);
  const rowActions = React.useCallback((rowIndex: number): InlineGlideRowAction[] => {
    if (readOnly) return [];
    const row = rows[rowIndex];
    if (!row) return [];
    return [{ key: 'delete', title: `Delete ${row[columns[0].key] || 'row'}`, icon: 'trash', onClick: () => onDelete(row.id) }];
  }, [readOnly, rows, columns, onDelete]);

  return (
    <section className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)]">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--ui-border)]">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-[color:var(--ui-text-strong)]">{title}</h2>
          {hint && <p className="text-[10px] text-[color:var(--ui-text-faint)]">{hint}</p>}
        </div>
        <Button theme="light" className="ml-auto" onClick={onAdd} disabled={readOnly}>
          <Plus className="w-3.5 h-3.5" /> {addLabel}
        </Button>
      </header>
      <InlineGlideTable
        columns={columns}
        rows={rows}
        getCellContent={getCellContent}
        onCommit={onCommit}
        editableKeys={editable}
        readOnly={readOnly}
        rowActions={rowActions}
        rowInfo={onEdit ? rowInfo : undefined}
        editors={editors}
        rowMenuItems={(rowIndex, close) => {
          if (readOnly) return null;
          const row = rows[rowIndex];
          if (!row) return null;
          return (
            <>
              {onEdit && (
                <ContextMenuItem onClick={() => { close(); onEdit(row.id); }}>
                  Edit {row[columns[0].key] || 'row'}
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => { close(); onDelete(row.id); }}>
                Delete {row[columns[0].key] || 'row'}
              </ContextMenuItem>
            </>
          );
        }}
        baseRowHeight={26}
        baseHeaderHeight={28}
        emptyLabel={`No ${title.toLowerCase()} yet`}
      />
    </section>
  );
}

const CALC_OPTIONS = [
  { v: 'percent', l: 'Percent' },
  { v: 'fixedPerUnit', l: 'Fixed per unit' },
  { v: 'flat', l: 'Flat' },
];
const POSTING_OPTIONS = [
  { v: 'topsheet', l: 'Top sheet' },
  { v: 'category', l: 'Category' },
  { v: 'account', l: 'Account' },
];
const UNIT_TYPES = [
  { v: 'time', l: 'Time' },
  { v: 'quantity', l: 'Quantity' },
  { v: 'flat', l: 'Flat' },
  { v: 'percent', l: 'Percent' },
];
const MARKUP_KINDS = [
  { v: 'markup', l: 'Markup' },
  { v: 'discount', l: 'Discount' },
  { v: 'charge', l: 'Charge' },
  { v: 'credit', l: 'Credit' },
];

/** Budget library + settings (`docs/BUDGETING-SURFACES.md` §5). The chart of
 *  accounts and library are SHARED across every version. */
export function BudgetLibraryView({ model, project, readOnly }: { model: BudgetModel; project: Project; readOnly: boolean }) {
  const { dispatch } = useProject();
  const dialog = useDialog();
  const budget = model.budget;
  const settings = model.settings;
  const version = activeBudgetVersion(budget);
  const lines = version?.lines || [];
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);
  const [currencyMenuOpen, setCurrencyMenuOpen] = React.useState(false);
  const editingGroup = editingGroupId ? (budget.groups || []).find(g => g.id === editingGroupId) : undefined;

  const setLibrary = React.useCallback((key: LibraryKey, value: BudgetFringe[] | BudgetGroup[] | BudgetGlobal[] | BudgetUnit[] | BudgetCurrency[] | BudgetMarkup[]) => {
    switch (key) {
      case 'fringes': return dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key, value: value as BudgetFringe[] } });
      case 'groups': return dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key, value: value as BudgetGroup[] } });
      case 'globals': return dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key, value: value as BudgetGlobal[] } });
      case 'units': return dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key, value: value as BudgetUnit[] } });
      case 'currencies': return dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key, value: value as BudgetCurrency[] } });
      case 'markups': return dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key, value: value as BudgetMarkup[] } });
    }
  }, [dispatch]);

  // ---- settings ------------------------------------------------------------
  const currencyItems: PickerItem[] = (budget.currencies || []).map(c => ({ id: c.code, label: c.symbol ? `${c.symbol} ${c.code}` : c.code }));

  // ---- fringes -------------------------------------------------------------
  const fringeRows: LibraryRow[] = (budget.fringes || []).map(f => ({
    key: `fringe:${f.id}`, id: f.id,
    name: f.name,
    calc: CALC_OPTIONS.find(o => o.v === f.calc)?.l || "Percent",
    percent: String(f.percent ?? 0),
    amount: (Number(f.amountCents || 0) / 100).toFixed(2),
    cutoff: f.cutoffCents != null ? (f.cutoffCents / 100).toFixed(2) : '',
    posting: POSTING_OPTIONS.find(o => o.v === (f.posting || settings.fringePosting))?.l || 'Top sheet',
    groups: (f.groups || []).map(id => (budget.groups || []).find(g => g.id === id)?.name || '').filter(Boolean).join(', '),
  }));
  const groupIdByName = new Map((budget.groups || []).map(g => [g.name.trim().toLowerCase(), g.id]));
  const commitFringes = (edits: InlineGlideEdit[]) => {
    const next = (budget.fringes || []).map(f => {
      const e = edits.find(x => x.row === fringeRows.findIndex(r => r.id === f.id));
      if (!e) return f;
      switch (e.colKey) {
        case 'name': return { ...f, name: e.value };
        case 'calc': return { ...f, calc: (CALC_OPTIONS.find(o => o.l === e.value)?.v || f.calc) as BudgetFringe['calc'] };
        case 'percent': return { ...f, percent: Number(e.value.replace(/[^0-9.\-]/g, '')) || 0 };
        case 'amount': return { ...f, amountCents: parseMoney(e.value) };
        case 'cutoff': return { ...f, cutoffCents: e.value.trim() ? parseMoney(e.value) : undefined };
        case 'posting': return { ...f, posting: (POSTING_OPTIONS.find(o => o.l === e.value)?.v || f.posting) as BudgetFringe['posting'] };
        case 'groups': return {
          ...f,
          groups: e.value.split(',').map(x => x.trim()).filter(Boolean)
            .map(name => groupIdByName.get(name.toLowerCase())).filter(Boolean) as string[],
        };
        default: return f;
      }
    });
    setLibrary('fringes', next);
  };

  // ---- groups --------------------------------------------------------------
  const groupRows: LibraryRow[] = (budget.groups || []).map(g => ({
    key: `group:${g.id}`, id: g.id, name: g.name, color: g.color || '', inBudget: g.inBudget === false ? 'No' : 'Yes',
  }));
  const commitGroups = (edits: InlineGlideEdit[]) => {
    const next = (budget.groups || []).map(g => {
      const idx = groupRows.findIndex(r => r.id === g.id);
      const e = edits.find(x => x.row === idx);
      if (!e) return g;
      if (e.colKey === 'name') return { ...g, name: e.value };
      if (e.colKey === 'color') return { ...g, color: e.value.trim() || undefined };
      if (e.colKey === 'inBudget') return { ...g, inBudget: e.value.trim().toLowerCase() !== 'no' };
      return g;
    });
    setLibrary('groups', next);
  };

  // ---- globals -------------------------------------------------------------
  const globalRows: LibraryRow[] = (budget.globals || []).map(g => ({
    key: `global:${g.id}`, id: g.id, symbol: g.symbol, description: g.description || '', value: String(g.value ?? 0), formula: g.formula || '',
  }));
  const commitGlobals = (edits: InlineGlideEdit[]) => {
    const next = (budget.globals || []).map(g => {
      const idx = globalRows.findIndex(r => r.id === g.id);
      const e = edits.find(x => x.row === idx);
      if (!e) return g;
      if (e.colKey === 'symbol') return { ...g, symbol: e.value.trim().toUpperCase() };
      if (e.colKey === 'description') return { ...g, description: e.value };
      if (e.colKey === 'value') return { ...g, value: Number(e.value.replace(/[^0-9.\-]/g, '')) || 0 };
      if (e.colKey === 'formula') return { ...g, formula: e.value.trim() || undefined };
      return g;
    });
    setLibrary('globals', next);
  };

  // ---- units ---------------------------------------------------------------
  const unitRows: LibraryRow[] = (budget.units || []).map(u => ({
    key: `unit:${u.id}`, id: u.id, name: u.name, plural: u.plural, type: UNIT_TYPES.find(t => t.v === u.type)?.l || 'Quantity', hours: u.hours != null ? String(u.hours) : '',
  }));
  const commitUnits = (edits: InlineGlideEdit[]) => {
    const next = (budget.units || []).map(u => {
      const idx = unitRows.findIndex(r => r.id === u.id);
      const e = edits.find(x => x.row === idx);
      if (!e) return u;
      if (e.colKey === 'name') return { ...u, name: e.value };
      if (e.colKey === 'plural') return { ...u, plural: e.value };
      if (e.colKey === 'type') return { ...u, type: (UNIT_TYPES.find(t => t.l === e.value)?.v || u.type) as BudgetUnit['type'] };
      if (e.colKey === 'hours') return { ...u, hours: e.value.trim() ? Number(e.value) : undefined };
      return u;
    });
    setLibrary('units', next);
  };

  // ---- currencies ----------------------------------------------------------
  const currencyRows: LibraryRow[] = (budget.currencies || []).map(c => ({
    key: `cur:${c.code}`, id: c.code, code: c.code, symbol: c.symbol || '', rate: c.rateToBase != null ? String(c.rateToBase) : '',
  }));
  const commitCurrencies = (edits: InlineGlideEdit[]) => {
    const next = (budget.currencies || []).map(c => {
      const idx = currencyRows.findIndex(r => r.id === c.code);
      const e = edits.find(x => x.row === idx);
      if (!e) return c;
      if (e.colKey === 'symbol') return { ...c, symbol: e.value.trim() || undefined };
      if (e.colKey === 'rate') return { ...c, rateToBase: e.value.trim() ? Number(e.value) : undefined };
      return c;
    });
    setLibrary('currencies', next);
  };

  // ---- markups -------------------------------------------------------------
  const markupRows: LibraryRow[] = (budget.markups || []).map(m => ({
    key: `markup:${m.id}`, id: m.id, name: m.name,
    kind: MARKUP_KINDS.find(k => k.v === m.kind)?.l || 'Markup',
    calc: m.calc === 'percent' ? 'Percent' : 'Flat',
    percent: String(m.percent ?? 0),
    amount: (Number(m.amountCents || 0) / 100).toFixed(2),
    compound: m.compound ? 'Yes' : 'No',
  }));
  const commitMarkups = (edits: InlineGlideEdit[]) => {
    const next = (budget.markups || []).map(m => {
      const idx = markupRows.findIndex(r => r.id === m.id);
      const e = edits.find(x => x.row === idx);
      if (!e) return m;
      if (e.colKey === 'name') return { ...m, name: e.value };
      if (e.colKey === 'kind') return { ...m, kind: (MARKUP_KINDS.find(k => k.l === e.value)?.v || m.kind) as BudgetMarkup['kind'] };
      if (e.colKey === 'calc') return { ...m, calc: e.value.toLowerCase() === 'flat' ? 'flat' as const : 'percent' as const };
      if (e.colKey === 'percent') return { ...m, percent: Number(e.value.replace(/[^0-9.\-]/g, '')) || 0 };
      if (e.colKey === 'amount') return { ...m, amountCents: parseMoney(e.value) };
      if (e.colKey === 'compound') return { ...m, compound: e.value.trim().toLowerCase() === 'yes' };
      return m;
    });
    setLibrary('markups', next);
  };

  // ---- deletes -------------------------------------------------------------
  const confirmDelete = React.useCallback(async (key: LibraryKey, id: string, name: string) => {
    const uses = key === 'fringes' ? lines.filter(l => (l.fringes || []).includes(id)).length
      : key === 'groups' ? lines.filter(l => (l.groups || []).includes(id)).length
        : key === 'units' ? lines.filter(l => l.unit === id).length
          : key === 'currencies' ? lines.filter(l => l.currency === id).length
            : 0;
    const ok = await dialog.confirm({
      title: `Delete ${name}?`,
      message: uses > 0
        ? `Used by ${uses} line${uses === 1 ? '' : 's'} — those references will be cleared. Undo is available.`
        : 'Undo is available.',
      danger: true,
      suppressKey: 'lemon_schedule_budget_delete_library',
    });
    if (!ok) return;
    dispatch({ type: 'BATCH_START' });
    try {
      if (key === 'fringes') {
        setLibrary('fringes', (budget.fringes || []).filter(f => f.id !== id));
        dispatch({ type: 'BULK_UPDATE_BUDGET_LINES', payload: { updates: lines.filter(l => (l.fringes || []).includes(id)).map(l => ({ id: l.id, updates: { fringes: (l.fringes || []).filter(x => x !== id) } })) } });
      } else if (key === 'groups') {
        setLibrary('groups', (budget.groups || []).filter(g => g.id !== id));
        dispatch({ type: 'BULK_UPDATE_BUDGET_LINES', payload: { updates: lines.filter(l => (l.groups || []).includes(id)).map(l => ({ id: l.id, updates: { groups: (l.groups || []).filter(x => x !== id) } })) } });
      } else if (key === 'units') {
        setLibrary('units', (budget.units || []).filter(u => u.id !== id));
        dispatch({ type: 'BULK_UPDATE_BUDGET_LINES', payload: { updates: lines.filter(l => l.unit === id).map(l => ({ id: l.id, updates: { unit: 'unit-flat' } })) } });
      } else if (key === 'currencies') {
        setLibrary('currencies', (budget.currencies || []).filter(c => c.code !== id));
        dispatch({ type: 'BULK_UPDATE_BUDGET_LINES', payload: { updates: lines.filter(l => l.currency === id).map(l => ({ id: l.id, updates: { currency: undefined } })) } });
      } else if (key === 'globals') {
        // Simple v1 rule: formulas that referenced it surface #REF! — the
        // convert-to-last-value flow is a later phase (docs/BUDGETING.md §4).
        setLibrary('globals', (budget.globals || []).filter(g => g.id !== id));
      } else if (key === 'markups') {
        setLibrary('markups', (budget.markups || []).filter(m => m.id !== id));
      }
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
  }, [lines, budget, dialog, dispatch, setLibrary]);

  const section = (key: LibraryKey) => (id: string) => {
    const name = key === 'fringes' ? (budget.fringes || []).find(f => f.id === id)?.name
      : key === 'groups' ? (budget.groups || []).find(g => g.id === id)?.name
        : key === 'globals' ? (budget.globals || []).find(g => g.id === id)?.symbol
          : key === 'units' ? (budget.units || []).find(u => u.id === id)?.name
            : key === 'currencies' ? id
              : (budget.markups || []).find(m => m.id === id)?.name;
    void confirmDelete(key, id, name || 'item');
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-custom bg-[var(--ui-modal-header-base)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 space-y-3">
        <section className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <h2 className="text-xs font-semibold text-[color:var(--ui-text-strong)] mb-2">Budget settings</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">Base currency</span>
              <DropdownMenu
                open={currencyMenuOpen}
                onOpenChange={setCurrencyMenuOpen}
                width="w-44"
                theme="light"
                trigger={
                  <Button variant="outline" theme="light" className="w-full justify-between" disabled={readOnly}>
                    <span className="truncate">{currencyItems.find(c => c.id === settings.currency)?.label || settings.currency}</span>
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  </Button>
                }
              >
                {currencyItems.map(item => (
                  <DropdownItem
                    key={item.id}
                    onClick={() => { setCurrencyMenuOpen(false); dispatch({ type: 'UPDATE_BUDGET_SETTINGS', payload: { currency: item.id } }); }}
                    icon={item.id === settings.currency ? <span className="text-[10px]">✓</span> : undefined}
                  >
                    {item.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">Symbol</span>
              <BudgetInput value={settings.currencySymbol || '$'} onCommit={v => dispatch({ type: 'UPDATE_BUDGET_SETTINGS', payload: { currencySymbol: v || '$' } })} readOnly={readOnly} />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">Decimals</span>
              <Seg
                variant="track"
                theme="light"
                value={String(settings.decimals)}
                options={[{ v: '0', l: 'Whole' }, { v: '2', l: '2 dp' }]}
                onChange={v => dispatch({ type: 'UPDATE_BUDGET_SETTINGS', payload: { decimals: v === '2' ? 2 : 0 } })}
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">Negatives</span>
              <Seg
                variant="track"
                theme="light"
                value={settings.negativeStyle || 'minus'}
                options={[{ v: 'minus', l: '-100' }, { v: 'parentheses', l: '(100)' }]}
                onChange={v => dispatch({ type: 'UPDATE_BUDGET_SETTINGS', payload: { negativeStyle: v === 'parentheses' ? 'parentheses' : 'minus' } })}
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">Fringe posting</span>
              <Seg
                variant="track"
                theme="light"
                value={settings.fringePosting || 'topsheet'}
                options={POSTING_OPTIONS.map(o => ({ v: o.v, l: o.l }))}
                onChange={v => dispatch({ type: 'UPDATE_BUDGET_SETTINGS', payload: { fringePosting: v as 'topsheet' | 'category' | 'account' } })}
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">Cost context</span>
              <span className="text-xs text-[color:var(--ui-text-muted)]">
                {model.lineCount} {model.lineCount === 1 ? 'line' : 'lines'} · {model.linkedLineCount} linked · {formatMoney(model.totals.grandTotalCents, settings)} total
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <h2 className="text-xs font-semibold text-[color:var(--ui-text-strong)] mb-1">System values</h2>
          <p className="text-[10px] text-[color:var(--ui-text-faint)] mb-2">Recomputed from the active schedule and calendar every time; never stored.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {SYSTEM_GLOBAL_KEYS.map(key => (
              <div key={key} className="rounded border border-[color:var(--ui-border)] px-2 py-1">
                <div className="text-[9px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">{key}</div>
                <div className="text-xs font-semibold text-[color:var(--ui-text-strong)]">{model.globals[key] ?? 0}</div>
              </div>
            ))}
          </div>
          {Object.keys(model.globalErrors).length > 0 && (
            <p className="text-[10px] text-amber-700 mt-2">
              {Object.entries(model.globalErrors).map(([k, v]) => `${k}: ${v}`).join(' · ')}
            </p>
          )}
        </section>

        <LibraryTable
          title="Fringes"
          hint="Percent / fixed per unit / flat, with an optional cutoff per line or range."
          addLabel="Fringe"
          rows={fringeRows}
          readOnly={readOnly}
          onCommit={commitFringes}
          onAdd={() => setLibrary('fringes', [...(budget.fringes || []), makeBudgetFringe({ name: 'New Fringe', calc: 'percent', percent: 10 })])}
          onDelete={section('fringes')}
          editors={{
            calc: { kind: 'enum', options: CALC_OPTIONS.map(o => o.l) },
            posting: { kind: 'enum', options: POSTING_OPTIONS.map(o => o.l) },
            groups: { kind: 'entity', mode: 'multi', displayMode: 'name', allowFreeText: false, items: (budget.groups || []).map(g => ({ id: g.id, name: g.name })), placeholder: 'Groups' },
          }}
          columns={[
            { key: 'name', label: 'Name', width: 200, editable: true },
            { key: 'calc', label: 'Calc', width: 110, editable: true },
            { key: 'percent', label: 'Percent', width: 70, align: 'right', editable: true },
            { key: 'amount', label: 'Amount', width: 80, align: 'right', editable: true },
            { key: 'cutoff', label: 'Cutoff', width: 80, align: 'right', editable: true },
            { key: 'posting', label: 'Posting', width: 90, editable: true },
            { key: 'groups', label: 'Groups', width: 120, editable: true },
          ]}
        />

        <LibraryTable
          title="Groups"
          hint="Tags shared by lines and fringes (one fringe can apply to a whole group)."
          addLabel="Group"
          rows={groupRows}
          readOnly={readOnly}
          onCommit={commitGroups}
          onAdd={() => setLibrary('groups', [...(budget.groups || []), makeBudgetGroup({ name: 'New Group' })])}
          onDelete={section('groups')}
          onEdit={(id) => setEditingGroupId(id)}
          editors={{ inBudget: { kind: 'enum', options: ['Yes', 'No'] } }}
          columns={[
            { key: 'name', label: 'Name', width: 220, editable: true },
            { key: 'color', label: 'Colour', width: 130, swatch: true },
            { key: 'inBudget', label: 'In budget', width: 80, align: 'center', editable: true },
          ]}
        />

        <LibraryTable
          title="Globals"
          hint="Named numbers for formulas; a global can reference another global."
          addLabel="Global"
          rows={globalRows}
          readOnly={readOnly}
          onCommit={commitGlobals}
          onAdd={() => setLibrary('globals', [...(budget.globals || []), makeBudgetGlobal({ symbol: `G${(budget.globals || []).length + 1}`, value: 0 })])}
          onDelete={section('globals')}
          columns={[
            { key: 'symbol', label: 'Symbol', width: 110, editable: true },
            { key: 'description', label: 'Description', width: 220, editable: true },
            { key: 'value', label: 'Value', width: 80, align: 'right', editable: true },
            { key: 'formula', label: 'Formula', width: 160, editable: true },
          ]}
        />

        <LibraryTable
          title="Units"
          hint="How a line's quantity is counted; hours feed the day-rate maths."
          addLabel="Unit"
          rows={unitRows}
          readOnly={readOnly}
          onCommit={commitUnits}
          onAdd={() => setLibrary('units', [...(budget.units || []), makeBudgetUnit({ name: 'New Unit', plural: 'New Units', type: 'quantity' })])}
          onDelete={section('units')}
          editors={{ type: { kind: 'enum', options: UNIT_TYPES.map(o => o.l) } }}
          columns={[
            { key: 'name', label: 'Name', width: 140, editable: true },
            { key: 'plural', label: 'Plural', width: 140, editable: true },
            { key: 'type', label: 'Type', width: 100, editable: true },
            { key: 'hours', label: 'Hours', width: 70, align: 'right', editable: true },
          ]}
        />

        <LibraryTable
          title="Currencies"
          hint="A line in another currency converts with its rate; a missing rate is a warning, never 1:1."
          addLabel="Currency"
          rows={currencyRows}
          readOnly={readOnly}
          onCommit={commitCurrencies}
          onAdd={() => setLibrary('currencies', [...(budget.currencies || []), { code: `CUR${(budget.currencies || []).length + 1}`, symbol: '', rateToBase: undefined }])}
          onDelete={section('currencies')}
          columns={[
            { key: 'code', label: 'Code', width: 90 },
            { key: 'symbol', label: 'Symbol', width: 80, editable: true },
            { key: 'rate', label: 'Rate to base', width: 110, align: 'right', editable: true },
          ]}
        />

        <LibraryTable
          title="Markups"
          hint="Contingency, charges and discounts applied after category totals."
          addLabel="Markup"
          rows={markupRows}
          readOnly={readOnly}
          onCommit={commitMarkups}
          onAdd={() => setLibrary('markups', [...(budget.markups || []), makeBudgetMarkup({ name: 'New Markup', sort: (budget.markups || []).length })])}
          onDelete={section('markups')}
          editors={{
            kind: { kind: 'enum', options: MARKUP_KINDS.map(o => o.l) },
            calc: { kind: 'enum', options: ['Percent', 'Flat'] },
            compound: { kind: 'enum', options: ['Yes', 'No'] },
          }}
          columns={[
            { key: 'name', label: 'Name', width: 180, editable: true },
            { key: 'kind', label: 'Kind', width: 100, editable: true },
            { key: 'calc', label: 'Calc', width: 90, editable: true },
            { key: 'percent', label: 'Percent', width: 70, align: 'right', editable: true },
            { key: 'amount', label: 'Amount', width: 80, align: 'right', editable: true },
            { key: 'compound', label: 'Compound', width: 80, align: 'center', editable: true },
          ]}
        />
      </div>

      {editingGroup && (
        <BudgetGroupModal
          open
          group={editingGroup}
          readOnly={readOnly}
          onClose={() => setEditingGroupId(null)}
          onUpdate={(updates) => setLibrary('groups', (budget.groups || []).map(g => (g.id === editingGroup.id ? { ...g, ...updates } : g)))}
          onDelete={() => { void confirmDelete('groups', editingGroup.id, editingGroup.name); setEditingGroupId(null); }}
        />
      )}
    </div>
  );
}
