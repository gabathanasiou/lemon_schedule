import type React from 'react';
import type { Action } from '../../store';
import type { CalendarVersion, Project } from '../../types';
import type { LabSelection, LabSurfaceKind } from '../../lib/labState';

/** Studio sections — the picker groups and the left-to-right review order. */
export type SurfaceGroup =
  | 'Schedule'
  | 'Calendar'
  | 'Production'
  | 'Elements & Links'
  | 'Reports & Print'
  | 'Budget'
  | 'Script'
  | 'App & Account'
  | 'Collaboration'
  | 'Dialogs';

export const SURFACE_GROUPS: SurfaceGroup[] = [
  'Schedule',
  'Calendar',
  'Production',
  'Elements & Links',
  'Reports & Print',
  'Budget',
  'Script',
  'App & Account',
  'Collaboration',
  'Dialogs',
];

/** One previewable surface. `sources` drives the completeness test: every
 *  source file that renders this modal belongs here, and a modal file that is
 *  in no surface's list fails the unit suite. */
export interface ModalSurfaceMeta {
  /** Stable id — the deep link and the MCP `get_lab_state` payload. */
  id: string;
  title: string;
  group: SurfaceGroup;
  /** One line: what this surface is for (shown in the studio dock). */
  note: string;
  kind: LabSurfaceKind;
  /** Repo-relative files this surface previews (the completeness contract). */
  sources: string[];
  /** The fixture renders without an open project (project pickers, help). */
  projectless?: boolean;
  /** Fixture override for the studio's width control. */
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'auto';
}

/** Project-derived picks so fixtures don't hand-roll seed lookups. */
export interface FixturePicks {
  cast?: { id: string; label: string };
  element?: { category: string; key: string; label: string };
  scene?: { id: string; number: string };
  /** A production day's calendar date (YYYY-MM-DD), when the project has one. */
  dayDate?: string;
  daySectionIndex?: number;
  crew?: { id: string; label: string };
  location?: { id: string; label: string };
  reportDesign?: { id: string; name: string };
  budgetLine?: { id: string; label: string };
}

export interface FixtureContext {
  /** Null only for `projectless` surfaces — the studio gates the rest. */
  project: Project | null;
  dispatch: React.Dispatch<Action>;
  calendar: CalendarVersion | undefined;
  picks: FixturePicks;
  theme: 'light' | 'dark';
  /** Modal close affordance: closes the preview, with a Re-open action. */
  close: () => void;
  /** Publish what this fixture is pointed at for the MCP reader. */
  select: (selection: LabSelection | undefined) => void;
  selection?: LabSelection;
}

export type SurfaceRender = (ctx: FixtureContext) => React.ReactNode;

/** A group module's metadata (pure — safe to import from the Node test). */
export type SurfaceMetaList = ModalSurfaceMeta[];
