import React, { useState, useMemo } from 'react';
import { useProject } from '../../store';
import { X } from 'lucide-react';
import { EntityDropdown } from '../EntityDropdown';

export interface CastBreakdownOptions {
  castIds: string[];
}

interface CastBreakdownDialogProps {
  onPrint: (opts: CastBreakdownOptions) => void;
  onClose: () => void;
}

export default function CastBreakdownDialog({ onPrint, onClose }: CastBreakdownDialogProps) {
  const { state } = useProject();
  const project = state.present;

  const allCastIds = useMemo(() => {
    const ids = new Set<string>();
    for (const scene of project.scenes) {
      for (const id of scene.cast.split(',').map(c => c.trim()).filter(Boolean)) ids.add(id);
    }
    for (const m of project.castMembers || []) ids.add(m.id);
    return [...ids].sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
  }, [project.scenes, project.castMembers]);

  const [selectedCastIds, setSelectedCastIds] = useState<string[]>(allCastIds);

  const castItems = useMemo(() => allCastIds.map(id => ({
    id,
    name: project.castMembers?.find(m => m.id === id)?.name || '—',
  })), [allCastIds, project.castMembers]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Cast Breakdown</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
            <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
              Cast Members
            </label>
            <EntityDropdown
              value={selectedCastIds.join(', ')}
              onChange={val => setSelectedCastIds(val.split(',').map(x => x.trim()).filter(Boolean))}
              items={castItems}
              positioning="fixed"
              standalone
              mode="multi"
              placeholder="e.g. 1, 2, 3"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={() => onPrint({ castIds: selectedCastIds })}
            disabled={selectedCastIds.length === 0}
            className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
