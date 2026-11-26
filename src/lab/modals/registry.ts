import type { ModalSurfaceMeta, SurfaceRender } from './types';
import { SURFACE_GROUPS } from './types';
import { meta as scheduleMeta } from './surfaces/schedule';
import { meta as calendarMeta } from './surfaces/calendar';
import { meta as productionMeta } from './surfaces/production';
import { meta as elementsMeta } from './surfaces/elements';
import { meta as reportsMeta } from './surfaces/reports';
import { meta as budgetMeta } from './surfaces/budget';
import { meta as scriptMeta } from './surfaces/script';
import { meta as appChromeMeta } from './surfaces/appChrome';
import { meta as collaborationMeta } from './surfaces/collaboration';
import { meta as dialogsMeta } from './surfaces/dialogs';
import { render as scheduleRender } from './fixtures/schedule';
import { render as calendarRender } from './fixtures/calendar';
import { render as productionRender } from './fixtures/production';
import { render as elementsRender } from './fixtures/elements';
import { render as reportsRender } from './fixtures/reports';
import { render as budgetRender } from './fixtures/budget';
import { render as scriptRender } from './fixtures/script';
import { render as appChromeRender } from './fixtures/appChrome';
import { render as collaborationRender } from './fixtures/collaboration';
import { render as dialogsRender } from './fixtures/dialogs';

/** The studio's one registry. Group order is the review order; within a group
 *  the metadata file's order wins. `sources` is the completeness contract:
 *  every app file that renders a modal/dialog must appear in exactly one
 *  surface's list (the unit suite enforces it). */
const GROUPED: ModalSurfaceMeta[][] = [
  scheduleMeta,
  calendarMeta,
  productionMeta,
  elementsMeta,
  reportsMeta,
  budgetMeta,
  scriptMeta,
  appChromeMeta,
  collaborationMeta,
  dialogsMeta,
];

export const SURFACES: ModalSurfaceMeta[] = SURFACE_GROUPS.flatMap((group) =>
  GROUPED.flat().filter((surface) => surface.group === group),
);

const RENDERERS: Record<string, SurfaceRender> = {
  ...scheduleRender,
  ...calendarRender,
  ...productionRender,
  ...elementsRender,
  ...reportsRender,
  ...budgetRender,
  ...scriptRender,
  ...appChromeRender,
  ...collaborationRender,
  ...dialogsRender,
};

export function surfaceById(id: string | null | undefined): ModalSurfaceMeta | undefined {
  return SURFACES.find((surface) => surface.id === id);
}

export function surfaceRenderer(id: string): SurfaceRender | undefined {
  return RENDERERS[id];
}

/** Dev guard: a missing renderer means the picker would show a dead surface. */
export function missingRenderers(): string[] {
  return SURFACES.filter((surface) => !RENDERERS[surface.id]).map((surface) => surface.id);
}
