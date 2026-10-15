import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, FolderOpen, FileUp, Download, Printer, LogOut, Cloud, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useProject, useIsOnlineProject, useProjectTheme } from '../store';
import { PROJECT_CHROME, projectAccentOf, projectMenuThemeOf } from '../lib/projectTheme';
import { useDialog } from './Dialog';
import { IS_COARSE } from '../lib/device';
import { ReportDesign } from '../types';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import DropdownSubmenu from './DropdownSubmenu';
import Button from './Button';
import { SaveIndicator } from './SaveIndicator';
import { UndoRedoButtons } from './UndoRedoButtons';
import { RoomNote } from './RoomNote';
import { UserPresenceCluster } from './UserPresenceCluster';
import { isSupabaseConfigured } from '../lib/supabase/client';
import type { AgentBridgeStatus } from '../lib/agentBridgeClient';
import type { AppTabId } from '../lib/appNav';

export type { AppTabId };

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
  shiftHeld: boolean;
  togglePopout: (tabId: string) => void;
  onTabContextMenu: (e: React.MouseEvent, tabId: AppTabId) => void;
  onOpenProjectManager: () => void;
  /** Opens the User & sharing panel for the open shared project (S2). */
  onManageSharing: () => void;
  onImportClick: () => void;
  onImportNewProject: () => void;
  onUpdateScript: () => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onExportSex: () => void;
  onPrintSchedule: () => void;
  onPrintDood: () => void;
  onPrintBreakdownSheet: () => void;
  onPrintReport: (design: ReportDesign) => void;
  onShowTrash: () => void;
  onShowIntegrity: () => void;
  agentBridge: { enabled: boolean; status: AgentBridgeStatus; available: boolean };
  onToggleAgentBridge: () => void;
  driveCtx: GoogleAuthContextValue;
  closeProject: () => void;
  createProject: (title?: string) => Promise<void>;
  /** Opens the app-level AccountModal (sign in / create account). */
  onOpenAccount: () => void;
}

