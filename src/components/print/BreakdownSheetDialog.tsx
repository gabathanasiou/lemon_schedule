import React, { useState, useMemo } from 'react';
import { useProject } from '../../store';
import { Printer } from 'lucide-react';
import Modal from '../Modal';

export interface BreakdownSheetOptions {
  sortOrder: 'sheet' | 'scene';
  sceneIds: string[];
}

interface BreakdownSheetDialogProps {
  onPrint: (opts: BreakdownSheetOptions) => void;
  onClose: () => void;
}

export default function BreakdownSheetDialog({ onPrint, onClose }: BreakdownSheetDialogProps) {
  const { state } = useProject();
  const scenes = state.present.scenes;

  const [sortOrder, setSortOrder] = useState<'sheet' | 'scene'>('sheet');
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>(scenes.map(s => s.id));

  const sceneItems = useMemo(() => scenes.map(s => ({ id: s.id, name: `${s.sceneNumber} — ${s.set || s.description}` })), [scenes]);

  const toggleScene = (id: string) => {
    setSelectedSceneIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <Modal open onClose={onClose} title="Scene Breakdown" icon={<Printer className="w-4 h-4" />} width="max-w-xl">
      <div className="px-6 py-4 space-y-5">
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 space-y-4">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-3 block">
              Sort Order
            </label>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setSortOrder('sheet')}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${sortOrder === 'sheet' ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-700'}`}
              >
                Sheet Order
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('scene')}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${sortOrder === 'scene' ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-700'}`}
              >
                Scene Order
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
              Scenes to Include
            </label>
            <div className="bg-zinc-950 border border-zinc-700 rounded-md overflow-y-auto max-h-48">
              {sceneItems.map(item => {
                const selected = selectedSceneIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleScene(item.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${selected ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'}`}
                  >
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${selected ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-600'}`}>
                      {selected && <svg className="w-3 h-3 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </button>
                );
              })}
              {sceneItems.length === 0 && (
                <div className="px-3 py-4 text-xs text-zinc-600 text-center">No scenes</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
        <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => onPrint({ sortOrder, sceneIds: selectedSceneIds })}
          disabled={selectedSceneIds.length === 0}
          className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Printer className="w-3.5 h-3.5" />
          Print / Save PDF
        </button>
      </div>
    </Modal>
  );
}
