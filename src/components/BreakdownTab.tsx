import React, { useRef, useMemo, useCallback } from 'react';
import Spreadsheet, { CellBase, DataViewerComponent, DataEditorComponent } from 'react-spreadsheet';
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
    if (window.confirm("Delete scene?")) {
      dispatch({ type: 'DELETE_SCENE', payload: id });
    }
  }, [dispatch]);

  const DeleteViewer: DataViewerComponent<CellBase<string>> = useCallback(({ row }) => {
    const scene = scenes[row];
    if (!scene) return null;
    return (
      <div
        className="flex items-center justify-center h-full w-full cursor-pointer hover:bg-red-50 transition-colors"
        onMouseDown={e => { e.stopPropagation(); deleteScene(scene.id); }}
      >
        <Trash2 className="w-4 h-4 text-red-600/0 hover:text-red-600 transition-colors" />
      </div>
    );
  }, [scenes, deleteScene]);

  const IntExtEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    return (
      <select
        value={cell?.value || 'INT'}
        onChange={e => { onChange({ value: e.target.value }); exitEditMode(); }}
        autoFocus
        className="w-full h-full bg-white border-0 outline-none cursor-pointer text-[13px] px-2"
      >
        {INT_EXT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }, []);

  const DayNightEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    return (
      <select
        value={cell?.value || 'DAY'}
        onChange={e => { onChange({ value: e.target.value }); exitEditMode(); }}
        autoFocus
        className="w-full h-full bg-white border-0 outline-none cursor-pointer text-[13px] px-2"
      >
        {DAY_NIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }, []);

  const data = useMemo((): CellBase[][] => {
    const rows = scenes.map(scene => [
      { value: scene.sceneNumber },
      { value: scene.pageCount },
      { value: scene.scriptDay },
      { value: scene.intExt, DataEditor: IntExtEditor },
      { value: scene.set },
      { value: scene.dayNight, DataEditor: DayNightEditor },
      { value: scene.description },
      { value: scene.cast },
      { value: scene.notes },
      { value: '', readOnly: true, DataViewer: DeleteViewer },
    ]);
    rows.push(COLUMNS.map((c, i) => i < ACTIONS_COL ? { value: '' } : { value: '', readOnly: true }));
    return rows;
  }, [scenes, IntExtEditor, DayNightEditor, DeleteViewer]);

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
        newScene.pageCountDecimal = parsePageCount(newScene.pageCount || '1');
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
            updates.pageCountDecimal = parsePageCount(newVal);
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
          pageCount: row['Pages'] || '1',
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
            }
            .Spreadsheet__header-row {
              background: white;
              border-bottom: 2px solid #0a0a0a;
              position: sticky;
              top: 0;
              z-index: 10;
            }
            .Spreadsheet__header-row th {
              padding: 8px 6px;
              font-family: ui-monospace, monospace;
              font-size: 12px;
              font-weight: 600;
              text-align: left;
              border-right: 1px solid #e4e4e7;
              color: #18181b;
              white-space: nowrap;
            }
            .Spreadsheet__cell {
              border: none;
              border-right: 1px solid #e4e4e7;
              border-bottom: 1px solid #e4e4e7;
              padding: 0;
              height: 34px;
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
          `}</style>
          <Spreadsheet
            data={data}
            onChange={handleChange}
            columnLabels={COLUMNS.map(c => c.label)}
            hideRowIndicators
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
