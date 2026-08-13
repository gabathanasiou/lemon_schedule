import React, { useMemo } from 'react';
import { ReportBlock } from '../../types';
import { ReportCollection } from '../../types';
import { getReportFieldDefs, fieldsForScope, ReportFieldDef } from '../../lib/reportFields';
import { Project } from '../../types';
import { Type, AlignLeft, Repeat, Table2, Columns3, Printer, FilePlus, Ruler } from 'lucide-react';

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
  onInsert: (payload: PaletteDropPayload) => void;
  readOnly: boolean;
}

const ReportPalette: React.FC<ReportPaletteProps> = ({ project, insertScope, insertCategory, onInsert, readOnly }) => {
  const fields = useMemo(() => fieldsForScope(getReportFieldDefs(project), insertScope, insertCategory), [project, insertScope, insertCategory]);

  const groups = useMemo(() => {
    const out: { group: string; fields: ReportFieldDef[] }[] = [];
    for (const f of fields) {
      let g = out.find(x => x.group === f.group);
      if (!g) { g = { group: f.group, fields: [] }; out.push(g); }
      g.fields.push(f);
    }
    return out;
  }, [fields]);

  const startDrag = (e: React.DragEvent, payload: PaletteDropPayload) => {
    e.dataTransfer.setData(DROP_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="w-[188px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto select-none">
      <div className="p-3">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-2">Blocks</div>
        <div className="space-y-0.5">
          {BLOCK_ITEMS.map(item => (
            <button
              key={item.label}
              draggable={!readOnly}
              onDragStart={e => startDrag(e, item.type)}
              onClick={() => !readOnly && onInsert(item.type)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors active:bg-zinc-800 disabled:opacity-40"
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mt-4 mb-2 flex items-center justify-between">
          Attributes
          <span className="normal-case text-[9px] text-sky-400/80">{insertScope || 'top level'}</span>
        </div>
        {groups.map(g => (
          <div key={g.group} className="mb-2">
            <div className="text-[10px] font-medium text-zinc-600 px-1 mb-0.5">{g.group}</div>
            <div className="space-y-0.5">
              {g.fields.map(f => (
                <button
                  key={f.key}
                  draggable={!readOnly}
                  onDragStart={e => startDrag(e, { kind: 'field', field: f.key })}
                  onClick={() => !readOnly && onInsert({ kind: 'field', field: f.key })}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors active:bg-zinc-800 disabled:opacity-40"
                >
                  <span className="truncate">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="px-1 text-[10px] text-zinc-600 italic">No attributes here — production/project fields are available everywhere.</div>
        )}
      </div>
    </aside>
  );
};

export default ReportPalette;
