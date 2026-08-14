import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, FolderOpen, FileUp, Download, Printer, LogOut, Cloud, Trash2, Undo2, Redo2 } from 'lucide-react';
import { useProject } from '../store';
import { useDialog } from './Dialog';
import { generateUUID } from '../lib/utils';
import { IS_COARSE } from '../lib/device';
import { ReportDesign } from '../types';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import DropdownSubmenu from './DropdownSubmenu';
import { SaveIndicator } from './SaveIndicator';
import { ItemManagerDropdown } from './DropdownMenu';
import { useUnsavedGuardState, performLocalUndo, performLocalRedo } from '../lib/unsavedGuard';

export type AppTabId = 'breakdown' | 'schedule' | 'calendar' | 'design' | 'rules' | 'production' | 'reports';

interface GoogleAuthContextValue {
  isSignedIn: boolean;
  needsReauth: boolean;
  user?: { name?: string } | null;
  signIn: () => void;
  signOut: () => void;
}

interface AppHeaderProps {
  activeTab: AppTabId;
  setActiveTab: (tab: AppTabId) => void;
  isCloudProject: boolean;
  shiftHeld: boolean;
  togglePopout: (tabId: string) => void;
  onTabContextMenu: (e: React.MouseEvent, tabId: AppTabId) => void;
  onOpenProjectManager: () => void;
  onImportClick: () => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onPrintSchedule: () => void;
  onPrintDood: () => void;
  onPrintBreakdownSheet: () => void;
  onPrintReport: (design: ReportDesign) => void;
  onShowTrash: () => void;
  driveCtx: GoogleAuthContextValue;
  closeProject: () => void;
  createProject: (title?: string) => Promise<void>;
}

