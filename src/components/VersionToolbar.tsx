import React, { useState, useCallback } from 'react';
import { useProject, useIsCloudProject } from '../store';
import { SaveIndicator } from './SaveIndicator';
import { Undo2, Redo2, ChevronDown, Pencil, Check, X, Copy, Trash2, Plus } from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { generateUUID } from '../lib/utils';

interface VersionToolbarProps {
  projectTitle: string;
  onProjectTitleChange: (title: string) => void;
  tabName: string;
  onClose?: () => void;
  contentTheme?: 'light' | 'dark';
}

export default function VersionToolbar({ projectTitle, onProjectTitleChange, tabName, onClose, contentTheme = 'light' }: VersionToolbarProps) {
  const { state, dispatch, readOnly } = useProject();
  const isCloudProject = useIsCloudProject();
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const [showVersionsMenu, setShowVersionsMenu] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const cloudBg = isCloudProject ? 'bg-blue-950' : 'bg-zinc-950';
  const cloudBorder = isCloudProject ? 'border-blue-800' : 'border-zinc-800';
  const cloudHover = isCloudProject ? 'hover:bg-blue-800' : 'hover:bg-zinc-800';
  const cloudBtnBg = isCloudProject ? 'bg-blue-900' : 'bg-zinc-900';
  const cloudBtnHover = isCloudProject ? 'hover:bg-blue-800' : 'hover:bg-zinc-800';

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
          <div className={`h-4 w-px ${isCloudProject ? 'bg-blue-800' : 'bg-zinc-700'}`} />
          <div className="relative h-full">
            <span className={`absolute top-0.5 -bottom-5 left-0 right-0 rounded-t-md pointer-events-none ${contentTheme === 'dark' ? 'bg-zinc-900 border-l border-r border-t border-zinc-600' : 'bg-white'}`} />
            <span className={`relative px-3 py-1.5 rounded-t-md text-xs font-semibold ${contentTheme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
              {tabName}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3 font-mono text-xs">
          <div className={`flex items-center gap-1 rounded-md p-0.5 border ${cloudBorder} ${cloudBtnBg}`}>
            <button
              onClick={() => dispatch({ type: 'UNDO' })}
              disabled={state.past.length === 0}
              className={`p-1.5 rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${cloudBtnHover}`}
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => dispatch({ type: 'REDO' })}
              disabled={state.future.length === 0}
              className={`p-1.5 rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${cloudBtnHover}`}
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <DropdownMenu
            open={showVersionsMenu}
            onOpenChange={(o) => { if (!o) setEditingVersionId(null); setShowVersionsMenu(o); }}
            width="w-80"
            theme={isCloudProject ? 'blue' : 'dark'}
            trigger={
              <button
                className={`flex items-center space-x-1.5 border transition-colors text-white px-3 py-1.5 rounded cursor-pointer select-none font-sans font-medium ${cloudBorder} ${cloudBtnBg} ${cloudBtnHover}`}
              >
                <span>Version: <strong className={`font-semibold ${isCloudProject ? 'text-white' : 'text-zinc-300'}`}>{version?.name || 'Select Version'}</strong></span>
                <ChevronDown className={`w-3.5 h-3.5 ${isCloudProject ? 'text-blue-300' : 'text-zinc-400'}`} />
              </button>
            }
          >
            <div className={`px-3 py-2 border-b font-bold text-[11px] tracking-wider uppercase ${isCloudProject ? 'border-white/10 text-white' : 'border-zinc-800 text-zinc-400'}`}>
              Schedule Versions
            </div>
            <div className="max-h-60 overflow-y-auto py-1 space-y-0.5">
              {project.versions.map(v => {
                const isActive = v.id === project.activeVersionId;
                const isEditing = v.id === editingVersionId;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between px-3 py-2 rounded transition-colors group ${isActive ? (isCloudProject ? 'bg-white/15 text-white font-semibold' : 'bg-zinc-800 text-white font-semibold') : (isCloudProject ? 'text-white/70 hover:bg-white/10' : 'text-zinc-300 hover:bg-zinc-800')}`}
                  >
                    {isEditing ? (
                      <div className="flex items-center space-x-1 flex-1 mr-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 text-white px-2 py-0.5 rounded outline-none text-xs flex-1"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (editingName.trim()) dispatch({ type: 'RENAME_VERSION', payload: { id: v.id, name: editingName.trim() } });
                              setEditingVersionId(null);
                            } else if (e.key === 'Escape') {
                              setEditingVersionId(null);
                            }
                          }}
                        />
                        <button onClick={(e) => { e.stopPropagation(); if (editingName.trim()) { dispatch({ type: 'RENAME_VERSION', payload: { id: v.id, name: editingName.trim() } }); } setEditingVersionId(null); }} className="p-1 hover:bg-zinc-700 rounded text-emerald-400">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingVersionId(null); }} className="p-1 hover:bg-zinc-700 rounded text-rose-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span onClick={() => { dispatch({ type: 'SET_ACTIVE_VERSION', payload: v.id }); setShowVersionsMenu(false); }} className="truncate flex-1 cursor-pointer" title={v.name}>{v.name}</span>
                    )}
                    {!isEditing && (
                      <div className="flex items-center space-x-1 ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setEditingVersionId(v.id); setEditingName(v.name); }} className="p-1 hover:bg-zinc-800 rounded hover:text-white transition-colors" title="Rename version">
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button onClick={() => { const name = `${v.name} Copy`; const newId = generateUUID(); dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: v.id, id: newId } }); setEditingVersionId(newId); setEditingName(name); }} className="p-1 hover:bg-zinc-800 rounded hover:text-white transition-colors" title="Duplicate version">
                          <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button disabled={project.versions.length <= 1} className={`p-1 rounded transition-colors ${project.versions.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-rose-950/40 hover:text-rose-400'}`} title="Delete version">
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-zinc-800 mt-1 pt-1.5 flex flex-col space-y-1">
              <DropdownItem onClick={() => { const name = `${version?.name || 'Version'} Copy`; const newId = generateUUID(); dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: project.activeVersionId, id: newId } }); setEditingVersionId(newId); setEditingName(name); setShowVersionsMenu(false); }} icon={<Copy className="w-3.5 h-3.5" />}>
                Duplicate Current
              </DropdownItem>
              <DropdownItem onClick={() => { const name = `V${String(project.versions.length + 1).padStart(2, '0')}`; const newId = generateUUID(); dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: null, id: newId } }); setEditingVersionId(newId); setEditingName(name); setShowVersionsMenu(false); }} icon={<Plus className="w-3.5 h-3.5" />}>
                Create Blank Version
              </DropdownItem>
            </div>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
