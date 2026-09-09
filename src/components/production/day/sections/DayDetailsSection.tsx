import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDateLong } from '../../../../lib/utils';
import { getDayType } from '../../../../lib/dayTypes';
import { resolvedLocationName } from '../../../../lib/locations';
import TimeField from '../../../TimeField';
import BreaksNotesSection from './BreaksNotesSection';
import { DAY_ALIGN, DAY_GROUP_ROW, DAY_TABLE, DAY_TABLE_WRAP, DAY_TD, DAY_TH } from '../tableStyles';

const FIELD = 'w-full px-2.5 py-2 bg-white border border-zinc-300 rounded text-xs text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400';

const ValueRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <tr className="even:bg-zinc-50/60">
    <td className={`${DAY_TD} ${DAY_ALIGN.left} text-[11px] font-medium text-zinc-500 w-40`}>{label}</td>
    <td className={`${DAY_TD} ${DAY_ALIGN.left} text-xs text-zinc-800`}>{children}</td>
  </tr>
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
      <div className={DAY_TABLE_WRAP}>
        <table className={DAY_TABLE}>
          <thead>
            <tr className="border-b border-zinc-200">
              <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Field</th>
              <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className={DAY_GROUP_ROW}><td colSpan={2} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Day</td></tr>
            <ValueRow label="Date">{day.date ? formatDateLong(day.date) : '—'}</ValueRow>
            <ValueRow label="Day">{day.chronoDay ? `Day ${day.chronoDay}` : '—'}</ValueRow>
            <ValueRow label="Day type">{dayType ? dayType.label : 'Work'}</ValueRow>
            <ValueRow label="Scenes">{day.scenes.length}</ValueRow>
            <ValueRow label="Cast">{day.cast.length}</ValueRow>
            <ValueRow label="Elements">{Object.values(day.elements).reduce((n, l) => n + l.length, 0)}</ValueRow>
            <ValueRow label="Master location">
              {master ? resolvedLocationName(master.name, master.address, master.place, master.lat, master.lng) : '—'}
            </ValueRow>
            <tr className={DAY_GROUP_ROW}><td colSpan={2} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Timing</td></tr>
            <ValueRow label="General call">
              <TimeField
                value={day.daybreakRow?.daybreakCallTime || '08:00'}
                onChange={v => patchRow({ daybreakCallTime: v })}
                readOnly={readOnly}
                className="w-28"
              />
            </ValueRow>
            <ValueRow label="First call">{day.firstCall || '—'}</ValueRow>
            <ValueRow label="Est. wrap">{day.wrap || '—'}</ValueRow>
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Breaks & notes (call sheet)</div>
        <BreaksNotesSection day={day} patchMeta={patchMeta} patchRow={patchRow} readOnly={readOnly} project={project} dispatch={dispatch} actions={actions} />
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
