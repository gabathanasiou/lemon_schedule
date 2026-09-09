import React, { useCallback, useMemo } from 'react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DayElementEntry, DayView } from '../../../lib/dayView';
import type { DayMeta, Project } from '../../../types';
import { computeElementCallChain, getCallTimeSettings, setElementCall } from '../../../lib/callTimes';
import { createDayTimesTheme } from '../../../lib/glideTheme';
import { textCell } from '../../../lib/glideCells';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit } from '../../InlineGlideTable';

/**
 * Day Times Glide (roadmap 101) — one compact spreadsheet per element category,
 * embedded directly in the Day Manager's Call Times card. Rows are the day's
 * elements of that category; columns are
 * `ID | Character | SWF | <stage columns from the Call Times settings>`. Every
 * write goes through the SAME `daybreakMeta.elementCalls` path as the rest of
 * the app (`setElementCall` + `patchMeta`), so the grid and Copy-from-day can
 * never drift. Cells hold the raw expression; the resolved time shows when not
 * editing (amber when overridden). Grid mechanics live in `InlineGlideTable`.
 */
export interface DayTimesGlideProps {
  day: DayView;
  category: string;
  patchMeta: (patch: Partial<DayMeta>) => void;
  project: Project;
  readOnly?: boolean;
}

interface SheetColumn extends InlineGlideColumn {}

type GridRow = Record<string, string> & { key: string };

const ID_COL = 'id';
const NAME_COL = 'name';
const SWF_COL = 'swf';

const DayTimesGlide: React.FC<DayTimesGlideProps> = ({ day, category, patchMeta, project, readOnly }) => {
  const settings = useMemo(() => getCallTimeSettings(project), [project]);
  const stageKeys = useMemo(() => settings.categoryStages[category] || [], [settings, category]);
  const stageDefs = useMemo(
    () => settings.stages.filter(s => stageKeys.includes(s.key)),
    [settings.stages, stageKeys],
  );

  const entries: DayElementEntry[] = category === 'cast' ? day.cast : (day.elements[category] || []);
  const stageKeySet = useMemo(() => new Set(stageKeys), [stageKeys]);

  const resolvedByKey = useMemo(() => {
    const map = new Map<string, Record<string, { time: string }>>();
    for (const e of entries) {
      const overrides = day.meta.elementCalls?.[category]?.[e.key];
      map.set(e.key, computeElementCallChain(settings.stages, stageKeys, e.firstCallTime, overrides));
    }
    return map;
  }, [entries, day.meta.elementCalls, category, settings.stages, stageKeys]);

  const rows = useMemo<GridRow[]>(() => entries.map(e => {
    const row: GridRow = {
      key: e.key,
      [ID_COL]: e.boardId || '',
      [NAME_COL]: e.name,
      [SWF_COL]: e.code || '',
    };
    const overrides = day.meta.elementCalls?.[category]?.[e.key];
    for (const key of stageKeys) row[key] = (overrides?.[key as keyof typeof overrides] as string | undefined) || '';
    return row;
  }), [entries, day.meta.elementCalls, category, stageKeys]);

  const columns = useMemo<SheetColumn[]>(() => [
    { key: ID_COL, label: 'ID', width: 48, align: 'center' },
    { key: NAME_COL, label: 'Character', width: 220 },
    { key: SWF_COL, label: 'SWF', width: 48, align: 'center' },
    ...stageDefs.map<SheetColumn>(def => ({ key: def.key, label: def.abbrev || def.label, width: 88, align: 'center' })),
  ], [stageDefs]);

  const getCellContent = useCallback((col: InlineGlideColumn, row: Record<string, string>, _rowIndex: number): GridCell => {
    if (col.key === ID_COL) {
      return textCell(row[col.key], { readonly: true, allowOverlay: false, align: 'center', cursor: 'default', themeOverride: { bgCell: '#fafafa', textDark: '#a1a1aa' } });
    }
    if (col.key === SWF_COL) {
      const code = row[SWF_COL];
      const isWork = code === 'W';
      return textCell(code, {
        readonly: true,
        allowOverlay: false,
        align: 'center',
        cursor: 'default',
        themeOverride: code
          ? { bgCell: isWork ? '#e4e4e7' : '#fef3c7', textDark: isWork ? '#3f3f46' : '#b45309' }
          : { bgCell: '#fafafa' },
      });
    }
    if (col.key === NAME_COL) {
      return textCell(row[col.key], { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { bgCell: '#fafafa' } });
    }
    const raw = row[col.key] || '';
    const resolved = resolvedByKey.get(row.key)?.[col.key]?.time || '';
    return textCell(raw, {
      displayData: resolved,
      readonly: !!readOnly,
      align: 'center',
      themeOverride: raw ? { textDark: '#b45309' } : undefined,
    });
  }, [resolvedByKey, readOnly]);

  const onCommit = useCallback((edits: InlineGlideEdit[]) => {
    let calls = day.meta.elementCalls;
    for (const edit of edits) {
      const entry = entries[edit.row];
      if (!entry) continue;
      calls = setElementCall(calls, category, entry.key, edit.colKey, edit.value);
    }
    patchMeta({ elementCalls: calls });
  }, [day.meta.elementCalls, entries, category, patchMeta]);

  return (
    <InlineGlideTable
      dataAttr="data-day-times-glide"
      columns={columns}
      rows={rows}
      getCellContent={getCellContent}
      onCommit={onCommit}
      editableKeys={stageKeySet}
      readOnly={readOnly}
      createTheme={createDayTimesTheme}
    />
  );
};

export default DayTimesGlide;
