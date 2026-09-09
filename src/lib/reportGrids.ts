import type { Project } from '../types';
import type { ReportCollectionItem, ReportCtx, ReportCrewItem, ReportElementCallItem } from './reportData';
import { resolveCollectionItems } from './reportData';
import { getCallTimeSettings } from './callTimes';
import type { ReportFieldDef } from './reportFields';
import { getLabel } from './categories';

/**
 * Shared seam for the reports designer's day-scoped GRID blocks (items 111/112).
 * One config/read model feeds BOTH the static print renderer
 * (`components/reports/ReportGridBlock`) and the interactive call-sheet grid
 * (`components/production/day/InteractiveGridBlock`) — no fork, and the future
 * editable-day-timings block plugs in here.
 *
 * The blocks reuse the canonical `elementCallsOfDay`/`crewOfDay` collections
 * (item 99) and the field registry's fixed columns; nothing is re-derived.
 */

export type ReportGridCollection = 'elementCallsOfDay' | 'crewOfDay';

const GRID_COLLECTIONS = new Set<ReportGridCollection>(['elementCallsOfDay', 'crewOfDay']);

export function isReportGridCollection(collection: string | undefined): collection is ReportGridCollection {
  return !!collection && GRID_COLLECTIONS.has(collection as ReportGridCollection);
}

export interface ReportGridColumn {
  /** Field-registry key (never a raw scene property). */
  field: string;
  label: string;
  /** Percentage width (normalized to sum to 100). */
  width: number;
  align?: 'left' | 'center' | 'right';
}

export interface ReportGridGroup {
  /** Element category key; '' for the flat crew table. */
  category: string;
  label: string;
  items: ReportCollectionItem[];
  columns: ReportGridColumn[];
}

/** Fixed columns: element calls = ID · Name · SWF · <stages>; crew = Name · Role · Call. */
const ELEMENT_CALL_FIXED = ['elementCallId', 'elementCallName', 'elementCallCode'];
const CREW_FIXED = ['crewName', 'role', 'crewCallTime'];

function fieldColumn(fieldMap: Record<string, ReportFieldDef>, field: string, fallbackWidth = 10): ReportGridColumn {
  const def = fieldMap[field];
  return { field, label: def?.label || field, width: def?.defaultWidth ?? fallbackWidth, align: def?.align };
}

/** Rescale the registry widths to percentages summing to 100 (the shared table
 *  recipe renders `width: n%`). */
function normalize(cols: ReportGridColumn[]): ReportGridColumn[] {
  const total = cols.reduce((a, c) => a + c.width, 0) || 1;
  return cols.map(c => ({ ...c, width: Math.round((c.width / total) * 10000) / 100 }));
}

/** The staged categories in settings order (cast first by default). */
export function stagedCategoryKeys(project: Project): string[] {
  const settings = getCallTimeSettings(project);
  return Object.keys(settings.categoryStages).filter(k => (settings.categoryStages[k] || []).length > 0);
}

function elementCallColumns(project: Project, category: string, fieldMap: Record<string, ReportFieldDef>): ReportGridColumn[] {
  const settings = getCallTimeSettings(project);
  const stageKeys = settings.categoryStages[category] || [];
  const stages = settings.stages.filter(s => stageKeys.includes(s.key));
  return normalize([
    ...ELEMENT_CALL_FIXED.map(f => fieldColumn(fieldMap, f)),
    ...stages.map(s => fieldColumn(fieldMap, `call_${s.key}`, 9)),
  ]);
}

function crewColumns(fieldMap: Record<string, ReportFieldDef>): ReportGridColumn[] {
  return normalize(CREW_FIXED.map(f => fieldColumn(fieldMap, f)));
}

/**
 * The day's grid groups for a block. Element calls group per staged category
 * present on the day (cast-first, resolver order); a block `category` narrows
 * to one table. Crew is always one flat group.
 */
export function resolveReportGridGroups(
  ctx: ReportCtx,
  collection: ReportGridCollection,
  category: string | undefined,
  dayItem: ReportCollectionItem | undefined,
  fieldMap: Record<string, ReportFieldDef>,
): ReportGridGroup[] {
  if (!dayItem) return [];
  if (collection === 'crewOfDay') {
    const items = resolveCollectionItems(ctx, 'crewOfDay', undefined, dayItem, undefined) as ReportCrewItem[];
    return [{ category: '', label: 'Crew', items, columns: crewColumns(fieldMap) }];
  }
  const all = resolveCollectionItems(ctx, 'elementCallsOfDay', undefined, dayItem, undefined) as ReportElementCallItem[];
  const filtered = category ? all.filter(it => it.category === category) : all;
  const order: string[] = [];
  const byCategory = new Map<string, ReportElementCallItem[]>();
  for (const it of filtered) {
    if (!byCategory.has(it.category)) {
      byCategory.set(it.category, []);
      order.push(it.category);
    }
    byCategory.get(it.category)!.push(it);
  }
  // A chosen category with no elements still exposes its columns so the
  // designer can show the shape; print renders nothing (no items).
  if (category && order.length === 0) order.push(category);
  return order.map(cat => ({
    category: cat,
    label: getLabel(cat, cat, ctx.project.categoryLabels),
    items: byCategory.get(cat) || [],
    columns: elementCallColumns(ctx.project, cat, fieldMap),
  }));
}

/** Designer skeleton (no day in scope): the staged category tables with no rows. */
export function skeletonReportGridGroups(
  project: Project,
  collection: ReportGridCollection,
  category: string | undefined,
  fieldMap: Record<string, ReportFieldDef>,
): ReportGridGroup[] {
  if (collection === 'crewOfDay') {
    return [{ category: '', label: 'Crew', items: [], columns: crewColumns(fieldMap) }];
  }
  const categories = category ? [category] : stagedCategoryKeys(project);
  return categories.map(cat => ({
    category: cat,
    label: getLabel(cat, cat, project.categoryLabels),
    items: [],
    columns: elementCallColumns(project, cat, fieldMap),
  }));
}
