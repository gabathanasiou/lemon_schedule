import React, { useState, useMemo } from 'react';
import { useProject } from '../../store';
import { X } from 'lucide-react';
import { EntityDropdown } from '../EntityDropdown';

export interface LocationBreakdownOptions {
  locationFilters: string[];
}

interface LocationBreakdownDialogProps {
  onPrint: (opts: LocationBreakdownOptions) => void;
  onClose: () => void;
}

export default function LocationBreakdownDialog({ onPrint, onClose }: LocationBreakdownDialogProps) {
  const { state } = useProject();
  const project = state.present;

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const s of project.scenes) {
      if (s.set.trim()) set.add(s.set.trim());
    }
    return [...set].sort();
  }, [project.scenes]);

  const [selectedLocations, setSelectedLocations] = useState<string[]>(locations);

  const locationItems = useMemo(() => locations.map(l => ({ id: l, name: l })), [locations]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Location Breakdown</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
            <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
              Locations
            </label>
            <EntityDropdown
              value={selectedLocations.join(', ')}
              onChange={val => setSelectedLocations(val.split(',').map(x => x.trim()).filter(Boolean))}
              items={locationItems}
              positioning="fixed"
              standalone
              mode="multi"
              placeholder="e.g. SET, LOCATION"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={() => onPrint({ locationFilters: selectedLocations })}
            disabled={selectedLocations.length === 0}
            className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
