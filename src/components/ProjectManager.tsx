import React, { useRef, useState, useMemo, useEffect } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject, ProjectMeta, loadProjectFromStorage } from '../store';
import { Project } from '../types';
import { exportProjectFromStorage, exportProjectData } from '../lib/utils';
import { pushProjectAndUpdateIndex } from '../lib/syncManager';
import { listDriveProjectMetas, deleteDriveProject, readDriveProject, removeFromDriveIndex, clearAllDriveData, formatDriveError, getDriveErrorStatus } from '../lib/googleDriveStorage';
import { Plus, Download, Trash2, FolderOpen, ArrowUpDown, ChevronDown, Cloud, CloudOff, HardDrive, AlertTriangle, Loader2, RefreshCw, Skull } from 'lucide-react';
import { useDialog } from './Dialog';
import Modal, { ModalFooter } from './Modal';
import ProjectCard from './ProjectCard';
import NewProjectModal from './NewProjectModal';
import { PM_BTN_PAD, PM_ICON, PM_ICON_SM, PM_INPUT, PM_TITLE, PM_SUBTITLE } from './projectManagerStyles';
import { useGoogleAuth } from '../lib/googleDriveAuth';

interface ProjectManagerProps {
  onClose?: () => void;
}

type SortKey = 'lastModified' | 'createdAt' | 'title';
type ProjectTab = 'local' | 'cloud';

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

