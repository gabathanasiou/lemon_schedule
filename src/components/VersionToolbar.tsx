import React, { useCallback } from 'react';
import { useProject, useProjectTheme } from '../store';
import { PROJECT_CHROME } from '../lib/projectTheme';
import { useDialog } from './Dialog';
import { SaveIndicator } from './SaveIndicator';
import { UndoRedoButtons } from './UndoRedoButtons';
import { RoomNote } from './RoomNote';

interface VersionToolbarProps {
  projectTitle: string;
  onProjectTitleChange: (title: string) => void;
  tabName: string;
  onClose?: () => void;
}

export default function VersionToolbar({ projectTitle, onProjectTitleChange, tabName, onClose }: VersionToolbarProps) {
  const { state, locked } = useProject();
  const dialog = useDialog();

  const projectTheme = useProjectTheme();
  const isCloudProject = projectTheme !== 'local';
  const chrome = PROJECT_CHROME[projectTheme];
  const project = state.present;

  const handleRenameProject = useCallback((value: string) => {
    onProjectTitleChange(value);
  }, [onProjectTitleChange]);

  return (
    <div className={`shrink-0 ${chrome.bar} text-zinc-300 select-none print:hidden`}>
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
            className={`bg-transparent border-none text-white font-medium rounded px-1 outline-none font-sans ${chrome.titleRing}`}
          />
          <span className="px-3 py-1.5 rounded text-xs font-semibold bg-white text-zinc-900">
            {tabName}
          </span>
        </div>

        <div className="flex items-center space-x-3 font-mono text-xs">
          <RoomNote />
          <UndoRedoButtons />
        </div>
      </div>
    </div>
  );
}
