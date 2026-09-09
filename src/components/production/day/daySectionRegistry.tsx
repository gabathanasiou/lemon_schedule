import React from 'react';
import type { DayMeta } from '../../../types';
import type { DayView } from '../../../lib/dayView';
import type { DaySectionProps } from './daySectionTypes';
import DayDetailsSection, { DayDetailsIcon } from './sections/DayDetailsSection';
import LocationsSection, { LocationsIcon } from './sections/LocationsSection';
import ScenesSection, { ScenesIcon } from './sections/ScenesSection';
import CastElementsSection, { CastElementsIcon } from './sections/CastElementsSection';
import EventsSection, { EventsIcon } from './sections/EventsSection';
import ConflictsSection, { ConflictsIcon } from './sections/ConflictsSection';
import CallSheetSection, { CallSheetIcon } from './sections/CallSheetSection';

/**
 * THE list of Day Manager sections (D7). The page, the pop-out and the copy
 * modal all iterate this registry — adding a section is one entry here, never
 * a new hardcoded list. `summary` drives the collapsed header; `copyable` +
 * `copyMode` drive the Copy-from-day modal.
 */
export interface DaySectionDef {
  id: string;
  title: string;
  icon: React.ReactNode;
  /** One-line live summary shown in the collapsed card header. */
  summary: (day: DayView) => string;
  Component: React.ComponentType<DaySectionProps>;
  copyable: boolean;
  copyMode?: 'replace' | 'merge';
  /** The meta patch this section copies (Copy-from-day). Events are handled
   *  by the modal (date-keyed, merged into the calendar version). */
  extract?: (day: DayView) => Partial<DayMeta> | undefined;
  /** True when the section has no content for this day (drives empty copy). */
  isEmpty?: (day: DayView) => boolean;
}

export const DAY_SECTIONS: DaySectionDef[] = [
  {
    id: 'details',
    title: 'Day Details',
    icon: <DayDetailsIcon className="w-3.5 h-3.5" />,
    summary: day => day.meta.note ? day.meta.note : '',
    Component: DayDetailsSection,
    copyable: true,
    copyMode: 'replace',
    extract: day => (day.meta.note ? { note: day.meta.note } : undefined),
  },
  {
    id: 'locations',
    title: 'Locations',
    icon: <LocationsIcon className="w-3.5 h-3.5" />,
    summary: day => {
      const n = (day.masterLocation ? 1 : 0) + day.keyLocations.length;
      return n > 0 ? `${n} location${n !== 1 ? 's' : ''}` : 'None';
    },
    Component: LocationsSection,
    copyable: true,
    copyMode: 'replace',
    extract: day => ({
      ...(day.meta.locationId ? { locationId: day.meta.locationId } : {}),
      ...(day.meta.locationIds && day.meta.locationIds.length ? { locationIds: day.meta.locationIds } : {}),
    }),
  },
  {
    id: 'scenes',
    title: 'Scenes',
    icon: <ScenesIcon className="w-3.5 h-3.5" />,
    summary: day => `${day.scenes.length} scene${day.scenes.length !== 1 ? 's' : ''} · ${day.sums.pages || 0} pgs`,
    Component: ScenesSection,
    copyable: false,
    isEmpty: day => day.scenes.length === 0,
  },
  {
    id: 'castElements',
    title: 'Cast & Elements',
    icon: <CastElementsIcon className="w-3.5 h-3.5" />,
    summary: day => {
      const el = Object.values(day.elements).reduce((n, list) => n + list.length, 0);
      return `${day.cast.length} cast · ${el} element${el !== 1 ? 's' : ''}`;
    },
    Component: CastElementsSection,
    copyable: false,
    isEmpty: day => day.cast.length === 0 && Object.keys(day.elements).length === 0,
  },
  {
    id: 'events',
    title: 'Events',
    icon: <EventsIcon className="w-3.5 h-3.5" />,
    summary: day => {
      const groups = day.event?.lists ? Object.values(day.event.lists).reduce((n, g) => n + Object.keys(g).length, 0) : 0;
      const status = day.status ? 1 : 0;
      return `${status + groups} event${status + groups !== 1 ? 's' : ''}`;
    },
    Component: EventsSection,
    copyable: true,
    copyMode: 'merge',
  },
  {
    id: 'conflicts',
    title: 'Conflicts',
    icon: <ConflictsIcon className="w-3.5 h-3.5" />,
    summary: day => `${day.violations.length} conflict${day.violations.length !== 1 ? 's' : ''}`,
    Component: ConflictsSection,
    copyable: false,
    isEmpty: day => day.violations.length === 0,
  },
  {
    id: 'callSheet',
    title: 'Call Sheet',
    icon: <CallSheetIcon className="w-3.5 h-3.5" />,
    summary: () => 'Live preview',
    Component: CallSheetSection,
    copyable: false,
  },
];

export const DAY_SECTION_BY_ID = new Map(DAY_SECTIONS.map(s => [s.id, s]));
