import React, { useCallback } from 'react';
import { useProject, useIsCloudProject } from '../store';
import { useDialog } from './Dialog';
import { SaveIndicator } from './SaveIndicator';
import { UndoRedoButtons } from './UndoRedoButtons';

interface VersionToolbarProps {
  projectTitle: string;
  onProjectTitleChange: (title: string) => void;
  tabName: string;
  onClose?: () => void;
}

export default function VersionToolbar({ projectTitle, onProjectTitleChange, tabName, onClose }: VersionToolbarProps) {
  const { state, locked } = useProject();
  const dialog = useDialog();

  const isCloudProject = useIsCloudProject();
  const project = state.present;

  const cloudBg = isCloudProject ? 'bg-blue-950' : 'bg-zinc-950';

  const handleRenameProject = useCallback((value: string) => {
    onProjectTitleChange(value);
  }, [onProjectTitleChange]);

  return (
    <div className={`shrink-0 ${cloudBg} text-zinc-300 select-none print:hidden`}>
      {locked && (
        <div className="bg-red-600 text-white px-4 py-1.5 flex items-center justify-between text-xs">
          <span className="font-medium">No Internet Connection - editing disabled</span>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <SaveIndicator isCloudProject={isCloudProject} />
          <input
            value={projectTitle}
            onChange={e => handleRenameProject(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className={`bg-transparent border-none text-white font-medium rounded px-1 outline-none font-sans ${isCloudProject ? 'focus:ring-1 focus:ring-blue-600' : 'focus:ring-1 focus:ring-zinc-600'}`}
          />
          <span className="px-3 py-1.5 rounded text-xs font-semibold bg-white text-zinc-900">
            {tabName}
          </span>
        </div>

        <div className="flex items-center space-x-3 font-mono text-xs">
          <UndoRedoButtons isCloudProject={isCloudProject} />
        </div>
      </div>
    </div>
  );
}
