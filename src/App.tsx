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
import PageToolbar from './components/PageToolbar';
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
import { parseFDX, parseFountain, parseCSV, ImportResult, exportBreakdownCSV } from './lib/import';
import { generateUUID, exportProjectFromStorage, exportProjectData } from './lib/utils';
import { formatDriveError } from './lib/googleDriveStorage';
import { SaveIndicator } from './components/SaveIndicator';
import { useGoogleAuth } from './lib/googleDriveAuth';
import { Download, Printer, Trash2, Plus, X, ChevronDown, Undo2, Redo2, FolderOpen, RotateCcw, HardDrive, FileUp, WifiOff, Cloud, CloudOff, LogOut, ExternalLink, PanelLeftOpen, PanelLeftClose, Loader2 } from 'lucide-react';
import PopoutWindow, { PopoutPlaceholder, cascadePosition } from './components/PopoutWindow';
import VersionToolbar from './components/VersionToolbar';
import { LongPressMenuProvider, getMarqueeMode, setTransientMarquee } from './lib/useLongPressMenu';
import { isInteractiveElement } from '@gabriel/ui-kit';
import { IS_COARSE } from './lib/device';
import SelectionModeButton from './components/SelectionModeButton';
import KeyboardToggleButton from './components/KeyboardToggleButton';
import AppHeader, { AppTabId } from './components/AppHeader';
import ProductionTab from './components/ProductionTab';
import OfflineStatus from './components/OfflineStatus';
import { PopoutFrame, SubTabPopoutFrame, ReportCategorySidebar } from './components/popout/PopoutFrames';
import { requestUnsavedSave } from './lib/unsavedGuard';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function AppContent() {
  const { state, dispatch, currentProjectId, createProject, readOnly, projectList, renameProject, registerPostSaveHandler, closeProject, consumeLegacyMigrationNotice, retryConnectivity } = useProject();
  const dialog = useDialog();
  const [activeTab, setActiveTab] = useState<'breakdown' | 'schedule' | 'calendar' | 'design' | 'rules' | 'reports'>('breakdown');
  const [designSubTab, setDesignSubTab] = useState<'colors' | 'ribbons'>('ribbons');
  const [brSubTab, setBrSubTab] = useState<'elements' | 'sheet' | 'glide'>('glide');
  const [brCategory, setBrCategory] = useState('cast');
  const [brSheetIdx, setBrSheetIdx] = useState(0);
  const [reportsSubTab, setReportsSubTab] = useState<'doods' | 'elementBreakdown'>('doods');
  const [reportsCategory, setReportsCategory] = useState('cast');
  const [prodSubTab, setProdSubTab] = useState<'details' | 'crew'>('details');
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

  // Tab actions consult the element manager's unsaved-changes guard first:
  // the prompt (and any merge confirmation from the save) happens while the
  // element manager is still mounted, before the switch/popout.
  const requestTabSwitch = useCallback((tab: AppTabId) => {
    void requestUnsavedSave(dialog, () => setActiveTab(tab));
  }, [dialog, setActiveTab]);

  const requestTabPopout = useCallback((tab: AppTabId) => {
    void requestUnsavedSave(dialog, () => togglePopout(tab));
  }, [dialog, togglePopout]);

  const tabLabels: Record<string, string> = {
    breakdown: 'Breakdown', schedule: 'Schedule', calendar: 'Calendar',
    design: 'Design', rules: 'Rules', reports: 'Reports', production: 'Production',
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
      } else if (parentId === 'production' && prodSubTab === subTabId) {
        const nextTab = ['details', 'crew'].find(t => t !== subTabId && !newSet.has(t));
        if (nextTab) setProdSubTab(nextTab as any);
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
  const [retryingConnection, setRetryingConnection] = useState(false);

  useEffect(() => {
    if (readOnly) {
      setShowOfflineModal(true);
      setShowRestoredBanner(false);
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowOfflineModal(false);
      setShowRestoredBanner(true);
      const timer = setTimeout(() => setShowRestoredBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [readOnly]);

  const handleRetryConnection = useCallback(async () => {
    if (retryingConnection) return;
    setRetryingConnection(true);
    const started = Date.now();
    try {
      await retryConnectivity();
    } finally {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, 1000 - elapsed);
      setTimeout(() => setRetryingConnection(false), remaining);
    }
  }, [retryConnectivity, retryingConnection]);

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
      dialog.alert({ title: 'Import Error', message: formatDriveError(e, e?.message || 'Failed to parse file') });
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

  // Long-press on rows opens the context menu; on marquee containers it
  // starts a transient marquee selection (gated by the marquee tool mode).
  const longPressGate = useCallback((target: HTMLElement) => {
    const inMarqueeToolZone = !!target.closest('[data-marquee-tool-only]');
    if (inMarqueeToolZone && getMarqueeMode() !== 'tool') return false;
    const inRow = !!target.closest('[data-row-id]');
    if (inMarqueeToolZone) {
      return !target.closest('button, input, select, textarea');
    }
    if (isInteractiveElement(target)) return false;
    return !(inRow && getMarqueeMode() !== 'tool');
  }, []);

  const handleLongPress = useCallback((target: HTMLElement, x: number, y: number) => {
    if (target.closest('[data-row-id]')) {
      target.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 2,
        view: window,
      }));
    } else {
      setTransientMarquee(true);
    }
  }, []);

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
    <LongPressMenuProvider
      targetSelector="[data-row-id], [data-marquee-container]"
      longPressMs={750}
      shouldStartLongPress={longPressGate}
      onLongPress={handleLongPress}
    >
    <>
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

      <OfflineStatus
        readOnly={readOnly}
        isCloudProject={isCloudProject}
        isSignedIn={driveCtx.isSignedIn}
        needsReauth={driveCtx.needsReauth}
        onSignIn={() => driveCtx.signIn()}
        onRetry={handleRetryConnection}
        retryingConnection={retryingConnection}
        showModal={showOfflineModal}
        setShowModal={setShowOfflineModal}
        showRestoredBanner={showRestoredBanner}
      />

      {/* HEADER */}
      <AppHeader
        activeTab={activeTab}
        setActiveTab={requestTabSwitch}
        isCloudProject={isCloudProject}
        shiftHeld={shiftHeld}
        togglePopout={requestTabPopout}
        onTabContextMenu={(e, tabId) => setTabContextMenu({ x: e.clientX, y: e.clientY, tabId })}
        onOpenProjectManager={() => setShowProjectManager(true)}
        onImportClick={() => importFileRef.current?.click()}
        onExportCSV={handleExportCSV}
        onExportJSON={handleExportJSON}
        onPrintSchedule={() => setShowPrintDialog(true)}
        onPrintDood={() => setShowDoodDialog(true)}
        onPrintBreakdownSheet={() => setShowBreakdownSheetDialog(true)}
        onPrintElementBreakdown={() => setShowElementBreakdownDialog(true)}
        onShowTrash={() => setShowTrash(true)}
        driveCtx={driveCtx}
        closeProject={closeProject}
        createProject={async (title) => { await createProject(title); }}
      />

      {/* POPOUT WINDOWS */}
      {poppedOutTabs.has('breakdown') && popoutWindowsRef.current.get('breakdown') && (
        <PopoutFrame title={`${project.title || 'Untitled'} - Breakdown`} win={popoutWindowsRef.current.get('breakdown')!} onClose={() => closePopout('breakdown')} tabName="Breakdown" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)}>
          <BreakdownTab subTab={brSubTab} onSubTabChange={setBrSubTab} savedCat={brCategory} onCategoryChange={setBrCategory} savedSheetIdx={brSheetIdx} onSheetIdxChange={setBrSheetIdx} onOpenSheet={handleOpenSheet} onOpenSchedule={handleOpenScheduleAtScene} onOpenSheetInPopout={handleOpenSheetInPopout} onOpenScheduleInPopout={handleOpenScheduleInPopout} poppedOutSubTabs={poppedOutSubTabs.breakdown || new Set()} onToggleSubPopout={(id) => toggleSubPopout('breakdown', id)} onCloseSubPopout={(id) => closeSubPopout('breakdown', id)} shiftHeld={shiftHeld} />
        </PopoutFrame>
      )}
      {poppedOutTabs.has('schedule') && popoutWindowsRef.current.get('schedule') && (
        <PopoutFrame title={`${project.title || 'Untitled'} - Schedule`} win={popoutWindowsRef.current.get('schedule')!} onClose={() => closePopout('schedule')} tabName="Schedule" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)}>
          <ScheduleTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} onPrint={() => setShowPrintDialog(true)} targetSceneId={scheduleTargetScene} onSceneTargetSeen={handleClearScheduleTarget} savedScrollTop={scheduleScrollTop} onScrollChange={setScheduleScrollTop} />
        </PopoutFrame>
      )}
      {poppedOutTabs.has('calendar') && popoutWindowsRef.current.get('calendar') && (
        <PopoutFrame title={`${project.title || 'Untitled'} - Calendar`} win={popoutWindowsRef.current.get('calendar')!} onClose={() => closePopout('calendar')} tabName="Calendar" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)}>
          <CalendarTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} />
        </PopoutFrame>
      )}
      {poppedOutTabs.has('design') && popoutWindowsRef.current.get('design') && (
        <PopoutFrame title={`${project.title || 'Untitled'} - Design`} win={popoutWindowsRef.current.get('design')!} onClose={() => closePopout('design')} tabName="Design" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} bg="bg-zinc-950">
          <DesignTab subTab={designSubTab} onSubTabChange={setDesignSubTab} poppedOutSubTabs={poppedOutSubTabs.design || new Set()} onToggleSubPopout={(id) => toggleSubPopout('design', id)} onCloseSubPopout={(id) => closeSubPopout('design', id)} shiftHeld={shiftHeld} />
        </PopoutFrame>
      )}
      {poppedOutTabs.has('rules') && popoutWindowsRef.current.get('rules') && (
        <PopoutFrame title={`${project.title || 'Untitled'} - Rules`} win={popoutWindowsRef.current.get('rules')!} onClose={() => closePopout('rules')} tabName="Rules" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)}>
          <RulesTab />
        </PopoutFrame>
      )}
      {poppedOutTabs.has('reports') && popoutWindowsRef.current.get('reports') && (
        <PopoutFrame title={`${project.title || 'Untitled'} - Reports`} win={popoutWindowsRef.current.get('reports')!} onClose={() => closePopout('reports')} tabName="Reports" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} bg="bg-zinc-900">
          <ReportsTab subTab={reportsSubTab} onSubTabChange={setReportsSubTab} selectedCategory={reportsCategory} onCategoryChange={setReportsCategory} onPrint={() => { setPrintDialogCategory(reportsCategory); if (reportsSubTab === 'doods') setShowDoodDialog(true); else setShowElementBreakdownDialog(true); }} poppedOutSubTabs={poppedOutSubTabs.reports || new Set()} onToggleSubPopout={(id) => toggleSubPopout('reports', id)} onCloseSubPopout={(id) => closeSubPopout('reports', id)} shiftHeld={shiftHeld} />
        </PopoutFrame>
      )}

      {/* SUB-TAB POPOUT WINDOWS */}
      {poppedOutSubTabs.breakdown?.has('sheet') && popoutSubWindowsRef.current.get('sub_breakdown_sheet') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Sheet`} win={popoutSubWindowsRef.current.get('sub_breakdown_sheet')!} onClose={() => closeSubPopout('breakdown', 'sheet')} tabName="Breakdown" subTabId="sheet" tabLabel="Sheet" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_breakdown_sheet']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_breakdown_sheet: el }))}>
          <SceneSheet initialIndex={brSheetIdx} onIndexChange={setBrSheetIdx} onOpenSchedule={handleOpenScheduleAtScene} onOpenScheduleInPopout={handleOpenScheduleInPopout} headerTarget={subHeaderTargets['sub_breakdown_sheet']} />
        </SubTabPopoutFrame>
      )}
      {poppedOutSubTabs.breakdown?.has('elements') && popoutSubWindowsRef.current.get('sub_breakdown_elements') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Element Manager`} win={popoutSubWindowsRef.current.get('sub_breakdown_elements')!} onClose={() => closeSubPopout('breakdown', 'elements')} tabName="Breakdown" subTabId="elements" tabLabel="Element Manager" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_breakdown_elements']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_breakdown_elements: el }))}>
          <ElementManager initialCategory={brCategory} onCategoryChange={setBrCategory} headerTarget={subHeaderTargets['sub_breakdown_elements']} />
        </SubTabPopoutFrame>
      )}
      {poppedOutSubTabs.breakdown?.has('glide') && popoutSubWindowsRef.current.get('sub_breakdown_glide') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Glide Breakdown`} win={popoutSubWindowsRef.current.get('sub_breakdown_glide')!} onClose={() => closeSubPopout('breakdown', 'glide')} tabName="Breakdown" subTabId="glide" tabLabel="Glide Breakdown" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_breakdown_glide']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_breakdown_glide: el }))}>
          <GlideBreakdownTab onOpenSheet={handleOpenSheet} onOpenSheetInPopout={handleOpenSheetInPopout} headerTarget={subHeaderTargets['sub_breakdown_glide']} />
        </SubTabPopoutFrame>
      )}
      {poppedOutSubTabs.design?.has('ribbons') && popoutSubWindowsRef.current.get('sub_design_ribbons') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Ribbon Designer`} win={popoutSubWindowsRef.current.get('sub_design_ribbons')!} onClose={() => closeSubPopout('design', 'ribbons')} tabName="Design" subTabId="ribbons" tabLabel="Ribbon Designer" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_design_ribbons']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_design_ribbons: el }))} theme="dark" bg="bg-zinc-950">
          <RibbonTab headerTarget={subHeaderTargets['sub_design_ribbons']} />
        </SubTabPopoutFrame>
      )}
      {poppedOutSubTabs.design?.has('colors') && popoutSubWindowsRef.current.get('sub_design_colors') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Colors`} win={popoutSubWindowsRef.current.get('sub_design_colors')!} onClose={() => closeSubPopout('design', 'colors')} tabName="Design" subTabId="colors" tabLabel="Colors" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_design_colors']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_design_colors: el }))} theme="dark" bg="bg-zinc-950">
          <ColorsTab headerTarget={subHeaderTargets['sub_design_colors']} />
        </SubTabPopoutFrame>
      )}
      {poppedOutSubTabs.reports?.has('doods') && popoutSubWindowsRef.current.get('sub_reports_doods') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Day Out of Days`} win={popoutSubWindowsRef.current.get('sub_reports_doods')!} onClose={() => closeSubPopout('reports', 'doods')} tabName="Reports" subTabId="doods" tabLabel="Day Out of Days" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_reports_doods']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_reports_doods: el }))} theme="dark" bg="bg-zinc-900" rightContent={<button onClick={() => { setPrintDialogCategory(reportsCategory); setShowDoodDialog(true); }} className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"><Printer className="w-3.5 h-3.5" /> Print</button>}>
          <div className="flex-1 min-h-0 flex">
            <ReportCategorySidebar collapsed={reportSidebarCollapsed['doods']} onToggleCollapsed={c => setReportSidebarCollapsed(prev => ({ ...prev, doods: c }))} keys={allReportCategoryKeys} selected={reportsCategory} onSelect={setReportsCategory} project={project} />
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <DoodsTab selectedCategory={reportsCategory} />
            </div>
          </div>
        </SubTabPopoutFrame>
      )}
      {poppedOutSubTabs.reports?.has('elementBreakdown') && popoutSubWindowsRef.current.get('sub_reports_elementBreakdown') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Element Breakdown`} win={popoutSubWindowsRef.current.get('sub_reports_elementBreakdown')!} onClose={() => closeSubPopout('reports', 'elementBreakdown')} tabName="Element Breakdown" subTabId="elementBreakdown" tabLabel="Element Breakdown" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_reports_elementBreakdown']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_reports_elementBreakdown: el }))} theme="dark" bg="bg-zinc-900" rightContent={<button onClick={() => { setPrintDialogCategory(reportsCategory); setShowElementBreakdownDialog(true); }} className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"><Printer className="w-3.5 h-3.5" /> Print</button>}>
          <div className="flex-1 min-h-0 flex">
            <ReportCategorySidebar collapsed={reportSidebarCollapsed['elementBreakdown']} onToggleCollapsed={c => setReportSidebarCollapsed(prev => ({ ...prev, elementBreakdown: c }))} keys={allReportCategoryKeys} selected={reportsCategory} onSelect={setReportsCategory} project={project} />
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <ElementBreakdownView selectedCategory={reportsCategory} />
            </div>
          </div>
        </SubTabPopoutFrame>
      )}

      {poppedOutSubTabs.production?.has('details') && popoutSubWindowsRef.current.get('sub_production_details') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Project Details`} win={popoutSubWindowsRef.current.get('sub_production_details')!} onClose={() => closeSubPopout('production', 'details')} tabName="Production" subTabId="details" tabLabel="Project Details" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_production_details']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_production_details: el }))}>
          <ProductionTab subTab="details" onSubTabChange={setProdSubTab} poppedOutSubTabs={poppedOutSubTabs.production || new Set()} onToggleSubPopout={(id) => toggleSubPopout('production', id)} onCloseSubPopout={(id) => closeSubPopout('production', id)} />
        </SubTabPopoutFrame>
      )}
      {poppedOutSubTabs.production?.has('crew') && popoutSubWindowsRef.current.get('sub_production_crew') && (
        <SubTabPopoutFrame title={`${project.title || 'Untitled'} - Crew`} win={popoutSubWindowsRef.current.get('sub_production_crew')!} onClose={() => closeSubPopout('production', 'crew')} tabName="Production" subTabId="crew" tabLabel="Crew" projectTitle={project.title} onProjectTitleChange={v => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId)} headerTarget={subHeaderTargets['sub_production_crew']} setHeaderTarget={el => setSubHeaderTargets(prev => ({ ...prev, sub_production_crew: el }))}>
          <ProductionTab subTab="crew" onSubTabChange={setProdSubTab} poppedOutSubTabs={poppedOutSubTabs.production || new Set()} onToggleSubPopout={(id) => toggleSubPopout('production', id)} onCloseSubPopout={(id) => closeSubPopout('production', id)} />
        </SubTabPopoutFrame>
      )}

      {/* CONTENT */}
      <main key={currentProjectId} className="flex-1 flex flex-col relative bg-white min-h-0 -mt-px" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, input, select, [role="button"], [role="menuitem"]')) return;
          setShowFileMenu(false);
          setShowVersionsMenu(false);
          setTabContextMenu(null);
        }}
      >
        {poppedOutTabs.has(activeTab) ? (
          <PopoutPlaceholder title={tabLabels[activeTab]} onBringBack={() => closePopout(activeTab)} />
        ) : (
          activeTab === 'breakdown' ? <BreakdownTab subTab={brSubTab} onSubTabChange={setBrSubTab} savedCat={brCategory} onCategoryChange={setBrCategory} savedSheetIdx={brSheetIdx} onSheetIdxChange={setBrSheetIdx} onOpenSheet={handleOpenSheet} onOpenSchedule={handleOpenScheduleAtScene} onOpenSheetInPopout={handleOpenSheetInPopout} onOpenScheduleInPopout={handleOpenScheduleInPopout} poppedOutSubTabs={poppedOutSubTabs.breakdown || new Set()} onToggleSubPopout={(id) => toggleSubPopout('breakdown', id)} onCloseSubPopout={(id) => closeSubPopout('breakdown', id)} shiftHeld={shiftHeld} /> : activeTab === 'schedule' ? <ScheduleTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} onPrint={() => setShowPrintDialog(true)} targetSceneId={scheduleTargetScene} onSceneTargetSeen={handleClearScheduleTarget} savedScrollTop={scheduleScrollTop} onScrollChange={setScheduleScrollTop} /> :           activeTab === 'calendar' ? <CalendarTab onOpenScene={handleOpenScene} onOpenSceneInPopout={handleOpenSceneInPopout} /> : activeTab === 'design' ? <DesignTab subTab={designSubTab} onSubTabChange={setDesignSubTab} poppedOutSubTabs={poppedOutSubTabs.design || new Set()} onToggleSubPopout={(id) => toggleSubPopout('design', id)} onCloseSubPopout={(id) => closeSubPopout('design', id)} shiftHeld={shiftHeld} /> : activeTab === 'reports' ? <ReportsTab subTab={reportsSubTab} onSubTabChange={setReportsSubTab} selectedCategory={reportsCategory} onCategoryChange={setReportsCategory} onPrint={() => { setPrintDialogCategory(reportsCategory); if (reportsSubTab === 'doods') setShowDoodDialog(true); else setShowElementBreakdownDialog(true); }} poppedOutSubTabs={poppedOutSubTabs.reports || new Set()} onToggleSubPopout={(id) => toggleSubPopout('reports', id)} onCloseSubPopout={(id) => closeSubPopout('reports', id)} shiftHeld={shiftHeld} /> : activeTab === 'production' ? <ProductionTab subTab={prodSubTab} onSubTabChange={setProdSubTab} poppedOutSubTabs={poppedOutSubTabs.production || new Set()} onToggleSubPopout={(id) => toggleSubPopout('production', id)} onCloseSubPopout={(id) => closeSubPopout('production', id)} shiftHeld={shiftHeld} /> : <RulesTab />
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
        <ContextMenuItem onClick={() => { requestTabPopout(tabContextMenu.tabId); setTabContextMenu(null); }} icon={<ExternalLink className="w-3.5 h-3.5" />}>
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

