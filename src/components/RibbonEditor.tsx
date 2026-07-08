import React, { useState, useCallback, useMemo } from 'react';
import { useProject } from '../store';
import { SceneRibbonColumn, SCENE_RIBBON_DEFAULTS } from '../types';
import { Plus, Trash2, GripVertical } from 'lucide-react';

const AVAILABLE_KEYS: { key: string; label: string }[] = [
  { key: 'sceneNumber', label: 'Scene #' },
  { key: 'duration', label: 'Duration' },
  { key: 'intExt', label: 'I/E' },
  { key: 'set', label: 'Set' },
  { key: 'dayNight', label: 'D/N' },
  { key: 'cast', label: 'Cast' },
  { key: 'pageCount', label: 'Pages' },
  { key: 'description', label: 'Synopsis' },
  { key: 'notes', label: 'Notes' },
  { key: 'props', label: 'Props' },
  { key: 'wardrobe', label: 'Wardrobe' },
  { key: 'makeup', label: 'Makeup' },
  { key: 'backgroundActors', label: 'Background Actors' },
  { key: 'stunts', label: 'Stunts' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'sfx', label: 'SFX' },
  { key: 'vfx', label: 'VFX' },
  { key: 'sound', label: 'Sound' },
  { key: 'music', label: 'Music' },
  { key: 'animalsAndWranglers', label: 'Animals & Wranglers' },
  { key: 'weapons', label: 'Weapons' },
  { key: 'greenery', label: 'Greenery' },
  { key: 'artDept', label: 'Art Dept' },
];

export function RibbonEditor() {
  const { state, dispatch } = useProject();
  const project = state.present;
  const ribbon = project.sceneRibbon || SCENE_RIBBON_DEFAULTS;

  const updateRibbon = useCallback((columns: SceneRibbonColumn[]) => {
    dispatch({ type: 'UPDATE_SCENE_RIBBON', payload: columns });
  }, [dispatch]);

  const addColumn = (key: string) => {
    if (ribbon.some(c => c.key === key)) return;
    updateRibbon([...ribbon, { key, width: 80 }]);
  };

  const removeColumn = (key: string) => {
    updateRibbon(ribbon.filter(c => c.key !== key));
  };

  const setWidth = (key: string, w: number) => {
    updateRibbon(ribbon.map(c => c.key === key ? { ...c, width: Math.max(30, w) } : c));
  };

  const moveColumn = (key: string, direction: -1 | 1) => {
    const idx = ribbon.findIndex(c => c.key === key);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ribbon.length) return;
    const next = [...ribbon];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    updateRibbon(next);
  };

  const reset = () => updateRibbon(SCENE_RIBBON_DEFAULTS);

  const unused = useMemo(() => {
    const hiddenSet = new Set(project.hiddenCategories || []);
    return AVAILABLE_KEYS.filter(a => !ribbon.some(c => c.key === a.key) && !hiddenSet.has(a.key));
  }, [ribbon, project.hiddenCategories]);

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
      <div className="max-w-2xl mx-auto w-full flex flex-col h-full px-4 py-4 gap-3">
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm">
          <span className="text-xs font-bold text-zinc-700">Scene Ribbon Columns</span>
          <button onClick={reset} className="text-[11px] text-zinc-500 hover:text-zinc-900 font-medium">Reset to Default</button>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl bg-white border border-zinc-200/80 shadow-sm flex flex-col">
          <div className="flex-1 overflow-auto p-3 space-y-1">
            {ribbon.map((col, idx) => {
              const info = AVAILABLE_KEYS.find(a => a.key === col.key);
              return (
                <div key={col.key} className="flex items-center gap-2 px-2 py-1.5 bg-zinc-50 rounded-lg border border-zinc-200 group">
                  <GripVertical className="w-3 h-3 text-zinc-400 shrink-0" />
                  <span className="flex-1 text-xs font-medium text-zinc-700">{info?.label || col.key}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveColumn(col.key, -1)} disabled={idx === 0} className="p-0.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-20">←</button>
                    <button onClick={() => moveColumn(col.key, 1)} disabled={idx === ribbon.length - 1} className="p-0.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-20">→</button>
                  </div>
                  <input
                    type="number"
                    value={col.width}
                    onChange={e => setWidth(col.key, parseInt(e.target.value) || 30)}
                    className="w-14 border border-zinc-200 rounded px-1.5 py-0.5 text-[10px] text-right"
                    title="Width (px)"
                  />
                  <button onClick={() => removeColumn(col.key)} className="p-0.5 text-zinc-400 hover:text-red-500 hover-reveal transition-opacity">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-zinc-200 bg-zinc-50">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 px-1">Add Column</div>
            <div className="flex flex-wrap gap-1">
              {unused.map(a => (
                <button key={a.key} onClick={() => addColumn(a.key)} className="px-2 py-1 text-[10px] bg-white border border-zinc-200 rounded hover:bg-zinc-100 text-zinc-600">
                  + {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
