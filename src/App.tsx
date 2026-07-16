/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ProjectProvider, useProject, useIsCloudProject, DEFAULT_CATEGORY_LABELS } from './store';
import { useDialog } from './components/Dialog';
import { TrashItem, VersionTrashItem, RuleTrashItem, RibbonTrashItem, ElementTrashItem, CategoryTrashItem, ColorRuleTrashItem, Project } from './types';
import { BreakdownTab } from './components/BreakdownTab';
import { ScheduleTab } from './components/ScheduleTab';
import { CalendarTab } from './components/CalendarTab';
import { RulesTab } from './components/RulesTab';
import DesignTab from './components/DesignTab';
import RibbonTab from './components/RibbonTab';
import { ColorsTab } from './components/ColorsTab';
import DoodsTab from './components/DoodsTab';
import ElementBreakdownView from './components/ElementBreakdownView';
import { SceneSheet } from './components/SceneSheet';
import { ElementManager } from './components/ElementManager';
import { GlideBreakdownTab } from './components/BreakdownTabGlide';
import MiniTab from './components/MiniTab';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from './lib/categories';
import { getElementsFromScenes } from './store';
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
import { ItemManagerDropdown } from './components/DropdownMenu';
import DropdownItem from './components/DropdownItem';
import DropdownDivider from './components/DropdownDivider';
import DropdownSubmenu from './components/DropdownSubmenu';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './components/ContextMenu';
import Modal from './components/Modal';
import { ModalFooter } from './components/Modal';
import { useStorage, SaveStatus, ProjectIndexEntry } from './components/StorageStatus';
import { RULE_TYPE_META, describeRule, getRuleSearchText } from './components/rules/ruleMeta';
import { writeProjectToFolder } from './lib/persistentStorage';
import ImportDialog from './components/ImportDialog';
import { parseFDX, parseFountain, parseCSV, ImportResult, exportBreakdownCSV } from './lib/importScreenplay';
import { generateUUID, exportProjectFromStorage, exportProjectData } from './lib/utils';
import { SaveIndicator } from './components/SaveIndicator';
import { useGoogleAuth } from './lib/googleDriveAuth';
import { Download, Printer, Trash2, Plus, X, ChevronDown, Undo2, Redo2, FolderOpen, RotateCcw, HardDrive, FileUp, WifiOff, Cloud, CloudOff, LogOut, ExternalLink, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import PopoutWindow, { PopoutPlaceholder, cascadePosition } from './components/PopoutWindow';
import VersionToolbar from './components/VersionToolbar';
import { LongPressMenuProvider } from './lib/useLongPressMenu';
import { IS_COARSE } from './lib/device';
import SelectionModeButton from './components/SelectionModeButton';
import KeyboardToggleButton from './components/KeyboardToggleButton';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function AppContent() {
  const { state, dispatch, currentProjectId, createProject, readOnly, projectList, renameProject, registerPostSaveHandler, closeProject, consumeLegacyMigrationNotice } = useProject();
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
        const { left, top } = cascadePosition();
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
    const onBlur = () => setShiftHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, []);

  useEffect(() => {
    const notice = consumeLegacyMigrationNotice();
    if (notice) {
      dialog.alert({
        title: 'Legacy Project Converted',
        message: `This project was created before the daybreak system and has been automatically converted. ${notice.versionCount} version(s) across ${notice.dayCount} production day(s) were migrated. Some scheduling details may need review.`,
      });
    }
  }, [consumeLegacyMigrationNotice, dialog, currentProjectId]);

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

  const [poppedOutSubTabs, setPoppedOutSubTabs] = useState<Record<string, Set<string>>>({});
  const popoutSubWindowsRef = useRef<Map<string, Window>>(new Map());

  const toggleSubPopout = (parentId: string, subTabId: string) => {
    const isPopped = poppedOutSubTabs[parentId]?.has(subTabId);
    if (isPopped) {
      const winKey = `sub_${parentId}_${subTabId}`;
      const w = popoutSubWindowsRef.current.get(winKey);
      if (w && !w.closed) w.close();
      popoutSubWindowsRef.current.delete(winKey);
      setPoppedOutSubTabs(prev => {
        const next = { ...prev };
        const s = new Set(prev[parentId] || []);
        s.delete(subTabId);
        next[parentId] = s;
        return next;
      });
    } else {
      const { left, top } = cascadePosition();
      const winKey = `sub_${parentId}_${subTabId}`;
      const w = window.open('', winKey, `width=1200,height=800,left=${left},top=${top}`);
      if (!w) return;
      popoutSubWindowsRef.current.set(winKey, w);
      const newSet = new Set(poppedOutSubTabs[parentId] || []);
      newSet.add(subTabId);
      setPoppedOutSubTabs(prev => ({ ...prev, [parentId]: newSet }));
      if (parentId === 'breakdown' && brSubTab === subTabId) {
        const nextTab = ['sheet', 'elements', 'glide'].find(t => t !== subTabId && !newSet.has(t));
        if (nextTab) setBrSubTab(nextTab as any);
      } else if (parentId === 'design' && designSubTab === subTabId) {
        const nextTab = ['ribbons', 'colors'].find(t => t !== subTabId && !newSet.has(t));
        if (nextTab) setDesignSubTab(nextTab as any);
      } else if (parentId === 'reports' && reportsSubTab === subTabId) {
        const nextTab = ['doods', 'elementBreakdown'].find(t => t !== subTabId && !newSet.has(t));
        if (nextTab) setReportsSubTab(nextTab as any);
      }
    }
  };

  const closeSubPopout = (parentId: string, subTabId: string) => {
    setPoppedOutSubTabs(prev => {
      const next = { ...prev };
      const s = new Set(prev[parentId] || []);
      s.delete(subTabId);
      next[parentId] = s;
      return next;
    });
    popoutSubWindowsRef.current.delete(`sub_${parentId}_${subTabId}`);
  };

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

  useEffect(() => {
    setShowProjectManager(false);
    setShowPrintDialog(false);
    setShowDoodDialog(false);
    setShowBreakdownSheetDialog(false);
    setShowElementBreakdownDialog(false);
    setPrintDialogCategory(undefined);
    setShowTrash(false);
    setShowRestoreModal(null);
    setPendingImport(null);
    setPrintOptions(null);
    setDoodOptions(null);
    setBreakdownSheetOptions(null);
    setElementBreakdownOptions(null);
    popoutWindowsRef.current.forEach(w => { if (!w.closed) w.close(); });
    popoutWindowsRef.current.clear();
    setPoppedOutTabs(new Set());
    popoutSubWindowsRef.current.forEach(w => { if (!w.closed) w.close(); });
    popoutSubWindowsRef.current.clear();
    setPoppedOutSubTabs({});
  }, [currentProjectId]);

  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showVersionsMenu, setShowVersionsMenu] = useState(false);
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
  const [editingTitle, setEditingTitle] = useState(false);
  const [subHeaderTargets, setSubHeaderTargets] = useState<Record<string, HTMLDivElement | null>>({});
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [reportSidebarCollapsed, setReportSidebarCollapsed] = useState<Record<string, boolean>>({});
  const [printOptions, setPrintOptions] = useState<PrintOptions | null>(null);
  const [doodOptions, setDoodOptions] = useState<DoodOptions | null>(null);
  const [breakdownSheetOptions, setBreakdownSheetOptions] = useState<BreakdownSheetOptions | null>(null);
  const [elementBreakdownOptions, setElementBreakdownOptions] = useState<ElementBreakdownOptions | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState<{ entries: ProjectIndexEntry[]; projects: { id: string; data: string }[] } | null>(null);
  const driveCtx = useGoogleAuth();
  const topTabContainerRef = useRef<HTMLDivElement>(null);
  const [tabScrollMask, setTabScrollMask] = useState('none');
  const checkTabScroll = useCallback(() => {
    const el = topTabContainerRef.current;
    if (!el) return;
    const atLeft = el.scrollLeft <= 2;
    const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    if (atLeft && atRight) setTabScrollMask('none');
    else if (atLeft) setTabScrollMask('linear-gradient(to left, transparent, black 12px)');
    else if (atRight) setTabScrollMask('linear-gradient(to right, transparent, black 12px)');
    else setTabScrollMask('linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)');
  }, []);
  useEffect(() => {
    checkTabScroll();
    window.addEventListener('resize', checkTabScroll);
    return () => window.removeEventListener('resize', checkTabScroll);
  }, [checkTabScroll]);
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const allReportCategoryKeys = useMemo(() => {
    const hidden = new Set(project.hiddenCategories || []);
    const keys: { key: string; isCustom: boolean }[] = [];
    for (const c of ELEMENT_CATEGORIES) {
      if (!hidden.has(c.key)) keys.push({ key: c.key, isCustom: false });
    }
    for (const c of project.customCategories || []) {
      if (!hidden.has(c.key)) keys.push({ key: c.key, isCustom: true });
    }
    return keys;
  }, [project.customCategories, project.hiddenCategories]);

  const noProject = currentProjectId === null;
  const isCloudProject = !!projectList.find(p => p.id === currentProjectId)?.driveFileId;

  const inactiveTabText = isCloudProject ? 'text-white/70 hover:text-white hover:bg-blue-900/60' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800';
  const activeTabClass = isCloudProject ? 'bg-white text-blue-950' : 'bg-white text-zinc-900';

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

      const allDaysSorted = [...new Set<number>((version?.rows || []).filter(r => r.containerId != null).map(r => r.containerId as number))].sort((a, b) => a - b);
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
          productionStart={version?.productionStart}
          nonShootDates={version?.nonShootDates}
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
          productionStart={version?.productionStart}
          nonShootDates={version?.nonShootDates}
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
    exportProjectData(JSON.stringify(project), project.title || 'Export');
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
      {readOnly && (() => {
        const isAuthIssue = isCloudProject && (!driveCtx.isSignedIn || driveCtx.needsReauth);
        return (
          <div className={`${isAuthIssue ? 'bg-amber-600' : 'bg-red-600'} text-white px-4 py-1.5 flex items-center justify-between text-xs shrink-0 print:hidden`}>
            <span className="font-medium">
              {isAuthIssue
                ? (driveCtx.needsReauth ? 'Session expired - sign in to resume editing' : 'Signed out of Google Drive - editing is disabled')
                : 'No Internet Connection - editing is disabled'}
            </span>
            {isAuthIssue ? (
              <button
                onClick={() => driveCtx.signIn()}
                className="ml-3 px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-500 transition-colors font-semibold"
              >
                Sign in
              </button>
            ) : (
              <button
                onClick={handleRetryConnection}
                className="ml-3 px-2.5 py-1 rounded bg-red-700 hover:bg-red-500 transition-colors font-semibold"
              >
                Retry Connection
              </button>
            )}
          </div>
        );
      })()}
      {showOfflineModal && (() => {
        const isAuthIssue = isCloudProject && (!driveCtx.isSignedIn || driveCtx.needsReauth);
        return (
          <Modal open={showOfflineModal} onClose={() => setShowOfflineModal(false)}
            title={isAuthIssue ? 'Signed out' : "You're offline"}
            icon={isAuthIssue ? <CloudOff className="w-5 h-5 text-amber-400" /> : <WifiOff className="w-5 h-5 text-zinc-400" />}
            width="max-w-md"
            footer={
              <ModalFooter>
                <button
                  onClick={() => { setShowOfflineModal(false); if (isAuthIssue) driveCtx.signIn(); }}
                  className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors"
                >
                  {isAuthIssue ? 'Sign in' : 'OK'}
                </button>
              </ModalFooter>
            }
          >
            <div className="px-5 py-3 text-zinc-400 text-xs border-b border-zinc-800">
              {isAuthIssue
                ? 'You have been signed out of Google Drive. Sign in again to resume editing your cloud project.'
                : 'Lemon Schedule requires an internet connection. You can continue to browse your project, but all editing controls are currently disabled.'}
            </div>
          </Modal>
        );
      })()}

      {/* HEADER */}
      <header className={`flex items-center ${isCloudProject ? 'bg-blue-950' : 'bg-zinc-950'} text-zinc-300 px-4 py-2 select-none print:hidden`}>
        <div className="flex items-center gap-2 shrink-0">
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
                  <span className="hidden md:inline">File</span>
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
                <DropdownItem onClick={() => { setShowFileMenu(false); if (isCloudProject) closeProject(); driveCtx.signOut(); }} icon={<LogOut className="w-3.5 h-3.5" />}>
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
            {editingTitle ? (
              <input 
                autoFocus
                value={project.title} 
                onChange={e => {
                  dispatch({type: 'UPDATE_PROJECT', payload: {title: e.target.value}});
                }}
                onBlur={e => {
                  setEditingTitle(false);
                  renameProject(currentProjectId!, e.target.value, projectList.find(p => p.id === currentProjectId)?.driveFileId);
                }}
                onKeyDown={e => { if (e.key === 'Enter') { setEditingTitle(false); (e.target as HTMLInputElement).blur(); } }}
                className={`bg-transparent border-none text-white font-medium rounded px-1 outline-none font-sans max-w-[120px] ${isCloudProject ? 'focus:ring-1 focus:ring-blue-600' : 'focus:ring-1 focus:ring-zinc-600'}`}
              />
            ) : (
              <span
                onClick={() => setEditingTitle(true)}
                className="text-white font-medium px-1 truncate max-w-[120px] cursor-pointer hover:opacity-80"
                title={project.title}
              >
                {project.title}
              </span>
            )}
          </div>
          <div ref={topTabContainerRef} onScroll={checkTabScroll} className="flex items-center gap-1 rounded p-0.5 overflow-x-auto flex-1 min-w-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitMaskImage: tabScrollMask, maskImage: tabScrollMask }}>
            <button 
              onClick={() => { if (shiftHeld && !IS_COARSE) { togglePopout('breakdown'); } else { setActiveTab('breakdown'); } }}
              onContextMenu={(e) => { if (IS_COARSE) return; e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: 'breakdown' }); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0 ${activeTab === 'breakdown' ? activeTabClass : inactiveTabText}`}
            >
              Breakdown
            </button>
            <button 
              onClick={() => { if (shiftHeld && !IS_COARSE) { togglePopout('schedule'); } else { setActiveTab('schedule'); } }}
              onContextMenu={(e) => { if (IS_COARSE) return; e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: 'schedule' }); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0 ${activeTab === 'schedule' ? activeTabClass : inactiveTabText}`}
            >
              Schedule
            </button>
            <button 
              onClick={() => { if (shiftHeld && !IS_COARSE) { togglePopout('calendar'); } else { setActiveTab('calendar'); } }}
              onContextMenu={(e) => { if (IS_COARSE) return; e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: 'calendar' }); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0 ${activeTab === 'calendar' ? activeTabClass : inactiveTabText}`}
            >
              Calendar
            </button>
            <button 
              onClick={() => { if (shiftHeld && !IS_COARSE) { togglePopout('design'); } else { setActiveTab('design'); } }}
              onContextMenu={(e) => { if (IS_COARSE) return; e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: 'design' }); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0 ${activeTab === 'design' ? activeTabClass : inactiveTabText}`}
            >
              Design
            </button>
            <button 
              onClick={() => { if (shiftHeld && !IS_COARSE) { togglePopout('rules'); } else { setActiveTab('rules'); } }}
              onContextMenu={(e) => { if (IS_COARSE) return; e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: 'rules' }); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0 ${activeTab === 'rules' ? activeTabClass : inactiveTabText}`}
            >
              Rules
            </button>
            <button 
              onClick={() => { if (shiftHeld && !IS_COARSE) { togglePopout('reports'); } else { setActiveTab('reports'); } }}
              onContextMenu={(e) => { if (IS_COARSE) return; e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: 'reports' }); }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0 ${activeTab === 'reports' ? activeTabClass : inactiveTabText}`}
            >
              Reports
            </button>
          </div>

        <div className="flex items-center space-x-3 font-mono text-xs shrink-0 ml-auto">
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
            onDelete={async (id) => {
              const ok = await dialog.confirm({ title: 'Delete Version?', message: 'This can be restored from Trash.', danger: true, suppressKey: 'lemon_schedule_dnwa_delete_version' });
              if (ok) dispatch({ type: 'DELETE_VERSION', payload: id });
            }}
            onCreate={() => {
              const name = `V${String(project.versions.length + 1).padStart(2, '0')}`;
              const newId = generateUUID();
              dispatch({ type: 'NEW_VERSION', payload: { name, cloneFromId: null, id: newId } });
              return newId;
            }}
            onTrash={() => setShowTrash(true)}
            readOnly={false}
            theme={isCloudProject ? 'blue' : 'dark'}
            label="Version"
            header="SCHEDULE VERSIONS"
            itemLabel="Version"
            trigger={
              <button
                className={`flex items-center space-x-1.5 rounded transition-colors px-3 py-1.5 cursor-pointer select-none font-sans text-xs text-white whitespace-nowrap ${isCloudProject ? 'hover:bg-blue-900/60' : 'hover:bg-zinc-800'}`}
              >
                <span><span className="hidden md:inline">Version: </span><strong>{version?.name || 'Select Version'}</strong></span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            }
          />
          </div>
        </div>
      </header>

      {/* POPOUT WINDOWS */}
      {poppedOutTabs.has('breakdown') && popoutWindowsRef.current.get('breakdown') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Breakdown`} win={popoutWindowsRef.current.get('breakdown')!} onClose={() => closePopout('breakdown')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Breakdown" onClose={() => closePopout('breakdown')} />
            <div className="flex-1 min-h-0 flex flex-col">
              <BreakdownTab subTab={brSubTab} onSubTabChange={setBrSubTab} savedCat={brCategory} onCategoryChange={setBrCategory} savedSheetIdx={brSheetIdx} onSheetIdxChange={setBrSheetIdx} onOpenSheet={handleOpenSheet} onOpenSchedule={handleOpenScheduleAtScene} onOpenSheetInPopout={handleOpenSheetInPopout} onOpenScheduleInPopout={handleOpenScheduleInPopout} poppedOutSubTabs={poppedOutSubTabs.breakdown || new Set()} onToggleSubPopout={(id) => toggleSubPopout('breakdown', id)} onCloseSubPopout={(id) => closeSubPopout('breakdown', id)} shiftHeld={shiftHeld} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('schedule') && popoutWindowsRef.current.get('schedule') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Schedule`} win={popoutWindowsRef.current.get('schedule')!} onClose={() => closePopout('schedule')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Schedule" onClose={() => closePopout('schedule')} />
            <div className="flex-1 min-h-0 flex flex-col">
              <ScheduleTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} onPrint={() => setShowPrintDialog(true)} targetSceneId={scheduleTargetScene} onSceneTargetSeen={handleClearScheduleTarget} savedScrollTop={scheduleScrollTop} onScrollChange={setScheduleScrollTop} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('calendar') && popoutWindowsRef.current.get('calendar') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Calendar`} win={popoutWindowsRef.current.get('calendar')!} onClose={() => closePopout('calendar')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Calendar" onClose={() => closePopout('calendar')} />
            <div className="flex-1 min-h-0 flex flex-col">
              <CalendarTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('design') && popoutWindowsRef.current.get('design') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Design`} win={popoutWindowsRef.current.get('design')!} onClose={() => closePopout('design')}>
          <div className="h-screen bg-zinc-950 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Design" onClose={() => closePopout('design')} />
            <div className="flex-1 min-h-0 flex flex-col">
              <DesignTab subTab={designSubTab} onSubTabChange={setDesignSubTab} poppedOutSubTabs={poppedOutSubTabs.design || new Set()} onToggleSubPopout={(id) => toggleSubPopout('design', id)} onCloseSubPopout={(id) => closeSubPopout('design', id)} shiftHeld={shiftHeld} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('rules') && popoutWindowsRef.current.get('rules') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Rules`} win={popoutWindowsRef.current.get('rules')!} onClose={() => closePopout('rules')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Rules" onClose={() => closePopout('rules')} />
            <div className="flex-1 min-h-0 flex flex-col">
              <RulesTab />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutTabs.has('reports') && popoutWindowsRef.current.get('reports') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Reports`} win={popoutWindowsRef.current.get('reports')!} onClose={() => closePopout('reports')}>
          <div className="h-screen bg-zinc-900 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Reports" onClose={() => closePopout('reports')} />
            <div className="flex-1 min-h-0 flex flex-col">
              <ReportsTab subTab={reportsSubTab} onSubTabChange={setReportsSubTab} selectedCategory={reportsCategory} onCategoryChange={setReportsCategory} onPrint={() => { setPrintDialogCategory(reportsCategory); if (reportsSubTab === 'doods') setShowDoodDialog(true); else setShowElementBreakdownDialog(true); }} poppedOutSubTabs={poppedOutSubTabs.reports || new Set()} onToggleSubPopout={(id) => toggleSubPopout('reports', id)} onCloseSubPopout={(id) => closeSubPopout('reports', id)} shiftHeld={shiftHeld} />
            </div>
          </div>
        </PopoutWindow>
      )}

      {/* SUB-TAB POPOUT WINDOWS */}
      {poppedOutSubTabs.breakdown?.has('sheet') && popoutSubWindowsRef.current.get('sub_breakdown_sheet') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Sheet`} win={popoutSubWindowsRef.current.get('sub_breakdown_sheet')!} onClose={() => closeSubPopout('breakdown', 'sheet')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Breakdown" onClose={() => closeSubPopout('breakdown', 'sheet')} />
            <MiniTab
              tabs={[{ id: 'sheet', label: 'Sheet' }]}
              activeTab="sheet"
              onChange={() => {}}
              rightContent={<div ref={el => { if (el && subHeaderTargets['sub_breakdown_sheet'] !== el) setSubHeaderTargets(prev => ({ ...prev, sub_breakdown_sheet: el })); }} className="flex items-center gap-2" />}
            />
            <div className="flex-1 min-h-0 flex flex-col">
              <SceneSheet initialIndex={brSheetIdx} onIndexChange={setBrSheetIdx} onOpenSchedule={handleOpenScheduleAtScene} onOpenScheduleInPopout={handleOpenScheduleInPopout} headerTarget={subHeaderTargets['sub_breakdown_sheet']} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.breakdown?.has('elements') && popoutSubWindowsRef.current.get('sub_breakdown_elements') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Element Manager`} win={popoutSubWindowsRef.current.get('sub_breakdown_elements')!} onClose={() => closeSubPopout('breakdown', 'elements')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Breakdown" onClose={() => closeSubPopout('breakdown', 'elements')} />
            <MiniTab
              tabs={[{ id: 'elements', label: 'Element Manager' }]}
              activeTab="elements"
              onChange={() => {}}
              rightContent={<div ref={el => { if (el && subHeaderTargets['sub_breakdown_elements'] !== el) setSubHeaderTargets(prev => ({ ...prev, sub_breakdown_elements: el })); }} className="flex items-center gap-2" />}
            />
            <div className="flex-1 min-h-0 flex flex-col">
              <ElementManager initialCategory={brCategory} onCategoryChange={setBrCategory} headerTarget={subHeaderTargets['sub_breakdown_elements']} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.breakdown?.has('glide') && popoutSubWindowsRef.current.get('sub_breakdown_glide') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Glide Breakdown`} win={popoutSubWindowsRef.current.get('sub_breakdown_glide')!} onClose={() => closeSubPopout('breakdown', 'glide')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Breakdown" onClose={() => closeSubPopout('breakdown', 'glide')} />
            <MiniTab
              tabs={[{ id: 'glide', label: 'Glide Breakdown' }]}
              activeTab="glide"
              onChange={() => {}}
              rightContent={<div ref={el => { if (el && subHeaderTargets['sub_breakdown_glide'] !== el) setSubHeaderTargets(prev => ({ ...prev, sub_breakdown_glide: el })); }} className="flex items-center gap-2" />}
            />
            <div className="flex-1 min-h-0 flex flex-col">
              <GlideBreakdownTab onOpenSheet={handleOpenSheet} onOpenSheetInPopout={handleOpenSheetInPopout} headerTarget={subHeaderTargets['sub_breakdown_glide']} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.design?.has('ribbons') && popoutSubWindowsRef.current.get('sub_design_ribbons') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Ribbon Designer`} win={popoutSubWindowsRef.current.get('sub_design_ribbons')!} onClose={() => closeSubPopout('design', 'ribbons')}>
          <div className="h-screen bg-zinc-950 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Design" onClose={() => closeSubPopout('design', 'ribbons')} />
            <MiniTab
              theme="dark"
              tabs={[{ id: 'ribbons', label: 'Ribbon Designer' }]}
              activeTab="ribbons"
              onChange={() => {}}
              rightContent={<div ref={el => { if (el && subHeaderTargets['sub_design_ribbons'] !== el) setSubHeaderTargets(prev => ({ ...prev, sub_design_ribbons: el })); }} className="flex items-center gap-2" />}
            />
            <div className="flex-1 min-h-0 flex flex-col">
              <RibbonTab headerTarget={subHeaderTargets['sub_design_ribbons']} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.design?.has('colors') && popoutSubWindowsRef.current.get('sub_design_colors') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Colors`} win={popoutSubWindowsRef.current.get('sub_design_colors')!} onClose={() => closeSubPopout('design', 'colors')}>
          <div className="h-screen bg-zinc-950 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Design" onClose={() => closeSubPopout('design', 'colors')} />
            <MiniTab
              theme="dark"
              tabs={[{ id: 'colors', label: 'Colors' }]}
              activeTab="colors"
              onChange={() => {}}
              rightContent={<div ref={el => { if (el && subHeaderTargets['sub_design_colors'] !== el) setSubHeaderTargets(prev => ({ ...prev, sub_design_colors: el })); }} className="flex items-center gap-2" />}
            />
            <div className="flex-1 min-h-0 flex flex-col">
              <ColorsTab headerTarget={subHeaderTargets['sub_design_colors']} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.reports?.has('doods') && popoutSubWindowsRef.current.get('sub_reports_doods') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Day Out of Days`} win={popoutSubWindowsRef.current.get('sub_reports_doods')!} onClose={() => closeSubPopout('reports', 'doods')}>
          <div className="h-screen bg-zinc-900 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Reports" onClose={() => closeSubPopout('reports', 'doods')} />
            <MiniTab
              theme="dark"
              tabs={[{ id: 'doods', label: 'Day Out of Days' }]}
              activeTab="doods"
              onChange={() => {}}
              rightContent={
                <div className="flex items-center gap-2">
                  <button onClick={() => { setPrintDialogCategory(reportsCategory); setShowDoodDialog(true); }} className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors">
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </button>
                  <div ref={el => { if (el && subHeaderTargets['sub_reports_doods'] !== el) setSubHeaderTargets(prev => ({ ...prev, sub_reports_doods: el })); }} className="flex items-center gap-2" />
                </div>
              }
            />
            <div className="flex-1 min-h-0 flex">
              {reportSidebarCollapsed['doods'] ? (
                <div className="w-9 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center pt-3">
                  <button onClick={() => setReportSidebarCollapsed(prev => ({ ...prev, doods: false }))} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Expand sidebar">
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                </div>
              ) : (
              <div className="w-[188px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">Categories</span>
                    <button onClick={() => setReportSidebarCollapsed(prev => ({ ...prev, doods: true }))} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Collapse sidebar">
                      <PanelLeftClose className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {allReportCategoryKeys.map(({ key, isCustom }) => {
                      const Icon = isCustom
                        ? getCustomIcon((project.customCategories || []).find(c => c.key === key)?.icon || 'Tag')
                        : CAT_ICONS[key] || null;
                      const isActive = key === reportsCategory;
                      const label = isCustom
                        ? (project.customCategories || []).find(c => c.key === key)?.label || key
                        : getLabel(key, (() => { const b: Record<string, string> = {}; for (const c of ELEMENT_CATEGORIES) b[c.key] = c.label; return b; })()[key] || key, project.categoryLabels);
                      return (
                        <button
                          key={key}
                          onClick={() => setReportsCategory(key)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'}`}
                        >
                          {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                          <span className="truncate flex-1">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              )}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <DoodsTab selectedCategory={reportsCategory} />
              </div>
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.reports?.has('elementBreakdown') && popoutSubWindowsRef.current.get('sub_reports_elementBreakdown') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Element Breakdown`} win={popoutSubWindowsRef.current.get('sub_reports_elementBreakdown')!} onClose={() => closeSubPopout('reports', 'elementBreakdown')}>
          <div className="h-screen bg-zinc-900 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} tabName="Element Breakdown" onClose={() => closeSubPopout('reports', 'elementBreakdown')} />
            <div className="flex items-center justify-between px-3 pt-2 pb-2 border-b shrink-0 bg-zinc-900 border-zinc-800">
              <span className="px-3 py-1.5 text-xs font-semibold rounded-b-md text-white bg-zinc-950">Element Breakdown</span>
              <div className="flex items-center gap-2">
                <button onClick={() => { setPrintDialogCategory(reportsCategory); setShowElementBreakdownDialog(true); }} className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors">
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <div ref={el => { if (el && subHeaderTargets['sub_reports_elementBreakdown'] !== el) setSubHeaderTargets(prev => ({ ...prev, sub_reports_elementBreakdown: el })); }} className="flex items-center gap-2" />
              </div>
            </div>
            <div className="flex-1 min-h-0 flex">
              {reportSidebarCollapsed['elementBreakdown'] ? (
                <div className="w-9 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center pt-3">
                  <button onClick={() => setReportSidebarCollapsed(prev => ({ ...prev, elementBreakdown: false }))} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Expand sidebar">
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-[188px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">Categories</span>
                      <button onClick={() => setReportSidebarCollapsed(prev => ({ ...prev, elementBreakdown: true }))} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Collapse sidebar">
                        <PanelLeftClose className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-0.5">
                    {allReportCategoryKeys.map(({ key, isCustom }) => {
                      const Icon = isCustom
                        ? getCustomIcon((project.customCategories || []).find(c => c.key === key)?.icon || 'Tag')
                        : CAT_ICONS[key] || null;
                      const isActive = key === reportsCategory;
                      const label = isCustom
                        ? (project.customCategories || []).find(c => c.key === key)?.label || key
                        : getLabel(key, (() => { const b: Record<string, string> = {}; for (const c of ELEMENT_CATEGORIES) b[c.key] = c.label; return b; })()[key] || key, project.categoryLabels);
                      return (
                        <button
                          key={key}
                          onClick={() => setReportsCategory(key)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'}`}
                        >
                          {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                          <span className="truncate flex-1">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              )}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <ElementBreakdownView selectedCategory={reportsCategory} />
              </div>
            </div>
          </div>
        </PopoutWindow>
      )}

      {/* CONTENT */}
      <main key={currentProjectId} className="flex-1 flex flex-col relative bg-white min-h-0 -mt-px" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {poppedOutTabs.has(activeTab) ? (
          <PopoutPlaceholder title={tabLabels[activeTab]} onBringBack={() => closePopout(activeTab)} />
        ) : (
          activeTab === 'breakdown' ? <BreakdownTab subTab={brSubTab} onSubTabChange={setBrSubTab} savedCat={brCategory} onCategoryChange={setBrCategory} savedSheetIdx={brSheetIdx} onSheetIdxChange={setBrSheetIdx} onOpenSheet={handleOpenSheet} onOpenSchedule={handleOpenScheduleAtScene} onOpenSheetInPopout={handleOpenSheetInPopout} onOpenScheduleInPopout={handleOpenScheduleInPopout} poppedOutSubTabs={poppedOutSubTabs.breakdown || new Set()} onToggleSubPopout={(id) => toggleSubPopout('breakdown', id)} onCloseSubPopout={(id) => closeSubPopout('breakdown', id)} shiftHeld={shiftHeld} /> : activeTab === 'schedule' ? <ScheduleTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} onPrint={() => setShowPrintDialog(true)} targetSceneId={scheduleTargetScene} onSceneTargetSeen={handleClearScheduleTarget} savedScrollTop={scheduleScrollTop} onScrollChange={setScheduleScrollTop} /> :           activeTab === 'calendar' ? <CalendarTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} /> : activeTab === 'design' ? <DesignTab subTab={designSubTab} onSubTabChange={setDesignSubTab} poppedOutSubTabs={poppedOutSubTabs.design || new Set()} onToggleSubPopout={(id) => toggleSubPopout('design', id)} onCloseSubPopout={(id) => closeSubPopout('design', id)} shiftHeld={shiftHeld} /> : activeTab === 'reports' ? <ReportsTab subTab={reportsSubTab} onSubTabChange={setReportsSubTab} selectedCategory={reportsCategory} onCategoryChange={setReportsCategory} onPrint={() => { setPrintDialogCategory(reportsCategory); if (reportsSubTab === 'doods') setShowDoodDialog(true); else setShowElementBreakdownDialog(true); }} poppedOutSubTabs={poppedOutSubTabs.reports || new Set()} onToggleSubPopout={(id) => toggleSubPopout('reports', id)} onCloseSubPopout={(id) => closeSubPopout('reports', id)} shiftHeld={shiftHeld} /> : <RulesTab />
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
                    onClick={async () => { const ok = await dialog.confirm({ title: 'Empty Trash?', message: 'Permanently delete all trash items?', danger: true, suppressKey: 'lemon_schedule_dnwa_empty_trash' }); if (ok) dispatch({ type: 'EMPTY_TRASH' }); }}
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
    {tabContextMenu && (
      <ContextMenu open={true} x={tabContextMenu.x} y={tabContextMenu.y} onClose={() => setTabContextMenu(null)}>
        <ContextMenuItem onClick={() => { togglePopout(tabContextMenu.tabId); setTabContextMenu(null); }} icon={<ExternalLink className="w-3.5 h-3.5" />}>
          Open in New Window
        </ContextMenuItem>
      </ContextMenu>
    )}
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

