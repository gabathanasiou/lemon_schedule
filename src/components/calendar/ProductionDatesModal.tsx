import React, { useState } from 'react';
import { useProject } from '../../store';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import DateField from '../DateField';
import { initialViewFor } from './calendarUtils';
import { computeDaysOffSync } from '../../lib/daysOffSync';
import { CalendarDays, Check } from 'lucide-react';

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Production Dates manager (roadmap 54, MMS-style): prep start, production
 *  start and post end dates + the weekly days-off pattern. The calendar range
 *  spans prep..post; Apply Days Off / Save SYNC the pattern MMS-style: mark
 *  pattern weekdays Day Off across the SCHEDULED span — from production start
 *  through the stripboard's last shooting day (post end only extends the
 *  window) — and remove ONLY the statuses the pattern itself created when a
 *  weekday is unchecked. Hand-made statuses and event cards are never touched. */
export const ProductionDatesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const activeCalendarVersion = project.calendarVersions.find(v => v.id === project.activeCalendarVersionId);

  const sizes = ruleModalSizes();
  const { XSZ, CREM_LABEL, CREM_TEXT, CREM_BODY } = sizes;

  const [prepStart, setPrepStart] = useState<string>(activeCalendarVersion?.prepStart || '');
  const [prodStart, setProdStart] = useState<string>(activeCalendarVersion?.productionStart || '');
  const [postEnd, setPostEnd] = useState<string>(activeCalendarVersion?.postEnd || '');
  const [daysOff, setDaysOff] = useState<Set<number>>(new Set(activeCalendarVersion?.weeklyDaysOff || [5, 6]));
  const [applyNote, setApplyNote] = useState('');

  const toggleDay = (i: number) =>
    setDaysOff(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  const dateField = (value: string, onChange: (v: string) => void) => (
    <DateField
      value={value ? [value] : []}
      onChange={ds => onChange(ds[0] || '')}
      placeholder="Pick a date"
      initialView={initialViewFor(value ? [value] : [], prodStart)}
    />
  );

  /** Number of production (non-pinned) stripboard days — the schedule's length. */
  const productionDayCount = () =>
    (activeVersion?.rows || []).filter(r => r.containerId === 1 && r.type === 'DAYBREAK' && !r.pinned).length;

  /** Syncs the weekly days-off across the schedule's span (prep start → the
   *  last scheduled day, post end only when later). Pure math lives in
   *  `lib/daysOffSync`; this owns the dispatch + the note copy. */
  const applyDaysOff = (): { added: number; removed: number } => {
    if (!activeCalendarVersion) return { added: 0, removed: 0 };
    const result = computeDaysOffSync({
      prepStart,
      productionStart: prodStart,
      postEnd,
      daysOff,
      current: activeCalendarVersion.nonShootDates || [],
      productionDayCount: productionDayCount(),
    });
    if (result.kind === 'no-start') { setApplyNote('Set at least a production (or prep) start date first.'); return { added: 0, removed: 0 }; }
    if (result.kind === 'invalid-start') { setApplyNote('Invalid start date.'); return { added: 0, removed: 0 }; }
    if (result.kind === 'no-change') { setApplyNote('No new days off to add — pattern days already have a status.'); return { added: 0, removed: 0 }; }

    dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: activeCalendarVersion.id, nonShootDates: result.nonShootDates } });
    const parts: string[] = [];
    if (result.added.length > 0) {
      parts.push(`Marked ${result.added.length} day${result.added.length === 1 ? '' : 's'} off (${result.added[0].date} – ${result.added[result.added.length - 1].date})`);
    }
    if (result.removed > 0) {
      parts.push(`removed ${result.removed} day${result.removed === 1 ? '' : 's'} (weekday unchecked)`);
    }
    setApplyNote(`${parts.join('; ')}.`);
    return { added: result.added.length, removed: result.removed };
  };

  const handleSave = () => {
    if (!activeCalendarVersion) return;
    dispatch({ type: 'BATCH_START' });
    applyDaysOff();
    const payload: any = { id: activeCalendarVersion.id };
    if (prepStart) payload.prepStart = prepStart; else payload.prepStart = undefined;
    if (prodStart) payload.productionStart = prodStart;
    if (postEnd) payload.postEnd = postEnd; else payload.postEnd = undefined;
    payload.weeklyDaysOff = [...daysOff].sort();
    dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload });
    dispatch({ type: 'BATCH_COMMIT' });
    onClose();
  };

  const saveEnabled = !!prodStart || !!prepStart;

  return (
    <Modal open onClose={onClose} title="Production Dates" width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={handleSave} disabled={!saveEnabled}>Save</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>
        <div>
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
              <CalendarDays className={`${XSZ} text-zinc-500`} />
              Production Window
            </span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Prep Start', value: prepStart, set: setPrepStart },
              { label: 'Production Start', value: prodStart, set: setProdStart },
              { label: 'Post End', value: postEnd, set: setPostEnd },
            ].map(f => (
              <div key={f.label} data-date-row={f.label} className="flex items-center justify-between py-1">
                <span className={`${CREM_LABEL} text-zinc-300`}>{f.label}</span>
                {dateField(f.value, f.set)}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
              <CalendarDays className={`${XSZ} text-zinc-500`} />
              Days Off
            </span>
            <button
              onClick={applyDaysOff}
              className={`${CREM_LABEL} text-zinc-300 hover:text-white font-medium transition-colors`}
              title="Sync the weekly days off with the schedule (adds pattern days, removes unchecked ones)"
            >
              Apply Days Off
            </button>
          </div>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => toggleDay(i)}
                className={`w-9 h-8 text-[10px] font-semibold rounded transition-colors ${
                  daysOff.has(i)
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className={`${CREM_LABEL} text-zinc-600 mt-2 flex items-center gap-1`}>
            <Check className="w-3 h-3 shrink-0" />
            Days off sync both ways across the schedule (post end extends the window): pattern days are marked Day Off, unchecking a weekday removes only the statuses it created — hand-marked statuses and event cards are kept.
          </p>
          {applyNote && (
            <p className={`${CREM_LABEL} text-zinc-400 mt-2`}>{applyNote}</p>
          )}
        </div>
      </div>
    </Modal>
  );
};