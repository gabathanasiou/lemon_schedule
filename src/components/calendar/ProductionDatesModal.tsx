import React, { useState } from 'react';
import { useProject } from '../../store';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import Modal, { ModalFooter } from '../Modal';
import DateField from '../DateField';
import { toDateKey } from './calendarUtils';
import { addDays, advanceDateCursor, buildNonShootSet } from '../../lib/daybreakUtils';
import { CalendarDays, Check } from 'lucide-react';

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Mon-based weekday (0=Mon..6=Sun) of an ISO date key. */
const monBased = (key: string): number => {
  const js = new Date(key + 'T00:00:00').getDay();
  return js === 0 ? 6 : js - 1;
};

/** Production Dates manager (roadmap 54, MMS-style): prep start, production
 *  start and post end dates + the weekly days-off pattern. The calendar range
 *  spans prep..post; Apply Days Off / Save materialize holidays MMS-style:
 *  across the SCHEDULED span — from production start through the stripboard's
 *  last shooting day (post end only extends the window) — so days off work
 *  even without a post end. Existing statused dates are never overwritten. */
export const ProductionDatesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const sizes = ruleModalSizes();
  const { XSZ, CREM_LABEL, CREM_TEXT, CREM_BODY, CREM_FOOTER_BTN } = sizes;

  const [prepStart, setPrepStart] = useState<string>(activeVersion?.prepStart || '');
  const [prodStart, setProdStart] = useState<string>(activeVersion?.productionStart || '');
  const [postEnd, setPostEnd] = useState<string>(activeVersion?.postEnd || '');
  const [daysOff, setDaysOff] = useState<Set<number>>(new Set(activeVersion?.weeklyDaysOff || [5, 6]));
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
    />
  );

  /** Number of production (non-pinned) stripboard days — the schedule's length. */
  const productionDayCount = () =>
    (activeVersion?.rows || []).filter(r => r.containerId === 1 && r.type === 'DAYBREAK' && !r.pinned).length;

  /** Marks the weekly days-off across the schedule's span (prep start → the
   *  last scheduled day, post end only when later). Returns how many were
   *  added. Existing statused dates are never touched. */
  const applyDaysOff = (): number => {
    if (!activeVersion) return 0;
    const from = prepStart || prodStart;
    if (!from) { setApplyNote('Set at least a production (or prep) start date first.'); return 0; }
    const fromDate = new Date(from + 'T00:00:00');
    if (isNaN(fromDate.getTime())) { setApplyNote('Invalid start date.'); return 0; }

    const nonShootSet = buildNonShootSet(activeVersion.nonShootDates);
    const skip = (d: string) => nonShootSet.has(d) || daysOff.has(monBased(d));

    // Walk the same date cursor the stripboard uses: land N production days
    // from the production anchor, skipping statuses + pattern days.
    const anchor = prodStart || from;
    let cursor = anchor;
    for (let i = 0; i < productionDayCount(); i++) {
      cursor = advanceDateCursor(cursor, skip);
      cursor = addDays(cursor, 1);
    }
    const lastShoot = addDays(cursor, -1);

    let to = lastShoot;
    if (postEnd && !isNaN(new Date(postEnd + 'T00:00:00').getTime()) && postEnd > to) to = postEnd;
    const toDate = new Date(to + 'T00:00:00');

    const current = activeVersion.nonShootDates || [];
    const existing = new Map(current.map(n => [n.date, n]));
    const added: { date: string; status: 'holiday' }[] = [];
    const walk = new Date(fromDate);
    while (walk <= toDate) {
      const key = toDateKey(walk);
      if (daysOff.has(monBased(key)) && !existing.has(key)) {
        added.push({ date: key, status: 'holiday' });
      }
      walk.setDate(walk.getDate() + 1);
    }
    if (added.length === 0) { setApplyNote('No new days off to add — pattern days already have a status.'); return 0; }
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, nonShootDates: [...current, ...added] } });
    setApplyNote(`Marked ${added.length} day${added.length === 1 ? '' : 's'} off (${added[0].date} – ${added[added.length - 1].date}).`);
    return added.length;
  };

  const handleSave = () => {
    if (!activeVersion) return;
    dispatch({ type: 'BATCH_START' });
    applyDaysOff();
    const payload: any = { id: activeVersion.id };
    if (prepStart) payload.prepStart = prepStart; else payload.prepStart = undefined;
    if (prodStart) payload.productionStart = prodStart;
    if (postEnd) payload.postEnd = postEnd; else payload.postEnd = undefined;
    payload.weeklyDaysOff = [...daysOff].sort();
    dispatch({ type: 'UPDATE_VERSION', payload });
    dispatch({ type: 'BATCH_COMMIT' });
    onClose();
  };

  const saveEnabled = !!prodStart || !!prepStart;

  return (
    <Modal open onClose={onClose} title="Production Dates" width="max-w-md"
      footer={
        <ModalFooter>
          <button onClick={onClose} className={`${CREM_FOOTER_BTN} text-zinc-400 font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors`}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!saveEnabled} className={`${CREM_FOOTER_BTN} bg-zinc-800 text-white font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}>
            Save
          </button>
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
              <div key={f.label} className="flex items-center justify-between py-1">
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
              title="Mark the weekly days off as Day Off across the schedule (post end extends the window)"
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
            Days off are marked Day Off from the start through the schedule's last day (post end extends the window); existing statuses are kept.
          </p>
          {applyNote && (
            <p className={`${CREM_LABEL} text-zinc-400 mt-2`}>{applyNote}</p>
          )}
        </div>
      </div>
    </Modal>
  );
};