import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Spreadsheet, { CellBase, DataViewerComponent, DataEditorComponent } from 'react-spreadsheet';
import { useProject } from '../store';
import { ProjectElement } from '../types';
import { getElementsFromScenes } from '../store';
import { Trash2 } from 'lucide-react';
import { EntityDropdown } from './EntityDropdown';

const ELEMENT_CATEGORIES = [
  { key: 'cast', label: 'Cast', sceneKey: 'cast' },
  { key: 'set', label: 'Sets', sceneKey: 'set' },
  { key: 'props', label: 'Props', sceneKey: 'props' },
  { key: 'extras', label: 'Supporting Artists', sceneKey: 'extras' },
  { key: 'stunts', label: 'Stunts', sceneKey: 'stunts' },
  { key: 'vehicles', label: 'Vehicles', sceneKey: 'vehicles' },
  { key: 'wardrobe', label: 'Wardrobe', sceneKey: 'wardrobe' },
  { key: 'makeup', label: 'Makeup & Hair', sceneKey: 'makeup' },
  { key: 'sfx', label: 'SFX', sceneKey: 'sfx' },
  { key: 'vfx', label: 'VFX', sceneKey: 'vfx' },
  { key: 'sound', label: 'Sound', sceneKey: 'sound' },
  { key: 'music', label: 'Music / Playback', sceneKey: 'music' },
  { key: 'animals', label: 'Animals', sceneKey: 'animals' },
  { key: 'weapons', label: 'Weapons / Armoury', sceneKey: 'weapons' },
  { key: 'greenery', label: 'Greenery / Set Dressing', sceneKey: 'greenery' },
  { key: 'artDept', label: 'Art Department', sceneKey: 'artDept' },
];

function loadCategoryElements(project: any, category: string): ProjectElement[] {
  const stored = (project.breakdownElements || {})[category];
  if (stored && stored.length > 0) return [...stored];
  if (category === 'cast') {
    const sceneIds = getElementsFromScenes(project.scenes, 'cast');
    const merged = new Map<string, ProjectElement>();
    for (const e of sceneIds) merged.set(e.id, { id: e.id, name: '' });
    for (const m of project.castMembers || []) merged.set(m.id, { id: m.id, name: m.name });
    return [...merged.values()];
  }
  return getElementsFromScenes(project.scenes, category).map(e => ({ id: '', name: e.name }));
}

interface LocalRow {
  key: string;
  id: string;
  name: string;
}

let keyCounter = 0;
function nextKey() { return String(++keyCounter); }

