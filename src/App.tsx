/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ProjectProvider, useProject } from './store';
import { BreakdownTab } from './components/BreakdownTab';
import { ScheduleTab } from './components/ScheduleTab';
import { ProjectManager } from './components/ProjectManager';
import { Download, Printer, Copy, Trash2, Plus, Pencil, Check, X, ChevronDown, Undo2, Redo2, FolderOpen } from 'lucide-react';

function AppContent() {
  const { state, dispatch, currentProjectId } = useProject();
  const [activeTab, setActiveTab] = useState<'breakdown' | 'schedule'>('breakdown');
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showVersionsMenu, setShowVersionsMenu] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const noProject = currentProjectId === null;

  if (noProject) {
    return <ProjectManager />;
  }

  const handleExportJSON = () => {
    const data = JSON.stringify(project, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'Export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleExportCSV = () => {
    const lines = ["Scene,Pages,ScriptDay,I/E,Set,D/N,Description,Cast,Notes"];
    for(const s of project.scenes) {
      lines.push(`${s.sceneNumber},"${s.pageCount}",${s.scriptDay},${s.intExt},"${s.set}",${s.dayNight},"${s.description}","${s.cast}","${s.notes}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'Breakdown'}.csv`;
    a.click();
  };

  return (
    <div className="h-screen bg-white flex flex-col text-[13px] print:bg-white print:text-black overflow-hidden">
      {showProjectManager && (
        <ProjectManager onClose={() => setShowProjectManager(false)} />
      )}

      {/* HEADER */}
      <header className="flex items-center justify-between bg-zinc-950 text-zinc-300 px-4 py-2 select-none print:hidden border-b border-zinc-900 border-t-zinc-700/50">
        <div className="flex items-center space-x-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowProjectManager(true)}
              className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
              title="Project Manager"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            <input 
              value={project.title} 
              onChange={e => dispatch({type: 'UPDATE_PROJECT', payload: {title: e.target.value}})}
              className="bg-transparent border-none text-white font-medium focus:ring-1 focus:ring-zinc-600 rounded px-1 outline-none font-sans"
            />
          </div>
          <div className="flex space-x-1 bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
            <button 
              onClick={() => setActiveTab('breakdown')} 
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'breakdown' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Breakdown
            </button>
            <button 
              onClick={() => setActiveTab('schedule')}
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'schedule' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Schedule
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-3 font-mono text-xs">
          <div className="flex items-center gap-1 bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
            <button
              onClick={() => dispatch({ type: 'UNDO' })}
              disabled={state.past.length === 0}
              className="p-1.5 rounded-sm hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => dispatch({ type: 'REDO' })}
              disabled={state.future.length === 0}
              className="p-1.5 rounded-sm hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeTab === 'schedule' && (
            <div className="relative">
              <button 
                onClick={() => setShowVersionsMenu(prev => !prev)}
                className="flex items-center space-x-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors text-white px-3 py-1.5 rounded cursor-pointer select-none font-sans font-medium"
              >
                <span>Version: <strong className="text-zinc-300 font-semibold">{version?.name || 'Select Version'}</strong></span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              {showVersionsMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setShowVersionsMenu(false); setEditingVersionId(null); }} />
                  
                  <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-50 text-zinc-300 p-2 flex flex-col font-sans select-none">
                    <div className="px-3 py-2 border-b border-zinc-800 text-zinc-400 font-bold text-[11px] tracking-wider uppercase">
                      Schedule Versions
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto py-1 space-y-0.5">
                      {project.versions.map(v => {
                        const isActive = v.id === project.activeVersionId;
                        const isEditing = v.id === editingVersionId;
                        
                        return (
                          <div 
                            key={v.id} 
                            className={`flex items-center justify-between px-3 py-2 rounded transition-colors group ${isActive ? 'bg-zinc-900 text-white font-medium' : 'hover:bg-zinc-900/60'}`}
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
                                      if (editingName.trim()) {
                                        dispatch({ type: 'RENAME_VERSION', payload: { id: v.id, name: editingName.trim() } });
                                      }
                                      setEditingVersionId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingVersionId(null);
                                    }
                                  }}
                                />
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (editingName.trim()) {
                                      dispatch({ type: 'RENAME_VERSION', payload: { id: v.id, name: editingName.trim() } });
                                    }
                                    setEditingVersionId(null);
                                  }}
                                  className="p-1 hover:bg-zinc-700 rounded text-emerald-400"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingVersionId(null);
                                  }}
                                  className="p-1 hover:bg-zinc-700 rounded text-rose-400"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span 
                                onClick={() => {
                                  dispatch({ type: 'SET_ACTIVE_VERSION', payload: v.id });
                                  setShowVersionsMenu(false);
                                }}
                                className="truncate flex-1 cursor-pointer"
                                title={v.name}
                              >
                                {v.name}
                              </span>
                            )}

                            {!isEditing && (
                              <div className="flex items-center space-x-1 ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  onClick={() => {
                                    setEditingVersionId(v.id);
                                    setEditingName(v.name);
                                  }}
                                  className="p-1 hover:bg-zinc-800 rounded hover:text-white transition-colors"
                                  title="Rename version"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                                <button 
                                  onClick={() => {
                                    const newName = prompt("Name for duplicated version?", `${v.name} Copy`);
                                    if (newName) {
                                      dispatch({ type: 'NEW_VERSION', payload: { name: newName, cloneFromId: v.id } });
                                    }
                                  }}
                                  className="p-1 hover:bg-zinc-800 rounded hover:text-white transition-colors"
                                  title="Duplicate version"
                                >
                                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                                <button 
                                  onClick={() => {
                                    if (project.versions.length <= 1) return;
                                    if (confirm(`Are you sure you want to delete "${v.name}"? This cannot be undone.`)) {
                                      dispatch({ type: 'DELETE_VERSION', payload: v.id });
                                    }
                                  }}
                                  disabled={project.versions.length <= 1}
                                  className={`p-1 rounded transition-colors ${project.versions.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-rose-950/40 hover:text-rose-400'}`}
                                  title="Delete version"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-zinc-800 mt-1 pt-1.5 flex flex-col space-y-1">
                      <button 
                        onClick={() => {
                          const name = prompt("Name for duplicated version?", `${version?.name || 'Version'} Copy`);
                          if (name) {
                            dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: project.activeVersionId } });
                            setShowVersionsMenu(false);
                          }
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-900 rounded hover:text-white flex items-center gap-2 text-xs transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5 text-zinc-400" /> Duplicate Active Version
                      </button>
                      <button 
                        onClick={() => {
                          const name = prompt("Name for new version?", `Version ${project.versions.length + 1}`);
                          if (name) {
                            dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: null } });
                            setShowVersionsMenu(false);
                          }
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-900 rounded hover:text-white flex items-center gap-2 text-xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-zinc-400" /> Create Blank Version
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          
          <div className="flex space-x-2 relative group cursor-pointer z-50">
             <span className="px-3 py-1 items-center flex hover:bg-zinc-800 rounded transition-colors">Export ▾</span>
             <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded shadow-2xl hidden group-hover:flex flex-col w-48 text-zinc-300">
               <button onClick={handleExportCSV} className="text-left px-4 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2"><Download className="w-3 h-3"/> Breakdown to CSV</button>
               <button onClick={handleExportJSON} className="text-left px-4 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2"><Download className="w-3 h-3"/> Save Project as JSON</button>
               <button onClick={() => window.print()} className="text-left px-4 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2 border-t border-zinc-800"><Printer className="w-3 h-3"/> Print Schedule</button>
             </div>
          </div>
          <span className="text-zinc-500">Auto-saved</span>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white min-h-0">
        {activeTab === 'breakdown' ? <BreakdownTab /> : <ScheduleTab />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}

