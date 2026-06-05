import React, { useState, useMemo } from 'react';
import { useProject } from '../../store';
import { X } from 'lucide-react';

export interface BreakdownSheetOptions {
  sceneRange: 'all';
}

interface BreakdownSheetDialogProps {
  onPrint: (opts: BreakdownSheetOptions) => void;
  onClose: () => void;
}

export default function BreakdownSheetDialog({ onPrint, onClose }: BreakdownSheetDialogProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Script Breakdown Sheet</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-sm text-zinc-600">
            One sheet per scene showing all production elements. Currently includes cast data.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={() => onPrint({ sceneRange: 'all' })}
            className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
