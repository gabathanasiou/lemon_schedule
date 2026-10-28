import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useProject, ProjectMeta, loadProjectFromStorage, saveProjectToStorage } from '../store';
import { Project } from '../types';
import { exportProjectFromStorage, exportProjectData } from '../lib/utils';
import { pushProjectAndUpdateIndex } from '../lib/syncManager';
import { listDriveProjectMetas, deleteDriveProject, readDriveProject, removeFromDriveIndex, clearAllDriveData, formatDriveError, getDriveErrorStatus } from '../lib/googleDriveStorage';
import { readOnlineProject } from '../lib/supabase/onlineProjects';
import { onlineProjectListForDisplay } from '../lib/supabase/onlineProjectList';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { isSupabaseConfigured } from '../lib/supabase/client';
import { Plus, Trash2, FolderOpen, ArrowUpDown, ChevronDown, Cloud, CloudOff, HardDrive, Users, TriangleAlert, Loader2, RefreshCw, Skull, FileUp, Check, LogOut } from 'lucide-react';
import { useDialog } from './Dialog';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import ProjectCard from './ProjectCard';
import { AccountAvatar } from './AccountAvatar';
import { AccountSettingsModal } from './AccountSettingsModal';
import NewProjectModal from './NewProjectModal';
import ImportDialog from './ImportDialog';
import { parseNewProjectFile, NEW_PROJECT_ACCEPT } from '../lib/import';
import type { ImportResult } from '../lib/import';
import { PM_BTN_PAD, PM_ICON, PM_ICON_SM, PM_INPUT, PM_TITLE, PM_SUBTITLE } from './projectManagerStyles';
import { pickerAccept } from '../lib/device';
import { useGoogleAuth } from '../lib/googleDriveAuth';
import { useDriveProjectList } from '../lib/useDriveProjectList';

interface ProjectManagerProps {
  onClose?: () => void;
  /** Opens the app-level AccountModal (sign in / create account) — used by
   *  the signed-out Online tab so email/password sign-in works without the
   *  header cluster (boot screen). */
  onOpenAccount?: () => void;
}

type SortKey = 'lastModified' | 'createdAt' | 'title';
type ProjectTab = 'local' | 'cloud' | 'online';

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'lastModified', label: 'Last Modified' },
  { key: 'createdAt', label: 'Created' },
  { key: 'title', label: 'A-Z' },
];

