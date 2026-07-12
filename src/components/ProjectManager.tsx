import React, { useRef, useState, useMemo, useEffect } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject, ProjectMeta, loadProjectFromStorage } from '../store';
import { Project } from '../types';
import { exportProjectFromStorage } from '../lib/utils';
import { pushProjectAndUpdateIndex } from '../lib/syncManager';
import { listDriveProjectMetas, deleteDriveProject, clearAllDriveData } from '../lib/googleDriveStorage';
import { Plus, Download, Upload, Pencil, Copy, Trash2, Check, FolderOpen, CheckCircle2, ArrowUpDown, ChevronDown, Cloud, HardDrive, AlertTriangle, Loader2, RefreshCw, Skull } from 'lucide-react';
import { useDialog } from './Dialog';
import Modal, { ModalFooter } from './Modal';
import { useGoogleAuth } from '../lib/googleDriveAuth';

interface ProjectManagerProps {
  onClose?: () => void;
}

type SortKey = 'lastModified' | 'createdAt' | 'title';
type ProjectTab = 'local' | 'cloud';

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'lastModified', label: 'Last Modified' },
  { key: 'createdAt', label: 'Created' },
  { key: 'title', label: 'A–Z' },
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
  const hasDefaultedRef = useRef(false);

  // Drive state
  const [driveMetas, setDriveMetas] = useState<ProjectMeta[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveCorrupt, setDriveCorrupt] = useState(false);
  const [driveTotalCount, setDriveTotalCount] = useState<number | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    if (auth.isSignedIn) {
      setActiveTab('cloud');
      hasDefaultedRef.current = true;
    }
  }, [auth.isSignedIn]);

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
      })
      .catch(e => {
        setDriveError(e?.message || 'Failed to load cloud projects');
        setDriveLoading(false);
      });
  }, [auth.isSignedIn, auth.accessToken]);

  const refetchDrive = () => {
    if (!auth.accessToken) return;
    setDriveLoading(true);
    setDriveError(null);
    setDriveCorrupt(false);
    setDriveTotalCount(null);
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
      })
      .catch(e => {
        setDriveError(e?.message || 'Failed to load cloud projects');
        setDriveLoading(false);
      });
  };

  const handleDeleteAllDrive = async () => {
    if (!auth.accessToken) return;
    const ok = await dialog.confirm({
      title: 'Delete ALL Drive data?',
      message: `This will permanently delete all ${driveTotalCount?.toLocaleString() ?? 'unknown'} files in your Google Drive app data. This cannot be undone.`,
      danger: true,
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
      dialog.alert({ title: 'Wipe Failed', message: e?.message || 'Could not delete all Drive files.' });
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
    console.log('[PM] cloudProjects merge:', { driveMetas: driveMetas.length, fromProjectList: projectList.filter(p => p.driveFileId).length, merged: merged.size });
    return [...merged.values()];
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

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.scenes && data.versions) {
          importProjectFromData(data as Project);
          onClose?.();
        } else {
          dialog.alert({ title: 'Invalid File', message: 'Missing scenes or versions.' });
        }
      } catch {
        dialog.alert({ title: 'Invalid File', message: 'Could not read file.' });
      }
      setImporting(false);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportJSON = (e: React.MouseEvent, p: ProjectMeta) => {
    e.stopPropagation();
    if (p.driveFileId) return;
    exportProjectFromStorage(p.id, p.title);
  };

  const handleCardClick = (p: ProjectMeta) => {
    if (renamingId) return;
    if (p.driveFileId) {
      openProject(p.id, p.driveFileId).then(() => onClose?.());
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
      renameProject(renamingId, renameTitle.trim());
    }
    setRenamingId(null);
  };

  const [movingId, setMovingId] = useState<string | null>(null);

  const handleMoveToDrive = async (p: ProjectMeta) => {
    const ok = await dialog.confirm({ title: `Move "${p.title}" to Drive?`, message: 'This will upload the project to Google Drive and sync future changes.' });
    if (!ok) return;
    setMovingId(p.id);
    try {
      const project = p.id === currentProjectId ? { ...state.present } : loadProjectFromStorage(p.id);
      if (!project) { dialog.alert({ title: 'Error', message: 'Could not load project data.' }); return; }
      const newFileId = await pushProjectAndUpdateIndex(auth.accessToken!, project);
      updateProjectMeta(p.id, { driveFileId: newFileId });
    } catch (e: any) {
      dialog.alert({ title: 'Upload Failed', message: e?.message || 'Could not upload to Drive.' });
    } finally {
      setMovingId(null);
    }
  };

  const handleMoveToLocal = async (p: ProjectMeta) => {
    const ok = await dialog.confirm({ title: `Remove "${p.title}" from Drive?`, message: 'This will delete the project from Google Drive. A local copy will be saved.', danger: true });
    if (!ok) return;
    setMovingId(p.id);
    try {
      const project = p.id === currentProjectId ? { ...state.present } : null;
      if (project) {
        localStorage.setItem(`lemon_schedule_project_v1_${p.id}`, JSON.stringify(project));
      }
      if (p.driveFileId) {
        await deleteDriveProject(auth.accessToken!, p.driveFileId);
      }
      updateProjectMeta(p.id, { driveFileId: undefined });
    } catch (e: any) {
      dialog.alert({ title: 'Remove Failed', message: e?.message || 'Could not remove from Drive.' });
    } finally {
      setMovingId(null);
    }
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
    <Modal open onClose={() => onClose?.()} title="Projects" icon={<FolderOpen className="w-4 h-4" />} width="max-w-lg"
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
                onClick={() => { createProject(); onClose?.(); }}
                className="px-4 py-1.5 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
              <Plus className="w-3.5 h-3.5" /> New Project
              </button>
              <input type="file" accept=".lemon,.json" ref={fileInputRef} onChange={handleImportJSON} className="hidden" />
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
                onClick={async () => { await createProject(undefined, true); onClose?.(); }}
                className="px-4 py-1.5 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> New Cloud Project
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
        </ModalFooter>
      }
    >
      <div className="px-5 py-3 max-h-[60vh] overflow-y-auto">
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
                ? 'bg-zinc-800 text-white'
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
          <div className="flex items-center gap-2 px-1 pb-2">
            <span className="text-[10px] text-zinc-500">Logged in as <strong className="text-zinc-300 font-semibold">{auth.user.name}</strong></span>
          </div>
        )}

        {activeTab === 'cloud' && !auth.isSignedIn ? (
          <div className="text-center py-12 text-zinc-500">
            <Cloud className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-400">Sign in required</p>
            <p className="text-xs mt-1 text-zinc-600">Connect to Google Drive to access your cloud projects.</p>
          </div>
        ) : activeTab === 'cloud' && driveLoading ? (
          <div className="text-center py-12 text-zinc-500">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-zinc-600 animate-spin" />
            <p className="text-xs text-zinc-500">Loading cloud projects...</p>
          </div>
        ) : activeTab === 'cloud' && driveError && !driveCorrupt ? (
          <div className="text-center py-12 text-zinc-500">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-600" />
            <p className="text-sm font-medium text-zinc-400">Failed to load</p>
            <p className="text-xs mt-1 text-zinc-600 mb-3">{driveError}</p>
            <button
              onClick={refetchDrive}
              className="flex items-center gap-1 mx-auto px-3 py-1.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        ) : !hasProjects ? (
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
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{sortedList.length} project{sortedList.length !== 1 ? 's' : ''}</span>
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

            {sortedList.map(p => {
              const isActive = p.id === currentProjectId;
              const isRenaming = renamingId === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => handleCardClick(p)}
                  onDoubleClick={isRenaming ? undefined : () => startRenaming(p)}
                  className={`group flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                    isActive
                      ? 'bg-zinc-800 border-zinc-700 text-white'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        value={renameTitle}
                        onChange={e => setRenameTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-zinc-950 border border-zinc-600 text-white px-2.5 py-1.5 rounded-md text-xs outline-none focus:ring-2 focus:ring-zinc-500"
                        onClick={e => e.stopPropagation()}
                      />
                      <button
                        onClick={e => { e.stopPropagation(); confirmRename(); }}
                        className="p-1.5 hover:bg-emerald-800/60 rounded-md text-emerald-400 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setRenamingId(null); }}
                        className="p-1.5 hover:bg-rose-800/60 rounded-md text-rose-400 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate text-xs">{p.title}</h3>
                          {p.driveFileId && (
                            <Cloud className="w-3 h-3 text-zinc-500 shrink-0" title="Cloud project" />
                          )}
                          {isActive && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        <p className={`text-[10px] mt-0.5 ${isActive ? 'text-zinc-500' : 'text-zinc-500'}`}>
                          {isActive ? 'Currently open' : formatDate(p.lastModified)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 hover-reveal transition-opacity" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => startRenaming(p)}
                          className="p-1.5 rounded-md transition-colors hover:bg-zinc-700"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        {!p.driveFileId && (
                          <button
                            onClick={() => duplicateProject(p.id)}
                            className="p-1.5 rounded-md transition-colors hover:bg-zinc-700"
                            title="Duplicate"
                          >
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                        )}
                        <button
                          onClick={e => handleExportJSON(e, p)}
                          className="p-1.5 rounded-md transition-colors hover:bg-zinc-700"
                           title="Export"
                        >
                          <Download className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        {activeTab === 'local' && auth.isSignedIn && (
                          <button
                            onClick={() => handleMoveToDrive(p)}
                            disabled={movingId === p.id}
                            className="p-1.5 rounded-md transition-colors hover:bg-zinc-700 disabled:opacity-40"
                            title="Move to Drive"
                          >
                            <Upload className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                        )}
                        {activeTab === 'cloud' && (
                          <button
                            onClick={() => handleMoveToLocal(p)}
                            disabled={movingId === p.id}
                            className="p-1.5 rounded-md transition-colors hover:bg-zinc-700 disabled:opacity-40"
                            title="Move to Local"
                          >
                            <Cloud className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                        )}
                        <button
                          onClick={async () => { const ok = await dialog.confirm({ title: `Delete "${p.title}"?`, message: 'This cannot be undone.', danger: true }); if (ok) deleteProject(p.id); }}
                          className="p-1.5 rounded-md transition-colors hover:bg-rose-900/40"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400 hover:text-rose-400 transition-colors" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
