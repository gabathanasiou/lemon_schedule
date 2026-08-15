import React, { createContext, useContext, useEffect, useReducer, useCallback, useState, useRef, useMemo } from 'react';
import { Project } from '../types';
import { generateUUID } from '../lib/utils';
import { useGoogleAuth } from '../lib/googleDriveAuth';
import { pushProjectAndUpdateIndex, removeFromDrive } from '../lib/syncManager';
import { readDriveProject, removeFromDriveIndex } from '../lib/googleDriveStorage';
import { migrateLegacyProject, migrateLegacyCastMirror, LegacyMigrationResult } from '../lib/legacyMigration';
import { performLocalUndo, performLocalRedo } from '../lib/unsavedGuard';
import {
  LEGACY_KEY,
  INDEX_KEY,
  ProjectMeta,
  getProjectStorageKey,
  loadProjectListFromStorage,
  saveProjectListToStorage,
  loadProjectFromStorage,
  setPendingLegacyMigrationNotice,
  consumePendingLegacyMigrationNotice,
} from './storage';
import { Action, State, reducer, makeBlankProject } from './reducer';

export interface ProjectContextType {
  state: State;
  dispatch: React.Dispatch<Action>;
  projectList: ProjectMeta[];
  currentProjectId: string | null;
  initialized: boolean;
  readOnly: boolean;
  createProject: (title?: string, cloud?: boolean) => Promise<string>;
  openProject: (id: string, cloudDriveFileId?: string) => Promise<void>;
  deleteProject: (id: string, cloudDriveFileId?: string) => Promise<void>;
  renameProject: (id: string, title: string, driveFileId?: string) => void;
  duplicateProject: (id: string, cloudDriveFileId?: string) => Promise<void>;
  importProjectFromData: (data: Project) => string;
  updateProjectMeta: (id: string, updates: Partial<ProjectMeta>) => void;
  registerPostSaveHandler: (handler: ((project: Project) => Promise<void>) | null) => void;
  driveSaveError: boolean;
  storageQuotaError: boolean;
  retryDriveSync: () => Promise<void>;
  retryConnectivity: () => Promise<boolean>;
  closeProject: () => void;
  consumeLegacyMigrationNotice: () => LegacyMigrationResult | null;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectList, setProjectList] = useState<ProjectMeta[]>(() => loadProjectListFromStorage());
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const auth = useGoogleAuth();
  const driveFileIdRef = useRef<string | undefined>(undefined);
  const [driveSaveError, setDriveSaveError] = useState(false);
  const [storageQuotaError, setStorageQuotaError] = useState(false);

  const blank = makeBlankProject();

  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: blank,
    future: [],
    _batchDepth: 0,
  });
  const presentRef = useRef(state.present);
  presentRef.current = state.present;

  // Offline detection - block cloud project mutations when offline; local projects keep working
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [realOnline, setRealOnline] = useState(navigator.onLine);
  const lastSaveFailedRef = useRef(false);
  const projectListRef = useRef(projectList);
  projectListRef.current = projectList;
  const currentProjectIdRef = useRef(currentProjectId);
  currentProjectIdRef.current = currentProjectId;
  const authStateRef = useRef({ isSignedIn: auth.isSignedIn, needsReauth: auth.needsReauth });
  authStateRef.current = { isSignedIn: auth.isSignedIn, needsReauth: auth.needsReauth };
  const probeRef = useRef<() => Promise<boolean>>(async () => false);

  // Proactive connectivity probe - the browser `offline` event is slow/unreliable (Wi-Fi
  // drops can leave navigator.onLine true for a long time), so ping the Drive API on a
  // 10s interval plus key events. Auth state wins over probe results: an HTTP response
  // (even 401/403) proves the network is up, but never unlocks editing while the session
  // is signed out or expired.
  useEffect(() => {
    const currentMeta = () => projectListRef.current.find(p => p.id === currentProjectIdRef.current);
    const isCloudContext = () => !!currentMeta()?.driveFileId || authStateRef.current.isSignedIn;
    const probe = async (): Promise<boolean> => {
      if (!isCloudContext()) return true;
      try {
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=kind', {
          method: 'HEAD',
          cache: 'no-store',
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          setIsOnline(true);
          lastSaveFailedRef.current = false;
          const meta = currentMeta();
          if (meta?.driveFileId && authStateRef.current.isSignedIn && !authStateRef.current.needsReauth) {
            setRealOnline(true);
          }
          return !meta?.driveFileId || (authStateRef.current.isSignedIn && !authStateRef.current.needsReauth);
        }
        setIsOnline(false);
        return false;
      } catch {
        setIsOnline(false);
        if (currentMeta()?.driveFileId) setRealOnline(false);
        lastSaveFailedRef.current = true;
        return false;
      }
    };
    probeRef.current = probe;
    const onOffline = () => {
      setIsOnline(false);
      if (currentMeta()?.driveFileId) setRealOnline(false);
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') probe(); };
    const conn = (navigator as any).connection;
    conn?.addEventListener?.('change', probe);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', probe);
    window.addEventListener('online', probe);
    window.addEventListener('offline', onOffline);
    probe();
    const interval = setInterval(probe, 10_000);
    return () => {
      clearInterval(interval);
      conn?.removeEventListener?.('change', probe);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', probe);
      window.removeEventListener('online', probe);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  const isCurrentCloudProject = useCallback(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    return !!meta?.driveFileId;
  }, [currentProjectId]);
  const guardedDispatch = useCallback((action: Action) => {
    if (!realOnline && action.type !== 'LOAD' && isCurrentCloudProject()) return;
    dispatch(action);
  }, [realOnline, isCurrentCloudProject]);

  // On mount: migrate legacy data or load project list (no auto-open)
  useEffect(() => {
    const legacyData = localStorage.getItem(LEGACY_KEY);
    if (legacyData) {
      try {
        const parsed = JSON.parse(legacyData);
        if (parsed.scenes && parsed.versions) {
          const id = generateUUID();
          for (const v of parsed.versions || []) {
            for (const r of v.rows || []) {
              if (r.type === 'DAYBREAK' && r.daybreakCallTime == null) {
                r.daybreakCallTime = '08:00';
              }
            }
          }
          const migrationResult = migrateLegacyProject(parsed);
          migrateLegacyCastMirror(migrationResult.project);
          if (migrationResult.migrated) {
            setPendingLegacyMigrationNotice(migrationResult);
          }
          localStorage.setItem(getProjectStorageKey(id), JSON.stringify(migrationResult.project));
          localStorage.removeItem(LEGACY_KEY);
          const meta: ProjectMeta = { id, title: migrationResult.project.title || 'Project', lastModified: Date.now(), createdAt: Date.now() };
          saveProjectListToStorage([meta]);
          setProjectList([meta]);
          dispatch({ type: 'LOAD', payload: migrationResult.project });
          setCurrentProjectId(id);
          setInitialized(true);
          return;
        }
      } catch (e) {
        console.error("Failed to migrate legacy project", e);
      }
    }

    const list = loadProjectListFromStorage();
    if (list.length > 0) {
      setProjectList(list);
    }

    const validIds = new Set(list.map(p => p.id));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('lemon_schedule_') && key !== INDEX_KEY) {
        const m = key.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
        if (m && !validIds.has(m[0])) localStorage.removeItem(key);
      }
    }

    setInitialized(true);
  }, []);

  const postSaveHandlerRef = useRef<((project: Project) => Promise<void>) | null>(null);
  const registerPostSaveHandler = useCallback((handler: ((project: Project) => Promise<void>) | null) => {
    postSaveHandlerRef.current = handler;
  }, []);

  // Consolidated save pipeline - localStorage for local projects, Drive for cloud projects
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveProjectRef = useRef(state.present);
  saveProjectRef.current = state.present;

  useEffect(() => {
    if (!currentProjectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const project = saveProjectRef.current;
      const meta = projectList.find(p => p.id === currentProjectId);
      const isCloud = !!meta?.driveFileId;

      if (isCloud) {
        if (skipSaveRef.current) { skipSaveRef.current = false; return; }
        if (auth.isSignedIn && auth.accessToken && isOnline && meta?.driveFileId) {
          try {
            const newFileId = await pushProjectAndUpdateIndex(
              auth.accessToken, project, meta.driveFileId,
            );
            driveFileIdRef.current = newFileId;
            lastSaveFailedRef.current = false;
            setRealOnline(true);
            setProjectList(prev => {
              const updated = prev.map(p =>
                p.id === currentProjectId
                  ? { ...p, title: project.title, driveFileId: newFileId, lastModified: Date.now() }
                  : p
              );
              saveProjectListToStorage(updated);
              return updated;
            });
            setDriveSaveError(false);
          } catch (err: any) {
            console.error('Drive save failed:', err);
            if (err?.message?.includes('401')) {
              auth.refreshToken();
              setTimeout(async () => {
                try {
                  const token = sessionStorage.getItem('lemon_google_token');
                  if (token && meta?.driveFileId) {
                    await pushProjectAndUpdateIndex(token, project, meta.driveFileId);
                    setDriveSaveError(false);
                    lastSaveFailedRef.current = false;
                    setRealOnline(true);
                  }
                } catch {
                  // Give up - user can manually retry
                }
              }, 2000);
            } else {
              lastSaveFailedRef.current = true;
              setRealOnline(false);
            }
            setDriveSaveError(true);
          }
        } else {
          lastSaveFailedRef.current = true;
          setRealOnline(false);
          setDriveSaveError(true);
        }
      } else {
        try {
          localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(project));
          setStorageQuotaError(false);
        } catch (e: any) {
          if (e.name === 'QuotaExceededError') {
            setStorageQuotaError(true);
            console.error('localStorage quota exceeded - project not saved');
          } else {
            console.error('localStorage save failed:', e);
          }
          return;
        }
        setProjectList(prev => {
          const existing = prev.find(p => p.id === currentProjectId);
          if (!existing) return prev;
          const updated = prev.map(p =>
            p.id === currentProjectId
              ? { ...p, title: project.title, lastModified: Date.now() }
              : p
          );
          saveProjectListToStorage(updated);
          return updated;
        });
        postSaveHandlerRef.current?.(project).catch(() => {});
      }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state.present, currentProjectId, auth.isSignedIn, auth.accessToken, isOnline]);

  // Clear sync errors and force a fresh sync when the user re-authenticates
  // Also block editing when the user signs out while editing a cloud project
  const prevSignedInRef = useRef(auth.isSignedIn);
  useEffect(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (auth.isSignedIn && !prevSignedInRef.current) {
      if (meta?.driveFileId) {
        setDriveSaveError(false);
      }
    } else if (!auth.isSignedIn && prevSignedInRef.current) {
      if (meta?.driveFileId) {
        setRealOnline(false);
        setDriveSaveError(true);
      }
    }
    prevSignedInRef.current = auth.isSignedIn;
  }, [auth.isSignedIn, currentProjectId]);

  // When the token becomes invalid (silent refresh failed), block editing
  const prevNeedsReauthRef = useRef(auth.needsReauth);
  useEffect(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (!meta?.driveFileId) return;
    if (auth.needsReauth && !prevNeedsReauthRef.current) {
      setRealOnline(false);
      setDriveSaveError(true);
    } else if (!auth.needsReauth && prevNeedsReauthRef.current) {
      setDriveSaveError(false);
    }
    prevNeedsReauthRef.current = auth.needsReauth;
  }, [auth.needsReauth, currentProjectId]);

  // Catch-up sync when reconnecting; immediately lock cloud projects when going offline
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      const meta = projectListRef.current.find(p => p.id === currentProjectId);
      if (meta?.driveFileId && driveSaveError) {
        const token = sessionStorage.getItem('lemon_google_token');
        if (token) {
          pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId)
            .then(() => { setDriveSaveError(false); lastSaveFailedRef.current = false; setRealOnline(true); })
            .catch(() => {});
        }
      }
    } else if (!isOnline && prevOnlineRef.current) {
      const meta = projectListRef.current.find(p => p.id === currentProjectId);
      if (meta?.driveFileId) {
        setRealOnline(false);
        setDriveSaveError(true);
        lastSaveFailedRef.current = true;
      }
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, currentProjectId, driveSaveError]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentProjectId) return;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        // The element manager's unsaved edits undo locally first.
        if (!performLocalUndo()) dispatch({ type: 'UNDO' });
      }
      if (cmdOrCtrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (!performLocalRedo()) dispatch({ type: 'REDO' });
      }
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProjectId]);

  // Flush current project to localStorage immediately (local projects only)
  const flushCurrentProject = useCallback(() => {
    if (!currentProjectId) return;
    const meta = projectList.find(p => p.id === currentProjectId);
    if (!meta || meta.driveFileId) return;
    try {
      localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(state.present));
      setStorageQuotaError(false);
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') setStorageQuotaError(true);
      return;
    }
    setProjectList(prev => {
      const existing = prev.find(p => p.id === currentProjectId);
      if (!existing) return prev;
      const updated = prev.map(p =>
        p.id === currentProjectId
          ? { ...p, title: state.present.title, lastModified: Date.now() }
          : p
      );
      saveProjectListToStorage(updated);
      return updated;
    });
  }, [currentProjectId, state.present, projectList]);

  // Guard to skip the save-pipeline push right after creating a cloud project
  const skipSaveRef = useRef(false);

  const createProject = useCallback(async (title?: string, cloud?: boolean): Promise<string> => {
    flushCurrentProject();
    const newProject = makeBlankProject(title);
    const id = newProject.id;

    if (cloud && auth.isSignedIn && auth.accessToken) {
      try {
        const newFileId = await pushProjectAndUpdateIndex(auth.accessToken, newProject);
        const meta: ProjectMeta = {
          id, title: newProject.title, lastModified: Date.now(), createdAt: Date.now(),
          driveFileId: newFileId,
        };
        setProjectList(prev => { const u = [...prev, meta]; return u; });
        dispatch({ type: 'LOAD', payload: newProject });
        setCurrentProjectId(id);
        driveFileIdRef.current = newFileId;
        skipSaveRef.current = true;
        return id;
      } catch (e) {
        console.error('Failed to upload new project to Drive:', e);
      }
    }

    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(newProject));
    const meta: ProjectMeta = { id, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => { const u = [...prev, meta]; saveProjectListToStorage(u); return u; });
    dispatch({ type: 'LOAD', payload: newProject });
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject, auth.isSignedIn, auth.accessToken]);

  const openProject = useCallback(async (id: string, cloudDriveFileId?: string) => {
    flushCurrentProject();
    const meta = projectList.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;

    if (driveFileId && auth.accessToken) {
      try {
        const project = await readDriveProject(auth.accessToken, driveFileId);
        if (meta && meta.title !== project.title) {
          project.title = meta.title;
        }
        setProjectList(prev => {
          if (prev.find(p => p.id === project.id)) return prev;
          return [...prev, {
            id: project.id,
            title: project.title,
            lastModified: Date.now(),
            createdAt: Date.now(),
            driveFileId,
          }];
        });
        dispatch({ type: 'LOAD', payload: project });
        setCurrentProjectId(project.id);
        driveFileIdRef.current = driveFileId;
      } catch (e) {
        console.error('Failed to open cloud project:', e);
        throw e;
      }
    } else {
      const project = loadProjectFromStorage(id);
      if (project) {
        dispatch({ type: 'LOAD', payload: project });
        setCurrentProjectId(id);
      }
    }
  }, [flushCurrentProject, auth.accessToken, projectList]);

  const deleteProject = useCallback(async (id: string, cloudDriveFileId?: string) => {
    const meta = projectList.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;
    if (driveFileId && auth.isSignedIn && auth.accessToken) {
      try {
        await removeFromDrive(auth.accessToken, driveFileId);
        await removeFromDriveIndex(auth.accessToken, id);
      } catch (e) {
        console.error('Failed to delete project from Drive:', e);
      }
    }

    if (!driveFileId) {
      localStorage.removeItem(getProjectStorageKey(id));
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.includes(id)) localStorage.removeItem(key);
    }

    const currentIndex = loadProjectListFromStorage();
    const remaining = currentIndex.filter(p => p.id !== id);
    saveProjectListToStorage(remaining);
    setProjectList(prev => prev.filter(p => p.id !== id));

    if (currentProjectId === id) {
      setCurrentProjectId(null);
    }
  }, [currentProjectId, openProject, projectList, auth.isSignedIn, auth.accessToken]);

  const renameProject = useCallback((id: string, title: string, driveFileId?: string) => {
    if (currentProjectId === id) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { title } });
    }
    let existingMeta: ProjectMeta | undefined;
    setProjectList(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx >= 0) {
        existingMeta = prev[idx];
        const updated = [...prev];
        updated[idx] = { ...updated[idx], title };
        saveProjectListToStorage(updated);
        return updated;
      }
      if (!driveFileId) return prev;
      const updated = [...prev, { id, title, lastModified: Date.now(), createdAt: Date.now(), driveFileId }];
      saveProjectListToStorage(updated);
      return updated;
    });
    if (driveFileId && auth.accessToken) {
      if (currentProjectId === id) {
        pushProjectAndUpdateIndex(auth.accessToken, { ...presentRef.current, title }, driveFileId)
          .catch(e => console.error('Failed to push rename to Drive:', e));
      } else {
        readDriveProject(auth.accessToken, driveFileId)
          .then(project => {
            project.title = title;
            pushProjectAndUpdateIndex(auth.accessToken, project, driveFileId)
              .catch(e => console.error('Failed to push rename to Drive:', e));
          })
          .catch(e => console.error('Failed to read project for rename:', e));
      }
    }
  }, [currentProjectId, auth.accessToken]);

  const duplicateProject = useCallback(async (id: string, cloudDriveFileId?: string) => {
    const meta = projectList.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;
    if (!meta && !driveFileId) return;

    let original: Project | null = null;
    if (driveFileId && auth.accessToken) {
      try {
        original = await readDriveProject(auth.accessToken, driveFileId);
      } catch (e) {
        console.error('[duplicate] failed to read cloud project:', e);
        return;
      }
    } else if (!driveFileId) {
      original = id === currentProjectId ? state.present : loadProjectFromStorage(id);
    }
    if (!original) return;

    flushCurrentProject();
    const newId = generateUUID();
    const newProject: Project = {
      ...original,
      id: newId,
      title: `${original.title} Copy`,
      versions: original.versions.map(v => ({
        ...v,
        id: generateUUID(),
        rows: v.rows.map(r => ({ ...r, id: generateUUID() }))
      })),
      ribbonDesigns: original.ribbonDesigns || [],
      activeRibbonId: original.activeRibbonId || '',
    };

    if (driveFileId && auth.accessToken) {
      const newFileId = await pushProjectAndUpdateIndex(auth.accessToken, newProject);
      const newMeta: ProjectMeta = { id: newId, title: newProject.title, lastModified: Date.now(), createdAt: Date.now(), driveFileId: newFileId };
      setProjectList(prev => [...prev, newMeta]);
    } else {
      localStorage.setItem(getProjectStorageKey(newId), JSON.stringify(newProject));
      const newMeta: ProjectMeta = { id: newId, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
      setProjectList(prev => { const u = [...prev, newMeta]; saveProjectListToStorage(u); return u; });
    }
  }, [flushCurrentProject, currentProjectId, state.present, projectList, auth.accessToken]);

  const importProjectFromData = useCallback((data: Project): string => {
    flushCurrentProject();
    const id = generateUUID();
    const migrationResult = migrateLegacyProject(data);
    migrateLegacyCastMirror(migrationResult.project);
    if (migrationResult.migrated) {
      setPendingLegacyMigrationNotice(migrationResult);
    }
    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(migrationResult.project));
    const meta: ProjectMeta = { id, title: migrationResult.project.title || 'Imported Project', lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => { const u = [...prev, meta]; saveProjectListToStorage(u); return u; });
    dispatch({ type: 'LOAD', payload: migrationResult.project });
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject]);

  const updateProjectMeta = useCallback((id: string, updates: Partial<ProjectMeta>) => {
    setProjectList(prev => {
      const idx = prev.findIndex(p => p.id === id);
      let updated: ProjectMeta[];
      if (idx >= 0) {
        updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      } else {
        // Upsert: a Drive-only project (not in the localStorage index, e.g. after
        // a reload) must be added when it comes back local (move-to-local), or it
        // would vanish from the index entirely.
        const base: ProjectMeta = {
          id,
          title: updates.title || 'Project',
          lastModified: updates.lastModified ?? Date.now(),
          createdAt: updates.createdAt ?? Date.now(),
        };
        updated = [...prev, { ...base, ...updates }];
      }
      saveProjectListToStorage(updated);
      return updated;
    });
    if (id === currentProjectId && 'driveFileId' in updates) {
      driveFileIdRef.current = updates.driveFileId;
    }
  }, [currentProjectId]);

  const closeProject = useCallback(() => {
    setCurrentProjectId(null);
  }, []);

  const retryConnectivity = useCallback(async (): Promise<boolean> => {
    return probeRef.current();
  }, []);

  const retryDriveSync = useCallback(async () => {
    if (!currentProjectId) return;
    const meta = projectList.find(p => p.id === currentProjectId);
    if (!meta?.driveFileId) return;
    const token = sessionStorage.getItem('lemon_google_token') ?? auth.accessToken;
    if (!token) return;
    try {
      await pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId);
      setDriveSaveError(false);
      lastSaveFailedRef.current = false;
      setRealOnline(true);
    } catch (err: any) {
      if (err?.message?.includes('401')) {
        auth.refreshToken();
        setTimeout(async () => {
          try {
            const token = sessionStorage.getItem('lemon_google_token');
            if (token && meta?.driveFileId) {
              await pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId);
              setDriveSaveError(false);
              lastSaveFailedRef.current = false;
              setRealOnline(true);
            }
          } catch {
            setDriveSaveError(true);
          }
        }, 2000);
      } else {
        lastSaveFailedRef.current = true;
        setRealOnline(false);
      }
      setDriveSaveError(true);
    }
  }, [currentProjectId, auth.accessToken, projectList]);

  const consumeLegacyMigrationNotice = useCallback((): LegacyMigrationResult | null => {
    return consumePendingLegacyMigrationNotice();
  }, []);

  const contextValue = useMemo(() => ({
    state,
    dispatch: guardedDispatch,
    projectList,
    currentProjectId,
    initialized,
    readOnly: !realOnline,
    createProject,
    openProject,
    deleteProject,
    renameProject,
    duplicateProject,
    importProjectFromData,
    updateProjectMeta,
    registerPostSaveHandler,
    driveSaveError,
    storageQuotaError,
    retryDriveSync,
    retryConnectivity,
    closeProject,
    consumeLegacyMigrationNotice,
  }), [state, guardedDispatch, projectList, currentProjectId, initialized, realOnline, createProject, openProject, deleteProject, renameProject, duplicateProject, importProjectFromData, updateProjectMeta, registerPostSaveHandler, driveSaveError, storageQuotaError, retryDriveSync, retryConnectivity, closeProject, consumeLegacyMigrationNotice]);

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
}

export function useIsCloudProject(): boolean {
  const { projectList, currentProjectId } = useProject();
  return !!projectList.find(p => p.id === currentProjectId)?.driveFileId;
}