export default function AppHeader(props: AppHeaderProps) {
  const { state, dispatch, projectList, currentProjectId, renameProject, locked } = useProject();
  const dialog = useDialog();

  const project = state.present;
  const {
    activeTab, setActiveTab, shiftHeld, togglePopout, onTabContextMenu,
    onOpenProjectManager, onManageSharing, onImportClick, onImportNewProject, onUpdateScript, onExportCSV, onExportJSON, onExportSex,
    onPrintSchedule, onPrintDood, onPrintBreakdownSheet, onPrintReport,
    onShowTrash, onShowIntegrity, agentBridge, onToggleAgentBridge, driveCtx, closeProject, createProject, onOpenAccount,
  } = props;
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  // Local draft while renaming: the store (and the index meta / Drive / online
  // push) see ONE commit on blur/Enter, never a per-character UPDATE_PROJECT.
  const [titleDraft, setTitleDraft] = useState('');
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

  const currentDriveFileId = projectList.find(p => p.id === currentProjectId)?.driveFileId;
  const isOnlineProject = useIsOnlineProject();

  /* Project chrome (roadmap 248): local zinc / Drive blue / shared emerald. */
  const projectTheme = useProjectTheme();
  const chrome = PROJECT_CHROME[projectTheme];
  const accent = projectAccentOf(projectTheme);
  const menuTheme = projectMenuThemeOf(projectTheme);
  const isCloud = projectTheme !== 'local';
  const fileTriggerText = projectTheme === 'local' ? 'text-zinc-400 hover:text-white' : 'text-white';

  const tabButtons: AppTabId[] = ['breakdown', 'schedule', 'calendar', 'design', 'rules', 'production', 'reports'];

  const agentBridgeLabel =
    agentBridge.status === 'connected' ? 'Agent bridge: connected'
    : agentBridge.status === 'connecting' ? 'Agent bridge: connecting…'
    : agentBridge.status === 'error' ? 'Agent bridge: helper not running'
    : 'Connect agent bridge';
  const agentBridgeDot =
    agentBridge.status === 'connected' ? 'bg-emerald-400'
    : agentBridge.status === 'connecting' ? 'bg-amber-400 animate-pulse'
    : agentBridge.status === 'error' ? 'bg-red-500'
    : 'bg-zinc-600';

  return (
    <header className={`flex items-center ${chrome.bar} text-zinc-300 px-4 py-2 select-none print:hidden`}>
      <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu
            open={showFileMenu}
            onOpenChange={setShowFileMenu}
            width="w-56"
            align="left"
            theme={menuTheme}
            trigger={
              <button
                data-presence-anchor="toolbar:header:file"
                className={`flex items-center space-x-1.5 rounded transition-colors -ml-3 px-3 py-1.5 font-sans font-medium cursor-pointer select-none ${fileTriggerText} ${chrome.barHover}`}
              >
                <span className="hidden md:inline">File</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            }
          >
            <DropdownItem onClick={() => { setShowFileMenu(false); onOpenProjectManager(); }} icon={<FolderOpen className="w-3.5 h-3.5" />}>
              Project Manager
            </DropdownItem>
            {isOnlineProject && (
              <DropdownItem onClick={() => { setShowFileMenu(false); onManageSharing(); }} icon={<Users className="w-3.5 h-3.5" />}>
                Manage Shared Project...
              </DropdownItem>
            )}
            <DropdownDivider />
            <DropdownSubmenu id="import-file" label="Import" icon={<FileUp className="w-3.5 h-3.5" />} width="w-56">
              <DropdownItem onClick={() => { setShowFileMenu(false); onImportClick(); }} disabled={locked}>
                .fdx, .fountain, .csv, .txt
              </DropdownItem>
              <DropdownItem onClick={() => { setShowFileMenu(false); onImportNewProject(); }}>
                New project (.lemon, .msd, .sex, scripts)
              </DropdownItem>
              <DropdownItem onClick={() => { setShowFileMenu(false); onUpdateScript(); }} disabled={locked}>
                Update script (diff)…
              </DropdownItem>
            </DropdownSubmenu>
            <DropdownDivider />
            <DropdownSubmenu id="export-file" label="Export" icon={<Download className="w-3.5 h-3.5" />} width="w-48">
              <DropdownItem onClick={() => { setShowFileMenu(false); onExportCSV(); }}>
                Breakdown to .csv
              </DropdownItem>
              <DropdownItem onClick={() => { setShowFileMenu(false); onExportSex(); }}>
                Schedule to .sex
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
            {!isSupabaseConfigured && (
              <>
                <DropdownDivider />
                {driveCtx.isSignedIn ? (
                  <DropdownItem onClick={() => { setShowFileMenu(false); if (isCloud) closeProject(); driveCtx.signOut(); }} icon={<LogOut className="w-3.5 h-3.5" />}>
                    Sign out{driveCtx.user ? ` (${driveCtx.user.name})` : ''}
                  </DropdownItem>
                ) : (
                  <DropdownItem onClick={() => { setShowFileMenu(false); driveCtx.signIn(); }} icon={<Cloud className="w-3.5 h-3.5" />}>
                    Sign in with Google Drive...
                  </DropdownItem>
                )}
              </>
            )}
            <DropdownDivider />
            <DropdownItem onClick={() => { setShowFileMenu(false); onShowIntegrity(); }} icon={<ShieldCheck className="w-3.5 h-3.5" />}>
              Script integrity...
            </DropdownItem>
            <DropdownItem onClick={() => { setShowFileMenu(false); onShowTrash(); }} icon={<Trash2 className="w-3.5 h-3.5" />}>
              Trash...
            </DropdownItem>
            <DropdownDivider />
            {agentBridge.available && (
              <DropdownItem
                keepOpen
                onClick={onToggleAgentBridge}
                icon={<span className={`inline-block w-2 h-2 rounded-full ${agentBridgeDot}`} />}
              >
                {agentBridgeLabel}
              </DropdownItem>
            )}
          </DropdownMenu>
          <SaveIndicator isCloudProject={isCloud} />
          {editingTitle ? (
            <input 
              autoFocus
              value={titleDraft} 
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (titleDraft !== project.title) renameProject(currentProjectId!, titleDraft, currentDriveFileId);
              }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
              className={`bg-transparent border-none text-white font-medium rounded px-1 mr-2 outline-none font-sans max-w-[60px] md:max-w-[120px] ${chrome.titleRing}`}
            />
          ) : (
            <span
              onClick={() => { if (!locked) { setTitleDraft(project.title); setEditingTitle(true); } }}
              data-presence-anchor="header:project-title"
              className={`text-white font-medium px-1 mr-2 truncate max-w-[60px] md:max-w-[120px] ${locked ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
              title={project.title}
            >
              {project.title}
            </span>
          )}
        </div>
        <div ref={topTabContainerRef} onScroll={checkTabScroll} className="overflow-x-auto flex-1 min-w-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitMaskImage: tabScrollMask, maskImage: tabScrollMask }}>
          <div className="flex items-center gap-1 mx-auto shrink-0 w-fit">
            {tabButtons.map(tabId => (
              <Button
                key={tabId}
                variant="tab-header"
                cloud={accent}
                active={activeTab === tabId}
                data-presence-anchor={`nav:tab:${tabId}`}
                onClick={() => { if (shiftHeld && !IS_COARSE) { togglePopout(tabId); } else { setActiveTab(tabId); } }}
                onContextMenu={(e) => { if (IS_COARSE) return; e.preventDefault(); onTabContextMenu(e, tabId); }}
                className="shrink-0"
              >
                {tabId === 'breakdown' ? 'Breakdown' : tabId === 'schedule' ? 'Schedule' : tabId === 'calendar' ? 'Calendar' : tabId === 'design' ? 'Design' : tabId === 'rules' ? 'Rules' : tabId === 'production' ? 'Production' : 'Reports'}
              </Button>
            ))}
          </div>
        </div>

      <div className="flex items-center space-x-3 font-mono text-xs shrink-0 ml-auto">
        <RoomNote />
        <UndoRedoButtons />
        <UserPresenceCluster driveCtx={driveCtx} driveBacked={!!currentDriveFileId} closeProject={closeProject} onOpenAccount={onOpenAccount} onManageSharing={onManageSharing} />
      </div>
    </header>
  );
}