export function ElementManager() {
  const { state, dispatch } = useProject();
  const project = state.present;

  const [category, setCategory] = useState('cast');
  const [rows, setRows] = useState<LocalRow[]>(() =>
    loadCategoryElements(project, category).map(e => ({ key: nextKey(), id: e.id, name: e.name }))
  );
  const snapshotRef = useRef<LocalRow[]>(rows);
  const savingRef = useRef(false);

  useEffect(() => {
    if (savingRef.current) return;
    const loaded = loadCategoryElements(project, category);
    const localRows = loaded.map(e => ({ key: nextKey(), id: e.id, name: e.name }));
    setRows(localRows);
    snapshotRef.current = localRows;

    const stored = (project.breakdownElements || {})[category];
    const isEmpty = !stored || stored.length === 0;
    if (isEmpty && loaded.length > 0) {
      dispatch({ type: 'AUTO_POPULATE_ELEMENTS', payload: { category, elements: loaded } } as any);
    }
  }, [category, project, dispatch]);

  const hasChanges = useMemo(() => {
    const snap = snapshotRef.current;
    if (rows.length !== snap.length) return true;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].id !== snap[i].id || rows[i].name !== snap[i].name) return true;
    }
    return false;
  }, [rows]);

  const catItems = useMemo(() => ELEMENT_CATEGORIES.map(c => ({ id: c.key, name: c.label })), []);

  const deleteRow = useCallback((key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const NameEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
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

  const isCast = category === 'cast';
  const occurrences = useMemo(() => {
    const counts = new Map<string, number>();
    if (category === 'set') {
      for (const s of project.scenes) if (s.set.trim()) counts.set(s.set, (counts.get(s.set) || 0) + 1);
    } else if (isCast) {
      for (const s of project.scenes) for (const id of s.cast.split(',').map(x => x.trim()).filter(Boolean)) counts.set(id, (counts.get(id) || 0) + 1);
    } else {
      const field = category as keyof typeof project.scenes[0];
      for (const s of project.scenes) {
        const val = (s as any)[field] as string;
        if (!val) continue;
        for (const name of val.split(',').map(x => x.trim()).filter(Boolean)) counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    return counts;
  }, [project.scenes, category, isCast]);

  const DeleteViewer: DataViewerComponent<CellBase<string>> = useCallback(({ row }) => {
    const r = rows[row];
    if (!r) return null;
    return (
      <div className="flex items-center justify-center h-full w-full cursor-pointer hover:bg-red-50 transition-colors"
        onMouseDown={e => { e.stopPropagation(); deleteRow(r.key); }}>
        <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-600 transition-colors" />
      </div>
    );
  }, [rows, deleteRow]);

  const data: CellBase[][] = useMemo(() => {
    const result = rows.map(r => ({
      occ: occurrences.get(isCast ? r.id : r.name) || 0
    })).map(({ occ }, i) => [
      { value: rows[i].id },
      { value: rows[i].name, DataEditor: NameEditor },
      { value: occ, readOnly: true },
      { value: '', readOnly: true, DataViewer: DeleteViewer },
    ]);
    result.push([
      { value: '' },
      { value: '', DataEditor: NameEditor },
      { value: '', readOnly: true },
      { value: '', readOnly: true },
    ]);
    return result;
  }, [rows, NameEditor, DeleteViewer, occurrences, isCast]);

  const handleChange = useCallback((newData: CellBase[][]) => {
    const phantom = newData[rows.length];
    if (phantom) {
      const idVal = String(phantom[0]?.value ?? '').trim();
      const nameVal = String(phantom[1]?.value ?? '').trim().toUpperCase();
      if (idVal || nameVal) {
        setRows(prev => [...prev, { key: nextKey(), id: idVal || String(prev.length + 1), name: nameVal || idVal }]);
        return;
      }
    }
    setRows(prev => {
      const updated = prev.map((r, i) => {
        if (i >= newData.length) return r;
        const newId = String(newData[i]?.[0]?.value ?? '').trim();
        const newName = String(newData[i]?.[1]?.value ?? '').trim().toUpperCase();
        return { ...r, id: newId || r.id, name: newName || r.name };
      });
      return updated;
    });
  }, [rows.length]);

  const doSave = useCallback(() => {
    savingRef.current = true;
    const snap = snapshotRef.current;
    const snapMap = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
    const rowMap = new Map<string, LocalRow>(rows.map(r => [r.key, r]));

    for (const row of rows) {
      const orig = snapMap.get(row.key);
      if (!orig) {
        dispatch({ type: 'ADD_ELEMENT', payload: { category, element: { id: row.id, name: row.name } } });
      } else if (orig.id !== row.id || orig.name !== row.name) {
        dispatch({ type: 'UPDATE_ELEMENT', payload: { category, id: orig.id, updates: { id: row.id, name: row.name } } });
      }
    }
    for (const orig of snap) {
      if (!rowMap.has(orig.key)) {
        dispatch({ type: 'DELETE_ELEMENT', payload: { category, id: orig.id } });
      }
    }
    snapshotRef.current = rows.map(r => ({ ...r }));
    savingRef.current = false;
  }, [rows, category, dispatch]);

  const doRevert = useCallback(() => {
    setRows(snapshotRef.current.map(r => ({ ...r, key: nextKey() })));
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 overflow-hidden select-none">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 bg-white">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Category:</span>
        <div className="w-52">
          <EntityDropdown
            value={category}
            onChange={val => setCategory(val)}
            items={catItems}
            positioning="fixed"
            standalone
            mode="single"
            placeholder="Select category..."
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Spreadsheet
          data={data}
          onChange={handleChange}
          columnLabels={['ID', 'Name', 'Occ', '']}
        />
      </div>

      <div className="bg-zinc-100 border-t border-zinc-300 p-3 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-mono">
            {rows.length} {rows.length === 1 ? 'element' : 'elements'}
          </span>
          <button onClick={() => setRows(prev => [...prev].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })))} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Sort by ID
          </button>
          <button onClick={() => setRows(prev => {
            const maxNum = prev.reduce((max, r) => { const n = parseInt(r.id, 10); return isNaN(n) ? max : Math.max(max, n); }, 0);
            let next = maxNum + 1;
            return prev.map(r => r.id.trim() ? r : { ...r, id: String(next++) });
          })} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Auto-ID
          </button>
          <button onClick={() => setRows(prev => prev.filter(r => (occurrences.get(isCast ? r.id : r.name) || 0) > 0))} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Clear Zero
          </button>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button onClick={doRevert} className="px-4 py-1.5 rounded text-sm font-medium border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors">
              Revert
            </button>
          )}
          <button onClick={doSave} className={`px-4 py-1.5 rounded text-sm font-bold transition-colors ${hasChanges ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-zinc-200 text-zinc-400 cursor-default'}`}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
