import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDateLong } from '../../../../lib/utils';
import { getDayType } from '../../../../lib/dayTypes';
import { resolvedLocationName } from '../../../../lib/locations';
import BreaksNotesSection from './BreaksNotesSection';

const FIELD = 'w-full px-2.5 py-2 bg-white border border-zinc-300 rounded text-xs text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400';

/** One label-over-value cell — left aligned, so a row of them reads as a
 *  scannable grid instead of a ragged right-aligned column. */
const Field: React.FC<{ label: string; span?: boolean; children: React.ReactNode }> = ({ label, span, children }) => (
  <div className={`min-w-0 ${span ? 'col-span-2' : ''}`}>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">{label}</div>
    <div className="text-xs text-zinc-800 truncate">{children}</div>
  </div>
);

const DayDetailsSection: React.FC<DaySectionProps> = ({ day, patchMeta, patchRow, readOnly, project, dispatch, actions }) => {
  const [note, setNote] = useState(day.meta.note || '');
  useEffect(() => { setNote(day.meta.note || ''); }, [day.meta.note, day.sectionIndex]);

  const commitNote = () => {
    if ((day.meta.note || '') !== note) patchMeta({ note: note.trim() || undefined });
  };

  const dayType = day.status ? getDayType(project, day.status) : null;
  const master = day.masterLocation;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        <Field label="Date">{day.date ? formatDateLong(day.date) : '—'}</Field>
        <Field label="Day">{day.chronoDay ? `Day ${day.chronoDay}` : '—'}</Field>
        <Field label="Day type">{dayType ? dayType.label : 'Work'}</Field>
        <Field label="General call">{day.callTime || '—'}</Field>
        <Field label="First call">{day.firstCall || '—'}</Field>
        <Field label="Est. wrap">{day.wrap || '—'}</Field>
        <Field label="Scenes">{day.scenes.length}</Field>
        <Field label="Cast">{day.cast.length}</Field>
        <Field label="Elements">{Object.values(day.elements).reduce((n, l) => n + l.length, 0)}</Field>
        <Field label="Master location" span>
          {master ? resolvedLocationName(master.name, master.address, master.place, master.lat, master.lng) : '—'}
        </Field>
      </div>

      <label className="block">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Day notes / announcements</span>
        <textarea
          value={note}
          readOnly={readOnly}
          onChange={e => setNote(e.target.value)}
          onBlur={commitNote}
          rows={3}
          placeholder="Notes for the call sheet — parking, catering, announcements…"
          className={`${FIELD} mt-1.5 resize-y`}
        />
      </label>

      <div>
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Breaks & notes on the call sheet</div>
        <BreaksNotesSection day={day} patchMeta={patchMeta} patchRow={patchRow} readOnly={readOnly} project={project} dispatch={dispatch} actions={actions} />
      </div>
    </div>
  );
};

export const DayDetailsIcon = Info;

export default DayDetailsSection;
