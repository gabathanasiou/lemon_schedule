import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useProject } from '../../store';
import { Printer } from 'lucide-react';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import EngineOptionsGrid, { EngineOptions } from '../print/pdf/EngineOptionsGrid';

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

  const storageKey = `lemon_schedule_breakdown_sheet_${state.present.id}`;
  const sceneIds = scenes.map(s => s.id);
  const defaultSettings = { sortOrder: 'sheet' as 'sheet' | 'scene', selectedSceneIds: sceneIds };

  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch { return defaultSettings; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
  }, [storageKey, settings]);

  const update = (patch: Partial<typeof defaultSettings>) => setSettings(s => ({ ...s, ...patch }));
  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    try { localStorage.removeItem(storageKey); } catch {}
  }, [defaultSettings, storageKey]);

  const defaultEngine: EngineOptions = { engine: 'browser', pdfOrientation: 'landscape', pdfPaperSize: 'a4' };
  const engineStorageKey = `${storageKey}_engine`;
  const [engineOpts, setEngineOpts] = useState<EngineOptions>(() => {
    try {
      const stored = localStorage.getItem(engineStorageKey);
      return stored ? { ...defaultEngine, ...JSON.parse(stored) } : defaultEngine;
    } catch { return defaultEngine; }
  });
  useEffect(() => {
    try { localStorage.setItem(engineStorageKey, JSON.stringify(engineOpts)); } catch {}
  }, [engineStorageKey, engineOpts]);
  const updateEngine = useCallback((patch: Partial<EngineOptions>) => {
    setEngineOpts(prev => ({ ...prev, ...patch }));
  }, []);

  const sortOrder = settings.sortOrder;
  const selectedSceneIds = settings.selectedSceneIds;

  const sceneItems = useMemo(() => scenes.map(s => ({ id: s.id, name: `${s.sceneNumber} — ${s.set || s.description}` })), [scenes]);

  const toggleScene = (id: string) => {
    update({ selectedSceneIds: selectedSceneIds.includes(id) ? selectedSceneIds.filter(x => x !== id) : [...selectedSceneIds, id] });
  };

  return (
    <Modal open onClose={onClose} onReset={resetSettings} title="Scene Breakdown" icon={<Printer className="w-4 h-4" />} width="max-w-xl"
      footer={
        <ModalFooter>
          <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onPrint({ sortOrder, sceneIds: selectedSceneIds, ...(engineOpts as any) })}
            disabled={selectedSceneIds.length === 0}
            className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" />
            {engineOpts.engine === 'pdf' ? 'Generate PDF' : 'Print / Save PDF'}
          </button>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5">
        <EngineOptionsGrid options={engineOpts} onChange={updateEngine} />
        <div className="space-y-4">
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-3">
              Sort Order
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => update({ sortOrder: 'sheet' })}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${sortOrder === 'sheet' ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-700'}`}
              >
                Sheet Order
              </button>
              <button
                type="button"
                onClick={() => update({ sortOrder: 'scene' })}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${sortOrder === 'scene' ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-700'}`}
              >
                Scene Order
              </button>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-3">
              Scenes to Include
            </h3>
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
    </Modal>
  );
}
