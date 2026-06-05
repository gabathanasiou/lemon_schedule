import React, { useState, useCallback, useRef, useMemo } from 'react';
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

const ACTIONS_COL = 2;

export function ElementManager() {
  const { state, dispatch } = useProject();
  const project = state.present;

  const [category, setCategory] = useState('cast');

  const storedElements: ProjectElement[] = project.breakdownElements?.[category] || [];
  const scenes = project.scenes;

  const elements = useMemo(() => {
    if (storedElements.length > 0) return storedElements.sort(sortElements);
    if (category === 'cast') {
      const sceneIds = getElementsFromScenes(scenes, 'cast');
      const merged = new Map<string, ProjectElement>();
      for (const e of sceneIds) merged.set(e.id, e);
      for (const m of project.castMembers) merged.set(m.id, { id: m.id, name: m.name });
      return [...merged.values()].sort(sortElements);
    }
    return getElementsFromScenes(scenes, category);
  }, [storedElements, scenes, category, project.castMembers]);

  const catItems = useMemo(() => ELEMENT_CATEGORIES.map(c => ({ id: c.key, name: c.label })), []);

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

  const DeleteViewer: DataViewerComponent<CellBase<string>> = useCallback(({ row }) => {
    const m = elements[row];
    if (!m) return null;
    return (
      <div className="flex items-center justify-center h-full w-full cursor-pointer hover:bg-red-50 transition-colors"
        onMouseDown={e => { e.stopPropagation(); dispatch({ type: 'DELETE_ELEMENT', payload: { category, id: m.id } }); }}>
        <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-600 transition-colors" />
      </div>
    );
  }, [elements, dispatch, category]);

  const data: CellBase[][] = useMemo(() => {
    const rows = elements.map(m => [
      { value: m.id },
      { value: m.name, DataEditor: NameEditor },
      { value: '', readOnly: true, DataViewer: DeleteViewer },
    ]);
    rows.push([
      { value: '' },
      { value: '', DataEditor: NameEditor },
      { value: '', readOnly: true },
    ]);
    return rows;
  }, [elements, NameEditor, DeleteViewer]);

  const handleChange = useCallback((newData: CellBase[][]) => {
    const phantomRow = newData[elements.length];
    if (phantomRow) {
      const hasContent = phantomRow.slice(0, ACTIONS_COL).some(c => {
        const v = c?.value; return v !== undefined && v !== null && String(v).trim() !== '';
      });
      if (hasContent) {
        const newId = String(phantomRow[0]?.value ?? '').trim();
        const newName = String(phantomRow[1]?.value ?? '').trim().toUpperCase();
        if (!newId && !newName) return;
        const maxId = elements.reduce((max, e) => { const n = parseInt(e.id, 10); return isNaN(n) ? max : Math.max(max, n); }, 0);
        const id = newId || String(maxId + 1);
        dispatch({ type: 'ADD_ELEMENT', payload: { category, element: { id, name: newName || id } } });
        return;
      }
    }

    for (let row = 0; row < Math.min(elements.length, newData.length); row++) {
      const newId = String(newData[row]?.[0]?.value ?? '');
      const newName = String(newData[row]?.[1]?.value ?? '').toUpperCase();
      const orig = elements[row];
      if (newId !== orig.id || newName !== orig.name) {
        dispatch({ type: 'UPDATE_ELEMENT', payload: { category, id: orig.id, updates: { id: newId || orig.id, name: newName || orig.name } } });
      }
    }
  }, [elements, dispatch, category]);

  const add = useCallback(() => {
    const maxId = elements.reduce((max, e) => { const n = parseInt(e.id, 10); return isNaN(n) ? max : Math.max(max, n); }, 0);
    dispatch({ type: 'ADD_ELEMENT', payload: { category, element: { id: String(maxId + 1), name: '' } } });
  }, [elements, dispatch, category]);

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
          columnLabels={['ID', 'Name', '']}
        />
      </div>

      <div className="bg-zinc-100 border-t border-zinc-300 p-3 flex items-center shadow-inner">
        <button onClick={add} className="bg-zinc-900 border-2 border-transparent text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-800 transition-colors">
          + Add {ELEMENT_CATEGORIES.find(c => c.key === category)?.label || 'Element'}
        </button>
        <span className="ml-4 text-xs text-zinc-500 uppercase tracking-wider font-mono">
          {elements.length} {elements.length === 1 ? 'element' : 'elements'}
        </span>
        {storedElements.length === 0 && elements.length > 0 && (
          <span className="ml-3 text-xs text-zinc-400 italic">
            Auto-populated from scenes
          </span>
        )}
      </div>
    </div>
  );
}

function sortElements(a: ProjectElement, b: ProjectElement) {
  const na = parseInt(a.id, 10), nb = parseInt(b.id, 10);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}
