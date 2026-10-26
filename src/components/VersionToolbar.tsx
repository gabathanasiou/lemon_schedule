import React, { useCallback } from 'react';
import { useProject, useProjectTheme } from '../store';
import { useDialog } from './Dialog';
import { SaveIndicator } from './SaveIndicator';
import { UndoRedoButtons } from './UndoRedoButtons';
import { RoomNote } from './RoomNote';
import { CHROME_BAR_INSET, CHROME_ITEM_GAP } from '../lib/chromeSpacing';
import { ProjectChromeScope } from './ProjectChromeScope';

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
  const project = state.present;

  const handleRenameProject = useCallback((value: string) => {
    onProjectTitleChange(value);
  }, [onProjectTitleChange]);

  return (
    <ProjectChromeScope mode="dark">
    <div className="shrink-0 bg-[var(--ui-accent-header-bg)] text-[color:var(--ui-text)] select-none print:hidden">
      {locked && (
        <div className={`bg-red-600 text-white ${CHROME_BAR_INSET} py-1.5 flex items-center justify-between text-xs`}>
          <span className="font-medium">No Internet Connection - editing disabled</span>
        </div>
      )}
      <div data-chrome-bar="popout-toolbar" className={`flex items-center justify-between ${CHROME_BAR_INSET} py-2`}>
        <div className={`flex items-center ${CHROME_ITEM_GAP}`}>
          <SaveIndicator isCloudProject={isCloudProject} />
          <input
            value={projectTitle}
            onChange={e => handleRenameProject(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="bg-transparent border-none text-[color:var(--ui-text-strong)] font-medium rounded px-1 outline-none font-sans focus:ring-1 focus:ring-[color:var(--ui-accent-600)]"
          />
          <span className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--ui-tab-pill-plain)] text-[color:var(--ui-tab-pill-plain-text)]">
            {tabName}
          </span>
        </div>

        <div className={`flex items-center ${CHROME_ITEM_GAP} font-mono text-xs`}>
          <RoomNote />
          <UndoRedoButtons />
        </div>
      </div>
    </div>
    </ProjectChromeScope>
  );
}
