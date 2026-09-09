import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDateLong } from '../../../../lib/utils';
import { getDayType } from '../../../../lib/dayTypes';
import { resolvedLocationName } from '../../../../lib/locations';

const FIELD = 'w-full px-2.5 py-2 bg-white border border-zinc-300 rounded text-xs text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-zinc-100 last:border-0">
    <span className="text-[11px] font-medium text-zinc-500 shrink-0">{label}</span>
    <span className="text-xs text-zinc-800 text-right truncate">{children}</span>
  </div>
);

const DayDetailsSection: React.FC<DaySectionProps> = ({ day, patchMeta, readOnly, project }) => {
  const [note, setNote] = useState(day.meta.note || '');
  useEffect(() => { setNote(day.meta.note || ''); }, [day.meta.note, day.sectionIndex]);

  const commitNote = () => {
    if ((day.meta.note || '') !== note) patchMeta({ note: note.trim() || undefined });
  };

  const dayType = day.status ? getDayType(project, day.status) : null;
  const master = day.masterLocation;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 px-3">
        <Row label="Date">{day.date ? formatDateLong(day.date) : '—'}</Row>
        <Row label="Day">{day.chronoDay ? `Day ${day.chronoDay}` : '—'}</Row>
        <Row label="Day type">{dayType ? dayType.label : 'Work'}</Row>
        <Row label="General call">{day.callTime || '—'}</Row>
        <Row label="First call">{day.firstCall || '—'}</Row>
        <Row label="Est. wrap">{day.wrap || '—'}</Row>
        <Row label="Scenes">{day.scenes.length} · {day.sums.pages || 0} pgs</Row>
        <Row label="Cast / elements">{day.cast.length} cast · {Object.values(day.elements).reduce((n, l) => n + l.length, 0)} elements</Row>
        <Row label="Master location">
          {master ? resolvedLocationName(master.name, master.address, master.place, master.lat, master.lng) : '—'}
        </Row>
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
    </div>
  );
};

export const DayDetailsIcon = Info;

export default DayDetailsSection;
