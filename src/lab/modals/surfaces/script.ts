import type { ModalSurfaceMeta } from '../types';

/** Script-tab surfaces. */
export const meta = [
  {
    id: 'scene-cut',
    title: 'Cut scene split',
    group: 'Script',
    note: 'Choose the cut point when splitting a scene body.',
    kind: 'modal',
    sources: ['src/components/script/SceneCutModal.tsx'],
  },
  {
    id: 'scene-duplicate',
    title: 'Duplicate scene',
    group: 'Script',
    note: 'Split / coverage / plain duplicate modes + the next scene number.',
    kind: 'modal',
    sources: ['src/components/script/SceneDuplicateModal.tsx'],
    width: 'sm',
  },
  {
    id: 'split-break',
    title: 'Move break',
    group: 'Script',
    note: 'Move a scene break to another boundary after a split.',
    kind: 'modal',
    sources: ['src/components/script/SplitBreakModal.tsx'],
  },
  {
    id: 'split-manager',
    title: 'Split manager',
    group: 'Script',
    note: 'Review scene splits, rebuild missing bodies, re-anchor tags.',
    kind: 'modal',
    sources: ['src/components/script/SplitManagerModal.tsx'],
  },
  {
    id: 'script-update',
    title: 'Script update',
    group: 'Script',
    note: 'Import a revised script: compare scenes, categories, keep/discard.',
    kind: 'modal',
    sources: ['src/components/ScriptUpdateModal.tsx'],
  },
  {
    id: 'new-cast-naming',
    title: 'Name new cast',
    group: 'Script',
    note: 'The naming modal queued when a scene field creates a blank cast member.',
    kind: 'modal',
    sources: ['src/lib/newCastNaming.tsx'],
    width: 'sm',
  },
] as const satisfies readonly ModalSurfaceMeta[];
