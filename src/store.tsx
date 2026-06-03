import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { Project, Scene, ScheduleVersion, ScheduleRow, DayNight, IntExt } from './types';
import { generateUUID, parsePageCount } from './lib/utils';
import Papa from 'papaparse';

// Storage stuff
const STORAGE_KEY = 'a-little-bit-of-hope-project';

const initialProject: Project = {
  title: 'Untitled Project',
  draftNumber: '1',
  scenes: [
    {
      id: generateUUID(),
      sceneNumber: '1',
      pageCount: '1 3/8',
      pageCountDecimal: 1.375,
      scriptDay: '1',
      intExt: 'INT',
      set: 'APARTMENT',
      dayNight: 'DAY',
      description: 'Main character wakes up.',
      cast: '1',
      notes: '',
      shootDay: null
    },
    {
      id: generateUUID(),
      sceneNumber: '2',
      pageCount: '1/8',
      pageCountDecimal: 0.125,
      scriptDay: '1',
      intExt: 'EXT',
      set: 'STREET',
      dayNight: 'DAY',
      description: 'New scene',
      cast: '',
      notes: '',
      shootDay: null
    },
    {
      id: generateUUID(),
      sceneNumber: '3',
      pageCount: '2 1/8',
      pageCountDecimal: 2.125,
      scriptDay: '1',
      intExt: 'INT',
      set: 'CLUB',
      dayNight: 'NIGHT',
      description: 'They have a drink.',
      cast: '1, 2',
      notes: '',
      shootDay: null
    },
    {
      id: generateUUID(),
      sceneNumber: '4',
      pageCount: '4/8',
      pageCountDecimal: 0.5,
      scriptDay: '1',
      intExt: 'EXT',
      set: 'ALLEY',
      dayNight: 'NIGHT',
      description: 'Someone waits in the dark.',
      cast: '2',
      notes: '',
      shootDay: null
    }
  ],
  versions: [
    {
      id: generateUUID(),
      name: 'v1 - Initial Schedule',
      createdAt: Date.now(),
      rows: [],
      dayMeta: { 1: { shootDay: 1, unitCall: '08:00', date: 'SATURDAY 6TH JUNE 2026' } }
    }
  ],
  activeVersionId: ''
};

if (initialProject.versions[0]) {
  initialProject.activeVersionId = initialProject.versions[0].id;
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
  | { type: 'NEW_VERSION', payload: { name: string, cloneFromId: string } }
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
      const parent = state.present.versions.find(v => v.id === action.payload.cloneFromId);
      if (!parent) return state;
      const newVersion: ScheduleVersion = {
        ...parent,
        id: generateUUID(),
        name: action.payload.name,
        createdAt: Date.now(),
        // clone rows with new IDs
        rows: parent.rows.map(r => ({ ...r, id: generateUUID() }))
      };
      return applyChange({
        ...state.present,
        versions: [...state.present.versions, newVersion],
        activeVersionId: newVersion.id
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
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initialProject,
    future: []
  });

  // Load from local storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.scenes && parsed.versions) {
          dispatch({ type: 'LOAD', payload: parsed });
        }
      }
    } catch(e) {
      console.error("Failed to load project from local storage", e);
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.present));
  }, [state.present]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        // save handled by effect
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
}
