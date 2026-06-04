/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ProjectProvider, useProject } from './store';
import { TrashItem, VersionTrashItem } from './types';
import { BreakdownTab } from './components/BreakdownTab';
import { ScheduleTab } from './components/ScheduleTab';
import { CalendarTab } from './components/CalendarTab';
import { RulesTab } from './components/RulesTab';
import { ProjectManager } from './components/ProjectManager';
import PrintDialog from './components/PrintDialog';
import PrintSchedule from './components/PrintSchedule';
import DropdownMenu from './components/DropdownMenu';
import DropdownItem from './components/DropdownItem';
import DropdownDivider from './components/DropdownDivider';
import { Download, Printer, Copy, Trash2, Plus, Pencil, Check, X, ChevronDown, Undo2, Redo2, FolderOpen, RotateCcw, Settings } from 'lucide-react';

function AppContent() {
  const { state, dispatch, currentProjectId } = useProject();
  const [activeTab, setActiveTab] = useState<'breakdown' | 'schedule' | 'calendar' | 'rules'>('breakdown');
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showVersionsMenu, setShowVersionsMenu] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [printOptions, setPrintOptions] = useState<{showTimes: boolean; showDurations: boolean} | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showCalendarDesc, setShowCalendarDesc] = useState(false);
  const [showCalendarViewMenu, setShowCalendarViewMenu] = useState(false);
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const noProject = currentProjectId === null;

  useEffect(() => {
    if (printOptions) {
      const onAfterPrint = () => setPrintOptions(null);
      window.addEventListener('afterprint', onAfterPrint);
      setTimeout(() => window.print(), 200);
      return () => window.removeEventListener('afterprint', onAfterPrint);
    }
  }, [printOptions]);

  if (printOptions) {
    return (
      <div>
        <PrintSchedule project={project} showTimes={printOptions.showTimes} showDurations={printOptions.showDurations} />
      </div>
    );
  }

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

      {showPrintDialog && <PrintDialog onPrint={(opts) => { setShowPrintDialog(false); setPrintOptions(opts); }} />}

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
          <div className="flex items-center space-x-1 bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
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
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'calendar' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Calendar
            </button>
            <button 
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'rules' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Rules
            </button>
            {activeTab === 'calendar' && (
              <DropdownMenu
                open={showCalendarViewMenu}
                onClose={() => setShowCalendarViewMenu(false)}
                width="w-36"
                trigger={
                  <button
                    onClick={() => setShowCalendarViewMenu(p => !p)}
                    className="p-1 hover:bg-zinc-800 rounded transition-colors"
                    title="Calendar view options"
                  >
                    <Settings className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                  </button>
                }
              >
                <div className="px-3 py-1 text-zinc-400 text-[9px] uppercase tracking-wider font-mono">Show</div>
                <button onClick={() => { setShowCalendarDesc(false); setShowCalendarViewMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 ${!showCalendarDesc ? 'text-white font-semibold' : ''}`}>
                  Scene title
                </button>
                <button onClick={() => { setShowCalendarDesc(true); setShowCalendarViewMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 ${showCalendarDesc ? 'text-white font-semibold' : ''}`}>
                  Description
                </button>
              </DropdownMenu>
            )}
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

          <DropdownMenu
              open={showVersionsMenu}
              onClose={() => { setShowVersionsMenu(false); setEditingVersionId(null); }}
              width="w-80"
              trigger={
                <button 
                  onClick={() => setShowVersionsMenu(prev => !prev)}
                  className="flex items-center space-x-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors text-white px-3 py-1.5 rounded cursor-pointer select-none font-sans font-medium"
                >
                  <span>Version: <strong className="text-zinc-300 font-semibold">{version?.name || 'Select Version'}</strong></span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                </button>
              }
            >
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
                            onClick={(e) => { e.stopPropagation(); if (editingName.trim()) { dispatch({ type: 'RENAME_VERSION', payload: { id: v.id, name: editingName.trim() } }); } setEditingVersionId(null); }}
                            className="p-1 hover:bg-zinc-700 rounded text-emerald-400"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingVersionId(null); }}
                            className="p-1 hover:bg-zinc-700 rounded text-rose-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span 
                          onClick={() => { dispatch({ type: 'SET_ACTIVE_VERSION', payload: v.id }); setShowVersionsMenu(false); }}
                          className="truncate flex-1 cursor-pointer"
                          title={v.name}
                        >
                          {v.name}
                        </span>
                      )}

                      {!isEditing && (
                        <div className="flex items-center space-x-1 ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => { setEditingVersionId(v.id); setEditingName(v.name); }} className="p-1 hover:bg-zinc-800 rounded hover:text-white transition-colors" title="Rename version">
                            <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                          <button onClick={() => { const newName = prompt("Name for duplicated version?", `${v.name} Copy`); if (newName) { dispatch({ type: 'NEW_VERSION', payload: { name: newName, cloneFromId: v.id } }); } }} className="p-1 hover:bg-zinc-800 rounded hover:text-white transition-colors" title="Duplicate version">
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                          <button onClick={() => { if (project.versions.length <= 1) return; if (confirm(`Are you sure you want to delete "${v.name}"? This cannot be undone.`)) { dispatch({ type: 'DELETE_VERSION', payload: v.id }); } }} disabled={project.versions.length <= 1} className={`p-1 rounded transition-colors ${project.versions.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-rose-950/40 hover:text-rose-400'}`} title="Delete version">
                            <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-zinc-800 mt-1 pt-1.5 flex flex-col space-y-1">
                <DropdownItem onClick={() => { const name = prompt("Name for duplicated version?", `${version?.name || 'Version'} Copy`); if (name) { dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: project.activeVersionId } }); setShowVersionsMenu(false); } }} icon={<Copy className="w-3.5 h-3.5" />}>
                  Duplicate Active Version
                </DropdownItem>
                <DropdownItem onClick={() => { const name = prompt("Name for new version?", `V${String(project.versions.length + 1).padStart(2, '0')}`); if (name) { dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: null } }); setShowVersionsMenu(false); } }} icon={<Plus className="w-3.5 h-3.5" />}>
                  Create Blank Version
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={() => { setShowVersionsMenu(false); setShowTrash(true); }} icon={<Trash2 className="w-3.5 h-3.5" />}>
                  Trash ({(project.trash?.length || 0) + (project.versionTrash?.length || 0)})
                </DropdownItem>
              </div>
            </DropdownMenu>

          <DropdownMenu
              open={showExportMenu}
              onClose={() => setShowExportMenu(false)}
              width="w-48"
              trigger={
                <button
                  onClick={() => setShowExportMenu(prev => !prev)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-zinc-800 rounded transition-colors font-sans cursor-pointer select-none"
                >
                  <span>Export</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                </button>
              }
            >
              <DropdownItem onClick={handleExportCSV} icon={<Download className="w-3.5 h-3.5" />}>
                Breakdown to CSV
              </DropdownItem>
              <DropdownItem onClick={handleExportJSON} icon={<Download className="w-3.5 h-3.5" />}>
                Save Project as JSON
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => { setShowExportMenu(false); setShowPrintDialog(true); }} icon={<Printer className="w-3.5 h-3.5" />}>
                Print Schedule
              </DropdownItem>
            </DropdownMenu>
          <span className="text-zinc-500">Auto-saved</span>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white min-h-0">
        {activeTab === 'breakdown' ? <BreakdownTab /> : activeTab === 'schedule' ? <ScheduleTab /> : activeTab === 'calendar' ? <CalendarTab showDesc={showCalendarDesc} /> : <RulesTab />}
      </main>

      {showTrash && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setShowTrash(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div>
                <h2 className="text-white font-bold text-sm">Trash</h2>
                <p className="text-zinc-500 text-[11px] mt-0.5">Items expire after 30 days</p>
              </div>
              <button onClick={() => setShowTrash(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {[...(project.trash || []).map(t => ({ ...t, _kind: 'scene' as const })), ...(project.versionTrash || []).map(t => ({ ...t, _kind: 'version' as const }))]
                .sort((a, b) => b.deletedAt - a.deletedAt)
                .length === 0 ? (
                <div className="text-zinc-500 text-center py-12 text-sm">Trash is empty</div>
              ) : (
                [...(project.trash || []).map(t => ({ ...t, _kind: 'scene' as const })), ...(project.versionTrash || []).map(t => ({ ...t, _kind: 'version' as const }))]
                  .sort((a, b) => b.deletedAt - a.deletedAt)
                  .map((item: any) => (
                    <div key={item._kind === 'scene' ? item.scene.id : item.version.id} className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-zinc-900 group">
                      <div className="min-w-0">
                        <div className="text-white text-sm font-semibold truncate">
                          {item._kind === 'scene'
                            ? `${(item as TrashItem).scene.sceneNumber}. ${(item as TrashItem).scene.set}`
                            : (item as VersionTrashItem).version.name
                          }
                        </div>
                        <div className="text-zinc-500 text-[11px] mt-0.5">
                          {item._kind === 'scene'
                            ? `${(item as TrashItem).versionName} \u00b7 ${new Date(item.deletedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                            : `Version \u00b7 ${new Date(item.deletedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                          }
                        </div>
                      </div>
                      <button
                        onClick={() => dispatch({ type: item._kind === 'scene' ? 'RESTORE_SCENE' : 'RESTORE_VERSION_FROM_TRASH', payload: item._kind === 'scene' ? item.scene.id : item.version.id })}
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white p-1 rounded transition-all"
                        title="Restore"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
              )}
            </div>
            {((project.trash || []).length + (project.versionTrash || []).length) > 0 && (
              <div className="border-t border-zinc-800 px-5 py-3">
                <button
                  onClick={() => { if (confirm('Permanently delete all trash items?')) dispatch({ type: 'EMPTY_TRASH' }); }}
                  className="w-full text-center text-red-500 hover:text-red-400 text-xs font-semibold py-1.5 rounded hover:bg-red-500/10 transition-colors"
                >
                  Empty Trash
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