export function ProjectManager({ onClose }: ProjectManagerProps) {
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
  } = useProject();
  const dialog = useDialog();
  const auth = useGoogleAuth();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastModified');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<ProjectTab>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Drive state
  const [driveMetas, setDriveMetas] = useState<ProjectMeta[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveAuthError, setDriveAuthError] = useState(false);
  const [driveCorrupt, setDriveCorrupt] = useState(false);
  const [driveTotalCount, setDriveTotalCount] = useState<number | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [creatingCloud, setCreatingCloud] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Untitled Project');
  const [newProjectCloud, setNewProjectCloud] = useState(false);
  useEffect(() => {
    if (currentProjectId) {
      const meta = projectList.find(p => p.id === currentProjectId);
      setActiveTab(meta?.driveFileId ? 'cloud' : 'local');
    } else if (auth.isSignedIn) {
      setActiveTab('cloud');
    }
  }, [auth.isSignedIn, currentProjectId]);

  // Fetch Drive index on mount
  useEffect(() => {
    if (!auth.isSignedIn || !auth.accessToken) {
      setDriveMetas([]);
      setDriveError(null);
      setDriveCorrupt(false);
      setDriveTotalCount(null);
      return;
    }
    setDriveLoading(true);
    setDriveError(null);
    setDriveCorrupt(false);
    setDriveTotalCount(null);
    setDriveAuthError(false);
    listDriveProjectMetas(auth.accessToken)
      .then(metas => {
        setDriveTotalCount(metas.length);
        if (metas.length > MAX_DRIVE_ENTRIES) {
          setDriveCorrupt(true);
          setDriveError(`Drive data is corrupted: ${metas.length.toLocaleString()} entries found (limit is ${MAX_DRIVE_ENTRIES.toLocaleString()}). Use the debug cleanup below to wipe and start fresh.`);
          setDriveMetas([]);
        } else {
          setDriveMetas(metas.map(m => ({
            id: m.id,
            title: m.title,
            lastModified: m.lastModified,
            createdAt: m.createdAt,
            driveFileId: m.driveFileId,
          })));
        }
        setDriveLoading(false);
        setLastRefreshedAt(Date.now());
      })
      .catch(e => {
        setDriveError(formatDriveError(e, 'Failed to load cloud projects'));
        const isAuthError = getDriveErrorStatus(e) === 401;
        setDriveAuthError(isAuthError);
        if (isAuthError) auth.refreshToken();
        setDriveLoading(false);
        setLastRefreshedAt(Date.now());
      });
  }, [auth.isSignedIn, auth.accessToken]);

  // Refresh cloud list when switching to cloud tab
  useEffect(() => {
    if (activeTab === 'cloud' && auth.isSignedIn && auth.accessToken) {
      refetchDriveRef.current();
    }
  }, [activeTab]);

  const refetchDrive = () => {
    if (!auth.accessToken) return;
    setDriveLoading(true);
    setDriveError(null);
    setDriveCorrupt(false);
    setDriveTotalCount(null);
    setDriveAuthError(false);
    listDriveProjectMetas(auth.accessToken)
      .then(metas => {
        setDriveTotalCount(metas.length);
        if (metas.length > MAX_DRIVE_ENTRIES) {
          setDriveCorrupt(true);
          setDriveError(`Drive data is corrupted: ${metas.length.toLocaleString()} entries found. Use the debug cleanup to wipe and start fresh.`);
          setDriveMetas([]);
        } else {
          setDriveMetas(metas.map(m => ({
            id: m.id,
            title: m.title,
            lastModified: m.lastModified,
            createdAt: m.createdAt,
            driveFileId: m.driveFileId,
          })));
        }
        setDriveLoading(false);
        setLastRefreshedAt(Date.now());
      })
      .catch(e => {
        setDriveError(formatDriveError(e, 'Failed to load cloud projects'));
        const isAuthError = getDriveErrorStatus(e) === 401;
        setDriveAuthError(isAuthError);
        if (isAuthError) auth.refreshToken();
        setDriveLoading(false);
        setLastRefreshedAt(Date.now());
      });
  };

  const refetchDriveRef = useRef(refetchDrive);
  refetchDriveRef.current = refetchDrive;

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
    () => projectList.filter(p => !p.driveFileId),
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

  const sortedList = useMemo(() => {
    const source = activeTab === 'local' ? localProjects : cloudProjects;
    const list = [...source];
    if (sortKey === 'lastModified') {
      list.sort((a, b) => b.lastModified - a.lastModified);
    } else if (sortKey === 'createdAt') {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortKey === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [localProjects, cloudProjects, activeTab, sortKey]);

  const hasProjects = sortedList.length > 0;

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.scenes || !data.versions) {
        dialog.alert({ title: 'Invalid File', message: 'Missing scenes or versions.' });
        return;
      }
      const newId = importProjectFromData(data as Project);
      if (activeTab === 'cloud' && auth.isSignedIn && auth.accessToken) {
        const proj = loadProjectFromStorage(newId);
        if (proj) {
          const driveFileId = await pushProjectAndUpdateIndex(auth.accessToken, proj);
          updateProjectMeta(newId, { driveFileId });
        }
      }
      onClose?.();
    } catch {
      dialog.alert({ title: 'Invalid File', message: 'Could not read file.' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
    exportProjectFromStorage(p.id, p.title);
  };

  const handleCardClick = (p: ProjectMeta) => {
    if (renamingId) return;
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
      refetchDriveRef.current();
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
      const newFileId = await pushProjectAndUpdateIndex(auth.accessToken!, project);
      updateProjectMeta(p.id, { driveFileId: newFileId });
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
      localStorage.setItem(`lemon_schedule_project_v1_${p.id}`, JSON.stringify(project));
      if (p.driveFileId) {
        await deleteDriveProject(auth.accessToken!, p.driveFileId);
        await removeFromDriveIndex(auth.accessToken!, p.id);
      }
      updateProjectMeta(p.id, { driveFileId: undefined });
      refetchDrive();
    } catch (e: any) {
      dialog.alert({ title: 'Remove Failed', message: formatDriveError(e, 'Could not remove from Drive.') });
    } finally {
      setMovingId(null);
    }
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
    <Modal open onClose={() => onClose?.()} title="Project Manager" icon={<FolderOpen className="w-4 h-4" />} width="max-w-lg"
      footer={
        <ModalFooter>
          {activeTab === 'local' ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="px-4 py-1.5 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" /> {importing ? 'Importing...' : 'Import'}
              </button>
              <button
                onClick={() => { setShowNewProjectModal(true); setNewProjectName('Untitled Project'); setNewProjectCloud(false); }}
                className="px-4 py-1.5 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
              <Plus className="w-3.5 h-3.5" /> New Project
              </button>
            </>
          ) : auth.isSignedIn ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="px-4 py-1.5 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" /> {importing ? 'Importing...' : 'Import'}
              </button>
              <button
                onClick={() => { setShowNewProjectModal(true); setNewProjectName('Untitled Project'); setNewProjectCloud(true); }}
                disabled={creatingCloud}
                className="px-4 py-1.5 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {creatingCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {creatingCloud ? 'Creating...' : 'New Cloud Project'}
              </button>
            </>
          ) : (
            <button
              onClick={() => auth.signIn()}
              className="px-4 py-1.5 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <Cloud className="w-3.5 h-3.5" /> Sign in with Google
            </button>
          )}
          <input type="file" accept=".lemon,.json" ref={fileInputRef} onChange={handleImportJSON} className="hidden" />
        </ModalFooter>
      }
    >
      <div className="relative">
        <NewProjectModal
          open={showNewProjectModal}
          isCloud={newProjectCloud}
          name={newProjectName}
          onNameChange={setNewProjectName}
          creating={creatingCloud}
          onCancel={() => { setShowNewProjectModal(false); setCreatingCloud(false); }}
          onCreate={handleCreateProject}
        />
        <div className="px-5 py-3">
        <div className="flex gap-0.5 mb-3">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'local'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <HardDrive className="w-3 h-3" />
            Local
            <span className="text-[10px] text-zinc-500 ml-0.5">{localProjects.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'cloud'
                ? 'bg-blue-900 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <Cloud className="w-3 h-3" />
            Cloud
            {driveLoading
              ? <Loader2 className="w-3 h-3 text-zinc-400 animate-spin ml-0.5" />
              : <span className="text-[10px] text-zinc-500 ml-0.5">{cloudProjects.length}</span>
            }
          </button>
        </div>

        {/* Debug panel (Shift to reveal) */}
        {showDebug && activeTab === 'cloud' && (
          <div className="mb-3 p-2 rounded-md border border-rose-800 bg-rose-950/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-rose-400 flex items-center gap-1">
                <Skull className="w-3 h-3" /> DEBUG PANEL
              </span>
              {driveTotalCount !== null && (
                <span className="text-[10px] text-zinc-400">{driveTotalCount.toLocaleString()} files in Drive</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={refetchDrive}
                disabled={driveLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40"
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
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
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
                onClick={() => refetchDriveRef.current()}
                disabled={driveLoading}
                className="p-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
                title="Refresh cloud projects"
              >
                <RefreshCw className={`w-3 h-3 text-blue-200/60 ${driveLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'cloud' && !auth.isSignedIn ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-zinc-500">
            <Cloud className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-400">Sign in required</p>
            <p className="text-xs mt-1 text-zinc-600">Connect to Google Drive to access your cloud projects.</p>
          </div>
          </div>
        ) : activeTab === 'cloud' && driveLoading ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-zinc-500">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-zinc-600 animate-spin" />
            <p className="text-xs text-zinc-500">Loading cloud projects...</p>
          </div>
          </div>
        ) : activeTab === 'cloud' && driveError && !driveCorrupt ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-zinc-500">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-600" />
            <p className="text-sm font-medium text-zinc-400">Failed to load</p>
            <p className="text-xs mt-1 text-zinc-600 mb-3">{driveError}</p>
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
                className="flex items-center gap-1 mx-auto px-3 py-1.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>
          </div>
        ) : !hasProjects ? (
          <div className="max-h-[50vh] overflow-y-auto scrollbar-custom">
          <div className="text-center py-12 text-zinc-500">
            {activeTab === 'local' ? (
              <>
                <HardDrive className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
                <p className="text-sm font-medium text-zinc-400">No local projects</p>
                <p className="text-xs mt-1 text-zinc-600">Create a new project or import one to get started.</p>
              </>
            ) : (
              <>
                <Cloud className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
                <p className="text-sm font-medium text-zinc-400">No cloud projects</p>
                <p className="text-xs mt-1 text-zinc-600">Create a new cloud project to see it here.</p>
              </>
            )}
          </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{sortedList.length} {activeTab === 'cloud' ? 'cloud' : 'local'} project{sortedList.length !== 1 ? 's' : ''}</span>
              <div className="relative">
                <RadixDropdownMenu.Root open={showSortMenu} onOpenChange={(o) => setShowSortMenu(o)} modal={true}>
                  <RadixDropdownMenu.Trigger asChild>
                    <button className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 px-2.5 py-1 rounded-md transition-colors">
                      <ArrowUpDown className="w-3 h-3" />
                      {sortOptions.find(o => o.key === sortKey)?.label}
                    </button>
                  </RadixDropdownMenu.Trigger>
                  <RadixDropdownMenu.Portal>
                    <RadixDropdownMenu.Content
                      className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] py-1 min-w-[140px]"
                      align="end"
                      sideOffset={4}
                      collisionPadding={8}
                    >
                      {sortOptions.map(opt => (
                        <RadixDropdownMenu.Item
                          key={opt.key}
                          onSelect={() => setSortKey(opt.key)}
                          className={`text-left px-3 py-1.5 text-xs transition-colors outline-none cursor-pointer ${
                            sortKey === opt.key ? 'text-white bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 focus-visible:bg-zinc-900 focus-visible:text-zinc-200'
                          }`}
                        >
                          {opt.label}
                        </RadixDropdownMenu.Item>
                      ))}
                    </RadixDropdownMenu.Content>
                  </RadixDropdownMenu.Portal>
                </RadixDropdownMenu.Root>
              </div>
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
                onDuplicate={async (p) => { setDuplicatingId(p.id); await duplicateProject(p.id, p.driveFileId); setDuplicatingId(null); if (p.driveFileId) refetchDriveRef.current(); }}
                onExport={handleExportJSON}
                onMoveToDrive={handleMoveToDrive}
                onMoveToLocal={handleMoveToLocal}
                onDelete={async (p) => { setDeletingId(p.id); await deleteProject(p.id, p.driveFileId); setDeletingId(null); refetchDrive(); }}
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
  );
}
