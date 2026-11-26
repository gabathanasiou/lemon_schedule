import type { SurfaceMetaList } from '../types';

/** Collaboration surfaces. */
export const meta: SurfaceMetaList = [
  {
    id: 'sharing',
    title: 'Share project',
    group: 'Collaboration',
    note: 'Invite people, roles, view-only links, stop sharing.',
    kind: 'modal',
    sources: ['src/components/sharing/SharingModal.tsx'],
  },
  {
    id: 'collaborate',
    title: 'Collaborate on this project',
    group: 'Collaboration',
    note: 'Copy a local/Drive project into shared (online) projects.',
    kind: 'modal',
    sources: ['src/components/UserPresenceCluster.tsx'],
    width: 'sm',
  },
];
