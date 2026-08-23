import React, { useState } from 'react';
import type { Project } from '../types';
import { DEFAULT_DAY_TYPES, DAY_TYPE_BUILTIN_KEYS } from './dayTypes';
import { normalizeHex } from '../components/ColorField';
import type { ManagerRow, ManagerShellConfig, ManagerSavePlan } from './managerShell';

// Day Types manager config — a FLAT ManagerShell database (the locationManager
// pattern): rows are the day types themselves (Name + Color), no sub-categories.
// Built-ins (hold/travel/holiday) are locked rows: labels/colors editable,
// keys not deletable.

const FLAT_SCOPE = { key: 'dayTypes', label: 'Day Types' };

function buildDayTypeRows(project: Project): ManagerRow[] {
  const types = project.dayTypes?.length ? project.dayTypes : DEFAULT_DAY_TYPES;
  return types.map(t => ({
    key: t.key,
    id: t.key,
    label: t.label,
    color: t.color || '',
  }));
}

function slugify(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return slug || 'type';
}

function commitDayTypePlan(dispatch: (action: any) => void, plan: ManagerSavePlan, _scope: string, project: Project) {
  const current = project.dayTypes?.length ? project.dayTypes : DEFAULT_DAY_TYPES;
  const next = current.map(t => ({ ...t }));

  for (const id of plan.removes) {
    if (DAY_TYPE_BUILTIN_KEYS.has(id)) continue;
    const idx = next.findIndex(t => t.key === id);
    if (idx >= 0) next.splice(idx, 1);
  }
  for (const a of plan.adds) {
    const label = a.label.trim();
    if (!label) continue;
    let key = slugify(label);
    if (DAY_TYPE_BUILTIN_KEYS.has(key) || next.some(t => t.key === key)) {
      let n = 2;
      while (next.some(t => t.key === `${key}-${n}`) || DAY_TYPE_BUILTIN_KEYS.has(`${key}-${n}`)) n++;
      key = `${key}-${n}`;
    }
    const color = a.color?.trim();
    next.push({ key, label, ...(color ? { color } : {}) });
  }
  for (const u of plan.updates) {
    const def = next.find(t => t.key === u.id);
    if (!def) continue;
    if ('label' in u.updates && (u.updates.label || '').trim()) def.label = u.updates.label.trim();
    if ('color' in u.updates) {
      const c = (u.updates.color || '').trim();
      if (c) def.color = c;
      else delete def.color;
    }
  }
  dispatch({ type: 'SET_DAY_TYPES', payload: { dayTypes: next } });
}

/** Light-theme color cell (ManagerShell tables are light; ColorField is dark). */
const ColorCell: React.FC<{ row: ManagerRow; update: (f: string, v: string) => void; readOnly: boolean }> = ({ row, update, readOnly }) => {
  const [hexText, setHexText] = useState(row.color || '');
  const value = row.color || '';
  const commitHex = (raw: string) => {
    const normalized = normalizeHex(raw);
    if (normalized) {
      setHexText(normalized);
      update('color', normalized);
    } else {
      setHexText(value);
      update('color', value);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || '#000000'}
        disabled={readOnly}
        onChange={e => { setHexText(e.target.value); update('color', e.target.value); }}
        className="w-7 h-7 rounded border border-zinc-300 bg-white p-0.5 appearance-none cursor-pointer [&::-webkit-color-swatch-wrapper]:p-[2px] [&::-webkit-color-swatch]:border-none disabled:opacity-40"
      />
      <input
        type="text"
        value={hexText}
        disabled={readOnly}
        placeholder="#000000"
        spellCheck={false}
        onChange={e => setHexText(e.target.value)}
        onBlur={() => commitHex(hexText)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-20 px-2 py-1 text-xs text-zinc-800 bg-white border border-zinc-200 rounded-md outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 disabled:opacity-40"
      />
    </div>
  );
};

export const dayTypesManagerConfig: ManagerShellConfig = {
  title: 'Day Types',
  nounSingular: 'day type',
  nounPlural: 'day types',
  addNoun: 'Day Type',
  categorySingular: 'day type',
  categoryPlural: 'day types',
  sidebarTitle: 'Day Types',
  addScopeLabel: 'Add Day Type',
  renameScopeLabel: 'Rename Day Type',
  mergeTitle: 'Merge Day Types',
  mergeIntro: 'The following day types now share a name. Saving will merge each set into a single type.',
  mergeSummary: 'details combined',
  fields: [
    { key: 'label', label: 'Name', width: 'w-48' },
    { key: 'color', label: 'Color', width: 'w-44', render: (row, update, readOnly) => <ColorCell row={row} update={update} readOnly={readOnly} /> },
  ],
  mergeableFields: ['color'],
  flat: true,
  rowLocked: r => DAY_TYPE_BUILTIN_KEYS.has(r.key),
  categories: () => [FLAT_SCOPE],
  addCategory() { return null; },
  renameCategory() {},
  deleteCategoryConfirm(category) {
    return { title: `Delete "${category.label}"?`, message: 'This day type will be removed from the calendar.', suppressKey: 'lemon_schedule_dnwa_delete_day_type' };
  },
  deleteCategory() {},
  loadRows: buildDayTypeRows,
  makeBlankRow: () => ({ key: String(Date.now()), id: '', label: '', color: '' }),
  commitPlan: commitDayTypePlan,
  sortModes: [
    { key: 'label', label: 'By Name', comparator: (a, b) => (a.label || a.key).toLowerCase().localeCompare((b.label || b.key).toLowerCase()) },
  ],
};