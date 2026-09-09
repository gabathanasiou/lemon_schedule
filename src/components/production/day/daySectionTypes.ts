import type { Dispatch } from 'react';
import type { DayMeta, Project, ScheduleRow } from '../../../types';
import type { DayView } from '../../../lib/dayView';

/**
 * The one props contract every day section implements (D7). Sections are pure:
 * data in, patches out — never `useProject()`. The same component renders in
 * the page, the pop-out, the copy modal preview and future quick-edit modals.
 */

export interface DaySectionActions {
  openScene?: (sceneId: string) => void;
  openEvents?: (date: string) => void;
  openCallSheet?: () => void;
  printCallSheet?: () => void;
  /** Call-sheet design selection is owned by the composition root so the live
   *  preview pane and the section's picker stay in sync. */
  callSheetDesignId?: string;
  selectCallSheetDesign?: (id: string) => void;
}

export interface DaySectionProps {
  day: DayView;
  patchMeta: (patch: Partial<DayMeta>) => void;
  patchRow: (updates: Partial<ScheduleRow>) => void;
  readOnly?: boolean;
  project: Project;
  dispatch: Dispatch<any>;
  actions: DaySectionActions;
}
