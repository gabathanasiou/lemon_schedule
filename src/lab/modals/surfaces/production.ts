import type { ModalSurfaceMeta } from '../types';

/** Production-tab surfaces (Day Manager). */
export const meta = [
  {
    id: 'production-details',
    title: 'Production details',
    group: 'Production',
    note: 'Project/production info: title, timezone, key contacts, dates.',
    kind: 'modal',
    sources: ['src/components/production/day/ProductionDetailsModal.tsx'],
  },
  {
    id: 'copy-day',
    title: 'Copy from another day',
    group: 'Production',
    note: 'Pick a source day and copy its scene/element lists into this day.',
    kind: 'modal',
    sources: ['src/components/production/day/CopyDayModal.tsx'],
  },
  {
    id: 'call-times',
    title: 'Call Times',
    group: 'Production',
    note: 'Stages, per-category stage sets and department precalls.',
    kind: 'modal',
    sources: ['src/components/production/day/CallTimesSettingsModal.tsx'],
  },
  {
    id: 'crew-add',
    title: 'Add crew member',
    group: 'Production',
    note: 'Add a person to a crew position (name, contact, role).',
    kind: 'modal',
    sources: ['src/components/crew/AddCrewMemberModal.tsx'],
  },
] as const satisfies readonly ModalSurfaceMeta[];
