import React, { useState } from 'react';
import Modal from './Modal';
import { ModalFooter } from './Modal';

interface DriveConflict {
  projectId: string;
  localTitle: string;
  localModified: number;
  driveTitle: string;
  driveModified: number;
  resolution: string;
}

interface DriveConflictModalProps {
  conflicts: DriveConflict[];
  onResolve: (resolutions: { projectId: string; action: 'keep_local' | 'keep_drive' | 'keep_both' }[]) => void;
  onClose: () => void;
}

export function DriveConflictModal({ conflicts, onResolve, onClose }: DriveConflictModalProps) {
  const [resolutions, setResolutions] = useState<Map<string, 'keep_local' | 'keep_drive' | 'keep_both'>>(
    new Map(conflicts.map(c => [c.projectId, 'keep_local' as const])),
  );

  const setAction = (projectId: string, action: 'keep_local' | 'keep_drive' | 'keep_both') => {
    setResolutions(prev => {
      const next = new Map(prev);
      next.set(projectId, action);
      return next;
    });
  };

  const handleResolve = () => {
    const list = conflicts.map(c => ({
      projectId: c.projectId,
      action: resolutions.get(c.projectId) ?? 'keep_local',
    }));
    onResolve(list);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Sync Conflict"
      width="max-w-md"
      footer={
        <ModalFooter>
          <button
            onClick={handleResolve}
            className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            Resolve All
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 text-xs hover:text-white transition-colors"
          >
            Cancel
          </button>
        </ModalFooter>
      }
    >
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-zinc-800">
        {conflicts.map(conflict => {
          const action = resolutions.get(conflict.projectId) ?? 'keep_local';
          const localTime = new Date(conflict.localModified).toLocaleString();
          const driveTime = new Date(conflict.driveModified).toLocaleString();

          return (
            <div key={conflict.projectId} className="p-4 space-y-2">
              <div className="text-xs font-semibold text-white">{conflict.localTitle}</div>
              <div className="space-y-1">
                <div className="text-[11px]">
                  <span className="text-zinc-500">Local:</span>{' '}
                  <span className="text-zinc-300">{conflict.localTitle}</span>{' '}
                  <span className="text-zinc-600">{localTime}</span>
                </div>
                <div className="text-[11px]">
                  <span className="text-zinc-500">Drive:</span>{' '}
                  <span className="text-zinc-300">{conflict.driveTitle}</span>{' '}
                  <span className="text-zinc-600">{driveTime}</span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setAction(conflict.projectId, 'keep_local')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    action === 'keep_local'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Keep Local
                </button>
                <button
                  onClick={() => setAction(conflict.projectId, 'keep_drive')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    action === 'keep_drive'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Keep Drive
                </button>
                <button
                  onClick={() => setAction(conflict.projectId, 'keep_both')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    action === 'keep_both'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Keep Both
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
