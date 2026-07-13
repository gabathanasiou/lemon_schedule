import React, { useState, useCallback } from 'react';
import { useProject, useIsCloudProject } from '../store';
import { SaveIndicator } from './SaveIndicator';
import { Undo2, Redo2, ChevronDown } from 'lucide-react';
import { ItemManagerDropdown } from './DropdownMenu';
import { generateUUID } from '../lib/utils';

interface VersionToolbarProps {
  projectTitle: string;
  onProjectTitleChange: (title: string) => void;
  tabName: string;
  onClose?: () => void;
}

export default function VersionToolbar({ projectTitle, onProjectTitleChange, tabName, onClose }: VersionToolbarProps) {
  const { state, dispatch, readOnly } = useProject();
  const isCloudProject = useIsCloudProject();
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const [showVersionsMenu, setShowVersionsMenu] = useState(false);

  const cloudBg = isCloudProject ? 'bg-blue-950' : 'bg-zinc-950';

  const handleRenameProject = useCallback((value: string) => {
    onProjectTitleChange(value);
  }, [onProjectTitleChange]);

  return (
    <div className={`shrink-0 ${cloudBg} text-zinc-300 select-none print:hidden`}>
      {readOnly && (
        <div className="bg-red-600 text-white px-4 py-1.5 flex items-center justify-between text-xs">
          <span className="font-medium">No Internet Connection — editing disabled</span>
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
          <div className="flex items-center gap-1 border border-white/10 rounded bg-white/5">
            <button
              onClick={() => dispatch({ type: 'UNDO' })}
              disabled={state.past.length === 0}
              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${isCloudProject ? 'text-white/70 hover:text-white hover:bg-blue-900/60' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => dispatch({ type: 'REDO' })}
              disabled={state.future.length === 0}
              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${isCloudProject ? 'text-white/70 hover:text-white hover:bg-blue-900/60' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="border border-white/10 rounded bg-white/5">
          <ItemManagerDropdown
            open={showVersionsMenu}
            onClose={(open) => setShowVersionsMenu(open)}
            items={project.versions.map(v => ({ id: v.id, name: v.name }))}
            activeId={project.activeVersionId}
            closeOnSelect
            onSelect={(id) => dispatch({ type: 'SET_ACTIVE_VERSION', payload: id })}
            onRename={(id, name) => dispatch({ type: 'RENAME_VERSION', payload: { id, name } })}
            onDuplicate={(id) => {
              const v = project.versions.find(x => x.id === id);
              if (!v) return;
              const name = `${v.name} Copy`;
              const newId = generateUUID();
              dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: id, id: newId } });
              return newId;
            }}
            onDelete={(id) => dispatch({ type: 'DELETE_VERSION', payload: id })}
            onCreate={() => {
              const name = `V${String(project.versions.length + 1).padStart(2, '0')}`;
              const newId = generateUUID();
              dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: null, id: newId } });
              return newId;
            }}
            readOnly={false}
            theme={isCloudProject ? 'blue' : 'dark'}
            label="Version"
            header="SCHEDULE VERSIONS"
            itemLabel="Version"
            trigger={
              <button
                className={`flex items-center space-x-1.5 rounded transition-colors px-3 py-1.5 cursor-pointer select-none font-sans text-xs text-white whitespace-nowrap ${isCloudProject ? 'hover:bg-blue-900/60' : 'hover:bg-zinc-800'}`}
              >
                <span><span className="hidden sm:inline">Version: </span><strong>{version?.name || 'Select Version'}</strong></span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            }
          />
          </div>
        </div>
      </div>
    </div>
  );
}
