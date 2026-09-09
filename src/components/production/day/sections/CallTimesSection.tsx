import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DaySectionProps } from '../daySectionTypes';
import { getCallTimeSettings } from '../../../../lib/callTimes';
import { CAT_ICONS, getCustomIcon, getLabel } from '../../../../lib/categories';
import type { DayElementEntry } from '../../../../lib/dayView';
import DayTimesGlide from '../DayTimesGlide';
import InlineGlideTable, { type InlineGlideColumn } from '../../../InlineGlideTable';
import { ContextMenuItem } from '../../../ContextMenu';
import { createDayTimesTheme } from '../../../../lib/glideTheme';
import { doodCellStyle, doodCellText } from '../../../../lib/doodCells';
import { textCell } from '../../../../lib/glideCells';

/**
 * Call Times (item 99/101/107): the single per-category element view on a day.
 * Categories WITH configured call stages render one Day Times Glide grid (ID |
 * Character | SWF | <stage columns>) — editable, the same stage chain the call
 * sheet prints. Categories WITHOUT stages still list their elements in the SAME
 * inline-Glide style, read-only (ID | Name | SWF | Scene | Call), so no
 * breakdown category disappears: the SWF cell carries the element's DOOD-style
 * start/work/finish letter for the day; Scene + Call are its first appearance.
 */
const FALLBACK_EDITABLE = new Set<string>();

/** The stage-less fallback — a read-only inline Glide grid (roadmap 107), so
 *  every category panel reads in the spreadsheet language, never the old HTML
 *  table. */
const FallbackElementGrid: React.FC<{ entries: DayElementEntry[]; onEditCallTimesSettings?: () => void }> = ({ entries, onEditCallTimesSettings }) => {
  const rows = useMemo(() => entries.map(e => ({
    key: e.key,
    id: e.boardId || '',
    name: e.boardId ? `${e.boardId}. ${e.name}` : e.name,
    swf: e.dood || '',
    scene: String(e.firstScene),
    call: e.firstCallTime || '',
  })), [entries]);

  const columns: InlineGlideColumn[] = useMemo(() => [
    { key: 'id', label: 'ID', width: 56, align: 'center' },
    { key: 'name', label: 'Name', width: 220 },
    { key: 'swf', label: 'SWF', width: 56, align: 'center' },
    { key: 'scene', label: 'Scene', width: 70, align: 'center' },
    { key: 'call', label: 'Call', width: 96, align: 'center' },
  ], []);

  const getCellContent = (col: InlineGlideColumn, row: Record<string, string>): GridCell => {
    if (col.key === 'swf') {
      const letter = row.swf;
      return textCell(letter, {
        readonly: true,
        allowOverlay: false,
        align: 'center',
        cursor: 'default',
        displayData: doodCellText(letter),
        themeOverride: { textDark: doodCellStyle(letter).fg },
      });
    }
    if (col.key === 'call') {
      return textCell(row.call, { readonly: true, allowOverlay: false, align: 'center', cursor: 'default', themeOverride: { textDark: '#52525b' } });
    }
    if (col.key === 'scene' || col.key === 'id') {
      return textCell(row[col.key], { readonly: true, allowOverlay: false, align: 'center', cursor: 'default', themeOverride: { textDark: '#a1a1aa' } });
    }
    return textCell(row.name, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#52525b' } });
  };

  return (
    <InlineGlideTable
      columns={columns}
      rows={rows}
      getCellContent={getCellContent}
      onCommit={() => {}}
      editableKeys={FALLBACK_EDITABLE}
      readOnly
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

const CallTimesSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly, actions }) => {
  const settings = useMemo(() => getCallTimeSettings(project), [project]);

  const presentCategories = useMemo(() => {
    const cats: string[] = [];
    if (day.cast.length) cats.push('cast');
    for (const k of Object.keys(day.elements)) if ((day.elements[k] || []).length) cats.push(k);
    // Categories WITH call stages (the editable grids) sort above the
    // stage-less DOOD fallback lists — the people with real call times are the
    // ones you need first.
    const staged = (c: string) => (settings.categoryStages[c] || []).length > 0;
    return [...cats.filter(staged), ...cats.filter(c => !staged(c))];
  }, [day, settings]);

  const categoryLabel = (key: string) => getLabel(key, key, project.categoryLabels);
  const iconFor = (key: string) => {
    const custom = (project.customCategories || []).find(c => c.key === key);
    if (custom?.icon) return getCustomIcon(custom.icon);
    return CAT_ICONS[key] || Clock;
  };

  if (presentCategories.length === 0) {
    return <p className="text-xs text-zinc-400">No elements on this day.</p>;
  }

  return (
    <div className="space-y-4">
      {presentCategories.map(category => {
        const Icon = iconFor(category);
        const stageKeys = settings.categoryStages[category] || [];
        const stageDefs = settings.stages.filter(s => stageKeys.includes(s.key));
        const entries: DayElementEntry[] = category === 'cast' ? day.cast : (day.elements[category] || []);
        return (
          <div key={category} className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
              <Icon className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[11px] font-semibold text-zinc-700">{categoryLabel(category)}</span>
              <span className="text-[10px] text-zinc-400">{entries.length}</span>
              {stageDefs.length > 0
                ? <span className="ml-auto text-[10px] text-zinc-400">7:30 · 730 · -1h</span>
                : <span className="ml-auto text-[10px] text-zinc-400">no call stages — DOOD + first scene</span>}
            </div>
            {stageDefs.length > 0 ? (
              <DayTimesGlide
                day={day}
                category={category}
                patchMeta={patchMeta}
                project={project}
                readOnly={readOnly}
                onEditCallTimesSettings={actions.openCallTimesSettings}
              />
            ) : (
              <FallbackElementGrid entries={entries} onEditCallTimesSettings={actions.openCallTimesSettings} />
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-zinc-400">
        Categories with call stages show the editable chain (override a cell to pin it — amber). Categories without
        stages list each element with its DOOD start/work/finish letter and first scene + call time.
      </p>
    </div>
  );
};

export const CallTimesIcon = Clock;

export default CallTimesSection;