function formatDate(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

const MAX_DRIVE_ENTRIES = 5000;

export function ProjectManager({ onClose, onOpenAccount }: ProjectManagerProps) {
  const {
    projectList,
    currentProjectId,
    state,
    createProject,
    openProject,
    deleteProject,
    renameProject,
    duplicateProject,
    importProjectFromData,
    updateProjectMeta,
    onlineProjects,
    onlineLoading,
    onlineError,
    refetchOnlineProjects,
    closeProject,
  } = useProject();
  const dialog = useDialog();
  const auth = useGoogleAuth();
  const sbAuth = useSupabaseAuth();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastModified');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<ProjectTab>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [pendingScriptImport, setPendingScriptImport] = useState<{ result: ImportResult; fileName: string } | null>(null);
  const [parsingSchedule, setParsingSchedule] = useState<string | null>(null);

  const [showDebug, setShowDebug] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [creatingCloud, setCreatingCloud] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Untitled Project');
  const [newProjectCloud, setNewProjectCloud] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const {
    driveMetas, driveLoading, driveError, driveAuthError, driveCorrupt,
    driveTotalCount, lastRefreshedAt, refetchDrive,
    setDriveMetas, setDriveError, setDriveCorrupt, setDriveTotalCount,
  } = useDriveProjectList(auth);

  // The Shared list is a snapshot of the server — refresh it on EVERY open
  // (roadmap 249/253) so a row never carries a name (or existence) from an
  // earlier fetch: a peer's rename is visible the moment you look, without a
  // manual Refresh. The component mounts per open (`showProjectManager &&`).
  useEffect(() => {
    if (sbAuth.account) refetchOnlineProjects();
  }, [sbAuth.account, refetchOnlineProjects]);

  const handleDeleteAllDrive = async () => {
    if (!auth.accessToken) return;
    const ok = await dialog.confirm({
      title: 'Delete ALL Drive data?',
      message: `This will permanently delete all ${driveTotalCount?.toLocaleString() ?? 'unknown'} files in your Google Drive app data. This cannot be undone.`,
      danger: true,
      suppressKey: 'lemon_schedule_dnwa_delete_drive',
    });
    if (!ok) return;
    setDeletingAll(true);
    try {
      const count = await clearAllDriveData(auth.accessToken);
      dialog.alert({ title: 'Drive Wiped', message: `Deleted ${count} file${count !== 1 ? 's' : ''} from Google Drive.` });
      setDriveMetas([]);
      setDriveError(null);
      setDriveCorrupt(false);
      setDriveTotalCount(0);
    } catch (e: any) {
      dialog.alert({ title: 'Wipe Failed', message: formatDriveError(e, 'Could not delete all Drive files.') });
    } finally {
      setDeletingAll(false);
    }
  };

  const localProjects = useMemo(
    () => projectList.filter(p => !p.driveFileId && !p.onlineId),
    [projectList]
  );

  const cloudProjects = useMemo(() => {
    const merged = new Map<string, ProjectMeta>();
    for (const p of driveMetas) merged.set(p.id, p);
    for (const p of projectList) {
      if (p.driveFileId) merged.set(p.id, p);
    }
    const result = [...merged.values()];
    return result;
  }, [projectList, driveMetas]);

  // Server truth only (roadmap 249): the Shared list + its count come from the
  // last successful fetch — a failed refetch or a signed-out session presents
  // `null` (no count) instead of a stale number, and the session metas in
  // `projectList` are never merged in (see `onlineProjectListForDisplay`).
  const onlineProjectList = useMemo(
    () => onlineProjectListForDisplay({
      signedIn: !!sbAuth.account,
      serverMetas: onlineProjects,
      fetchFailed: onlineError !== null,
    }),
    [sbAuth.account, onlineProjects, onlineError]
  );

  const sortedList = useMemo(() => {
    const source = activeTab === 'local' ? localProjects : activeTab === 'cloud' ? cloudProjects : (onlineProjectList ?? []);
    const list = [...source];
    if (sortKey === 'lastModified') {
      list.sort((a, b) => b.lastModified - a.lastModified);
    } else if (sortKey === 'createdAt') {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortKey === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [localProjects, cloudProjects, onlineProjectList, activeTab, sortKey]);

  const hasProjects = sortedList.length > 0;

  // Import parity (roadmap 126): ONE parser path for every supported file
  // (projects, schedules AND screenplays). Always creates a new project.
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    // Screenplays/schedules are destructive-ish (they become the new project);
    // a serialized .lemon/.json didn't confirm before — keep that.
    if (ext !== 'lemon' && ext !== 'json') {
      const ok = await dialog.confirm({
        title: 'Import as New Project',
        message: `"${file.name}" will be imported as a NEW project. Continue?`,
      });
      if (!ok) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }
    setImporting(true);
    try {
      const parsed = await parseNewProjectFile(file);
      // Scripts get the shared review (rename, cast IDs, categories, heading
      // mapping) before the project is committed; projects/schedules load direct.
      if (parsed.kind === 'project') await importImportedProject(parsed.project);
      else setPendingScriptImport({ result: parsed.result, fileName: parsed.fileName });
    } catch (err: any) {
      dialog.alert({ title: 'Import Error', message: err?.message || 'Failed to import file' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const importImportedProject = async (project: Project): Promise<void> => {
    const newId = importProjectFromData(project);
    if (activeTab === 'cloud' && auth.isSignedIn && auth.accessToken) {
      try {
        const proj = loadProjectFromStorage(newId);
        if (proj) {
          const driveFileId = await pushProjectAndUpdateIndex(auth.accessToken, proj);
          updateProjectMeta(newId, { driveFileId });
          refetchDrive();
        }
      } catch (err: any) {
        dialog.alert({ title: 'Upload Failed', message: formatDriveError(err, 'The schedule was imported locally, but uploading it to Drive failed.') });
      }
    }
    onClose?.();
  };

  const handleExportJSON = async (e: React.MouseEvent, p: ProjectMeta) => {
    e.stopPropagation();
    if (p.id === currentProjectId) {
      exportProjectData(JSON.stringify(state.present), p.title);
      return;
    }
    if (p.driveFileId) {
      try {
        setExportingId(p.id);
        const proj = await readDriveProject(auth.accessToken!, p.driveFileId);
        exportProjectData(JSON.stringify(proj), p.title);
      } catch (err: any) {
        dialog.alert({ title: 'Export Failed', message: formatDriveError(err, 'Could not load project from Drive.') });
      } finally {
        setExportingId(null);
      }
      return;
    }
    if (p.onlineId) {
      try {
        setExportingId(p.id);
        const { project } = await readOnlineProject(p.onlineId);
        exportProjectData(JSON.stringify(project), p.title);
      } catch (err: any) {
        dialog.alert({ title: 'Export Failed', message: err?.message || 'Could not load the shared project.' });
      } finally {
        setExportingId(null);
      }
      return;
    }
    exportProjectFromStorage(p.id, p.title);
  };

  const handleCardClick = (p: ProjectMeta) => {
    if (renamingId) return;
    if (p.onlineId) {
      if (p.id === currentProjectId) {
        onClose?.();
        return;
      }
      setOpeningId(p.id);
      openProject(p.id)
        .then(() => onClose?.())
        .catch(err => {
          dialog.alert({ title: 'Could Not Open Project', message: err?.message || 'Could not load the shared project.' });
        })
        .finally(() => setOpeningId(null));
      return;
    }
    if (p.driveFileId) {
      setOpeningId(p.id);
      openProject(p.id, p.driveFileId)
        .then(() => onClose?.())
        .catch(err => {
          dialog.alert({ title: 'Could Not Open Project', message: formatDriveError(err, 'Could not load the project from Google Drive.') });
        })
        .finally(() => setOpeningId(null));
    } else {
      if (p.id === currentProjectId) {
        onClose?.();
        return;
      }
      openProject(p.id);
      onClose?.();
    }
  };

  const startRenaming = (p: ProjectMeta) => {
    setRenamingId(p.id);
    setRenameTitle(p.title);
  };

  const confirmRename = () => {
    if (renamingId && renameTitle.trim()) {
      const p = sortedList.find(p => p.id === renamingId);
      renameProject(renamingId, renameTitle.trim(), p?.driveFileId);
      refetchDrive();
    }
    setRenamingId(null);
  };

  const [movingId, setMovingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleMoveToDrive = async (p: ProjectMeta) => {
    const ok = await dialog.confirm({ title: `Move "${p.title}" to Drive?`, message: 'This will upload the project to Google Drive and sync future changes.' });
    if (!ok) return;
    setMovingId(p.id);
    try {
      const project = p.id === currentProjectId ? { ...state.present } : loadProjectFromStorage(p.id);
      if (!project) { dialog.alert({ title: 'Error', message: 'Could not load project data.' }); return; }
      const newFileId = await pushProjectAndUpdateIndex(auth.accessToken!, project, undefined, p.lastModified);
      // Preserve the original modified time: stamping "now" would make the cloud
      // copy look newer than the local one, and a later sync regression check
      // would refuse to treat the moved file as the same revision.
      updateProjectMeta(p.id, { driveFileId: newFileId, lastModified: p.lastModified });
      refetchDrive();
    } catch (e: any) {
      dialog.alert({ title: 'Upload Failed', message: formatDriveError(e, 'Could not upload to Drive.') });
    } finally {
      setMovingId(null);
    }
  };

  const handleMoveToLocal = async (p: ProjectMeta) => {
    const ok = await dialog.confirm({ title: `Remove "${p.title}" from Drive?`, message: 'This will delete the project from Google Drive. A local copy will be saved.', danger: true, suppressKey: 'lemon_schedule_dnwa_remove_drive' });
    if (!ok) return;
    setMovingId(p.id);
    try {
      const project = p.id === currentProjectId
        ? { ...state.present }
        : p.driveFileId
          ? await readDriveProject(auth.accessToken!, p.driveFileId)
          : null;
      if (!project) { dialog.alert({ title: 'Error', message: 'Could not load project data.' }); return; }
      saveProjectToStorage(p.id, project);
      if (p.driveFileId) {
        await deleteDriveProject(auth.accessToken!, p.driveFileId);
        await removeFromDriveIndex(auth.accessToken!, p.id);
      }
      // Pass full meta so updateProjectMeta can UPSERT — a Drive-only project
      // (fresh session, not in projectList) would otherwise vanish from the
      // local index after its Drive copy is deleted.
      updateProjectMeta(p.id, { driveFileId: undefined, title: p.title, lastModified: Date.now(), createdAt: p.createdAt ?? Date.now() });
      refetchDrive();
    } catch (e: any) {
      dialog.alert({ title: 'Remove Failed', message: formatDriveError(e, 'Could not remove from Drive.') });
    } finally {
      setMovingId(null);
    }
  };

  // Parity with the header cluster: signing out with a shared project open
  // returns to the opening page (a silent session expiry only locks it).
  const handleSignOut = () => {
    const currentMeta = projectList.find(p => p.id === currentProjectId);
    if (currentMeta?.onlineId) closeProject();
    void sbAuth.signOut();
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    if (newProjectCloud) setCreatingCloud(true);
    await createProject(newProjectName.trim(), newProjectCloud);
    setShowNewProjectModal(false);
    setCreatingCloud(false);
    onClose?.();
  };

  // Listen for Shift key to show debug panel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShowDebug(true); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShowDebug(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <>
    <Modal open closable={!!onClose} onClose={() => onClose?.()} title="Project Manager" icon={<FolderOpen className="w-4 h-4" />} width="max-w-lg"
      footer={
        <ModalFooter>
          {activeTab === 'online' ? (
            sbAuth.account ? (
              <ModalFooterButton variant="ghost" onClick={() => refetchOnlineProjects()} disabled={onlineLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${onlineLoading ? 'animate-spin' : ''}`} /> Refresh
              </ModalFooterButton>
            ) : (
              <ModalFooterButton onClick={() => onOpenAccount ? onOpenAccount() : sbAuth.signInWithGoogle()}>
                <Users className="w-3.5 h-3.5" /> Sign in to collaborate
              </ModalFooterButton>
            )
          ) : activeTab === 'local' ? (
            <>
              <ModalFooterButton
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || !!parsingSchedule}
                title="Import a project, schedule or screenplay as a new project"
              >
                {parsingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />} {parsingSchedule ? 'Parsing...' : importing ? 'Importing...' : 'Import'}
              </ModalFooterButton>
              <ModalFooterButton
                onClick={() => { setShowNewProjectModal(true); setNewProjectName('Untitled Project'); setNewProjectCloud(false); }}
              >
                <Plus className="w-3.5 h-3.5" /> New Project
              </ModalFooterButton>
            </>
          ) : auth.isSignedIn ? (
            <>
              <ModalFooterButton
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || !!parsingSchedule}
                title="Import a project, schedule or screenplay as a new project"
              >
                {parsingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />} {parsingSchedule ? 'Parsing...' : importing ? 'Importing...' : 'Import'}
              </ModalFooterButton>
              <ModalFooterButton
                onClick={() => { setShowNewProjectModal(true); setNewProjectName('Untitled Project'); setNewProjectCloud(true); }}
                disabled={creatingCloud}
              >
                {creatingCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {creatingCloud ? 'Creating...' : 'New Cloud Project'}
              </ModalFooterButton>
            </>
          ) : (
            <ModalFooterButton onClick={() => auth.signIn()}>
              <Cloud className="w-3.5 h-3.5" /> Sign in with Google
            </ModalFooterButton>
          )}
          <input type="file" accept={pickerAccept(NEW_PROJECT_ACCEPT)} ref={fileInputRef} onChange={handleImportFile} className="hidden" />
        </ModalFooter>
      }
    >
      <div className="relative">
        {parsingSchedule && (
          <div className="absolute inset-0 z-20 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-lg" data-testid="schedule-import-progress">
            <Loader2 className="w-8 h-8 text-[color:var(--ui-text)] animate-spin" />
            <div className="text-xs text-[color:var(--ui-text-muted)]">
              Parsing schedule… <span className="text-[color:var(--ui-text-faint)]">{parsingSchedule}</span>
            </div>
          </div>
        )}
        <NewProjectModal
          open={showNewProjectModal}
          isCloud={newProjectCloud}
          name={newProjectName}
          onNameChange={setNewProjectName}
          creating={creatingCloud}
          onCancel={() => { setShowNewProjectModal(false); setCreatingCloud(false); }}
          onCreate={handleCreateProject}
        />
        <AccountSettingsModal open={profileOpen} onClose={() => setProfileOpen(false)} />
        <div className="px-5 py-3">
        <div className="flex gap-0.5 mb-3">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'local'
                ? 'bg-[var(--ui-item-active-bg)] text-[color:var(--ui-text-strong)]'
                : 'text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text)] hover:bg-[var(--ui-item-hover-bg)]'
            }`}
          >
            <HardDrive className="w-3 h-3" />
            Local
            <span className="text-[10px] opacity-60 ml-0.5">{localProjects.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'cloud'
                ? 'bg-blue-900 text-white'
                : 'text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text)] hover:bg-[var(--ui-item-hover-bg)]'
            }`}
          >
            <Cloud className="w-3 h-3" />
            Cloud
            {driveLoading
              ? <Loader2 className="w-3 h-3 text-[color:var(--ui-text-muted)] animate-spin ml-0.5" />
              : <span className="text-[10px] opacity-60 ml-0.5">{cloudProjects.length}</span>
            }
          </button>
          {isSupabaseConfigured && (
            <button
              onClick={() => setActiveTab('online')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'online'
                  ? 'bg-emerald-900 text-white'
                  : 'text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text)] hover:bg-[var(--ui-item-hover-bg)]'
              }`}
            >
              <Users className="w-3 h-3" />
              Shared
              {onlineLoading
                ? <Loader2 className="w-3 h-3 text-[color:var(--ui-text-muted)] animate-spin ml-0.5" />
                : onlineProjectList && <span className="text-[10px] opacity-60 ml-0.5">{onlineProjectList.length}</span>
              }
            </button>
          )}
        </div>

        {/* Debug panel (Shift to reveal) */}
        {showDebug && activeTab === 'cloud' && (
          <div className="mb-3 p-2 rounded-md border border-rose-800 bg-rose-950/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-rose-400 flex items-center gap-1">
                <Skull className="w-3 h-3" /> DEBUG PANEL
              </span>
              {driveTotalCount !== null && (
                <span className="text-[10px] text-[color:var(--ui-text-muted)]">{driveTotalCount.toLocaleString()} files in Drive</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={refetchDrive}
                disabled={driveLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[var(--ui-input-bg)] text-[color:var(--ui-text)] hover:bg-[var(--ui-item-active-bg)] transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3 h-3 ${driveLoading ? 'animate-spin' : ''}`} /> Refetch
              </button>
              <button
                onClick={handleDeleteAllDrive}
                disabled={deletingAll}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-rose-800 text-white hover:bg-rose-700 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3 h-3" /> {deletingAll ? 'Deleting...' : 'Delete ALL Drive Data'}
              </button>
            </div>
          </div>
        )}

        {/* Corrupted Drive warning */}
        {activeTab === 'cloud' && driveCorrupt && (
          <div className="mb-3 p-3 rounded-md border border-amber-800 bg-amber-950/50">
            <div className="flex items-center gap-2 mb-2">
              <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-300">Drive Data Corrupted</span>
            </div>
            <p className="text-[10px] text-amber-400/80 mb-3">{driveError}</p>
            <button
              onClick={handleDeleteAllDrive}
              disabled={deletingAll}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-bold bg-rose-800 text-white hover:bg-rose-700 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3 h-3" /> {deletingAll ? 'Deleting...' : 'Wipe & Start Fresh'}
            </button>
          </div>
        )}

        {activeTab === 'cloud' && auth.isSignedIn && auth.user && (
          <div className="flex items-center justify-between px-3 py-2 mb-3 -mx-1 rounded-md bg-blue-950/50 border border-blue-900/50">
            <span className="text-[10px] text-blue-200/60">Logged in as <strong className="text-blue-100 font-semibold">{auth.user.name}</strong></span>
            <div className="flex items-center gap-2">
              {lastRefreshedAt && !driveLoading && (
                <span className="text-[10px] text-blue-200/40">Updated {formatDate(lastRefreshedAt)}</span>
              )}
              {driveLoading && (
                <span className="text-[10px] text-blue-200/40 animate-pulse">Syncing…</span>
              )}
              <button
                onClick={() => refetchDrive()}
                disabled={driveLoading}
                className="p-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
                title="Refresh cloud projects"
              >
                <RefreshCw className={`w-3 h-3 text-blue-200/60 ${driveLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'online' && sbAuth.account && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 mb-3 -mx-1 rounded-md bg-emerald-950/50 border border-emerald-900/50">
            <button
              onClick={() => sbAuth.account?.isAnonymous ? onOpenAccount?.() : setProfileOpen(true)}
              className="flex items-center gap-2 min-w-0 rounded px-1 -mx-1 py-0.5 text-[10px] text-emerald-200/60 hover:text-emerald-100 hover:bg-white/10 transition-colors"
              title={sbAuth.account.isAnonymous ? 'Guest — create an account to keep your access' : 'Profile & team settings'}
            >
              <AccountAvatar account={sbAuth.account} className="w-5 h-5" />
              <span className="truncate">Signed in as <strong className="text-emerald-100 font-semibold">{sbAuth.account.name || sbAuth.account.email}</strong>{sbAuth.account.isAnonymous ? ' (guest)' : ''}</span>
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-emerald-200/70 hover:text-emerald-100 hover:bg-white/10 transition-colors shrink-0"
              title="Sign out of your account"
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
        )}

        {activeTab === 'cloud' && !auth.isSignedIn ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-[color:var(--ui-text-faint)]">
            <Cloud className="w-12 h-12 mx-auto mb-3 text-[color:var(--ui-text-disabled)]" />
            <p className="text-sm font-medium text-[color:var(--ui-text-muted)]">Sign in required</p>
            <p className="text-xs mt-1 text-[color:var(--ui-text-faint)]">Connect to Google Drive to access your cloud projects.</p>
          </div>
          </div>
        ) : activeTab === 'cloud' && driveLoading ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-[color:var(--ui-text-faint)]">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-[color:var(--ui-text-faint)] animate-spin" />
            <p className="text-xs text-[color:var(--ui-text-faint)]">Loading cloud projects...</p>
          </div>
          </div>
        ) : activeTab === 'cloud' && driveError && !driveCorrupt ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-[color:var(--ui-text-faint)]">
            <TriangleAlert className="w-10 h-10 mx-auto mb-3 text-amber-600" />
            <p className="text-sm font-medium text-[color:var(--ui-text-muted)]">Failed to load</p>
            <p className="text-xs mt-1 text-[color:var(--ui-text-faint)] mb-3">{driveError}</p>
            {driveAuthError ? (
              <button
                onClick={() => auth.signIn()}
                className="flex items-center gap-1 mx-auto px-3 py-1.5 rounded text-[10px] font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-colors"
              >
                <CloudOff className="w-3 h-3" /> Sign in again
              </button>
            ) : (
              <button
                onClick={refetchDrive}
                className="flex items-center gap-1 mx-auto px-3 py-1.5 rounded text-[10px] font-medium bg-[var(--ui-input-bg)] text-[color:var(--ui-text)] hover:bg-[var(--ui-item-active-bg)] transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>
          </div>
        ) : activeTab === 'online' && !sbAuth.account ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-[color:var(--ui-text-faint)]">
            <Users className="w-12 h-12 mx-auto mb-3 text-[color:var(--ui-text-disabled)]" />
            <p className="text-sm font-medium text-[color:var(--ui-text-muted)]">Sign in required</p>
            <p className="text-xs mt-1 text-[color:var(--ui-text-faint)]">Sign in to see your shared projects and collaborate.</p>
          </div>
          </div>
        ) : activeTab === 'online' && onlineLoading ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-[color:var(--ui-text-faint)]">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-[color:var(--ui-text-faint)] animate-spin" />
            <p className="text-xs text-[color:var(--ui-text-faint)]">Loading shared projects...</p>
          </div>
          </div>
        ) : activeTab === 'online' && onlineError ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-[color:var(--ui-text-faint)]">
            <TriangleAlert className="w-10 h-10 mx-auto mb-3 text-amber-600" />
            <p className="text-sm font-medium text-[color:var(--ui-text-muted)]">Failed to load</p>
            <p className="text-xs mt-1 text-[color:var(--ui-text-faint)] mb-3">{onlineError}</p>
            <button
              onClick={() => refetchOnlineProjects()}
              className="flex items-center gap-1 mx-auto px-3 py-1.5 rounded text-[10px] font-medium bg-[var(--ui-input-bg)] text-[color:var(--ui-text)] hover:bg-[var(--ui-item-active-bg)] transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
          </div>
        ) : !hasProjects ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-[color:var(--ui-text-faint)]">
            {activeTab === 'local' ? (
              <>
                <HardDrive className="w-12 h-12 mx-auto mb-3 text-[color:var(--ui-text-disabled)]" />
                <p className="text-sm font-medium text-[color:var(--ui-text-muted)]">No local projects</p>
                <p className="text-xs mt-1 text-[color:var(--ui-text-faint)]">Create a new project or import one to get started.</p>
              </>
            ) : activeTab === 'cloud' ? (
              <>
                <Cloud className="w-12 h-12 mx-auto mb-3 text-[color:var(--ui-text-disabled)]" />
                <p className="text-sm font-medium text-[color:var(--ui-text-muted)]">No cloud projects</p>
                <p className="text-xs mt-1 text-[color:var(--ui-text-faint)]">Create a new cloud project to see it here.</p>
              </>
            ) : (
              <>
                <Users className="w-12 h-12 mx-auto mb-3 text-[color:var(--ui-text-disabled)]" />
                <p className="text-sm font-medium text-[color:var(--ui-text-muted)]">No shared projects</p>
                <p className="text-xs mt-1 text-[color:var(--ui-text-faint)]">Open a project and choose Collaborate from the account menu to add it here.</p>
              </>
            )}
          </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[color:var(--ui-text-faint)] font-semibold uppercase tracking-wider">{sortedList.length} {activeTab === 'cloud' ? 'cloud' : activeTab === 'online' ? 'shared' : 'local'} project{sortedList.length !== 1 ? 's' : ''}</span>
              <DropdownMenu
                open={showSortMenu}
                onOpenChange={setShowSortMenu}
                align="right"
                trigger={
                  <button className="flex items-center gap-1.5 text-[10px] font-medium text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] bg-[var(--ui-input-bg)] px-2.5 py-1 rounded-md transition-colors">
                    <ArrowUpDown className="w-3 h-3" />
                    {/* Reserve the widest sort label's width so the button
                        never jumps between "Last Modified" / "Created" / "A-Z" */}
                    <span className="relative inline-flex">
                      <span aria-hidden className="invisible whitespace-nowrap">{sortOptions[0].label}</span>
                      <span className="absolute inset-y-0 left-0 flex items-center whitespace-nowrap">
                        {sortOptions.find(o => o.key === sortKey)?.label}
                      </span>
                    </span>
                  </button>
                }
              >
                {sortOptions.map(opt => (
                  <DropdownItem
                    key={opt.key}
                    onClick={() => setSortKey(opt.key)}
                    icon={sortKey === opt.key ? <Check className="w-3.5 h-3.5" /> : undefined}
                  >
                    {opt.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </div>
            <div className="max-h-[50vh] overflow-y-auto scrollbar-custom mt-2">
            <div className="space-y-2">

            {sortedList.map(p => (
              <React.Fragment key={p.id}>
              <ProjectCard
                p={p}
                isActive={p.id === currentProjectId}
                activeTab={activeTab}
                authSignedIn={auth.isSignedIn}
                renameTitle={renameTitle}
                setRenameTitle={setRenameTitle}
                renamingId={renamingId}
                setRenamingId={setRenamingId}
                openingId={openingId}
                deletingId={deletingId}
                movingId={movingId}
                duplicatingId={duplicatingId}
                exportingId={exportingId}
                onCardClick={handleCardClick}
                onStartRenaming={startRenaming}
                onConfirmRename={confirmRename}
                onDuplicate={async (p) => { setDuplicatingId(p.id); await duplicateProject(p.id, p.driveFileId); setDuplicatingId(null); if (p.driveFileId) refetchDrive(); if (p.onlineId) refetchOnlineProjects(); }}
                onExport={handleExportJSON}
                onMoveToDrive={handleMoveToDrive}
                onMoveToLocal={handleMoveToLocal}
                onDelete={async (p) => {
                  setDeletingId(p.id);
                  try {
                    await deleteProject(p.id, p.driveFileId);
                    if (p.driveFileId) refetchDrive();
                    if (p.onlineId) refetchOnlineProjects();
                  } catch (e: any) {
                    dialog.alert({ title: 'Delete Failed', message: e?.message || 'Could not delete the project.' });
                  } finally {
                    setDeletingId(null);
                  }
                }}
                formatDate={formatDate}
              />
              </React.Fragment>
            ))}
          </div>
            </div>
          </>
          )}
      </div>
    </div>
    </Modal>
    {pendingScriptImport && (
      <ImportDialog
        mode="new-project"
        initialResult={pendingScriptImport.result}
        initialFileName={pendingScriptImport.fileName}
        onCreateProject={importImportedProject}
        onClose={() => setPendingScriptImport(null)}
      />
    )}
    </>
  );
}
