import React, { useState } from 'react';
import { useProject } from '../store';
import { X } from 'lucide-react';

export default function PrintDialog({ onPrint }: { onPrint: (options: { showTimes: boolean; showDurations: boolean }) => void }) {
  const { state } = useProject();
  const project = state.present;
  const [showTimes, setShowTimes] = useState(true);
  const [showDurations, setShowDurations] = useState(true);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Print Schedule</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-3">
            <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">Include Columns</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={showTimes} onChange={e => setShowTimes(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-zinc-700 font-medium">Call Times</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={showDurations} onChange={e => setShowDurations(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-zinc-700 font-medium">Durations</span>
            </label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 leading-relaxed">
            The schedule will be printed in landscape orientation with color-coded scene rows.<br />
            Use the browser's <strong>Save as PDF</strong> option in the print dialog to generate a PDF file.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button onClick={() => onPrint({ showTimes, showDurations })} className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-black/10 flex items-center gap-2">
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
