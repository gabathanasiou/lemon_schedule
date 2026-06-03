import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import Spreadsheet, { CellBase, DataViewerComponent, DataEditorComponent, ColumnIndicatorComponent } from 'react-spreadsheet';
import { useProject } from '../store';
import { Scene, IntExt, DayNight } from '../types';
import { generateUUID, formatPageCount, parsePageCount } from '../lib/utils';
import { Trash2 } from 'lucide-react';
import Papa from 'papaparse';

const COLUMNS = [
  { key: 'sceneNumber', label: 'Scene #' },
  { key: 'pageCount', label: 'Pages' },
  { key: 'scriptDay', label: 'Script Day' },
  { key: 'intExt', label: 'I/E' },
  { key: 'set', label: 'Set' },
  { key: 'dayNight', label: 'D/N' },
  { key: 'description', label: 'Description' },
  { key: 'cast', label: 'Cast' },
  { key: 'notes', label: 'Notes' },
  { key: 'actions', label: '' },
];

const INT_EXT_OPTIONS: IntExt[] = ['INT', 'EXT', 'INT/EXT'];
const DAY_NIGHT_OPTIONS: DayNight[] = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK'];
const ACTIONS_COL = COLUMNS.length - 1;
const INT_EXT_COL = COLUMNS.findIndex(c => c.key === 'intExt');
const DAY_NIGHT_COL = COLUMNS.findIndex(c => c.key === 'dayNight');

