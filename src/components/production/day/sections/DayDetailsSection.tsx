import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDateLong } from '../../../../lib/utils';

const FIELD = 'w-full px-2 py-1.5 bg-white border border-zinc-300 rounded text-xs text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400';

const DayDetailsSection: React.FC<DaySectionProps> = ({ day, patchMeta, readOnly }) => {
  const [note, setNote] = useState(day.meta.note || '');
  useEffect(() => { setNote(day.meta.note || ''); }, [day.meta.note, day.sectionIndex]);

  const commitNote = () => {
    if ((day.meta.note || '') !== note) patchMeta({ note: note.trim() || undefined });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center justify-between py-0.5">
          <span className="text-zinc-500">Date</span>
          <span className="text-zinc-800">{day.date ? formatDateLong(day.date) : '—'}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-zinc-500">Day</span>
          <span className="text-zinc-800">{day.chronoDay || '—'}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-zinc-500">General call</span>
          <span className="text-zinc-800">{day.callTime || '—'}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-zinc-500">Est. wrap</span>
          <span className="text-zinc-800">{day.wrap || '—'}</span>
        </div>
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
          className={`${FIELD} mt-1 resize-y`}
        />
      </label>
    </div>
  );
};

export const DayDetailsIcon = Info;

export default DayDetailsSection;
