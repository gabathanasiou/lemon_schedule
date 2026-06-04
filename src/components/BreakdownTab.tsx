import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import Spreadsheet, { CellBase, DataViewerComponent, DataEditorComponent, ColumnIndicatorComponent, Selection, EntireRowsSelection, RangeSelection } from 'react-spreadsheet';
import { useProject } from '../store';
import { Scene, IntExt, DayNight, CastMember } from '../types';
import { generateUUID, formatPageCount, parsePageCount } from '../lib/utils';
import { Trash2, Copy, Scissors, ClipboardPaste, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import Papa from 'papaparse';
import { CastTab } from './CastTab';

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
const ACTIONS_COL = 9;
const INT_EXT_COL = 3;
const DAY_NIGHT_COL = 5;
const CAST_COL = 7;

export function BreakdownTab() {
  const { state, dispatch } = useProject();
  const project = state.present;
  const scenes = project.scenes;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subTab, setSubTab] = useState<'scenes' | 'cast'>('scenes');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number } | null>(null);

  const deleteScene = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SCENE', payload: id });
  }, [dispatch]);

  const insertSceneAt = (index: number) => {
    const newScene: Scene = {
      id: generateUUID(),
      sceneNumber: '',
      pageCount: '1',
      pageCountDecimal: 1.0,
      scriptDay: '1',
      intExt: 'INT' as IntExt,
      set: 'NEW SET',
      dayNight: 'DAY' as DayNight,
      description: 'New scene',
      cast: '',
      notes: '',
      shootDay: null
    };
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index, scene: newScene } });
  };

  const duplicateSceneAt = (index: number) => {
    const original = scenes[index];
    if (!original) return;
    const duplicate: Scene = { ...original, id: generateUUID() };
    const base = original.sceneNumber.replace(/[A-Z]+$/, '');
    const used = scenes.filter(s => s.id !== original.id && s.sceneNumber.match(new RegExp('^' + base + '[A-Z]$'))).map(s => s.sceneNumber.slice(-1));
    let letter = 'A';
    for (let c = 65; c <= 90; c++) { if (!used.includes(String.fromCharCode(c))) { letter = String.fromCharCode(c); break; } }
    duplicate.sceneNumber = base + letter;
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index: index + 1, scene: duplicate } });
  };

  const deleteSelectedRows = () => {
    const indices = [...selectedRows].sort((a: number, b: number) => b - a);
    for (const idx of indices) {
      if (idx < scenes.length) deleteScene(scenes[idx].id);
    }
  };

  const cleanEmptyRows = () => {
    const toDelete: string[] = [];
    for (const s of scenes) {
      const isEmpty = !s.sceneNumber && !s.set && !s.description && !s.cast && !s.notes && s.pageCount === '1' && s.intExt === 'INT' && s.dayNight === 'DAY';
      if (isEmpty) toDelete.push(s.id);
    }
    for (const id of toDelete) dispatch({ type: 'DELETE_SCENE', payload: id });
  };

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

  const CastEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const [val, setVal] = useState(cell?.value || '');
    const committedRef = useRef(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const castMembers = project.castMembers || [];
    const currentIds = val.split(',').map(x => x.trim()).filter(Boolean);

    const sorted = [...castMembers].sort((a, b) => {
      const aSel = currentIds.includes(a.id);
      const bSel = currentIds.includes(b.id);
      if (aSel !== bSel) return aSel ? -1 : 1;
      const na = parseInt(a.id, 10);
      const nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });

    const toggle = (id: string) => {
      setVal(prev => {
        const ids = prev.split(',').map(x => x.trim()).filter(Boolean);
        const idx = ids.indexOf(id);
        if (idx >= 0) ids.splice(idx, 1);
        else ids.push(id);
        return ids.join(', ');
      });
    };

    const commit = () => {
      if (committedRef.current) return;
      committedRef.current = true;
      onChange({ value: val.split(',').map(x => x.trim()).filter(Boolean).join(', ') });
      exitEditMode();
    };

    useEffect(() => {
      const onClick = (e: MouseEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) commit();
      };
      document.addEventListener('mousedown', onClick);
      return () => document.removeEventListener('mousedown', onClick);
    }, [val, commit]);

    return (
      <div ref={wrapperRef} className="relative w-full h-full">
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') exitEditMode();
          }}
          onBlur={() => commit()}
          autoFocus
          className="w-full h-full border-0 outline-none px-2 text-[13px] font-mono"
          placeholder="1, 2, JOHN"
        />
        <div className="absolute top-full left-0 min-w-[220px] bg-white border border-zinc-200 shadow-lg z-50 max-h-64 overflow-y-auto">
          {sorted.map(m => {
            const checked = currentIds.includes(m.id);
            return (
              <div
                key={m.id}
                className={`px-2 py-1 text-[13px] cursor-pointer flex items-center gap-2 font-mono hover:bg-zinc-50 ${checked ? 'bg-blue-50' : ''}`}
                onMouseDown={e => { e.preventDefault(); toggle(m.id); }}
              >
                <span className="text-zinc-400 shrink-0 w-12 text-right">{m.id}.</span>
                <span className={checked ? 'text-blue-700 font-semibold' : 'text-zinc-600'}>{m.name || <span className="italic text-zinc-400">—</span>}</span>
              </div>
            );
          })}
          <div className="px-2 py-1 text-[11px] text-zinc-400 text-center border-t border-zinc-100">
            Tab or Enter to confirm
          </div>
        </div>
      </div>
    );
  }, [project.castMembers]);

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
    const initialVal = cell?.value || '';
    const setOptions = useMemo(() => {
      const sets = new Set(scenes.map(s => s.set.toUpperCase()).filter(Boolean));
      return [...sets].sort();
    }, [scenes]);
    const initialIdx = setOptions.indexOf(initialVal.toUpperCase());
    const [val, setVal] = useState(initialVal);
    const [highlightedIndex, setHighlightedIndex] = useState(initialIdx >= 0 ? initialIdx : 0);
    const committedRef = useRef(false);
    const filtered = setOptions.filter(opt => opt.includes(val.toUpperCase()));

    const commit = (value: string) => {
      committedRef.current = true;
      const match = setOptions.find(opt => opt === value.toUpperCase()) || value.toUpperCase();
      onChange({ value: match });
      exitEditMode();
    };

    return (
      <div className="relative w-full h-full">
        <input
          type="text"
          value={val}
          onChange={e => { setVal(e.target.value.toUpperCase()); setHighlightedIndex(0); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              commit(filtered[0] ? filtered[highlightedIndex] : val);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlightedIndex(i => Math.min(i + 1, setOptions.length - 1));
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
        <div className="absolute top-full left-0 w-full bg-white border border-zinc-200 shadow-lg z-50 max-h-48 overflow-y-auto">
          {setOptions.map((opt, i) => (
            <div
              key={opt}
              className={`px-2 py-1 text-[13px] cursor-pointer uppercase ${i === highlightedIndex ? 'bg-blue-100' : 'hover:bg-zinc-50'}`}
              onMouseDown={e => { e.preventDefault(); commit(opt); }}
            >
              {opt}
            </div>
          ))}
          <div className="px-2 py-1 text-[11px] text-zinc-400 text-center border-t border-zinc-100">
            Tab or Enter to confirm
          </div>
        </div>
      </div>
    );
  }, [scenes]);

  const IntExtEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const initialVal = cell?.value || '';
    const initialIdx = INT_EXT_OPTIONS.findIndex(opt => opt.toLowerCase() === initialVal.toLowerCase());
    const [val, setVal] = useState(initialVal);
    const [highlightedIndex, setHighlightedIndex] = useState(initialIdx >= 0 ? initialIdx : 0);
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
              setHighlightedIndex(i => Math.min(i + 1, INT_EXT_OPTIONS.length - 1));
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
        <div className="absolute top-full left-0 w-full bg-white border border-zinc-200 shadow-lg z-50 max-h-48 overflow-y-auto">
          {INT_EXT_OPTIONS.map((opt, i) => (
            <div
              key={opt}
              className={`px-2 py-1 text-[13px] cursor-pointer ${i === highlightedIndex ? 'bg-blue-100' : 'hover:bg-zinc-50'}`}
              onMouseDown={e => { e.preventDefault(); commit(opt); }}
            >
              {opt}
            </div>
          ))}
          <div className="px-2 py-1 text-[11px] text-zinc-400 text-center border-t border-zinc-100">
            Tab or Enter to confirm
          </div>
        </div>
      </div>
    );
  }, []);

  const DayNightEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const initialVal = cell?.value || '';
    const initialIdx = DAY_NIGHT_OPTIONS.findIndex(opt => opt.toLowerCase() === initialVal.toLowerCase());
    const [val, setVal] = useState(initialVal);
    const [highlightedIndex, setHighlightedIndex] = useState(initialIdx >= 0 ? initialIdx : 0);
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
              setHighlightedIndex(i => Math.min(i + 1, DAY_NIGHT_OPTIONS.length - 1));
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
        <div className="absolute top-full left-0 w-full bg-white border border-zinc-200 shadow-lg z-50 max-h-48 overflow-y-auto">
          {DAY_NIGHT_OPTIONS.map((opt, i) => (
            <div
              key={opt}
              className={`px-2 py-1 text-[13px] cursor-pointer ${i === highlightedIndex ? 'bg-blue-100' : 'hover:bg-zinc-50'}`}
              onMouseDown={e => { e.preventDefault(); commit(opt); }}
            >
              {opt}
            </div>
          ))}
          <div className="px-2 py-1 text-[11px] text-zinc-400 text-center border-t border-zinc-100">
            Tab or Enter to confirm
          </div>
        </div>
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
      { value: scene.cast, DataEditor: CastEditor },
      { value: scene.notes },
      { value: '', readOnly: true, DataViewer: DeleteViewer },
    ]);
    rows.push(COLUMNS.map((c, i) => {
      if (i >= ACTIONS_COL) return { value: '', readOnly: true };
      if (i === 1) return { value: '', DataEditor: PageCountEditor };
      if (i === 3) return { value: '', DataEditor: IntExtEditor };
      if (i === 4) return { value: '', DataEditor: SetEditor };
      if (i === 5) return { value: '', DataEditor: DayNightEditor };
      if (i === CAST_COL) return { value: '', DataEditor: CastEditor };
      return { value: '' };
    }));
    return rows;
  }, [scenes, IntExtEditor, DayNightEditor, DeleteViewer, PageCountEditor, SetEditor, CastEditor]);

  const RowIndicator: React.FC<{ row: number; label?: React.ReactNode; selected: boolean; onSelect: (row: number, extend: boolean) => void }> = useCallback(({ row, selected }) => (
    <td
      className={`Spreadsheet__header text-center cursor-pointer select-none text-zinc-400 hover:text-zinc-600 transition-colors ${selected ? 'bg-blue-50' : ''}`}
      style={{ width: 28, minWidth: 28, maxWidth: 28, fontSize: 10 }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, row });
      }}
    >≡</td>
  ), []);

  const handleChange = useCallback((newData: CellBase[][]) => {
    const phantomIndex = scenes.length;

    // Process all pasted/extra rows beyond existing scenes
    let createdAny = false;
    for (let row = phantomIndex; row < newData.length; row++) {
      const row_data = newData[row];
      if (!row_data) continue;
      const hasContent = row_data.slice(0, ACTIONS_COL).some(c => {
        const v = c?.value;
        return v !== undefined && v !== null && String(v).trim() !== '';
      });
      if (!hasContent) continue;
      const newScene: Partial<Record<string, any>> = { shootDay: null };
      for (let col = 0; col < ACTIONS_COL; col++) {
        const val = row_data[col]?.value ?? '';
        newScene[COLUMNS[col].key] = val;
      }
      newScene.id = generateUUID();
      const decimal = parsePageCount(newScene.pageCount || '1');
      newScene.pageCount = formatPageCount(decimal);
      newScene.pageCountDecimal = decimal;
      newScene.scriptDay = (newScene.scriptDay || '').replace(/[^0-9]/g, '');
      dispatch({ type: 'ADD_SCENE', payload: newScene as Scene });
      createdAny = true;
    }

    if (createdAny) return;

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
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white">
        <button onClick={() => setSubTab('scenes')} className={`px-3 py-1 rounded-sm text-xs font-semibold ${subTab === 'scenes' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}>
          Scene Breakdown
        </button>
        <button onClick={() => setSubTab('cast')} className={`px-3 py-1 rounded-sm text-xs font-semibold ${subTab === 'cast' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}>
          Cast
        </button>
      </div>
      {subTab === 'cast' ? <CastTab /> : (
        <>
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
            RowIndicator={RowIndicator}
            ColumnIndicator={CustomColIndicator}
            onSelect={(sel) => {
              if (sel instanceof EntireRowsSelection) {
                const range = sel.toRange(data);
                if (range) {
                  const rows = new Set<number>();
                  for (let r = range.start.row; r <= range.end.row; r++) rows.add(r);
                  setSelectedRows(rows);
                }
              } else if (sel instanceof RangeSelection) {
                const rows = new Set<number>();
                for (let r = sel.range.start.row; r <= sel.range.end.row; r++) rows.add(r);
                setSelectedRows(rows);
              } else {
                setSelectedRows(new Set());
              }
            }}
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
          <button onClick={cleanEmptyRows} className="bg-white border border-zinc-300 px-3 py-1.5 text-zinc-500 rounded text-sm hover:bg-zinc-50 transition-colors">
            Clean Empty Rows
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
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed bg-white border border-zinc-200 shadow-xl rounded-lg py-1 z-[9999] text-sm text-zinc-700 min-w-[180px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {contextMenu.row < scenes.length && (
              <>
                <button onClick={() => { insertSceneAt(contextMenu.row); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 flex items-center gap-2">
                  <Plus className="w-3 h-3 text-zinc-400" /> Insert Above
                </button>
                <button onClick={() => { insertSceneAt(contextMenu.row + 1); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 flex items-center gap-2">
                  <ArrowDown className="w-3 h-3 text-zinc-400" /> Insert Below
                </button>
                <button onClick={() => { duplicateSceneAt(contextMenu.row); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 flex items-center gap-2">
                  <Copy className="w-3 h-3 text-zinc-400" /> Duplicate
                </button>
                <div className="h-[1px] bg-zinc-200 my-1" />
              </>
            )}
            {selectedRows.size > 0 && (
              <button onClick={() => { deleteSelectedRows(); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2">
                <Trash2 className="w-3 h-3" /> Delete {selectedRows.size > 1 ? `${selectedRows.size} rows` : 'Row'}
              </button>
            )}
            {contextMenu.row >= scenes.length && (
              <button onClick={() => { addScene(); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 flex items-center gap-2">
                <Plus className="w-3 h-3 text-zinc-400" /> Add Scene
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
