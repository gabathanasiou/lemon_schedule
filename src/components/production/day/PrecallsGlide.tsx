import React, { useCallback, useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DayView } from '../../../lib/dayView';
import type { DayMeta, Project } from '../../../types';
import { dayDepartments, setDeptPrecall } from '../../../lib/dayCrew';
import { createDayTimesTheme } from '../../../lib/glideTheme';
import { isSeededNoop, seededTextCell, textCell } from '../../../lib/glideCells';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit } from '../../InlineGlideTable';
import { ContextMenuItem } from '../../ContextMenu';

/**
 * Precalls glide (item 159) — the live face of the Precalls block in the Call
 * Sheet → Edit canvas, structured exactly like the Call Times glide: a compact
 * InlineGlideTable over the canonical `dayDepartments` pool. Cells seed the
 * effective pre-call expression (`-30m`, the template value included) and show
 * the resolved call time (amber when a DAY override is stored). Every write
 * goes through the shared `setDeptPrecall` + `patchMeta`, so the grid, the Day
 * Manager Crew card and the call sheet can never drift.
 *
 * `layout: 'horizontal'` transposes to one column per department with a single
 * call row (the block stores the same preference).
 */
export interface PrecallsGlideProps {
  day: DayView;
  project: Project;
  patchMeta: (patch: Partial<DayMeta>) => void;
  readOnly?: boolean;
  /** Include departments with no pre-call (their effective call shows). */
  includeAll?: boolean;
  /** `includeAll` mode: only these departments (undefined = every one). */
  include?: string[];
  layout?: 'vertical' | 'horizontal';
  /** Header right-click → "Edit Call Time Stages…" (template pre-calls live
   *  in the settings modal owned by the composition root). */
  onEditCallTimesSettings?: () => void;
}

const PrecallsGlide: React.FC<PrecallsGlideProps> = ({ day, project, patchMeta, readOnly, includeAll, include, layout = 'horizontal', onEditCallTimesSettings }) => {
  const departments = useMemo(
    () => dayDepartments(project, day.meta, day.callTime).filter(d => !d.excluded && (includeAll ? (!include || include.includes(d.dept)) : d.precall)),
    [project, day.meta, day.callTime, includeAll, include],
  );

  const vertical = layout !== 'horizontal';

  // Vertical: one row per department. Horizontal: ONE row — each column is a
  // department (cells resolve by column key, not by row).
  const rows = useMemo<Record<string, string>[]>(
    () => vertical
      ? departments.map(d => ({
          key: d.dept,
          dept: d.dept,
          precall: d.precall,
          resolved: d.deptCall,
          overridden: day.meta.departmentPrecalls?.[d.dept] ? 'true' : '',
        }))
      : [{ key: 'row' }],
    [vertical, departments, day.meta.departmentPrecalls],
  );

  const columns = useMemo<InlineGlideColumn[]>(() => vertical
    ? [
        { key: 'dept', label: 'Department', width: 180 },
        { key: 'precall', label: 'Precall', width: 90, align: 'center' },
      ]
    : departments.map(d => ({ key: d.dept, label: d.dept, width: 100, align: 'center' as const })),
    [vertical, departments]);

  const editableKeys = useMemo(
    () => new Set(vertical ? ['precall'] : departments.map(d => d.dept)),
    [vertical, departments],
  );

  /** One call cell: seed = effective expression (falls back to the resolved
   *  time), display = resolved, amber = a day override is stored. */
  const callCell = useCallback((precall: string, resolved: string, overridden: boolean): GridCell => (
    seededTextCell(precall || resolved, {
      displayData: resolved,
      readonly: !!readOnly,
      align: 'center',
      themeOverride: overridden ? { textDark: '#b45309' } : undefined,
    })
  ), [readOnly]);

  const getCellContent = useCallback((col: InlineGlideColumn, row: Record<string, string>): GridCell => {
    if (vertical && col.key === 'dept') {
      return textCell(row.dept, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#52525b' } });
    }
    if (vertical) {
      return callCell(row.precall, row.resolved, row.overridden === 'true');
    }
    // Horizontal: the column IS the department.
    const d = departments.find(x => x.dept === col.key);
    if (!d) return textCell('', { readonly: true, allowOverlay: false });
    return callCell(d.precall, d.deptCall, !!day.meta.departmentPrecalls?.[d.dept]);
  }, [vertical, departments, day.meta.departmentPrecalls, callCell]);

  const onCommit = useCallback((edits: InlineGlideEdit[]) => {
    let meta: DayMeta = day.meta;
    let changed = false;
    for (const edit of edits) {
      const dept = vertical ? rows[edit.row]?.dept : edit.colKey;
      const d = dept ? departments.find(x => x.dept === dept) : undefined;
      if (!d) continue;
      const prior = meta.departmentPrecalls?.[d.dept] ?? '';
      // Enter/blur on a seeded cell (the template pre-call or the resolved
      // time) must never pin a spurious override.
      if (isSeededNoop(prior, d.precall || d.deptCall, edit.value)) continue;
      meta = { ...meta, ...setDeptPrecall(meta, d.dept, edit.value) };
      changed = true;
    }
    if (changed) patchMeta({ departmentPrecalls: meta.departmentPrecalls });
  }, [day.meta, vertical, rows, departments, patchMeta]);

  return (
    <InlineGlideTable
      dataAttr="data-precalls-glide"
      columns={columns}
      rows={rows}
      getCellContent={getCellContent}
      onCommit={onCommit}
      editableKeys={editableKeys}
      readOnly={readOnly}
      emptyLabel={readOnly ? 'No precalls on this day.' : 'No precalls yet — type a call time, or switch Departments to All.'}
      wrapHeaders={!vertical}
      baseHeaderHeight={vertical ? undefined : 46}
      createTheme={createDayTimesTheme}
      headerMenuItems={onEditCallTimesSettings ? close => (
        <ContextMenuItem
          onClick={() => { close(); onEditCallTimesSettings(); }}
          icon={<Clock className="w-3.5 h-3.5" />}
        >
          Edit Call Time Stages…
        </ContextMenuItem>
      ) : undefined}
    />
  );
};

export default PrecallsGlide;
