import React, { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import Modal, { ModalFooter } from '../../Modal';
import ModalFooterButton from '../../ModalFooterButton';
import Checkbox from '../../Checkbox';
import GroupedSelect, { GroupedSelectItem } from './GroupedSelect';
import { useProject } from '../../../store';
import { patchDayMeta } from '../../../lib/dayMeta';
import { upsertNonShootDate } from '../../../lib/nonShootHelpers';
import type { DayView } from '../../../lib/dayView';
import type { NonShootDate } from '../../../types';
import { DAY_SECTIONS } from './daySectionRegistry';
import { formatDateShort } from '../../../lib/utils';

/**
 * Copy-from-day (D18): pick a source production day, tick the registry
 * sections to copy (with their live summaries), confirm — one undo entry.
 * Sections with an `extract` copy their meta patch; Events merge the source's
 * lists/status into the target's date entry.
 */
export interface CopyDayModalProps {
  target: DayView;
  days: DayView[];
  onClose: () => void;
}

function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function mergeLists(a: NonShootDate['lists'], b: NonShootDate['lists']): NonShootDate['lists'] {
  const out: NonShootDate['lists'] = {};
  for (const src of [a, b]) {
    for (const [status, cats] of Object.entries(src || {})) {
      out[status] ||= {};
      for (const [cat, keys] of Object.entries(cats)) {
        const set = new Set([...(out[status][cat] || []), ...keys]);
        out[status][cat] = Array.from(set);
      }
    }
  }
  return out;
}

const CopyDayModal: React.FC<CopyDayModalProps> = ({ target, days, onClose }) => {
  const { state, dispatch, activeCalendarVersion } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const copyable = DAY_SECTIONS.filter(s => s.copyable);
  const [sourceIndex, setSourceIndex] = useState<number>(() => days.find(d => d.sectionIndex !== target.sectionIndex)?.sectionIndex ?? target.sectionIndex);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(copyable.filter(s => s.extract?.(target) || s.id === 'events').map(s => s.id)));

  const source = days.find(d => d.sectionIndex === sourceIndex) || target;

  const items: GroupedSelectItem[] = useMemo(() => days.map(d => ({
    id: String(d.sectionIndex),
    name: `DAY ${d.chronoDay} · ${formatDateShort(d.date)}`,
    group: `Week of ${formatDateShort(weekStart(d.date))}`,
  })), [days]);

  const toggle = (id: string, on: boolean) => setChecked(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const apply = () => {
    if (!activeVersion || !target.daybreakRow) return;
    dispatch({ type: 'BATCH_START' });

    let patch: Record<string, unknown> = {};
    for (const def of copyable) {
      if (!checked.has(def.id) || !def.extract) continue;
      const part = def.extract(source);
      if (part) patch = { ...patch, ...part };
    }
    if (Object.keys(patch).length > 0) {
      patchDayMeta(dispatch, activeVersion.id, target.daybreakRow, patch as any);
    }

    if (checked.has('events') && activeCalendarVersion) {
      const src = source.event;
      const tgt = target.event;
      if (src && (src.status || src.lists)) {
        const merged: NonShootDate = {
          ...(tgt || {}),
          date: target.date,
          status: tgt?.status || src.status,
          lists: mergeLists(tgt?.lists, src.lists),
        };
        const next = upsertNonShootDate(activeCalendarVersion.nonShootDates, target.date, merged);
        dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: activeCalendarVersion.id, nonShootDates: next } });
      }
    }

    dispatch({ type: 'BATCH_COMMIT' });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Copy from another day — into DAY ${target.chronoDay}`} width="max-w-lg"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={apply} disabled={checked.size === 0 || sourceIndex === target.sectionIndex}>Copy to this day</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-20 shrink-0">Copy from</span>
          <GroupedSelect className="flex-1 min-w-0" items={items} mode="single" selectedIds={[String(sourceIndex)]} onChange={ids => setSourceIndex(Number(ids[0]))} />
        </div>

        <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 divide-y divide-zinc-700/60">
          {copyable.map(def => {
            const on = checked.has(def.id);
            return (
              <label key={def.id} className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-zinc-700/40 transition-colors">
                <Checkbox checked={on} onChange={v => toggle(def.id, v)} theme="dark" variant="plain" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-200">{def.title}</span>
                  <span className="block text-[11px] text-zinc-500 truncate">{def.summary(source) || '—'}</span>
                </span>
              </label>
            );
          })}
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Copies into <span className="text-zinc-200">DAY {target.chronoDay}</span>, replacing the ticked sections' current values (events merge). You can undo this.
        </p>
      </div>
    </Modal>
  );
};

export default CopyDayModal;
