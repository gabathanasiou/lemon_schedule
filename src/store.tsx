import React, { createContext, useContext, useEffect, useReducer, useCallback, useState } from 'react';
import { Project, Scene, ScheduleVersion, ScheduleRow } from './types';
import { generateUUID, parsePageCount } from './lib/utils';
import Papa from 'papaparse';

const LEGACY_KEY = 'a-little-bit-of-hope-project';
const INDEX_KEY = 'lemon_schedule_project_index';
const PROJECT_KEY_PREFIX = 'lemon_schedule_project_v1_';

export interface ProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
}

function getProjectStorageKey(id: string): string {
  return `${PROJECT_KEY_PREFIX}${id}`;
}

function loadProjectListFromStorage(): ProjectMeta[] {
  try {
    const stored = localStorage.getItem(INDEX_KEY);
    if (stored) {
      const list: ProjectMeta[] = JSON.parse(stored);
      return list.map(p => ({ createdAt: p.lastModified, ...p }));
    }
  } catch (e) {
    console.error("Failed to load project list", e);
  }
  return [];
}

function saveProjectListToStorage(list: ProjectMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

function loadProjectFromStorage(id: string): Project | null {
  try {
    const stored = localStorage.getItem(getProjectStorageKey(id));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.scenes && parsed.versions) return parsed;
    }
  } catch (e) {
    console.error("Failed to load project", e);
  }
  return null;
}

function makeBlankProject(title = 'Untitled Project'): Project {
  const id = generateUUID();
  return {
    title,
    draftNumber: '1',
    scenes: [],
    versions: [{
      id,
      name: 'v1 - Initial Schedule',
      createdAt: Date.now(),
      rows: [],
      dayMeta: {}
    }],
    activeVersionId: id,
  };
}

type Action =
  | { type: 'LOAD'; payload: Project }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'UPDATE_PROJECT', payload: Partial<Project> }
  | { type: 'ADD_SCENE', payload: Scene }
  | { type: 'UPDATE_SCENE', payload: Partial<Scene> & { id: string } }
  | { type: 'DELETE_SCENE', payload: string }
  | { type: 'SORT_SCENES' }
  | { type: 'UPDATE_VERSION', payload: Partial<ScheduleVersion> & { id: string } }
  | { type: 'NEW_VERSION', payload: { name: string, cloneFromId?: string | null } }
  | { type: 'DELETE_VERSION', payload: string }
  | { type: 'RENAME_VERSION', payload: { id: string, name: string } }
  | { type: 'SET_ACTIVE_VERSION', payload: string }
  | { type: 'IMPORT_SCENES', payload: Scene[] }
  | { type: 'DELETE_DAY', day: number }

interface State {
  past: Project[];
  present: Project;
  future: Project[];
}

