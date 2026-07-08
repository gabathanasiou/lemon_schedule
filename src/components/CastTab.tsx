import React, { useMemo, useCallback, useState, useRef } from 'react';
import Spreadsheet, { CellBase, DataViewerComponent, DataEditorComponent, ColumnIndicatorComponent, HeaderRowComponent } from 'react-spreadsheet';
import { useProject } from '../store';
import { CastMember } from '../types';
import { Trash2 } from 'lucide-react';

const COLUMNS = [
  { key: 'id', label: 'Cast #' },
  { key: 'name', label: 'Name' },
  { key: 'actions', label: '' },
];
const ACTIONS_COL = 2;

export const CastTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const cast = state.present.castMembers || [];

  const sorted = useMemo(() =>
    [...cast].sort((a, b) => {
      const na = parseInt(a.id, 10);
      const nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    }),
    [cast]
  );

  const DeleteViewer: DataViewerComponent<CellBase<string>> = useCallback(({ row }) => {
    const m = sorted[row];
    if (!m) return null;
    return (
      <div className="flex items-center justify-center h-full w-full cursor-pointer hover:bg-red-50 transition-colors"
        onMouseDown={e => { e.stopPropagation(); dispatch({ type: 'DELETE_CAST_MEMBER', payload: m.id }); }}>
        <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-600 transition-colors" />
      </div>
    );
  }, [sorted, dispatch]);

  const NameEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const [val, setVal] = useState(cell?.value || '');
    return (
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value.toUpperCase())}
        onBlur={() => { onChange({ value: val.toUpperCase() }); exitEditMode(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange({ value: val.toUpperCase() }); exitEditMode(); }
          if (e.key === 'Escape') exitEditMode();
        }}
        autoFocus
      />
    );
  }, []);

  const DEFAULT_WIDTHS = [80, 300, 40];

  const colWidths = useRef<number[]>([...DEFAULT_WIDTHS]);
  const [widthVersion, setWidthVersion] = useState(0);
  const resizeRef = useRef<{ col: number; startX: number; startW: number } | null>(null);

  const CustomHeaderRow: HeaderRowComponent = ({ children, ...rest }) => (
    <tr {...rest} className="Spreadsheet__header-row">{children}</tr>
  );

  const CustomColIndicator: ColumnIndicatorComponent = useCallback(({ column, label }) => {
    const width = colWidths.current[column];
    return (
      <th className="Spreadsheet__header"
        style={{ width, maxWidth: width, minWidth: width, overflow: 'visible' }}>
        <div className="Spreadsheet__header-label">{label !== null ? label : ''}</div>
        <div className="column-resize-handle"
          onMouseDown={e => {
            e.preventDefault(); e.stopPropagation();
            resizeRef.current = { col: column, startX: e.clientX, startW: width };
            const onMove = (ev: MouseEvent) => {
              if (!resizeRef.current) return;
              const diff = ev.clientX - resizeRef.current.startX;
              const newW = Math.max(30, resizeRef.current.startW + diff);
              colWidths.current[resizeRef.current.col] = newW;
              setWidthVersion(v => v + 1);
            };
            const onUp = () => {
              resizeRef.current = null;
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }} />
      </th>
    );
  }, [widthVersion]);

  const widthStyle = useMemo(() => {
    return COLUMNS.map((_, i) => {
      const w = colWidths.current[i] || DEFAULT_WIDTHS[i] || 100;
      return `.Spreadsheet th:nth-child(${i + 1}), .Spreadsheet td:nth-child(${i + 1}) { width: ${w}px; min-width: ${w}px; max-width: ${w}px; }`;
    }).join('\n');
  }, [widthVersion]);

  const data = useMemo((): CellBase[][] => {
    const rows = sorted.map(m => [
      { value: m.id },
      { value: m.name, DataEditor: NameEditor },
      { value: '', readOnly: true, DataViewer: DeleteViewer },
    ]);
    rows.push(COLUMNS.map((_, i) => {
      if (i === ACTIONS_COL) return { value: '', readOnly: true };
      if (i === 1) return { value: '', DataEditor: NameEditor };
      return { value: '' };
    }));
    return rows;
  }, [sorted, DeleteViewer, NameEditor]);

  const handleChange = useCallback((newData: CellBase[][]) => {
    const phantomRow = newData[sorted.length];
    if (phantomRow) {
      const hasContent = phantomRow.slice(0, ACTIONS_COL).some(c => {
        const v = c?.value; return v !== undefined && v !== null && String(v).trim() !== '';
      });
      if (hasContent) {
        const newId = String(phantomRow[0]?.value ?? '').trim();
        const newName = String(phantomRow[1]?.value ?? '').trim().toUpperCase();
        const maxId = cast.reduce((max, c) => { const n = parseInt(c.id, 10); return isNaN(n) ? max : Math.max(max, n); }, 0);
        const id = newId || String(maxId + 1);
        dispatch({ type: 'ADD_CAST_MEMBER', payload: { id, name: newName } });
        return;
      }
    }

    for (let row = 0; row < Math.min(sorted.length, newData.length); row++) {
      const newId = String(newData[row]?.[0]?.value ?? '');
      const newName = String(newData[row]?.[1]?.value ?? '').toUpperCase();
      const orig = sorted[row];
      if (newId !== orig.id) {
        dispatch({ type: 'DELETE_CAST_MEMBER', payload: orig.id });
        dispatch({ type: 'ADD_CAST_MEMBER', payload: { id: newId, name: newName || orig.name.toUpperCase() } });
      } else if (newName !== orig.name) {
        dispatch({ type: 'UPDATE_CAST_MEMBER', payload: { id: orig.id, name: newName } });
      }
    }
  }, [sorted, cast, dispatch]);

  const add = useCallback(() => {
    const maxId = cast.reduce((max, c) => { const n = parseInt(c.id, 10); return isNaN(n) ? max : Math.max(max, n); }, 0);
    dispatch({ type: 'ADD_CAST_MEMBER', payload: { id: String(maxId + 1), name: '' } });
  }, [cast, dispatch]);

  return (
    <>
      <div className="flex-1 overflow-auto bg-white">
        <div className="min-w-[400px]">
          <style>{`
            .Spreadsheet {
              border-collapse: collapse;
              width: 100%;
              font-family: inherit;
              font-size: 13px;
            }
            .Spreadsheet__table {
              border-collapse: collapse;
              width: 100%;
              table-layout: fixed;
            }
            .Spreadsheet__header-row {
              background: white;
              border-bottom: 2px solid #0a0a0a;
            }
            .Spreadsheet__header-row th {
              position: sticky;
              top: 0;
              z-index: 10;
              padding: 0;
              font-family: ui-monospace, monospace;
              font-size: 12px;
              font-weight: 600;
              text-align: left;
              border-right: 1px solid #e4e4e7;
              color: #18181b;
              white-space: nowrap;
              position: relative;
              user-select: none;
            }
            .Spreadsheet__header-label {
              padding: 8px 6px;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .Spreadsheet__cell {
              border: none;
              border-right: 1px solid #e4e4e7;
              border-bottom: 1px solid #e4e4e7;
              padding: 0;
              height: 34px;
              overflow: hidden;
            }
            .Spreadsheet__cell--selected {
              outline: 2px solid #2563eb;
              outline-offset: -2px;
              z-index: 2;
              position: relative;
            }
            .Spreadsheet__cell--active {
              outline: 2px solid #2563eb;
              outline-offset: -2px;
              z-index: 2;
              position: relative;
            }
            .Spreadsheet__cell input {
              width: 100%;
              height: 100%;
              border: none;
              outline: none;
              padding: 6px 8px;
              font-size: 13px;
              font-family: inherit;
              background: transparent;
            }
            .Spreadsheet__cell .Spreadsheet__data-viewer {
              padding: 6px 8px;
              min-height: 34px;
              display: flex;
              align-items: center;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .Spreadsheet__data-editor {
              width: 100%;
              height: 100%;
            }
            tr:hover .Spreadsheet__cell { background: #fafafa; }
            tr:hover .Spreadsheet__cell--selected,
            tr:hover .Spreadsheet__cell--active { background: transparent; }
            .Spreadsheet__cell--readonly { background: white; }
            .column-resize-handle {
              position: absolute; top: 0; right: -3px; width: 6px; height: 100%;
              cursor: col-resize; z-index: 20; background: transparent;
            }
            .column-resize-handle:hover,
            .column-resize-handle:active { background: rgba(37, 99, 235, 0.3); }
            ${widthStyle}
          `}</style>
          <Spreadsheet
            data={data}
            onChange={handleChange}
            columnLabels={COLUMNS.map(c => c.label)}
            hideRowIndicators
            ColumnIndicator={CustomColIndicator}
            HeaderRow={CustomHeaderRow}
          />
        </div>
      </div>

      <div className="bg-zinc-100 border-t border-zinc-300 p-3 flex items-center shadow-inner">
        <button onClick={add}
          className="bg-zinc-900 border-2 border-transparent text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-800 transition-colors">
          + Add Cast
        </button>
        <span className="ml-4 text-xs text-zinc-500 uppercase tracking-wider font-mono">
          {cast.length} {cast.length === 1 ? 'member' : 'members'}
        </span>
      </div>
      </>
  );
};
