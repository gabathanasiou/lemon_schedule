import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useProject } from '../../store';
import { Printer } from 'lucide-react';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Checklist from '../Checklist';

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

  const sortOrder = settings.sortOrder;
  const selectedSceneIds = settings.selectedSceneIds;

  const sceneItems = useMemo(() => scenes.map(s => ({ id: s.id, name: `${s.sceneNumber} - ${s.set || s.description}` })), [scenes]);

  const toggleScene = (id: string) => {
    update({ selectedSceneIds: selectedSceneIds.includes(id) ? selectedSceneIds.filter(x => x !== id) : [...selectedSceneIds, id] });
  };

  return (
    <Modal open onClose={onClose} onReset={resetSettings} title="Scene Breakdown" icon={<Printer className="w-4 h-4" />} width="max-w-xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton
            onClick={() => onPrint({ sortOrder, sceneIds: selectedSceneIds })}
            disabled={selectedSceneIds.length === 0}
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5">
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
            <Checklist
              title="Scenes to Include"
              items={sceneItems.map(item => ({ id: item.id, label: item.name }))}
              selected={selectedSceneIds}
              onToggle={toggleScene}
              emptyHint="No scenes"
              maxHeight={192}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