function reducer(state: State, action: Action): State {
  if (action.type === 'LOAD') {
    return { past: [], present: action.payload, future: [] };
  }

  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, state.past.length - 1);
    return {
      past: newPast,
      present: previous,
      future: [state.present, ...state.future]
    };
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return {
      past: [...state.past, state.present],
      present: next,
      future: newFuture
    };
  }

  // Helper for applying changes to `present` and pushing to `past`
  const applyChange = (newPresent: Project): State => {
    return {
      past: [...state.past, state.present].slice(-50), // keep last 50
      present: newPresent,
      future: []
    };
  };

  switch (action.type) {
    case 'UPDATE_PROJECT':
      return applyChange({ ...state.present, ...action.payload });

    case 'ADD_SCENE':
      return applyChange({
        ...state.present,
        scenes: [...state.present.scenes, action.payload]
      });

    case 'UPDATE_SCENE': {
      let pageCountDecimal = state.present.scenes.find(s => s.id === action.payload.id)?.pageCountDecimal;
      if (action.payload.pageCount !== undefined) {
         // Re-parse page count
         pageCountDecimal = parsePageCount(action.payload.pageCount);
      }
      return applyChange({
        ...state.present,
        scenes: state.present.scenes.map(s => s.id === action.payload.id ? { ...s, ...action.payload, ...(pageCountDecimal !== undefined ? { pageCountDecimal } : {}) } : s)
      });
    }

    case 'DELETE_SCENE': {
      // Also remove from all schedules
      return applyChange({
        ...state.present,
        scenes: state.present.scenes.filter(s => s.id !== action.payload),
        versions: state.present.versions.map(v => ({
          ...v,
          rows: v.rows.filter(r => r.sceneId !== action.payload)
        }))
      });
    }

    case 'SORT_SCENES': {
      const sorted = [...state.present.scenes].sort((a, b) => {
        return a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true, sensitivity: 'base' });
      });
      return applyChange({ ...state.present, scenes: sorted });
    }

    case 'UPDATE_VERSION': {
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => v.id === action.payload.id ? { ...v, ...action.payload } : v)
      });
    }

    case 'NEW_VERSION': {
      let newVersion: ScheduleVersion;
      const parent = action.payload.cloneFromId 
        ? state.present.versions.find(v => v.id === action.payload.cloneFromId)
        : null;

      if (parent) {
        newVersion = {
          ...parent,
          id: generateUUID(),
          name: action.payload.name,
          createdAt: Date.now(),
          rows: parent.rows.map(r => ({ ...r, id: generateUUID() }))
        };
      } else {
        newVersion = {
          id: generateUUID(),
          name: action.payload.name,
          createdAt: Date.now(),
          rows: [],
          dayMeta: { 1: { shootDay: 1, unitCall: '08:00', date: '' } }
        };
      }
      return applyChange({
        ...state.present,
        versions: [...state.present.versions, newVersion],
        activeVersionId: newVersion.id
      });
    }

    case 'DELETE_VERSION': {
      const versionId = action.payload;
      const newVersions = state.present.versions.filter(v => v.id !== versionId);
      
      let newActiveId = state.present.activeVersionId;
      if (newActiveId === versionId) {
        newActiveId = newVersions.length > 0 ? newVersions[0].id : '';
      }
      
      if (newVersions.length === 0) {
        return state;
      }
      
      return applyChange({
        ...state.present,
        versions: newVersions,
        activeVersionId: newActiveId
      });
    }

    case 'RENAME_VERSION': {
      const { id, name } = action.payload;
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => v.id === id ? { ...v, name } : v)
      });
    }

    case 'SET_ACTIVE_VERSION':
      return applyChange({ ...state.present, activeVersionId: action.payload });
      
    case 'IMPORT_SCENES':
      return applyChange({
        ...state.present,
        scenes: [...state.present.scenes, ...action.payload]
      });

    case 'DELETE_DAY': {
      const activeVerId = state.present.activeVersionId;
      if (!activeVerId) return state;
      return applyChange({
        ...state.present,
        versions: state.present.versions.map(v => {
          if (v.id !== activeVerId) return v;
          return {
            ...v,
            rows: v.rows.filter(r => r.shootDay !== action.day),
            dayMeta: Object.fromEntries(Object.entries(v.dayMeta).filter(([k]) => Number(k) !== action.day))
          };
        })
      });
    }

    default:
      return state;
  }
}