export function BreakdownTab() {
  const { state, dispatch } = useProject();
  const project = state.present;
  const scenes = project.scenes;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deleteScene = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SCENE', payload: id });
  }, [dispatch]);

  const DeleteViewer: DataViewerComponent<CellBase<string>> = useCallback(({ row }) => {
    const scene = scenes[row];
    if (!scene) return null;
    return (
      <div
        className="flex items-center justify-center h-full w-full cursor-pointer hover:bg-red-50 transition-colors"
        onMouseDown={e => { e.stopPropagation(); deleteScene(scene.id); }}
      >
        <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-600 transition-colors" />
      </div>
    );
  }, [scenes, deleteScene]);

  const PageCountEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const [val, setVal] = useState(cell?.value || '');
    return (
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { onChange({ value: val }); exitEditMode(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange({ value: val }); exitEditMode(); }
          if (e.key === 'Escape') exitEditMode();
        }}
        autoFocus
      />
    );
  }, []);

  const SetEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
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

  const IntExtEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const [val, setVal] = useState(cell?.value || '');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const committedRef = useRef(false);
    const filtered = INT_EXT_OPTIONS.filter(opt => opt.toLowerCase().includes(val.toLowerCase()));

    const commit = (value: string) => {
      committedRef.current = true;
      const match = INT_EXT_OPTIONS.find(opt => opt.toLowerCase() === value.toLowerCase());
      onChange({ value: match || cell?.value || INT_EXT_OPTIONS[0] });
      exitEditMode();
    };

    return (
      <div className="relative w-full h-full">
        <input
          type="text"
          value={val}
          onChange={e => { setVal(e.target.value); setHighlightedIndex(0); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              commit(filtered[0] ? filtered[highlightedIndex] : val);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlightedIndex(i => Math.max(i - 1, 0));
            }
            if (e.key === 'Escape') exitEditMode();
          }}
          onBlur={() => {
            if (!committedRef.current) {
              commit(filtered[0] ? filtered[highlightedIndex] : val);
            }
          }}
          autoFocus
          className="w-full h-full border-0 outline-none px-2 text-[13px]"
        />
        {filtered.length > 0 && filtered.length < INT_EXT_OPTIONS.length && (
          <div className="absolute top-full left-0 w-full bg-white border border-zinc-200 shadow-lg z-50 overflow-y-auto">
            {filtered.map((opt, i) => (
              <div
                key={opt}
                className={`px-2 py-1 text-[13px] cursor-pointer ${i === highlightedIndex ? 'bg-blue-100' : 'hover:bg-zinc-50'}`}
                onMouseDown={e => { e.preventDefault(); commit(opt); }}
              >
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, []);

  const DayNightEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const [val, setVal] = useState(cell?.value || '');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const committedRef = useRef(false);
    const filtered = DAY_NIGHT_OPTIONS.filter(opt => opt.toLowerCase().includes(val.toLowerCase()));

    const commit = (value: string) => {
      committedRef.current = true;
      const match = DAY_NIGHT_OPTIONS.find(opt => opt.toLowerCase() === value.toLowerCase());
      onChange({ value: match || cell?.value || DAY_NIGHT_OPTIONS[0] });
      exitEditMode();
    };

    return (
      <div className="relative w-full h-full">
        <input
          type="text"
          value={val}
          onChange={e => { setVal(e.target.value); setHighlightedIndex(0); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              commit(filtered[0] ? filtered[highlightedIndex] : val);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlightedIndex(i => Math.max(i - 1, 0));
            }
            if (e.key === 'Escape') exitEditMode();
          }}
          onBlur={() => {
            if (!committedRef.current) {
              commit(filtered[0] ? filtered[highlightedIndex] : val);
            }
          }}
          autoFocus
          className="w-full h-full border-0 outline-none px-2 text-[13px]"
        />
        {filtered.length > 0 && filtered.length < DAY_NIGHT_OPTIONS.length && (
          <div className="absolute top-full left-0 w-full bg-white border border-zinc-200 shadow-lg z-50 overflow-y-auto">
            {filtered.map((opt, i) => (
              <div
                key={opt}
                className={`px-2 py-1 text-[13px] cursor-pointer ${i === highlightedIndex ? 'bg-blue-100' : 'hover:bg-zinc-50'}`}
                onMouseDown={e => { e.preventDefault(); commit(opt); }}
              >
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, []);

  const DEFAULT_WIDTHS = [60, 80, 80, 80, 180, 90, 300, 120, 200, 40];
  const colWidths = useRef<number[]>([...DEFAULT_WIDTHS]);
  const [widthVersion, setWidthVersion] = useState(0);

  const resizeRef = useRef<{ col: number; startX: number; startW: number } | null>(null);

  const CustomColIndicator: ColumnIndicatorComponent = useCallback(({ column, label }) => {
    const width = colWidths.current[column];
    const isResizing = resizeRef.current?.col === column;
    return (
      <th
        className="Spreadsheet__header"
        style={{ width, maxWidth: width, minWidth: width, position: 'relative', overflow: 'visible' }}
      >
        <div className="Spreadsheet__header-label">{label !== null ? label : ''}</div>
        <div
          className="column-resize-handle"
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
            resizeRef.current = { col: column, startX: e.clientX, startW: width };
            const handleMouseMove = (ev: MouseEvent) => {
              if (!resizeRef.current) return;
              const diff = ev.clientX - resizeRef.current.startX;
              const newW = Math.max(30, resizeRef.current.startW + diff);
              colWidths.current[resizeRef.current.col] = newW;
              setWidthVersion(v => v + 1);
            };
            const handleMouseUp = () => {
              resizeRef.current = null;
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        />
      </th>
    );
  }, [widthVersion]);

  const widthStyle = useMemo(() => {
    const cols = COLUMNS.map((_, i) => {
      const w = colWidths.current[i] || DEFAULT_WIDTHS[i] || 100;
      return `.Spreadsheet th:nth-child(${i + 1}), .Spreadsheet td:nth-child(${i + 1}) { width: ${w}px; min-width: ${w}px; max-width: ${w}px; }`;
    }).join('\n');
    return cols;
  }, [widthVersion]);

  const data = useMemo((): CellBase[][] => {
    const rows = scenes.map(scene => [
      { value: scene.sceneNumber },
      { value: scene.pageCount, DataEditor: PageCountEditor },
      { value: scene.scriptDay },
      { value: scene.intExt, DataEditor: IntExtEditor },
      { value: scene.set, DataEditor: SetEditor },
      { value: scene.dayNight, DataEditor: DayNightEditor },
      { value: scene.description },
      { value: scene.cast },
      { value: scene.notes },
      { value: '', readOnly: true, DataViewer: DeleteViewer },
    ]);
    rows.push(COLUMNS.map((c, i) => {
      if (i >= ACTIONS_COL) return { value: '', readOnly: true };
      if (i === 1) return { value: '', DataEditor: PageCountEditor };
      if (i === 3) return { value: '', DataEditor: IntExtEditor };
      if (i === 4) return { value: '', DataEditor: SetEditor };
      if (i === 5) return { value: '', DataEditor: DayNightEditor };
      return { value: '' };
    }));
    return rows;
  }, [scenes, IntExtEditor, DayNightEditor, DeleteViewer, PageCountEditor, SetEditor]);

  const handleChange = useCallback((newData: CellBase[][]) => {
    const phantomIndex = scenes.length;
    const phantomRow = newData[phantomIndex];

    if (phantomRow) {
      const hasContent = phantomRow.slice(0, ACTIONS_COL).some(c => {
        const v = c?.value;
        return v !== undefined && v !== null && String(v).trim() !== '';
      });
      if (hasContent) {
        const newScene: Partial<Record<string, any>> = { shootDay: null };
        for (let col = 0; col < ACTIONS_COL; col++) {
          const val = phantomRow[col]?.value ?? '';
          newScene[COLUMNS[col].key] = val;
        }
        newScene.id = generateUUID();
        const decimal = parsePageCount(newScene.pageCount || '1');
        newScene.pageCount = formatPageCount(decimal);
        newScene.pageCountDecimal = decimal;
        newScene.scriptDay = (newScene.scriptDay || '').replace(/[^0-9]/g, '');
        dispatch({ type: 'ADD_SCENE', payload: newScene as Scene });
        return;
      }
    }

    for (let row = 0; row < Math.min(scenes.length, newData.length); row++) {
      for (let col = 0; col < ACTIONS_COL; col++) {
        const colDef = COLUMNS[col];
        const oldVal = String((scenes as any)[row][colDef.key] ?? '');
        const newVal = String(newData[row]?.[col]?.value ?? '');
        if (newVal !== oldVal) {
          const updates: any = { [colDef.key]: newVal };
          if (colDef.key === 'pageCount') {
            const decimal = parsePageCount(newVal);
            updates.pageCountDecimal = decimal;
            updates.pageCount = formatPageCount(decimal);
          }
          if (colDef.key === 'scriptDay') {
            updates.scriptDay = newVal.replace(/[^0-9]/g, '');
          }
          if (colDef.key === 'set') {
            updates.set = newVal.toUpperCase();
          }
          if (colDef.key === 'intExt') {
            const match = INT_EXT_OPTIONS.find(opt => opt.toLowerCase() === newVal.toLowerCase());
            if (match) updates.intExt = match;
          }
          if (colDef.key === 'dayNight') {
            const match = DAY_NIGHT_OPTIONS.find(opt => opt.toLowerCase() === newVal.toLowerCase());
            if (match) updates.dayNight = match;
          }
          dispatch({ type: 'UPDATE_SCENE', payload: { id: scenes[row].id, ...updates } });
        }
      }
    }
  }, [scenes, dispatch]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const imported: Scene[] = results.data.map((row: any) => ({
          id: generateUUID(),
          sceneNumber: typeof row['Scene #'] === 'string' ? row['Scene #'] : typeof row['Scene'] === 'string' ? row['Scene'] : String(row['Scene'] || row['Scene #'] || ''),
          pageCount: formatPageCount(parsePageCount(row['Pages'] || '1')),
          pageCountDecimal: parsePageCount(row['Pages'] || '1'),
          scriptDay: row['Script Day'] || '',
          intExt: (row['I/E'] || 'INT') as any,
          set: row['Set'] || '',
          dayNight: (row['D/N'] || 'DAY') as any,
          description: row['Description'] || '',
          cast: row['Cast'] || '',
          notes: row['Notes'] || '',
          shootDay: null
        }));
        if (imported.length > 0) {
          dispatch({ type: 'IMPORT_SCENES', payload: imported });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const addScene = () => {
    dispatch({
      type: 'ADD_SCENE',
      payload: {
        id: generateUUID(),
        sceneNumber: '',
        pageCount: '1',
        pageCountDecimal: 1.0,
        scriptDay: '1',
        intExt: 'INT',
        set: 'NEW SET',
        dayNight: 'DAY',
        description: 'New scene',
        cast: '',
        notes: '',
        shootDay: null
      }
    });
  };

  const totalPagesDecimal = scenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 border-x border-zinc-200 shadow-xl overflow-hidden relative">
      <div className="flex-1 overflow-auto bg-white">
        <div className="min-w-[800px]">
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
              position: sticky;
              top: 0;
              z-index: 10;
            }
            .Spreadsheet__header-row th {
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
            tr:hover .Spreadsheet__cell {
              background: #fafafa;
            }
            tr:hover .Spreadsheet__cell--selected,
            tr:hover .Spreadsheet__cell--active {
              background: transparent;
            }
            .Spreadsheet__cell--readonly {
              background: white;
            }
            .column-resize-handle {
              position: absolute;
              top: 0;
              right: -3px;
              width: 6px;
              height: 100%;
              cursor: col-resize;
              z-index: 20;
              background: transparent;
            }
            .column-resize-handle:hover,
            .column-resize-handle:active {
              background: rgba(37, 99, 235, 0.3);
            }
            ${widthStyle}
          `}</style>
          <Spreadsheet
            data={data}
            onChange={handleChange}
            columnLabels={COLUMNS.map(c => c.label)}
            hideRowIndicators
            ColumnIndicator={CustomColIndicator}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                addScene();
              }
            }}
          />
        </div>
      </div>

      <div className="bg-zinc-100 border-t border-zinc-300 p-3 flex items-center justify-between shadow-inner">
        <div className="flex items-center space-x-4">
          <button onClick={addScene} className="bg-zinc-900 border-2 border-transparent text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-800 transition-colors">
            + Add Scene
          </button>
          <button onClick={() => dispatch({type: 'SORT_SCENES'})} className="bg-white border border-zinc-300 px-4 py-1.5 text-zinc-700 rounded text-sm hover:bg-zinc-50 transition-colors">
            Sort by Scene #
          </button>
          <div className="relative">
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImport} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-zinc-300 px-3 py-1.5 text-zinc-700 rounded text-sm hover:bg-zinc-50 transition-colors">
              Import CSV
            </button>
          </div>
        </div>
        <div className="flex font-mono text-xs items-center space-x-8 text-zinc-600">
          <div className="flex flex-col">
            <span className="uppercase text-[10px] text-zinc-400 font-semibold tracking-widest">Scenes</span>
            <span className="text-zinc-900 font-medium text-sm">{scenes.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="uppercase text-[10px] text-zinc-400 font-semibold tracking-widest">Total Pages</span>
            <span className="text-zinc-900 font-medium text-sm">{formatPageCount(totalPagesDecimal)} <span className="text-zinc-400 font-normal">({totalPagesDecimal.toFixed(3)})</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
