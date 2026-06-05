import React, { useState } from 'react';
import { X } from 'lucide-react';

export interface BreakdownSheetOptions {
  sortOrder: 'sheet' | 'scene';
}

interface BreakdownSheetDialogProps {
  onPrint: (opts: BreakdownSheetOptions) => void;
  onClose: () => void;
}

export default function BreakdownSheetDialog({ onPrint, onClose }: BreakdownSheetDialogProps) {
  const [sortOrder, setSortOrder] = useState<'sheet' | 'scene'>('sheet');

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Scene Breakdown</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-sm text-zinc-600">
            One page per scene showing cast and production elements.
          </p>
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
            <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-3 block">
              Sort Order
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSortOrder('sheet')}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border-2 ${sortOrder === 'sheet' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 text-zinc-600 hover:border-zinc-400'}`}
              >
                Sheet Order
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('scene')}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border-2 ${sortOrder === 'scene' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 text-zinc-600 hover:border-zinc-400'}`}
              >
                Scene Order
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={() => onPrint({ sortOrder })}
            className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
