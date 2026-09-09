import React from 'react';
import type { DaySectionProps } from '../daySectionTypes';
import type { ScheduleRow } from '../../../../types';
import Checkbox from '../../../Checkbox';
import { CellInput } from '../../../CellInput';
import DurationField from '../../../DurationField';
import { DAY_ALIGN, DAY_GROUP_ROW, DAY_TABLE, DAY_TABLE_WRAP, DAY_TD, DAY_TH } from '../tableStyles';

/** The day's breaks/notes: tick for call-sheet inclusion, edit label + duration
 *  inline (the computed start time is shown read-only). */
const BreaksNotesSection: React.FC<DaySectionProps> = ({ day, patchMeta, readOnly, project, dispatch }) => {
  const patchRowById = (rowId: string, updates: Partial<ScheduleRow>) =>
    dispatch({ type: 'UPDATE_ROW', payload: { versionId: project.activeVersionId, rowId, updates } });

  const allBreakIds = day.breaks.map(b => b.row.id);
  const allNoteIds = day.notes.map(n => n.row.id);
  const included = (list: string[] | undefined, id: string) => !list || list.includes(id);
  const setIncluded = (key: 'includeBreaks' | 'includeNotes', allIds: string[], id: string, on: boolean) => {
    const current = day.meta[key] ?? allIds;
    const next = on ? allIds.filter(x => x === id || current.includes(x)) : current.filter(x => x !== id);
    patchMeta({ [key]: next.length === allIds.length ? undefined : next } as any);
  };

  if (day.breaks.length === 0 && day.notes.length === 0) {
    return <p className="text-xs text-zinc-400">No breaks or notes on this day.</p>;
  }

  return (
    <div className={DAY_TABLE_WRAP}>
      <table className={DAY_TABLE}>
        <thead>
          <tr className="border-b border-zinc-200">
            <th className={`${DAY_TH} w-9 text-center`} title="Include on the call sheet">✓</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Label</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.center} w-16`}>Time</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.center} w-24`}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {day.breaks.length > 0 && (
            <tr className={DAY_GROUP_ROW}>
              <td colSpan={4} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Breaks</td>
            </tr>
          )}
          {day.breaks.map(b => (
            <tr key={b.row.id} className="even:bg-zinc-50/60">
              <td className={`${DAY_TD} text-center`}>
                <Checkbox checked={included(day.meta.includeBreaks, b.row.id)} disabled={readOnly} variant="plain" onChange={on => setIncluded('includeBreaks', allBreakIds, b.row.id, on)} />
              </td>
              <td className={`${DAY_TD} ${DAY_ALIGN.left}`}>
                <CellInput value={b.label} onChange={v => patchRowById(b.row.id, { breakLabel: v })} readOnly={readOnly} noFill />
              </td>
              <td className={`${DAY_TD} ${DAY_ALIGN.center} text-xs text-zinc-500 tabular-nums`}>{b.time || '—'}</td>
              <td className={`${DAY_TD} ${DAY_ALIGN.center}`}>
                <DurationField value={b.duration} onChange={v => patchRowById(b.row.id, { breakDuration: v })} readOnly={readOnly} className="w-16 justify-center mx-auto" />
              </td>
            </tr>
          ))}
          {day.notes.length > 0 && (
            <tr className={DAY_GROUP_ROW}>
              <td colSpan={4} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Notes</td>
            </tr>
          )}
          {day.notes.map(n => (
            <tr key={n.row.id} className="even:bg-zinc-50/60">
              <td className={`${DAY_TD} text-center`}>
                <Checkbox checked={included(day.meta.includeNotes, n.row.id)} disabled={readOnly} variant="plain" onChange={on => setIncluded('includeNotes', allNoteIds, n.row.id, on)} />
              </td>
              <td className={`${DAY_TD} ${DAY_ALIGN.left}`}>
                <CellInput value={n.text} onChange={v => patchRowById(n.row.id, { noteText: v })} readOnly={readOnly} noFill />
              </td>
              <td className={`${DAY_TD} ${DAY_ALIGN.center} text-xs text-zinc-500 tabular-nums`}>{n.time || '—'}</td>
              <td className={`${DAY_TD} ${DAY_ALIGN.center}`}>
                <DurationField value={n.row.estimatedDuration || 0} onChange={v => patchRowById(n.row.id, { estimatedDuration: v })} readOnly={readOnly} className="w-16 justify-center mx-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default BreaksNotesSection;