interface ProjectContextType {
  state: State;
  dispatch: React.Dispatch<Action>;
  projectList: ProjectMeta[];
  currentProjectId: string | null;
  initialized: boolean;
  createProject: (title?: string) => string;
  openProject: (id: string) => void;
  deleteProject: (id: string) => void;
  renameProject: (id: string, title: string) => void;
  duplicateProject: (id: string) => void;
  importProjectFromData: (data: Project) => string;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectList, setProjectList] = useState<ProjectMeta[]>(() => loadProjectListFromStorage());
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const blank = makeBlankProject();

  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: blank,
    future: []
  });

  // On mount: migrate legacy data or load most recent project
  useEffect(() => {
    const legacyData = localStorage.getItem(LEGACY_KEY);
    if (legacyData) {
      try {
        const parsed = JSON.parse(legacyData);
        if (parsed.scenes && parsed.versions) {
          const id = generateUUID();
          localStorage.setItem(getProjectStorageKey(id), legacyData);
          localStorage.removeItem(LEGACY_KEY);

          const meta: ProjectMeta = { id, title: parsed.title || 'Project', lastModified: Date.now(), createdAt: Date.now() };
          saveProjectListToStorage([meta]);
          setProjectList([meta]);

          dispatch({ type: 'LOAD', payload: parsed });
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
      const sorted = [...list].sort((a, b) => b.lastModified - a.lastModified);
      const latest = sorted[0];
      const project = loadProjectFromStorage(latest.id);
      if (project) {
        dispatch({ type: 'LOAD', payload: project });
        setCurrentProjectId(latest.id);
      }
    }

    setInitialized(true);
  }, []);

  // Auto-save current project to its storage key
  useEffect(() => {
    if (!currentProjectId) return;
    localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(state.present));
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
  }, [state.present, currentProjectId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentProjectId) return;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      }
      if (cmdOrCtrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProjectId]);

  // Save current project state to localStorage immediately
  const flushCurrentProject = useCallback(() => {
    if (!currentProjectId) return;
    localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(state.present));
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
  }, [currentProjectId, state.present]);

  const createProject = useCallback((title?: string): string => {
    flushCurrentProject();

    const id = generateUUID();
    const newProject = makeBlankProject(title);

    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(newProject));

    const meta: ProjectMeta = { id, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => {
      const updated = [...prev, meta];
      saveProjectListToStorage(updated);
      return updated;
    });

    dispatch({ type: 'LOAD', payload: newProject });
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject]);

  const openProject = useCallback((id: string) => {
    flushCurrentProject();

    const project = loadProjectFromStorage(id);
    if (project) {
      dispatch({ type: 'LOAD', payload: project });
      setCurrentProjectId(id);
    }
  }, [flushCurrentProject]);

  const deleteProject = useCallback((id: string) => {
    localStorage.removeItem(getProjectStorageKey(id));

    const currentIndex = loadProjectListFromStorage();
    const remaining = currentIndex.filter(p => p.id !== id);
    saveProjectListToStorage(remaining);
    setProjectList(remaining);

    if (currentProjectId === id) {
      if (remaining.length > 0) {
        openProject(remaining[0].id);
      } else {
        setCurrentProjectId(null);
      }
    }
  }, [currentProjectId, openProject]);

  const renameProject = useCallback((id: string, title: string) => {
    if (currentProjectId === id) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { title } });
    }
    setProjectList(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, title } : p);
      saveProjectListToStorage(updated);
      return updated;
    });
  }, [currentProjectId]);

  const duplicateProject = useCallback((id: string) => {
    flushCurrentProject();

    const original = id === currentProjectId ? state.present : loadProjectFromStorage(id);
    if (!original) return;

    const newId = generateUUID();
    const newProject: Project = {
      ...original,
      title: `${original.title} Copy`,
      versions: original.versions.map(v => ({
        ...v,
        id: generateUUID(),
        rows: v.rows.map(r => ({ ...r, id: generateUUID() }))
      }))
    };

    localStorage.setItem(getProjectStorageKey(newId), JSON.stringify(newProject));

    const meta: ProjectMeta = { id: newId, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => {
      const updated = [...prev, meta];
      saveProjectListToStorage(updated);
      return updated;
    });
  }, [flushCurrentProject, currentProjectId, state.present]);

  const importProjectFromData = useCallback((data: Project): string => {
    flushCurrentProject();

    const id = generateUUID();
    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(data));

    const meta: ProjectMeta = { id, title: data.title || 'Imported Project', lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => {
      const updated = [...prev, meta];
      saveProjectListToStorage(updated);
      return updated;
    });

    dispatch({ type: 'LOAD', payload: data });
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject]);

  return (
    <ProjectContext.Provider value={{
      state,
      dispatch,
      projectList,
      currentProjectId,
      initialized,
      createProject,
      openProject,
      deleteProject,
      renameProject,
      duplicateProject,
      importProjectFromData
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
}