export default function AppHeader(props: AppHeaderProps) {
  const { state, dispatch, projectList, currentProjectId, renameProject } = useProject();
  const dialog = useDialog();
  const guardState = useUnsavedGuardState();
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);
  const {
    activeTab, setActiveTab, isCloudProject, shiftHeld, togglePopout, onTabContextMenu,
    onOpenProjectManager, onImportClick, onExportCSV, onExportJSON,
    onPrintSchedule, onPrintDood, onPrintBreakdownSheet, onPrintReport,
    onShowTrash, driveCtx, closeProject, createProject,
  } = props;

  const [showFileMenu, setShowFileMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showVersionsMenu, setShowVersionsMenu] = useState(false);
  const [tabScrollMask, setTabScrollMask] = useState('none');
  const topTabContainerRef = useRef<HTMLDivElement>(null);
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

  const inactiveTabText = isCloudProject ? 'text-white/70 hover:text-white hover:bg-blue-900/60' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800';
  const activeTabClass = isCloudProject ? 'bg-white text-blue-950' : 'bg-white text-zinc-900';
  const currentDriveFileId = projectList.find(p => p.id === currentProjectId)?.driveFileId;

  const tabButtons: AppTabId[] = ['breakdown', 'schedule', 'calendar', 'design', 'rules', 'production', 'reports'];

  return (
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
            <DropdownItem onClick={() => { setShowFileMenu(false); onOpenProjectManager(); }} icon={<FolderOpen className="w-3.5 h-3.5" />}>
              Project Manager
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem onClick={() => { setShowFileMenu(false); onImportClick(); }} icon={<FileUp className="w-3.5 h-3.5" />}>
              Import Screenplay (FDX, Fountain, TXT, CSV)...
            </DropdownItem>
            <DropdownDivider />
            <DropdownSubmenu id="export-file" label="Export" icon={<Download className="w-3.5 h-3.5" />} width="w-48">
              <DropdownItem onClick={() => { setShowFileMenu(false); onExportCSV(); }}>
                Breakdown to CSV
              </DropdownItem>
              <DropdownItem onClick={() => { setShowFileMenu(false); onExportJSON(); }}>
                Export Project
              </DropdownItem>
            </DropdownSubmenu>
            <DropdownSubmenu id="print-file" label="Print" icon={<Printer className="w-3.5 h-3.5" />} width="w-48">
              <DropdownItem onClick={() => { setShowFileMenu(false); onPrintSchedule(); }}>
                Schedule...
              </DropdownItem>
              <DropdownItem onClick={() => { setShowFileMenu(false); onPrintDood(); }}>
                Day Out of Days...
              </DropdownItem>
              <DropdownItem onClick={() => { setShowFileMenu(false); onPrintBreakdownSheet(); }}>
                Scene Breakdown...
              </DropdownItem>
            </DropdownSubmenu>
            <DropdownSubmenu id="print-reports" label="Custom Reports" icon={<Printer className="w-3.5 h-3.5" />} width="w-52">
              {(project.reportDesigns || []).length === 0 ? (
                <DropdownItem onClick={() => setShowFileMenu(false)}>No reports yet — create one in Design</DropdownItem>
              ) : (
                (project.reportDesigns || []).map(d => (
                  <DropdownItem key={d.id} onClick={() => { setShowFileMenu(false); onPrintReport(d); }}>
                    {d.name}
                  </DropdownItem>
                ))
              )}
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
            <DropdownItem onClick={() => { setShowFileMenu(false); onShowTrash(); }} icon={<Trash2 className="w-3.5 h-3.5" />}>
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
                renameProject(currentProjectId!, e.target.value, currentDriveFileId);
              }}
              onKeyDown={e => { if (e.key === 'Enter') { setEditingTitle(false); (e.target as HTMLInputElement).blur(); } }}
              className={`bg-transparent border-none text-white font-medium rounded px-1 outline-none font-sans max-w-[60px] md:max-w-[120px] ${isCloudProject ? 'focus:ring-1 focus:ring-blue-600' : 'focus:ring-1 focus:ring-zinc-600'}`}
            />
          ) : (
            <span
              onClick={() => setEditingTitle(true)}
              className="text-white font-medium px-1 truncate max-w-[60px] md:max-w-[120px] cursor-pointer hover:opacity-80"
              title={project.title}
            >
              {project.title}
            </span>
          )}
        </div>
        <div ref={topTabContainerRef} onScroll={checkTabScroll} className="overflow-x-auto flex-1 min-w-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitMaskImage: tabScrollMask, maskImage: tabScrollMask }}>
          <div className="flex items-center gap-1 mx-auto shrink-0 w-fit">
            {tabButtons.map(tabId => (
              <button
                key={tabId}
                onClick={() => { if (shiftHeld && !IS_COARSE) { togglePopout(tabId); } else { setActiveTab(tabId); } }}
                onContextMenu={(e) => { if (IS_COARSE) return; e.preventDefault(); onTabContextMenu(e, tabId); }}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors shrink-0 ${activeTab === tabId ? activeTabClass : inactiveTabText}`}
              >
                {tabId === 'breakdown' ? 'Breakdown' : tabId === 'schedule' ? 'Schedule' : tabId === 'calendar' ? 'Calendar' : tabId === 'design' ? 'Design' : tabId === 'rules' ? 'Rules' : tabId === 'production' ? 'Production' : 'Reports'}
              </button>
            ))}
          </div>
        </div>

      <div className="flex items-center space-x-3 font-mono text-xs shrink-0 ml-auto">
        <div className="flex items-center gap-1 border border-white/10 rounded bg-white/5">
          <button
            onClick={() => { if (!performLocalUndo()) dispatch({ type: 'UNDO' }); }}
            disabled={state.past.length === 0 && !guardState.hasLocalUndo}
            className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${isCloudProject ? 'text-white/70 hover:text-white hover:bg-blue-900/60' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            title="Undo (Cmd+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { if (!performLocalRedo()) dispatch({ type: 'REDO' }); }}
            disabled={state.future.length === 0 && !guardState.hasLocalRedo}
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
          onTrash={() => onShowTrash()}
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
  );
}
