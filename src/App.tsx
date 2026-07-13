/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useLayoutEffect, useEffect, useRef, useCallback } from 'react';
import { ProjectProvider, useProject, DEFAULT_CATEGORY_LABELS } from './store';
import { useDialog } from './components/Dialog';
import { TrashItem, VersionTrashItem, RuleTrashItem, RibbonTrashItem, ElementTrashItem, CategoryTrashItem, ColorRuleTrashItem, Project } from './types';
import { BreakdownTab } from './components/BreakdownTab';
import { ScheduleTab } from './components/ScheduleTab';
import { CalendarTab } from './components/CalendarTab';
import { RulesTab } from './components/RulesTab';
import DesignTab from './components/DesignTab';
import { ProjectManager } from './components/ProjectManager';
import PrintDialog, { PrintOptions } from './components/PrintDialog';
import PrintSchedule from './components/PrintSchedule';
import DoodDialog, { DoodOptions } from './components/print/DoodDialog';
import Dood from './components/print/Dood';
import BreakdownSheetDialog, { BreakdownSheetOptions } from './components/print/BreakdownSheetDialog';
import BreakdownSheet from './components/print/BreakdownSheet';
import ElementBreakdownDialog, { ElementBreakdownOptions } from './components/print/ElementBreakdownDialog';
import ElementBreakdown from './components/print/ElementBreakdown';
import ReportsTab from './components/ReportsTab';
import DropdownMenu from './components/DropdownMenu';
import DropdownItem from './components/DropdownItem';
import DropdownDivider from './components/DropdownDivider';
import DropdownSubmenu from './components/DropdownSubmenu';
import Modal from './components/Modal';
import { ModalFooter } from './components/Modal';
import { useStorage, SaveStatus, ProjectIndexEntry } from './components/StorageStatus';
import { RULE_TYPE_META, describeRule, getRuleSearchText } from './components/rules/ruleMeta';
import { writeProjectToFolder } from './lib/persistentStorage';
import ImportDialog from './components/ImportDialog';
import { parseFDX, parseFountain, parseCSV, ImportResult, exportBreakdownCSV } from './lib/importScreenplay';
import { generateUUID, exportProjectFromStorage } from './lib/utils';
import { SaveIndicator } from './components/SaveIndicator';
import { useGoogleAuth } from './lib/googleDriveAuth';
import { Download, Printer, Copy, Trash2, Plus, Pencil, Check, X, ChevronDown, Undo2, Redo2, FolderOpen, RotateCcw, HardDrive, FileUp, WifiOff, ClipboardList, CalendarClock, CalendarDays, Layout, Gavel, FileText, Cloud, LogOut, ExternalLink } from 'lucide-react';
import PopoutWindow, { PopoutPlaceholder } from './components/PopoutWindow';
import VersionToolbar from './components/VersionToolbar';
import { LongPressMenuProvider } from './lib/useLongPressMenu';
import { IS_COARSE } from './lib/device';
import SelectionModeButton from './components/SelectionModeButton';
import KeyboardToggleButton from './components/KeyboardToggleButton';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function AppContent() {
  const { state, dispatch, currentProjectId, createProject, readOnly, projectList, renameProject, registerPostSaveHandler } = useProject();
  const dialog = useDialog();
  const [activeTab, setActiveTab] = useState<'breakdown' | 'schedule' | 'calendar' | 'design' | 'rules' | 'reports'>('breakdown');
  const [designSubTab, setDesignSubTab] = useState<'colors' | 'ribbons'>('ribbons');
  const [brSubTab, setBrSubTab] = useState<'elements' | 'sheet' | 'glide'>('glide');
  const [brCategory, setBrCategory] = useState('cast');
  const [brSheetIdx, setBrSheetIdx] = useState(0);
  const [reportsSubTab, setReportsSubTab] = useState<'doods' | 'elementBreakdown'>('doods');
  const [reportsCategory, setReportsCategory] = useState('cast');
  const [scheduleTargetScene, setScheduleTargetScene] = useState<string | null>(null);
  const [scheduleScrollTop, setScheduleScrollTop] = useState(0);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const [poppedOutTabs, setPoppedOutTabs] = useState<Set<string>>(new Set());
  const popoutWindowsRef = useRef<Map<string, Window>>(new Map());

  const togglePopout = (tabId: string) => {
    setPoppedOutTabs(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) {
        next.delete(tabId);
        const w = popoutWindowsRef.current.get(tabId);
        if (w && !w.closed) w.close();
        popoutWindowsRef.current.delete(tabId);
      } else {
        const left = Math.round((screen.width - 1200) / 2);
        const top = Math.round((screen.height - 800) / 2);
        const w = window.open('', `popout_${tabId}`, `width=1200,height=800,left=${left},top=${top}`);
        if (!w) return prev;
        popoutWindowsRef.current.set(tabId, w);
        next.add(tabId);
      }
      return next;
    });
  };

  const closePopout = (tabId: string) => {
    setPoppedOutTabs(prev => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    popoutWindowsRef.current.delete(tabId);
  };

  const tabLabels: Record<string, string> = {
    breakdown: 'Breakdown', schedule: 'Schedule', calendar: 'Calendar',
    design: 'Design', rules: 'Rules', reports: 'Reports',
  };

  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const handleOpenSheet = useCallback((rowIndex: number) => {
    setBrSubTab('sheet');
    setBrSheetIdx(rowIndex);
    if (!poppedOutTabs.has('breakdown')) setActiveTab('breakdown');
  }, [poppedOutTabs]);

  const handleOpenScene = useCallback((sceneId: string) => {
    const idx = state.present.scenes.findIndex(s => s.id === sceneId);
    if (idx >= 0) {
      setBrSubTab('sheet');
      setBrSheetIdx(idx);
      if (!poppedOutTabs.has('breakdown')) setActiveTab('breakdown');
    }
  }, [state.present.scenes, poppedOutTabs]);

  const handleOpenScheduleAtScene = useCallback((sceneId: string) => {
    setScheduleTargetScene(sceneId);
    if (!poppedOutTabs.has('schedule')) setActiveTab('schedule');
  }, [poppedOutTabs]);

  const handleOpenSheetInPopout = useCallback((rowIndex: number) => {
    if (IS_COARSE) return;
    setBrSubTab('sheet');
    setBrSheetIdx(rowIndex);
    if (!poppedOutTabs.has('breakdown')) togglePopout('breakdown');
  }, [poppedOutTabs]);

  const handleOpenSceneInPopout = useCallback((sceneId: string) => {
    if (IS_COARSE) return;
    const idx = state.present.scenes.findIndex(s => s.id === sceneId);
    if (idx >= 0) {
      setBrSubTab('sheet');
      setBrSheetIdx(idx);
      if (!poppedOutTabs.has('breakdown')) togglePopout('breakdown');
    }
  }, [state.present.scenes, poppedOutTabs]);

  const handleOpenScheduleInPopout = useCallback((sceneId: string) => {
    if (IS_COARSE) return;
    setScheduleTargetScene(sceneId);
    if (!poppedOutTabs.has('schedule')) togglePopout('schedule');
  }, [poppedOutTabs]);

  const handleClearScheduleTarget = useCallback(() => setScheduleTargetScene(null), []);

  useEffect(() => {
    if (IS_COARSE && typeof document !== 'undefined') {
      const opts: AddEventListenerOptions = { passive: false };
      document.addEventListener('gesturestart', e => e.preventDefault(), opts);
      document.addEventListener('gesturechange', e => e.preventDefault(), opts);
      document.addEventListener('gestureend', e => e.preventDefault(), opts);
    }
  }, []);

  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (readOnly) {
      setShowOfflineModal(true);
      setShowRestoredBanner(false);
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowRestoredBanner(true);
      const timer = setTimeout(() => setShowRestoredBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [readOnly]);

  const handleRetryConnection = useCallback(() => {
    if (navigator.onLine) {
      setShowOfflineModal(false);
    }
  }, []);

  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showVersionsMenu, setShowVersionsMenu] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showDoodDialog, setShowDoodDialog] = useState(false);
  const [showBreakdownSheetDialog, setShowBreakdownSheetDialog] = useState(false);
  const [showElementBreakdownDialog, setShowElementBreakdownDialog] = useState(false);
  const [printDialogCategory, setPrintDialogCategory] = useState<string | undefined>(undefined);
  const [pendingImport, setPendingImport] = useState<{ result: ImportResult; fileName: string } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let result: ImportResult;
      if (ext === 'fdx') {
        result = await parseFDX(file);
      } else if (ext === 'csv') {
        result = await parseCSV(file, state.present.castMembers || [], state.present.customCategories || [], state.present.categoryLabels || {});
      } else {
        result = await parseFountain(file);
      }
      setPendingImport({ result, fileName: file.name });
    } catch (e: any) {
      dialog.alert({ title: 'Import Error', message: e.message || 'Failed to parse file' });
    }
  }, [dialog, state.present.castMembers, state.present.customCategories, state.present.categoryLabels]);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [compactTabs, setCompactTabs] = useState(window.innerWidth < 900);
  const [tabDropdownOpen, setTabDropdownOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setCompactTabs(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [printOptions, setPrintOptions] = useState<PrintOptions | null>(null);
  const [doodOptions, setDoodOptions] = useState<DoodOptions | null>(null);
  const [breakdownSheetOptions, setBreakdownSheetOptions] = useState<BreakdownSheetOptions | null>(null);
  const [elementBreakdownOptions, setElementBreakdownOptions] = useState<ElementBreakdownOptions | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState<{ entries: ProjectIndexEntry[]; projects: { id: string; data: string }[] } | null>(null);
  const driveCtx = useGoogleAuth();
  const topTabContainerRef = useRef<HTMLDivElement>(null);
  const topTabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [topTabOverlayStyle, setTopTabOverlayStyle] = useState<React.CSSProperties>({ background: '#ffffff' });
  const [hoveredTopTab, setHoveredTopTab] = useState<string | null>(null);
  const [hoverTopTabStyle, setHoverTopTabStyle] = useState<React.CSSProperties>({});
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const noProject = currentProjectId === null;
  const isCloudProject = !!projectList.find(p => p.id === currentProjectId)?.driveFileId;

  const topTabIsDark = activeTab === 'reports' || activeTab === 'design';
  const topTabOverlayReady = 'left' in topTabOverlayStyle;
  const inactiveTabText = isCloudProject ? 'text-white/70 hover:text-white' : 'text-zinc-400 hover:text-zinc-200';

  const measureTopOverlay = () => {
    const el = topTabRefs.current.get(activeTab);
    const container = topTabContainerRef.current;
    if (!el || !container) return;
    const cr = container.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const isDark = activeTab === 'reports' || activeTab === 'design';
    const left = er.left - cr.left;
    const width = er.width;
    const bg = isDark ? '#18181b' : '#ffffff';
    const borders = isDark ? { borderLeft: '1px solid #52525b', borderRight: '1px solid #52525b', borderTop: '1px solid #52525b' } : {};
    setTopTabOverlayStyle({ left, width, opacity: 1, transform: 'translateY(0)', background: bg, ...borders });
  };

  useLayoutEffect(() => {
    const el = topTabRefs.current.get(activeTab);
    if (!el) return;
    const ro = new ResizeObserver(() => measureTopOverlay());
    ro.observe(el);
    measureTopOverlay();
    return () => ro.disconnect();
  }, [activeTab, designSubTab]);

  const updateTopHover = (tabId: string | null) => {
    setHoveredTopTab(tabId);
    if (tabId && tabId !== activeTab) {
      const el = topTabRefs.current.get(tabId);
      const container = topTabContainerRef.current;
      if (!el || !container) return;
      const cr = container.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      setHoverTopTabStyle({ left: er.left - cr.left, width: er.width });
    }
  };

  const storage = useStorage();
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

  useEffect(() => { if (!breakdownSheetOptions) return; const onAP = () => setBreakdownSheetOptions(null); window.addEventListener('afterprint', onAP); setTimeout(() => window.print(), 200); return () => window.removeEventListener('afterprint', onAP); }, [breakdownSheetOptions]);
  useEffect(() => { if (!elementBreakdownOptions) return; const onAP = () => setElementBreakdownOptions(null); window.addEventListener('afterprint', onAP); setTimeout(() => window.print(), 200); return () => window.removeEventListener('afterprint', onAP); }, [elementBreakdownOptions]);

  useEffect(() => {
    registerPostSaveHandler(storage.handle && currentProjectId ? async (project: Project) => {
      try {
        await writeProjectToFolder(storage.handle!, project);
        storage.setStatus('saved');
      } catch (e: any) {
        const msg = e?.message || 'Save failed';
        const isPerm = /permission/i.test(msg);
        storage.setStatus(isPerm ? 'no-permission' : 'error', msg);
      }
    } : null);
  }, [storage.handle, currentProjectId, registerPostSaveHandler]);

  if (doodOptions) {
    const elementIds = doodOptions.elementIds || doodOptions.castIds;
    const category = doodOptions.selectedCategory || 'cast';
    return (
      <div>
        <Dood
          title={project.title || 'Production Schedule'}
          scenes={project.scenes}
          scheduleRows={version?.rows || []}
          dayMeta={version?.dayMeta || {}}
          castMembers={project.castMembers || []}
          elementIds={elementIds}
          dayInts={doodOptions.dayInts}
          includeNonShooting={doodOptions.includeNonShooting}
          showTotals={doodOptions.showTotals}
          category={category}
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
          customCategories={project.customCategories || []}
          sortOrder={breakdownSheetOptions.sortOrder}
          sceneIds={breakdownSheetOptions.sceneIds}
          hiddenCategories={project.hiddenCategories || []}
        />
      </div>
    );
  }

  if (elementBreakdownOptions) {
    return (
      <div>
        <ElementBreakdown
          title={project.title || 'Production Schedule'}
          scenes={project.scenes}
          rows={version?.rows || []}
          dayMeta={version?.dayMeta || {}}
          castMembers={project.castMembers || []}
          customCategories={project.customCategories || []}
          category={elementBreakdownOptions.category}
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
        <PrintSchedule project={project} showTimes={printOptions.showTimes} showDurations={printOptions.showDurations} showCastList={printOptions.showCastList} showExportDate={printOptions.showExportDate} showPageNumbers={printOptions.showPageNumbers} selectedDays={printOptions.selectedDays} includeStatusDays={printOptions.includeStatusDays} fileName={fileName} ribbon={printOptions.selectedRibbonId ? project.ribbonDesigns.find(d => d.id === printOptions.selectedRibbonId)?.rows : undefined} colWidths={printOptions.selectedRibbonId ? project.ribbonDesigns.find(d => d.id === printOptions.selectedRibbonId)?.colWidths : undefined} cellPaddingV={printOptions.selectedRibbonId ? project.ribbonDesigns.find(d => d.id === printOptions.selectedRibbonId)?.cellPaddingV : undefined} cellPaddingH={printOptions.selectedRibbonId ? project.ribbonDesigns.find(d => d.id === printOptions.selectedRibbonId)?.cellPaddingH : undefined} edgePadding={printOptions.selectedRibbonId ? project.ribbonDesigns.find(d => d.id === printOptions.selectedRibbonId)?.edgePadding : undefined} cellBorders={printOptions.cellBorders} viewMode={printOptions.viewMode} />
      </div>
    );
  }

  if (noProject) {
    return <ProjectManager />;
  }

  const handleExportJSON = () => {
    exportProjectFromStorage(currentProjectId, project.title || 'Export');
  };
  
  const handleExportCSV = () => {
    exportBreakdownCSV(project);
  };

  return (
    <LongPressMenuProvider>
    <>
    <style>{`
      @keyframes pen-flash-light {
        0% { background-color: rgba(0,0,0,0.08); }
        100% { background-color: transparent; }
      }
      @keyframes pen-flash-dark {
        0% { background-color: rgba(255,255,255,0.12); }
        100% { background-color: transparent; }
      }
      .pen-pulse {
        animation: pen-flash-light 0.35s ease-out;
      }
      .pen-pulse-dark {
        animation: pen-flash-dark 0.35s ease-out;
      }
    `}</style>
    <div className="h-screen bg-white flex flex-col text-[13px] print:bg-white print:text-black overflow-hidden">
      {showProjectManager && (
        <ProjectManager onClose={() => setShowProjectManager(false)} />
      )}

      {showPrintDialog && <PrintDialog onPrint={(opts) => { setShowPrintDialog(false); setPrintOptions(opts); }} onClose={() => setShowPrintDialog(false)} />}
      {showDoodDialog && <DoodDialog selectedCategory={printDialogCategory} onPrint={(opts) => { setShowDoodDialog(false); setPrintDialogCategory(undefined); setDoodOptions(opts); }} onClose={() => { setShowDoodDialog(false); setPrintDialogCategory(undefined); }} />}
      {showBreakdownSheetDialog && <BreakdownSheetDialog onPrint={(opts) => { setShowBreakdownSheetDialog(false); setBreakdownSheetOptions(opts); }} onClose={() => setShowBreakdownSheetDialog(false)} />}
      {showElementBreakdownDialog && <ElementBreakdownDialog selectedCategory={printDialogCategory} onPrint={(opts) => { setShowElementBreakdownDialog(false); setPrintDialogCategory(undefined); setElementBreakdownOptions(opts); }} onClose={() => { setShowElementBreakdownDialog(false); setPrintDialogCategory(undefined); }} />}
      {pendingImport && <ImportDialog initialResult={pendingImport.result} initialFileName={pendingImport.fileName} onClose={() => setPendingImport(null)} />}
      <input ref={importFileRef} type="file" accept=".csv,.fdx,.fountain,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); if (importFileRef.current) importFileRef.current.value = ''; }} className="hidden" />

      {/* RESTORED BANNER */}
      {showRestoredBanner && (
        <div className="bg-green-600 text-white px-4 py-1.5 flex items-center justify-center text-xs shrink-0 print:hidden">
          <span className="font-medium">Connection restored</span>
        </div>
      )}
      {/* OFFLINE BANNER */}
      {readOnly && (
        <div className="bg-red-600 text-white px-4 py-1.5 flex items-center justify-between text-xs shrink-0 print:hidden">
          <span className="font-medium">No Internet Connection - editing is disabled</span>
          <button
            onClick={handleRetryConnection}
            className="ml-3 px-2.5 py-1 rounded bg-red-700 hover:bg-red-500 transition-colors font-semibold"
          >
            Retry Connection
          </button>
        </div>
      )}
      {showOfflineModal && (
        <Modal open={showOfflineModal} onClose={() => setShowOfflineModal(false)} title="You're offline" icon={<WifiOff className="w-5 h-5 text-zinc-400" />} width="max-w-md"
          footer={
            <ModalFooter>
              <button
                onClick={() => setShowOfflineModal(false)}
                className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors"
              >
                OK
              </button>
            </ModalFooter>
          }
        >
          <div className="px-5 py-3 text-zinc-400 text-xs border-b border-zinc-800">
            Lemon Schedule requires an internet connection. You can continue to browse your project,
            but all editing controls are currently disabled.
          </div>
        </Modal>
      )}

      {/* HEADER */}
      <header className={`flex items-center justify-between ${isCloudProject ? 'bg-blue-950' : 'bg-zinc-950'} text-zinc-300 px-4 py-2 select-none print:hidden`}>
        <div className="flex items-center space-x-6">
          <div className="flex items-center gap-2">
            <DropdownMenu
              open={showFileMenu}
              onOpenChange={setShowFileMenu}
              width="w-56"
              align="left"
              theme={isCloudProject ? 'blue' : 'dark'}
              trigger={
                <button
                  className={`flex items-center space-x-1.5 rounded transition-colors px-3 py-1.5 font-sans cursor-pointer select-none ${isCloudProject ? 'text-white hover:bg-blue-900/60' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                >
                  <span>File</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              }
            >
              <DropdownItem onClick={async () => { setShowFileMenu(false); const name = await dialog.prompt({ title: 'Name the Project', defaultValue: 'Untitled Project', placeholder: 'Project name' }); if (name) { await createProject(name); } }} icon={<Plus className="w-3.5 h-3.5" />}>
                New Project
              </DropdownItem>
              <DropdownItem onClick={() => { setShowFileMenu(false); setShowProjectManager(true); }} icon={<FolderOpen className="w-3.5 h-3.5" />}>
                Project Manager
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => { setShowFileMenu(false); importFileRef.current?.click(); }} icon={<FileUp className="w-3.5 h-3.5" />}>
                Import Screenplay (FDX, Fountain, TXT, CSV)...
              </DropdownItem>
              <DropdownDivider />
              <DropdownSubmenu id="export-file" label="Export" icon={<Download className="w-3.5 h-3.5" />} width="w-48">
                <DropdownItem onClick={() => { setShowFileMenu(false); handleExportCSV(); }}>
                  Breakdown to CSV
                </DropdownItem>
                <DropdownItem onClick={() => { setShowFileMenu(false); handleExportJSON(); }}>
                  Export Project
                </DropdownItem>
              </DropdownSubmenu>
              <DropdownSubmenu id="print-file" label="Print" icon={<Printer className="w-3.5 h-3.5" />} width="w-48">
                <DropdownItem onClick={() => { setShowFileMenu(false); setShowPrintDialog(true); }}>
                  Schedule...
                </DropdownItem>
                <DropdownItem onClick={() => { setShowFileMenu(false); setShowDoodDialog(true); }}>
                  Day Out of Days...
                </DropdownItem>
                <DropdownItem onClick={() => { setShowFileMenu(false); setShowBreakdownSheetDialog(true); }}>
                  Scene Breakdown...
                </DropdownItem>
                <DropdownItem onClick={() => { setShowFileMenu(false); setShowElementBreakdownDialog(true); }}>
                  Element Breakdown...
                </DropdownItem>
              </DropdownSubmenu>
              <DropdownDivider />
              {driveCtx.isSignedIn ? (
                <DropdownItem onClick={() => { setShowFileMenu(false); driveCtx.signOut(); }} icon={<LogOut className="w-3.5 h-3.5" />}>
                  Sign out{driveCtx.user ? ` (${driveCtx.user.name})` : ''}
                </DropdownItem>
              ) : (
                <DropdownItem onClick={() => { setShowFileMenu(false); driveCtx.signIn(); }} icon={<Cloud className="w-3.5 h-3.5" />}>
                  Sign in with Google Drive...
                </DropdownItem>
              )}
              <DropdownDivider />
              <DropdownItem onClick={() => { setShowFileMenu(false); setShowTrash(true); }} icon={<Trash2 className="w-3.5 h-3.5" />}>
                Trash...
              </DropdownItem>
            </DropdownMenu>
            <SaveIndicator isCloudProject={isCloudProject} />
            <input 
              value={project.title} 
              onChange={e => {
                dispatch({type: 'UPDATE_PROJECT', payload: {title: e.target.value}});
              }}
              onBlur={e => {
                renameProject(currentProjectId!, e.target.value, projectList.find(p => p.id === currentProjectId)?.driveFileId);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className={`bg-transparent border-none text-white font-medium rounded px-1 outline-none font-sans ${isCloudProject ? 'focus:ring-1 focus:ring-blue-600' : 'focus:ring-1 focus:ring-zinc-600'}`}
            />
          </div>
          <div ref={topTabContainerRef} className="relative flex items-center gap-1">
            {compactTabs ? (
              <div className="flex-1 flex justify-center">
              <DropdownMenu
                open={tabDropdownOpen}
                onOpenChange={setTabDropdownOpen}
                width="w-44"
                theme={isCloudProject ? 'blue' : 'dark'}
                trigger={
                  <button className={`flex items-center gap-1.5 border transition-colors text-white px-3 py-1.5 rounded cursor-pointer select-none font-sans text-xs font-semibold ${isCloudProject ? 'bg-blue-900 border-blue-800 hover:bg-blue-800' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'}`}>
                    <span>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>
                }
              >
                {(['breakdown', 'schedule', 'calendar', 'design', 'rules', 'reports'] as const).map(tab => {
                  const Icon = tab === 'breakdown' ? ClipboardList : tab === 'schedule' ? CalendarClock : tab === 'calendar' ? CalendarDays : tab === 'design' ? Layout : tab === 'rules' ? Gavel : FileText;
                  return (
                    <DropdownItem
                      key={tab}
                      onClick={() => { setActiveTab(tab); setTabDropdownOpen(false); }}
                      icon={<Icon className="w-3.5 h-3.5" />}
                      rightAction={!IS_COARSE ? {
                        icon: <ExternalLink className="w-3 h-3" />,
                        title: "Open in separate window",
                        onClick: () => {
                          setTabDropdownOpen(false);
                          if (!poppedOutTabs.has(tab)) {
                            togglePopout(tab);
                            if (tab === activeTab) {
                              const allTabs = ['breakdown', 'schedule', 'calendar', 'design', 'rules', 'reports'];
                              const next = allTabs.find(t => t !== tab && !poppedOutTabs.has(t)) || allTabs.find(t => t !== tab);
                              if (next) setActiveTab(next as any);
                            }
                          } else {
                            closePopout(tab);
                          }
                        },
                      } : undefined}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </DropdownItem>
                  );
                })}
              </DropdownMenu>
              </div>
            ) : (<>
            <span
              className="absolute top-0.5 -bottom-4 bg-white rounded-t-md pointer-events-none"
              style={{ ...topTabOverlayStyle, transition: 'none' }}
            />
            {hoveredTopTab && hoveredTopTab !== activeTab && (
              <span
                className={`absolute top-0.5 -bottom-4 rounded-t-md pointer-events-none ${isCloudProject ? 'bg-blue-900/70' : 'bg-zinc-700/70'}`}
                style={{ ...hoverTopTabStyle, transition: 'none' }}
              />
            )}
            <button 
              ref={el => { if (el) topTabRefs.current.set('breakdown', el); }}
              onClick={() => setActiveTab('breakdown')} 
              onMouseEnter={() => updateTopHover('breakdown')}
              onMouseLeave={() => updateTopHover(null)}
              className={`relative group px-3 py-1.5 rounded-t-md text-xs font-semibold transition-colors ${activeTab === 'breakdown' ? (topTabIsDark || !topTabOverlayReady ? 'text-white' : isCloudProject ? 'text-blue-950' : 'text-zinc-900') : inactiveTabText}`}
            >
              <span className="relative">Breakdown</span>
              <span
                onClick={(e) => { e.stopPropagation(); togglePopout('breakdown'); }}
                className={`ml-1.5 inline-flex items-center transition-opacity cursor-pointer text-zinc-400 hover:text-zinc-200 ${IS_COARSE ? '' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                title="Open in separate window"
              >
                <ExternalLink className="w-3 h-3" />
              </span>
            </button>
            <button 
              ref={el => { if (el) topTabRefs.current.set('schedule', el); }}
              onMouseEnter={() => updateTopHover('schedule')}
              onMouseLeave={() => updateTopHover(null)}
              onClick={() => setActiveTab('schedule')}
              className={`relative group px-3 py-1.5 rounded-t-md text-xs font-semibold transition-colors ${activeTab === 'schedule' ? (topTabIsDark || !topTabOverlayReady ? 'text-white' : isCloudProject ? 'text-blue-950' : 'text-zinc-900') : inactiveTabText}`}
            >
              <span className="relative">Schedule</span>
              <span
                onClick={(e) => { e.stopPropagation(); togglePopout('schedule'); }}
                className={`ml-1.5 inline-flex items-center transition-opacity cursor-pointer text-zinc-400 hover:text-zinc-200 ${IS_COARSE ? '' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                title="Open in separate window"
              >
                <ExternalLink className="w-3 h-3" />
              </span>
            </button>
            <button 
              ref={el => { if (el) topTabRefs.current.set('calendar', el); }}
              onMouseEnter={() => updateTopHover('calendar')}
              onMouseLeave={() => updateTopHover(null)}
              onClick={() => setActiveTab('calendar')}
              className={`relative group px-3 py-1.5 rounded-t-md text-xs font-semibold transition-colors ${activeTab === 'calendar' ? (topTabIsDark || !topTabOverlayReady ? 'text-white' : isCloudProject ? 'text-blue-950' : 'text-zinc-900') : inactiveTabText}`}
            >
              <span className="relative">Calendar</span>
              <span
                onClick={(e) => { e.stopPropagation(); togglePopout('calendar'); }}
                className={`ml-1.5 inline-flex items-center transition-opacity cursor-pointer text-zinc-400 hover:text-zinc-200 ${IS_COARSE ? '' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                title="Open in separate window"
              >
                <ExternalLink className="w-3 h-3" />
              </span>
            </button>
            <button 
              ref={el => { if (el) topTabRefs.current.set('design', el); }}
              onMouseEnter={() => updateTopHover('design')}
              onMouseLeave={() => updateTopHover(null)}
              onClick={() => setActiveTab('design')}
              className={`relative group px-3 py-1.5 rounded-t-md text-xs font-semibold transition-colors ${activeTab === 'design' ? (topTabIsDark || !topTabOverlayReady ? 'text-white' : isCloudProject ? 'text-blue-950' : 'text-zinc-900') : inactiveTabText}`}
            >
              <span className="relative">Design</span>
              <span
                onClick={(e) => { e.stopPropagation(); togglePopout('design'); }}
                className={`ml-1.5 inline-flex items-center transition-opacity cursor-pointer text-zinc-400 hover:text-zinc-200 ${IS_COARSE ? '' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                title="Open in separate window"
              >
                <ExternalLink className="w-3 h-3" />
              </span>
            </button>
            <button 
              ref={el => { if (el) topTabRefs.current.set('rules', el); }}
              onMouseEnter={() => updateTopHover('rules')}
              onMouseLeave={() => updateTopHover(null)}
              onClick={() => setActiveTab('rules')}
              className={`relative group px-3 py-1.5 rounded-t-md text-xs font-semibold transition-colors ${activeTab === 'rules' ? (topTabIsDark || !topTabOverlayReady ? 'text-white' : isCloudProject ? 'text-blue-950' : 'text-zinc-900') : inactiveTabText}`}
            >
              <span className="relative">Rules</span>
              <span
                onClick={(e) => { e.stopPropagation(); togglePopout('rules'); }}
                className={`ml-1.5 inline-flex items-center transition-opacity cursor-pointer text-zinc-400 hover:text-zinc-200 ${IS_COARSE ? '' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                title="Open in separate window"
              >
                <ExternalLink className="w-3 h-3" />
              </span>
            </button>
            <button 
              ref={el => { if (el) topTabRefs.current.set('reports', el); }}
              onMouseEnter={() => updateTopHover('reports')}
              onMouseLeave={() => updateTopHover(null)}
              onClick={() => setActiveTab('reports')}
              className={`relative group px-3 py-1.5 rounded-t-md text-xs font-semibold transition-colors ${activeTab === 'reports' ? (topTabIsDark || !topTabOverlayReady ? 'text-white' : isCloudProject ? 'text-blue-950' : 'text-zinc-900') : inactiveTabText}`}
            >
              <span className="relative">Reports</span>
              <span
                onClick={(e) => { e.stopPropagation(); togglePopout('reports'); }}
                className={`ml-1.5 inline-flex items-center transition-opacity cursor-pointer text-zinc-400 hover:text-zinc-200 ${IS_COARSE ? '' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                title="Open in separate window"
              >
                <ExternalLink className="w-3 h-3" />
              </span>
            </button>
            </>)}
          </div>
        </div>

        <div className="flex items-center space-x-3 font-mono text-xs">
          <div className={`flex items-center gap-1 rounded-md p-0.5 border ${isCloudProject ? 'bg-blue-900 border-blue-800' : 'bg-zinc-900 border-zinc-800'}`}>
            <button
              onClick={() => dispatch({ type: 'UNDO' })}
              disabled={state.past.length === 0}
              className={`p-1.5 rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${isCloudProject ? 'hover:bg-blue-800' : 'hover:bg-zinc-800'}`}
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => dispatch({ type: 'REDO' })}
              disabled={state.future.length === 0}
              className={`p-1.5 rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${isCloudProject ? 'hover:bg-blue-800' : 'hover:bg-zinc-800'}`}
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
                  className={`flex items-center space-x-1.5 border transition-colors text-white px-3 py-1.5 rounded cursor-pointer select-none font-sans font-medium ${isCloudProject ? 'bg-blue-900 border-blue-800 hover:bg-blue-800' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'}`}
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
                          <button onClick={() => { const name = `${v.name} Copy`; const newId = generateUUID(); dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: v.id, id: newId } }); setEditingVersionId(newId); setEditingName(name); }} className="p-1 hover:bg-zinc-800 rounded hover:text-white transition-colors" title="Duplicate version">
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                          <button onClick={async () => { if (project.versions.length <= 1) return; const ok = await dialog.confirm({ title: `Delete "${v.name}"?`, message: 'This cannot be undone.', danger: true }); if (ok) { dispatch({ type: 'DELETE_VERSION', payload: v.id }); } }} disabled={project.versions.length <= 1} className={`p-1 rounded transition-colors ${project.versions.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-rose-950/40 hover:text-rose-400'}`} title="Delete version">
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
                <DropdownDivider />
                <DropdownItem onClick={() => { setShowVersionsMenu(false); setShowTrash(true); }} icon={<Trash2 className="w-3.5 h-3.5" />}>
                  Trash ({(project.trash?.length || 0) + (project.versionTrash?.length || 0) + (project.rulesTrash?.length || 0) + (project.ribbonTrash?.length || 0) + (project.elementsTrash?.length || 0) + (project.categoryTrash?.length || 0) + (project.colorRulesTrash?.length || 0)})
                </DropdownItem>
              </div>
            </DropdownMenu>

        </div>
      </header>

      {/* POPOUT WINDOWS */}
      {poppedOutTabs.has('breakdown') && popoutWindowsRef.current.get('breakdown') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Breakdown`} win={popoutWindowsRef.current.get('breakdown')!} onClose={() => closePopout('breakdown')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Breakdown" onClose={() => closePopout('breakdown')} />
            <div className="flex-1 min-h-0">
              <BreakdownTab subTab={brSubTab} onSubTabChange={setBrSubTab} savedCat={brCategory} onCategoryChange={setBrCategory} savedSheetIdx={brSheetIdx} onSheetIdxChange={setBrSheetIdx} onOpenSheet={handleOpenSheet} onOpenSchedule={handleOpenScheduleAtScene} onOpenSheetInPopout={handleOpenSheetInPopout} onOpenScheduleInPopout={handleOpenScheduleInPopout} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('schedule') && popoutWindowsRef.current.get('schedule') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Schedule`} win={popoutWindowsRef.current.get('schedule')!} onClose={() => closePopout('schedule')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Schedule" onClose={() => closePopout('schedule')} />
            <div className="flex-1 min-h-0">
              <ScheduleTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} onPrint={() => setShowPrintDialog(true)} targetSceneId={scheduleTargetScene} onSceneTargetSeen={handleClearScheduleTarget} savedScrollTop={scheduleScrollTop} onScrollChange={setScheduleScrollTop} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('calendar') && popoutWindowsRef.current.get('calendar') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Calendar`} win={popoutWindowsRef.current.get('calendar')!} onClose={() => closePopout('calendar')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Calendar" onClose={() => closePopout('calendar')} />
            <div className="flex-1 min-h-0">
              <CalendarTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('design') && popoutWindowsRef.current.get('design') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Design`} win={popoutWindowsRef.current.get('design')!} onClose={() => closePopout('design')}>
          <div className="h-screen bg-zinc-950 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Design" onClose={() => closePopout('design')} />
            <div className="flex-1 min-h-0">
              <DesignTab subTab={designSubTab} onSubTabChange={setDesignSubTab} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('rules') && popoutWindowsRef.current.get('rules') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Rules`} win={popoutWindowsRef.current.get('rules')!} onClose={() => closePopout('rules')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Rules" onClose={() => closePopout('rules')} />
            <div className="flex-1 min-h-0">
              <RulesTab />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('reports') && popoutWindowsRef.current.get('reports') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Reports`} win={popoutWindowsRef.current.get('reports')!} onClose={() => closePopout('reports')}>
          <div className="h-screen bg-zinc-900 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Reports" onClose={() => closePopout('reports')} />
            <div className="flex-1 min-h-0">
              <ReportsTab subTab={reportsSubTab} onSubTabChange={setReportsSubTab} selectedCategory={reportsCategory} onCategoryChange={setReportsCategory} onPrint={() => { setPrintDialogCategory(reportsCategory); if (reportsSubTab === 'doods') setShowDoodDialog(true); else setShowElementBreakdownDialog(true); }} />
            </div>
          </div>
        </PopoutWindow>
      )}

      {/* CONTENT */}
      <main className="flex-1 flex flex-col relative bg-white min-h-0 -mt-px" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {poppedOutTabs.has(activeTab) ? (
          <PopoutPlaceholder title={tabLabels[activeTab]} onBringBack={() => closePopout(activeTab)} />
        ) : (
          activeTab === 'breakdown' ? <BreakdownTab subTab={brSubTab} onSubTabChange={setBrSubTab} savedCat={brCategory} onCategoryChange={setBrCategory} savedSheetIdx={brSheetIdx} onSheetIdxChange={setBrSheetIdx} onOpenSheet={handleOpenSheet} onOpenSchedule={handleOpenScheduleAtScene} onOpenSheetInPopout={handleOpenSheetInPopout} onOpenScheduleInPopout={handleOpenScheduleInPopout} /> : activeTab === 'schedule' ? <ScheduleTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} onPrint={() => setShowPrintDialog(true)} targetSceneId={scheduleTargetScene} onSceneTargetSeen={handleClearScheduleTarget} savedScrollTop={scheduleScrollTop} onScrollChange={setScheduleScrollTop} /> : activeTab === 'calendar' ? <CalendarTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} /> : activeTab === 'design' ? <DesignTab subTab={designSubTab} onSubTabChange={setDesignSubTab} /> : activeTab === 'reports' ? <ReportsTab subTab={reportsSubTab} onSubTabChange={setReportsSubTab} selectedCategory={reportsCategory} onCategoryChange={setReportsCategory} onPrint={() => { setPrintDialogCategory(reportsCategory); if (reportsSubTab === 'doods') setShowDoodDialog(true); else setShowElementBreakdownDialog(true); }} /> : <RulesTab />
        )}
      </main>

      {showTrash && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setShowTrash(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <div className="min-w-0">
                <h2 className="text-white font-bold text-sm">Trash</h2>
                <p className="text-zinc-500 text-[11px] mt-0.5">Items expire after 30 days</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {(project.trash?.length || 0) + (project.versionTrash?.length || 0) + (project.rulesTrash?.length || 0) + (project.ribbonTrash?.length || 0) + (project.elementsTrash?.length || 0) + (project.categoryTrash?.length || 0) + (project.colorRulesTrash?.length || 0) > 0 && (
                  <button
                    onClick={async () => { const ok = await dialog.confirm({ title: 'Empty Trash?', message: 'Permanently delete all trash items?', danger: true }); if (ok) dispatch({ type: 'EMPTY_TRASH' }); }}
                    className="text-[10px] text-red-500 hover:text-red-400 font-semibold px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                  >
                    Empty
                  </button>
                )}
                <button onClick={() => setShowTrash(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {(() => {
                const items: Array<{ kind: 'scene'; id: string; data: TrashItem }
                  | { kind: 'version'; id: string; data: VersionTrashItem }
                  | { kind: 'rule'; id: string; data: RuleTrashItem }
                  | { kind: 'ribbon'; id: string; data: RibbonTrashItem }
                  | { kind: 'element'; id: string; data: ElementTrashItem }
                  | { kind: 'category'; id: string; data: CategoryTrashItem }
                  | { kind: 'colorrule'; id: string; data: ColorRuleTrashItem }> = [
                    ...(project.trash || []).map(t => ({ kind: 'scene' as const, id: t.scene.id, data: t })),
                    ...(project.versionTrash || []).map(t => ({ kind: 'version' as const, id: t.version.id, data: t })),
                    ...(project.rulesTrash || []).map(t => ({ kind: 'rule' as const, id: t.rule.id, data: t })),
                    ...(project.ribbonTrash || []).map(t => ({ kind: 'ribbon' as const, id: t.design.id, data: t })),
                    ...(project.elementsTrash || []).map(t => ({ kind: 'element' as const, id: t.element.id, data: t })),
                    ...(project.categoryTrash || []).map(t => ({ kind: 'category' as const, id: t.category.key, data: t })),
                    ...(project.colorRulesTrash || []).map(t => ({ kind: 'colorrule' as const, id: t.rule.id, data: t })),
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
                  } else if (item.kind === 'rule') {
                    const t = item.data as RuleTrashItem;
                    const meta = RULE_TYPE_META[t.rule.type];
                    const castLabel = t.rule.type === 'CAST_CONFLICT' || t.rule.type === 'CAST_SCENE_FLAG'
                      ? getRuleSearchText(t.rule) || 'multiple'
                      : t.rule.castId;
                    title = `${meta.short} · Cast ${castLabel} · ${describeRule(t.rule)}`;
                    subtitle = `Rule · ${formatTime(t.deletedAt)}`;
                  } else if (item.kind === 'element') {
                    const t = item.data as ElementTrashItem;
                    const builtinLabels: Record<string, string> = DEFAULT_CATEGORY_LABELS;
                    const catLabel = project.categoryLabels?.[t.category] || builtinLabels[t.category] || t.category;
                    title = `${catLabel} · ${t.element.name || t.element.id}`;
                    subtitle = `Element · ${formatTime(t.deletedAt)}`;
                  } else if (item.kind === 'category') {
                    const t = item.data as CategoryTrashItem;
                    title = t.category.label;
                    subtitle = `Custom Category · ${t.elements.length} elements · ${formatTime(t.deletedAt)}`;
                  } else if (item.kind === 'colorrule') {
                    const t = item.data as ColorRuleTrashItem;
                    title = t.rule.name;
                    subtitle = `Color Rule · ${formatTime(t.deletedAt)}`;
                  } else {
                    const t = item.data as RibbonTrashItem;
                    title = t.design.name;
                    subtitle = `Ribbon Design · ${formatTime(t.deletedAt)}`;
                  }
                  const actionType = item.kind === 'scene' ? 'RESTORE_SCENE'
                    : item.kind === 'version' ? 'RESTORE_VERSION_FROM_TRASH'
                    : item.kind === 'rule' ? 'RESTORE_RULE_FROM_TRASH'
                    : item.kind === 'element' ? 'RESTORE_ELEMENT_FROM_TRASH'
                    : item.kind === 'category' ? 'RESTORE_CATEGORY_FROM_TRASH'
                    : item.kind === 'colorrule' ? 'RESTORE_COLOR_RULE_FROM_TRASH'
                    : 'RESTORE_RIBBON_FROM_TRASH';
                  const kindLabel = item.kind === 'scene' ? 'Scene' : item.kind === 'version' ? 'Version' : item.kind === 'rule' ? 'Rule' : item.kind === 'element' ? 'Element' : item.kind === 'category' ? 'Category' : item.kind === 'colorrule' ? 'Color Rule' : 'Ribbon';
                  const kindColor = item.kind === 'scene' ? 'text-sky-400' : item.kind === 'version' ? 'text-emerald-400' : item.kind === 'rule' ? 'text-amber-400' : item.kind === 'element' ? 'text-orange-400' : item.kind === 'category' ? 'text-pink-400' : item.kind === 'colorrule' ? 'text-teal-400' : 'text-violet-400';
                  return (
                    <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-zinc-900 group">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-medium ${kindColor} shrink-0`}>{kindLabel}</span>
                          <span className="text-white text-sm font-semibold truncate">{title}</span>
                        </div>
                        <div className="text-zinc-500 text-[11px] mt-0.5">{subtitle}</div>
                      </div>
                      <button
                        onClick={() => dispatch({ type: actionType as any, payload: item.id })}
                        className="hover-reveal text-zinc-400 hover:text-white p-1 rounded transition-all"
                        title="Restore"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {showRestoreModal && (
        <Modal open onClose={() => setShowRestoreModal(null)} title="Restore from Folder" icon={<HardDrive className="w-4 h-4" />} width="max-w-xl"
          footer={
            <ModalFooter>
              <button onClick={() => setShowRestoreModal(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
                Cancel
              </button>
              <button
                disabled={showRestoreModal.projects.length === 0}
                onClick={async () => {
                  try {
                    const projectsToImport: Project[] = showRestoreModal.projects.map(p => JSON.parse(p.data));
                    for (const proj of projectsToImport) {
                      try { importProjectFromData(proj); } catch (e) { console.error('Failed to import', proj.id, e); }
                    }
                    setShowRestoreModal(null);
                  } catch (e) { console.error(e); }
                }}
                className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                Restore {showRestoreModal.projects.length > 0 ? `(${showRestoreModal.projects.length})` : ''}
              </button>
            </ModalFooter>
          }
        >
          <div className="px-5 py-3 text-zinc-400 text-xs border-b border-zinc-800">
            {showRestoreModal.entries.length} {showRestoreModal.entries.length === 1 ? 'project' : 'projects'} found in your save folder.
            Restoring will merge them with your current projects.
          </div>
          <div className="p-2">
            {showRestoreModal.entries.length === 0 ? (
              <div className="text-zinc-500 text-center py-12 text-xs">No projects in folder.</div>
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
        </Modal>
      )}

    </div>
    {IS_COARSE && <SelectionModeButton />}
    {IS_COARSE && <KeyboardToggleButton />}
    </>
    </LongPressMenuProvider>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}

