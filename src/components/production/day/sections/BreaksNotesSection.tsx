import React from 'react';
import type { DaySectionProps } from '../daySectionTypes';
import type { ScheduleRow } from '../../../../types';
import Checkbox from '../../../Checkbox';
import { CellInput } from '../../../CellInput';
import DurationField from '../../../DurationField';

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

  const Row: React.FC<{ id: string; includeKey: 'includeBreaks' | 'includeNotes'; allIds: string[]; label: string; time: string; duration: number; onLabel: (v: string) => void; onDuration: (v: number) => void }> =
    ({ id, includeKey, allIds, label, time, duration, onLabel, onDuration }) => (
      <div className="flex items-center gap-2 py-1 border-b border-zinc-100 last:border-0">
        <Checkbox checked={included(day.meta[includeKey], id)} disabled={readOnly} variant="plain" onChange={on => setIncluded(includeKey, allIds, id, on)} />
        <div className="flex-1 min-w-0">
          <CellInput value={label} onChange={onLabel} readOnly={readOnly} noFill />
        </div>
        <span className="text-xs text-zinc-500 tabular-nums w-14 text-right shrink-0">{time || '—'}</span>
        <DurationField value={duration} onChange={onDuration} readOnly={readOnly} className="w-16 justify-end shrink-0" />
      </div>
    );

  return (
    <div className="space-y-2">
      {day.breaks.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">Breaks</div>
          {day.breaks.map(b => (
            <Row key={b.row.id} id={b.row.id} includeKey="includeBreaks" allIds={allBreakIds} label={b.label} time={b.time} duration={b.duration}
              onLabel={v => patchRowById(b.row.id, { breakLabel: v })} onDuration={v => patchRowById(b.row.id, { breakDuration: v })} />
          ))}
        </div>
      )}
      {day.notes.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">Notes</div>
          {day.notes.map(n => (
            <Row key={n.row.id} id={n.row.id} includeKey="includeNotes" allIds={allNoteIds} label={n.text} time={n.time} duration={n.row.estimatedDuration || 0}
              onLabel={v => patchRowById(n.row.id, { noteText: v })} onDuration={v => patchRowById(n.row.id, { estimatedDuration: v })} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BreaksNotesSection;
