import React, { useMemo, useState } from 'react';
import { ReportBlock } from '../../types';
import { ReportCollection } from '../../types';
import { getReportFieldDefs, fieldsForScope, ReportFieldDef, isGlobalField, smartFieldLabel } from '../../lib/reportFields';
import { COLLECTION_LABELS } from '../../lib/reportBlocks';
import { Project } from '../../types';
import { Type, AlignLeft, Repeat, Table2, Columns3, Printer, FilePlus, Ruler, Search, X } from 'lucide-react';

export interface PaletteDropPayload {
  kind: 'block' | 'field';
  type?: ReportBlock['type'];
  field?: string;
  collection?: ReportCollection;
  category?: string;
  moveId?: string;
  duplicate?: boolean;
}

export const DROP_MIME = 'application/x-report-block';

const BLOCK_ITEMS: { type: PaletteDropPayload; label: string; icon: React.ReactNode }[] = [
  { type: { kind: 'block', type: 'text' }, label: 'Text', icon: <Type className="w-3.5 h-3.5" /> },
  { type: { kind: 'block', type: 'field' }, label: 'Attribute', icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { type: { kind: 'block', type: 'repeat' }, label: 'Repeat', icon: <Repeat className="w-3.5 h-3.5" /> },
  { type: { kind: 'block', type: 'table' }, label: 'Table', icon: <Table2 className="w-3.5 h-3.5" /> },
  { type: { kind: 'block', type: 'columns' }, label: 'Columns', icon: <Columns3 className="w-3.5 h-3.5" /> },
  { type: { kind: 'block', type: 'ribbon' }, label: 'Ribbon', icon: <Printer className="w-3.5 h-3.5" /> },
  { type: { kind: 'block', type: 'pageBreak' }, label: 'Page Break', icon: <FilePlus className="w-3.5 h-3.5" /> },
  { type: { kind: 'block', type: 'spacer' }, label: 'Spacer', icon: <Ruler className="w-3.5 h-3.5" /> },
];

interface ReportPaletteProps {
  project: Project;
  insertScope: ReportCollection | null;
  insertCategory?: string;
  insideColumns?: boolean;
  onInsert: (payload: PaletteDropPayload) => void;
  readOnly: boolean;
}

const ReportPalette: React.FC<ReportPaletteProps> = ({ project, insertScope, insertCategory, insideColumns, onInsert, readOnly }) => {
  const [query, setQuery] = useState('');
  const allFields = useMemo(() => getReportFieldDefs(project), [project]);
  const fields = useMemo(() => fieldsForScope(allFields, insertScope, insertCategory), [allFields, insertScope, insertCategory]);
  const availableKeys = useMemo(() => new Set(fields.map(f => f.key)), [fields]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const groups = useMemo(() => {
    const source = searching ? allFields : fields;
    const list = searching
      ? source.filter(f => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
      : source;
    const out: { group: string; fields: ReportFieldDef[] }[] = [];
    for (const f of list) {
      let g = out.find(x => x.group === f.group);
      if (!g) { g = { group: f.group, fields: [] }; out.push(g); }
      g.fields.push(f);
    }
    return out;
  }, [fields, allFields, searching, q]);

  const itemGroups = searching ? groups : groups.filter(g => !g.fields.every(isGlobalField));
  const globalGroups = searching ? [] : groups.filter(g => g.fields.every(isGlobalField));

  const matchedBlocks = searching
    ? BLOCK_ITEMS.filter(i => i.label.toLowerCase().includes(q) || (i.type.type || '').toLowerCase().includes(q))
    : BLOCK_ITEMS;

  const blockAvailable = (item: { type: PaletteDropPayload; label: string }) =>
    !(item.type.type === 'columns' && insideColumns);

  const startDrag = (e: React.DragEvent, payload: PaletteDropPayload) => {
    e.dataTransfer.setData(DROP_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const scopeLabel = (insertScope && COLLECTION_LABELS[insertScope as keyof typeof COLLECTION_LABELS]) || insertScope || 'top level';

  const labelOf = (f: ReportFieldDef) => f.scope === 'smart' ? smartFieldLabel(f.label, insertScope) : f.label;

  const fieldButton = (f: ReportFieldDef, unavailable = false) => (
    <button
      key={f.key}
      draggable={!readOnly && !unavailable}
      onDragStart={unavailable ? undefined : (e => startDrag(e, { kind: 'field', field: f.key }))}
      onClick={unavailable ? undefined : (() => !readOnly && onInsert({ kind: 'field', field: f.key }))}
      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors disabled:opacity-40 ${unavailable ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-800'}`}
    >
      <span className="truncate">{labelOf(f)}</span>
      {unavailable && (
        <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-zinc-600">Not available here</span>
      )}
    </button>
  );

  const blockButton = (item: { type: PaletteDropPayload; label: string; icon: React.ReactNode }, unavailable = false) => (
    <button
      key={item.label}
      draggable={!readOnly && !unavailable}
      onDragStart={unavailable ? undefined : (e => startDrag(e, item.type))}
      onClick={unavailable ? undefined : (() => !readOnly && onInsert(item.type))}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${unavailable ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-800'}`}
    >
      {item.icon}
      <span className="truncate">{item.label}</span>
      {unavailable && (
        <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-zinc-600">Not available here</span>
      )}
    </button>
  );

  const groupBlock = (g: { group: string; fields: ReportFieldDef[] }) => (
    <div key={g.group} className="mb-2">
      <div className="text-[10px] font-medium text-zinc-600 px-1 mb-0.5">{g.group}</div>
      <div className="space-y-0.5">
        {g.fields.map(f => fieldButton(f, searching && !availableKeys.has(f.key)))}
      </div>
    </div>
  );

  const noResults = searching && matchedBlocks.length === 0 && groups.length === 0;

  return (
    <aside className="w-[188px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto select-none">
      <div className="p-3">
        <div className="relative mb-3">
          <Search className="w-3 h-3 text-zinc-600 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search blocks & attributes…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded pl-6 pr-6 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-2">Blocks</div>
        {matchedBlocks.length > 0 ? (
          <div className="space-y-0.5">
            {matchedBlocks.map(item => blockButton(item, !blockAvailable(item)))}
          </div>
        ) : (
          !noResults && <div className="px-1 text-[10px] text-zinc-600 italic">No blocks match.</div>
        )}

        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mt-4 mb-2 flex items-center justify-between">
          Attributes
          <span className="normal-case text-[9px] text-sky-400/80">{scopeLabel}</span>
        </div>
        {groups.length > 0 ? (
          <>
            {itemGroups.map(groupBlock)}
            {globalGroups.length > 0 && (
              <>
                {itemGroups.length > 0 && <div className="border-t border-zinc-800 my-2" />}
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1">Global</div>
                {globalGroups.map(groupBlock)}
              </>
            )}
          </>
        ) : (
          noResults
            ? <div className="px-1 text-[10px] text-zinc-600 italic">Nothing matches “{query}”.</div>
            : <div className="px-1 text-[10px] text-zinc-600 italic">No attributes here — production/project fields are available everywhere.</div>
        )}
      </div>
    </aside>
  );
};

export default ReportPalette;
