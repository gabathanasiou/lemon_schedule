export {
  ProjectProvider,
  useProject,
  useIsCloudProject,
} from './provider';
export type { ProjectContextType } from './provider';

export {
  LEGACY_KEY,
  INDEX_KEY,
  PROJECT_KEY_PREFIX,
  type ProjectMeta,
  getProjectStorageKey,
  loadProjectListFromStorage,
  saveProjectListToStorage,
  loadProjectFromStorage,
} from './storage';

export {
  BUILTIN_SCENE_KEYS,
  PROTECTED_CATEGORIES,
  DEFAULT_CATEGORY_LABELS,
  getSceneFieldValue,
  makeBlankProject,
  reducer,
  getElementsFromScenes,
} from './reducer';
export type { Action, State } from './reducer';
