import React, { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import type { ScheduleRow } from '../../../../types';
import Checkbox from '../../../Checkbox';
import { CellInput } from '../../../CellInput';
import DurationField from '../../../DurationField';
import { DAY_ALIGN, DAY_GROUP_ROW, DAY_INPUT, DAY_TABLE, DAY_TABLE_WRAP, DAY_TD, DAY_TH } from '../tableStyles';

const FIELD = `${DAY_INPUT} w-full px-2.5 py-2`;

/**
 * Breaks & Notes (call sheet): the stripboard's break/note rows with their
 * call-sheet inclusion ticks and inline label/duration edits, plus the day's
 * free-text announcements. Split out of Day Details so that card stays a
 * compact overview (roadmap 314).
 */
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

  const [note, setNote] = useState(day.meta.note || '');
  useEffect(() => { setNote(day.meta.note || ''); }, [day.meta.note, day.sectionIndex]);

  const commitNote = () => {
    if ((day.meta.note || '') !== note) patchMeta({ note: note.trim() || undefined });
  };

  return (
    <div className="space-y-4">
      {day.breaks.length === 0 && day.notes.length === 0 ? (
        <p className="text-xs text-[color:var(--ui-text-faint)]">No breaks or notes on this day — add them in the Schedule tab.</p>
      ) : (
        <div className={DAY_TABLE_WRAP}>
          <table className={DAY_TABLE}>
            <thead>
              <tr className="border-b border-[color:var(--ui-border)]">
                <th className={`${DAY_TH} w-9 text-center`} title="Include on the call sheet">✓</th>
                <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Label</th>
                <th className={`${DAY_TH} ${DAY_ALIGN.center} w-16`}>Time</th>
                <th className={`${DAY_TH} ${DAY_ALIGN.center} w-24`}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {day.breaks.length > 0 && (
                <tr className={DAY_GROUP_ROW}>
                  <td colSpan={4} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-muted)]">Breaks</td>
                </tr>
              )}
              {day.breaks.map(b => (
                <tr key={b.row.id} className="even:bg-[var(--ui-card-band)]/60">
                  <td className={`${DAY_TD} text-center`}>
                    <Checkbox checked={included(day.meta.includeBreaks, b.row.id)} disabled={readOnly} variant="plain" onChange={on => setIncluded('includeBreaks', allBreakIds, b.row.id, on)} />
                  </td>
                  <td className={`${DAY_TD} ${DAY_ALIGN.left}`}>
                    <CellInput value={b.label} onChange={v => patchRowById(b.row.id, { breakLabel: v })} readOnly={readOnly} noFill />
                  </td>
                  <td className={`${DAY_TD} ${DAY_ALIGN.center} text-xs text-[color:var(--ui-text-muted)] tabular-nums`}>{b.time || '—'}</td>
                  <td className={`${DAY_TD} ${DAY_ALIGN.center}`}>
                    <DurationField value={b.duration} onChange={v => patchRowById(b.row.id, { breakDuration: v })} readOnly={readOnly} className="w-16 justify-center mx-auto" />
                  </td>
                </tr>
              ))}
              {day.notes.length > 0 && (
                <tr className={DAY_GROUP_ROW}>
                  <td colSpan={4} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-muted)]">Notes</td>
                </tr>
              )}
              {day.notes.map(n => (
                <tr key={n.row.id} className="even:bg-[var(--ui-card-band)]/60">
                  <td className={`${DAY_TD} text-center`}>
                    <Checkbox checked={included(day.meta.includeNotes, n.row.id)} disabled={readOnly} variant="plain" onChange={on => setIncluded('includeNotes', allNoteIds, n.row.id, on)} />
                  </td>
                  <td className={`${DAY_TD} ${DAY_ALIGN.left}`}>
                    <CellInput value={n.text} onChange={v => patchRowById(n.row.id, { noteText: v })} readOnly={readOnly} noFill />
                  </td>
                  <td className={`${DAY_TD} ${DAY_ALIGN.center} text-xs text-[color:var(--ui-text-muted)] tabular-nums`}>{n.time || '—'}</td>
                  <td className={`${DAY_TD} ${DAY_ALIGN.center}`}>
                    <DurationField value={n.row.estimatedDuration || 0} onChange={v => patchRowById(n.row.id, { estimatedDuration: v })} readOnly={readOnly} className="w-16 justify-center mx-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label className="block">
        <span className="text-[10px] font-semibold text-[color:var(--ui-text-muted)] uppercase tracking-wider">Day notes / announcements</span>
        <textarea
          value={note}
          readOnly={readOnly}
          onChange={e => setNote(e.target.value)}
          onBlur={commitNote}
          rows={2}
          placeholder="Parking, catering, announcements…"
          className={`${FIELD} mt-1.5 resize-y`}
        />
      </label>
    </div>
  );
};

export const BreaksNotesIcon = ListChecks;

export default BreaksNotesSection;
