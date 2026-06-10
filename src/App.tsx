/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProjectProvider, useProject } from './store';
import { TrashItem, VersionTrashItem, RuleTrashItem, Project } from './types';
import { BreakdownTab } from './components/BreakdownTab';
import { ScheduleTab } from './components/ScheduleTab';
import { CalendarTab } from './components/CalendarTab';
import { RulesTab } from './components/RulesTab';
import { ProjectManager } from './components/ProjectManager';
import PrintDialog, { PrintOptions } from './components/PrintDialog';
import PrintSchedule from './components/PrintSchedule';
import DoodDialog, { DoodOptions } from './components/print/DoodDialog';
import Dood from './components/print/Dood';
import ShootingPlanDialog, { ShootingPlanOptions } from './components/print/ShootingPlanDialog';
import ShootingPlan from './components/print/ShootingPlan';
import CastBreakdownDialog, { CastBreakdownOptions } from './components/print/CastBreakdownDialog';
import CastBreakdown from './components/print/CastBreakdown';
import CharacterAppearancesDialog, { CharacterAppearancesOptions } from './components/print/CharacterAppearancesDialog';
import CharacterAppearances from './components/print/CharacterAppearances';
import LocationBreakdownDialog, { LocationBreakdownOptions } from './components/print/LocationBreakdownDialog';
import LocationBreakdown from './components/print/LocationBreakdown';
import BreakdownSheetDialog, { BreakdownSheetOptions } from './components/print/BreakdownSheetDialog';
import BreakdownSheet from './components/print/BreakdownSheet';
import DropdownMenu from './components/DropdownMenu';
import DropdownItem from './components/DropdownItem';
import DropdownDivider from './components/DropdownDivider';
import { StorageStatus, useStorage, SaveStatus, ProjectIndexEntry } from './components/StorageStatus';
import { RULE_TYPE_META, describeRule, getRuleSearchText } from './components/rules/ruleMeta';
import { writeProjectToFolder } from './lib/persistentStorage';
import { Download, Printer, Copy, Trash2, Plus, Pencil, Check, X, ChevronDown, Undo2, Redo2, FolderOpen, RotateCcw, Settings, HardDrive } from 'lucide-react';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function AppContent() {
  const { state, dispatch, currentProjectId } = useProject();
  const [activeTab, setActiveTab] = useState<'breakdown' | 'schedule' | 'calendar' | 'rules'>('breakdown');
  const [scheduleSubTab, setScheduleSubTab] = useState<'stripboard' | 'ribbons'>('stripboard');
  const [brSubTab, setBrSubTab] = useState<'scenes' | 'elements' | 'sheet'>('scenes');
  const [brCategory, setBrCategory] = useState('cast');
  const [brSheetIdx, setBrSheetIdx] = useState(0);

  const handleOpenSheet = useCallback((rowIndex: number) => {
    setActiveTab('breakdown');
    setBrSubTab('sheet');
    setBrSheetIdx(rowIndex);
  }, []);

  const handleOpenScene = useCallback((sceneId: string) => {
    const idx = state.present.scenes.findIndex(s => s.id === sceneId);
    if (idx >= 0) { setActiveTab('breakdown'); setBrSubTab('sheet'); setBrSheetIdx(idx); }
  }, [state.present.scenes]);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showVersionsMenu, setShowVersionsMenu] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showDoodDialog, setShowDoodDialog] = useState(false);
  const [showShootingPlanDialog, setShowShootingPlanDialog] = useState(false);
  const [showCastBreakdownDialog, setShowCastBreakdownDialog] = useState(false);
  const [showCharAppearancesDialog, setShowCharAppearancesDialog] = useState(false);
  const [showLocationBreakdownDialog, setShowLocationBreakdownDialog] = useState(false);
  const [showBreakdownSheetDialog, setShowBreakdownSheetDialog] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [printOptions, setPrintOptions] = useState<PrintOptions | null>(null);
  const [doodOptions, setDoodOptions] = useState<DoodOptions | null>(null);
  const [shootingPlanOptions, setShootingPlanOptions] = useState<ShootingPlanOptions | null>(null);
  const [castBreakdownOptions, setCastBreakdownOptions] = useState<CastBreakdownOptions | null>(null);
  const [charAppearancesOptions, setCharAppearancesOptions] = useState<CharacterAppearancesOptions | null>(null);
  const [locationBreakdownOptions, setLocationBreakdownOptions] = useState<LocationBreakdownOptions | null>(null);
  const [breakdownSheetOptions, setBreakdownSheetOptions] = useState<BreakdownSheetOptions | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showCalendarDesc, setShowCalendarDesc] = useState(false);
  const [showCalendarBreaks, setShowCalendarBreaks] = useState(true);
  const [showCalendarViewMenu, setShowCalendarViewMenu] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState<{ entries: ProjectIndexEntry[]; projects: { id: string; data: string }[] } | null>(null);
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const noProject = currentProjectId === null;

  const storage = useStorage();
  const autosaveTimerRef = useRef<number | null>(null);
  const ctx = useProject();
  const importProjectFromData = ctx.importProjectFromData;

  useEffect(() => {
  if (printOptions) {
      const vNum = (version?.name?.match(/\d+/) || ['1'])[0].padStart(2, '0');
      const vName = `V${vNum}`;
      const title = (project.title || 'Schedule').replace(/[<>:"/\\|?*]/g, '');
      const parts = [title, vName];
      if (!printOptions.showTimes) parts.push('NoTimes');

      const allDaysSorted = Object.keys(version?.dayMeta || {}).map(Number).sort((a, b) => {
        const da = version?.dayMeta?.[a]?.date || '';
        const db = version?.dayMeta?.[b]?.date || '';
        return da.localeCompare(db);
      });
      const dayToChrono = new Map(allDaysSorted.map((d, i) => [d, i + 1]));
      const selectedChronos = printOptions.selectedDays
        .map(d => dayToChrono.get(d) || d)
        .sort((a, b) => a - b);

      if (selectedChronos.length > 0 && selectedChronos.length < allDaysSorted.length) {
        const pad = (n: number) => String(n).padStart(2, '0');
        let consecutive = true;
        for (let i = 1; i < selectedChronos.length; i++) if (selectedChronos[i] !== selectedChronos[i - 1] + 1) { consecutive = false; break; }
        parts.push(consecutive && selectedChronos.length > 1
          ? `Days#${pad(selectedChronos[0])}-#${pad(selectedChronos[selectedChronos.length - 1])}`
          : `Day${selectedChronos.map(d => `#${pad(d)}`).join('')}`);
      }
      const fileName = parts.join('_');

      const oldTitle = document.title;
      document.title = fileName;
      const onAfterPrint = () => {
        document.title = oldTitle;
        setPrintOptions(null);
      };
      window.addEventListener('afterprint', onAfterPrint);
      setTimeout(() => window.print(), 200);
      return () => window.removeEventListener('afterprint', onAfterPrint);
    }
  }, [printOptions, project.title, version?.name]);

  useEffect(() => {
    if (!doodOptions) return;
    const title = (project.title || 'Schedule').replace(/[<>:"/\\|?*]/g, '');
    const fileName = `${title}_DOOD`;
    const oldTitle = document.title;
    document.title = fileName;
    const onAfterPrint = () => {
      document.title = oldTitle;
      setDoodOptions(null);
    };
    window.addEventListener('afterprint', onAfterPrint);
    setTimeout(() => window.print(), 200);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [doodOptions, project.title]);

  useEffect(() => { if (!shootingPlanOptions) return; const onAP = () => setShootingPlanOptions(null); window.addEventListener('afterprint', onAP); setTimeout(() => window.print(), 200); return () => window.removeEventListener('afterprint', onAP); }, [shootingPlanOptions]);
  useEffect(() => { if (!castBreakdownOptions) return; const onAP = () => setCastBreakdownOptions(null); window.addEventListener('afterprint', onAP); setTimeout(() => window.print(), 200); return () => window.removeEventListener('afterprint', onAP); }, [castBreakdownOptions]);
  useEffect(() => { if (!charAppearancesOptions) return; const onAP = () => setCharAppearancesOptions(null); window.addEventListener('afterprint', onAP); setTimeout(() => window.print(), 200); return () => window.removeEventListener('afterprint', onAP); }, [charAppearancesOptions, project.title]);
  useEffect(() => { if (!locationBreakdownOptions) return; const onAP = () => setLocationBreakdownOptions(null); window.addEventListener('afterprint', onAP); setTimeout(() => window.print(), 200); return () => window.removeEventListener('afterprint', onAP); }, [locationBreakdownOptions]);
  useEffect(() => { if (!breakdownSheetOptions) return; const onAP = () => setBreakdownSheetOptions(null); window.addEventListener('afterprint', onAP); setTimeout(() => window.print(), 200); return () => window.removeEventListener('afterprint', onAP); }, [breakdownSheetOptions]);

  useEffect(() => {
    if (!storage.handle || !currentProjectId) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    storage.setStatus('saving');
    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        await writeProjectToFolder(storage.handle!, project);
        storage.setStatus('saved');
      } catch (e: any) {
        const msg = e?.message || 'Save failed';
        const isPerm = /permission/i.test(msg);
        storage.setStatus(isPerm ? 'no-permission' : 'error', msg);
      }
    }, 800);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [state.present, storage.handle, currentProjectId]);

  if (doodOptions) {
    return (
      <div>
        <Dood
          title={project.title || 'Production Schedule'}
          scenes={project.scenes}
          scheduleRows={version?.rows || []}
          dayMeta={version?.dayMeta || {}}
          castMembers={project.castMembers || []}
          castIds={doodOptions.castIds}
          dayInts={doodOptions.dayInts}
          includeNonShooting={doodOptions.includeNonShooting}
          showTotals={doodOptions.showTotals}
        />
      </div>
    );
  }

  if (shootingPlanOptions) {
    return (
      <div>
        <ShootingPlan
          title={project.title || 'Production Schedule'}
          scenes={project.scenes}
          rows={version?.rows || []}
          dayMeta={version?.dayMeta || {}}
          dayInts={shootingPlanOptions.dayInts}
        />
      </div>
    );
  }

  if (castBreakdownOptions) {
    return (
      <div>
        <CastBreakdown
          title={project.title || 'Production Schedule'}
          scenes={project.scenes}
          rows={version?.rows || []}
          dayMeta={version?.dayMeta || {}}
          castMembers={project.castMembers || []}
          castIds={castBreakdownOptions.castIds}
        />
      </div>
    );
  }

  if (charAppearancesOptions) {
    return (
      <div>
        <CharacterAppearances
          title={project.title || 'Production Schedule'}
          scenes={project.scenes}
          rows={version?.rows || []}
          dayMeta={version?.dayMeta || {}}
          castMembers={project.castMembers || []}
          castIds={charAppearancesOptions.castIds}
        />
      </div>
    );
  }

  if (locationBreakdownOptions) {
    return (
      <div>
        <LocationBreakdown
          title={project.title || 'Production Schedule'}
          scenes={project.scenes}
          rows={version?.rows || []}
          dayMeta={version?.dayMeta || {}}
          locationFilters={locationBreakdownOptions.locationFilters}
        />
      </div>
    );
  }

  if (breakdownSheetOptions) {
    return (
      <div>
        <BreakdownSheet
          title={project.title || 'Production Schedule'}
          scenes={project.scenes}
          rows={version?.rows || []}
          dayMeta={version?.dayMeta || {}}
          castMembers={project.castMembers || []}
          sortOrder={breakdownSheetOptions.sortOrder}
          sceneIds={breakdownSheetOptions.sceneIds}
        />
      </div>
    );
  }

  if (printOptions) {
    const vName = version?.name?.replace(/^v/, '').split(' -')[0] || version?.name?.split(' ')[0] || version?.name || '';
    const title = (project.title || 'Schedule').replace(/[<>:"/\\|?*]/g, '');
    const times = printOptions.showTimes ? 'Timed' : 'NoTimes';
    const days = printOptions.selectedDays.length === 0 ? 'None'
      : printOptions.selectedDays.length === 1 ? `Day${printOptions.selectedDays[0]}`
      : `Days${printOptions.selectedDays.length}`;
    const fileName = `${title}_${vName}_${times}_${days}`;
    return (
      <div>
        <PrintSchedule project={project} showTimes={printOptions.showTimes} showDurations={printOptions.showDurations} showCastList={printOptions.showCastList} showExportDate={printOptions.showExportDate} showPageNumbers={printOptions.showPageNumbers} selectedDays={printOptions.selectedDays} includeStatusDays={printOptions.includeStatusDays} fileName={fileName} ribbon={printOptions.selectedRibbonId ? project.ribbonDesigns.find(d => d.id === printOptions.selectedRibbonId)?.rows : undefined} />
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

      {showPrintDialog && <PrintDialog onPrint={(opts) => { setShowPrintDialog(false); setPrintOptions(opts); }} onClose={() => setShowPrintDialog(false)} />}
      {showDoodDialog && <DoodDialog onPrint={(opts) => { setShowDoodDialog(false); setDoodOptions(opts); }} onClose={() => setShowDoodDialog(false)} />}
      {showShootingPlanDialog && <ShootingPlanDialog onPrint={(opts) => { setShowShootingPlanDialog(false); setShootingPlanOptions(opts); }} onClose={() => setShowShootingPlanDialog(false)} />}
      {showCastBreakdownDialog && <CastBreakdownDialog onPrint={(opts) => { setShowCastBreakdownDialog(false); setCastBreakdownOptions(opts); }} onClose={() => setShowCastBreakdownDialog(false)} />}
      {showCharAppearancesDialog && <CharacterAppearancesDialog onPrint={(opts) => { setShowCharAppearancesDialog(false); setCharAppearancesOptions(opts); }} onClose={() => setShowCharAppearancesDialog(false)} />}
      {showLocationBreakdownDialog && <LocationBreakdownDialog onPrint={(opts) => { setShowLocationBreakdownDialog(false); setLocationBreakdownOptions(opts); }} onClose={() => setShowLocationBreakdownDialog(false)} />}
      {showBreakdownSheetDialog && <BreakdownSheetDialog onPrint={(opts) => { setShowBreakdownSheetDialog(false); setBreakdownSheetOptions(opts); }} onClose={() => setShowBreakdownSheetDialog(false)} />}

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
              onClick={() => { setActiveTab('schedule'); setScheduleSubTab('stripboard'); }}
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'schedule' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Schedule
            </button>
            {activeTab === 'schedule' && (
              <DropdownMenu
                open={showScheduleMenu}
                onClose={() => setShowScheduleMenu(false)}
                width="w-40"
                trigger={
                  <button
                    onClick={() => setShowScheduleMenu(p => !p)}
                    className="p-1 hover:bg-zinc-800 rounded transition-colors"
                    title="Schedule view options"
                  >
                    <Settings className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                  </button>
                }
              >
                <DropdownItem onClick={() => { setScheduleSubTab('ribbons'); setShowScheduleMenu(false); }} icon={<Settings className="w-3.5 h-3.5" />}>
                  Ribbon Designer
                </DropdownItem>
              </DropdownMenu>
            )}
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'calendar' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Calendar
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
                <DropdownDivider />
                <div className="px-3 py-1 text-zinc-400 text-[9px] uppercase tracking-wider font-mono">Show</div>
                <button onClick={() => { setShowCalendarBreaks(!showCalendarBreaks); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 flex items-center justify-between">
                  <span>Breaks &amp; Notes</span>
                  <span className={`w-3 h-3 rounded border ${showCalendarBreaks ? 'bg-blue-500 border-blue-500' : 'border-zinc-500'}`} />
                </button>
              </DropdownMenu>
            )}
            <button 
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'rules' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Rules
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
                  Trash ({(project.trash?.length || 0) + (project.versionTrash?.length || 0) + (project.rulesTrash?.length || 0)})
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
              <DropdownItem onClick={() => { setShowExportMenu(false); setShowDoodDialog(true); }} icon={<Printer className="w-3.5 h-3.5" />}>
                Day Out of Days
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => { setShowExportMenu(false); setShowShootingPlanDialog(true); }} icon={<Printer className="w-3.5 h-3.5" />}>
                Shooting Plan
              </DropdownItem>
              <DropdownItem onClick={() => { setShowExportMenu(false); setShowCastBreakdownDialog(true); }} icon={<Printer className="w-3.5 h-3.5" />}>
                Cast Breakdown
              </DropdownItem>
              <DropdownItem onClick={() => { setShowExportMenu(false); setShowCharAppearancesDialog(true); }} icon={<Printer className="w-3.5 h-3.5" />}>
                Character Appearances
              </DropdownItem>
              <DropdownItem onClick={() => { setShowExportMenu(false); setShowLocationBreakdownDialog(true); }} icon={<Printer className="w-3.5 h-3.5" />}>
                Location Breakdown
              </DropdownItem>
              <DropdownItem onClick={() => { setShowExportMenu(false); setShowBreakdownSheetDialog(true); }} icon={<Printer className="w-3.5 h-3.5" />}>
                Scene Breakdown
              </DropdownItem>
            </DropdownMenu>
          <StorageStatus
            handle={storage.handle}
            status={storage.status}
            errorMessage={storage.errorMessage}
            onHandleChange={storage.setHandle}
            onStatusChange={storage.setStatus}
            onRestoreClick={(entries, projects) => setShowRestoreModal({ entries, projects })}
          />
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white min-h-0">
        {activeTab === 'breakdown' ? <BreakdownTab subTab={brSubTab} onSubTabChange={setBrSubTab} savedCat={brCategory} onCategoryChange={setBrCategory} savedSheetIdx={brSheetIdx} onSheetIdxChange={setBrSheetIdx} onOpenSheet={handleOpenSheet} /> : activeTab === 'schedule' ? <ScheduleTab onOpenScene={handleOpenScene} subTab={scheduleSubTab} onSubTabChange={setScheduleSubTab} /> : activeTab === 'calendar' ? <CalendarTab showDesc={showCalendarDesc} showBreaks={showCalendarBreaks} /> : <RulesTab />}
      </main>

      {showTrash && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setShowTrash(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
      <div style={{ background: '#ffffff', width: '100%' }}>
                <h2 className="text-white font-bold text-sm">Trash</h2>
                <p className="text-zinc-500 text-[11px] mt-0.5">Items expire after 30 days</p>
              </div>
              <button onClick={() => setShowTrash(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {(() => {
                const items: Array<{ kind: 'scene'; id: string; data: TrashItem }
                  | { kind: 'version'; id: string; data: VersionTrashItem }
                  | { kind: 'rule'; id: string; data: RuleTrashItem }> = [
                    ...(project.trash || []).map(t => ({ kind: 'scene' as const, id: t.scene.id, data: t })),
                    ...(project.versionTrash || []).map(t => ({ kind: 'version' as const, id: t.version.id, data: t })),
                    ...(project.rulesTrash || []).map(t => ({ kind: 'rule' as const, id: t.rule.id, data: t })),
                  ].sort((a, b) => b.data.deletedAt - a.data.deletedAt);
                if (items.length === 0) {
                  return <div className="text-zinc-500 text-center py-12 text-sm">Trash is empty</div>;
                }
                return items.map(item => {
                  let title: string;
                  let subtitle: string;
                  if (item.kind === 'scene') {
                    const t = item.data as TrashItem;
                    title = `${t.scene.sceneNumber}. ${t.scene.set}`;
                    subtitle = `${t.versionName} · ${formatTime(t.deletedAt)}`;
                  } else if (item.kind === 'version') {
                    const t = item.data as VersionTrashItem;
                    title = t.version.name;
                    subtitle = `Version · ${formatTime(t.deletedAt)}`;
                  } else {
                    const t = item.data as RuleTrashItem;
                    const meta = RULE_TYPE_META[t.rule.type];
                    const castLabel = t.rule.type === 'CAST_CONFLICT' || t.rule.type === 'CAST_SCENE_FLAG'
                      ? getRuleSearchText(t.rule) || 'multiple'
                      : t.rule.castId;
                    title = `${meta.short} · Cast ${castLabel} · ${describeRule(t.rule)}`;
                    subtitle = `Rule · ${formatTime(t.deletedAt)}`;
                  }
                  const actionType = item.kind === 'scene' ? 'RESTORE_SCENE'
                    : item.kind === 'version' ? 'RESTORE_VERSION_FROM_TRASH'
                    : 'RESTORE_RULE_FROM_TRASH';
                  return (
                    <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-zinc-900 group">
                      <div className="min-w-0">
                        <div className="text-white text-sm font-semibold truncate">{title}</div>
                        <div className="text-zinc-500 text-[11px] mt-0.5">{subtitle}</div>
                      </div>
                      <button
                        onClick={() => dispatch({ type: actionType as any, payload: item.id })}
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white p-1 rounded transition-all"
                        title="Restore"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
            {((project.trash?.length || 0) + (project.versionTrash?.length || 0) + (project.rulesTrash?.length || 0)) > 0 && (
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

      {showRestoreModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowRestoreModal(null)}>
          <div
            className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-sky-400" />
                <h2 className="text-white font-bold text-sm">Restore from folder</h2>
              </div>
              <button onClick={() => setShowRestoreModal(null)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-3 text-zinc-400 text-xs border-b border-zinc-800">
              {showRestoreModal.entries.length} {showRestoreModal.entries.length === 1 ? 'project' : 'projects'} found in your save folder.
              Restoring will merge them with your current projects.
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {showRestoreModal.entries.length === 0 ? (
                <div className="text-zinc-500 text-center py-12 text-sm">No projects in folder.</div>
              ) : (
                showRestoreModal.entries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-zinc-900">
                    <div className="min-w-0">
                      <div className="text-white text-sm font-semibold truncate">{entry.title || 'Untitled'}</div>
                      <div className="text-zinc-500 text-[11px] mt-0.5">
                        Last saved {new Date(entry.lastModified).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-zinc-800 px-5 py-3 flex items-center gap-2">
              <button
                onClick={() => setShowRestoreModal(null)}
                className="flex-1 px-4 py-2 rounded text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={showRestoreModal.projects.length === 0}
                onClick={async () => {
                  try {
                    const projectsToImport: Project[] = showRestoreModal.projects.map(p => JSON.parse(p.data));
                    for (const proj of projectsToImport) {
                      try {
                        importProjectFromData(proj);
                      } catch (e) {
                        console.error('Failed to import', proj.id, e);
                      }
                    }
                    setShowRestoreModal(null);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="flex-1 px-4 py-2 rounded text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Restore {showRestoreModal.projects.length} {showRestoreModal.projects.length === 1 ? 'project' : 'projects'}
              </button>
            </div>
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

