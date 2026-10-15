import React, { useMemo, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import changelogRaw from '../../CHANGELOG.md?raw';
import { parseChangelog, formatChangelogDate } from '../lib/changelog';

interface WhatsNewModalProps {
  onClose: () => void;
}

/** File → Help → What's New: the public CHANGELOG.md, newest first, collapsible. */
export default function WhatsNewModal({ onClose }: WhatsNewModalProps) {
  const days = useMemo(() => parseChangelog(changelogRaw), []);
  const [open, setOpen] = useState<Set<string>>(() => new Set(days.length ? [days[0].date] : []));

  const allOpen = days.length > 0 && days.every(day => open.has(day.date));
  const toggle = (date: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(days.map(day => day.date)));

  return (
    <Modal
      open
      onClose={onClose}
      title="What's New"
      icon={<Sparkles className="w-4 h-4" />}
      width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="max-h-[65vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-2 border-b border-zinc-800 bg-zinc-900">
          <span className="text-[11px] text-zinc-500">Newest first</span>
          <button
            onClick={toggleAll}
            className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors"
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
        {days.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">No updates yet.</p>
        ) : (
          days.map(day => {
            const isOpen = open.has(day.date);
            return (
              <div key={day.date} className="border-b border-zinc-800/70 last:border-b-0">
                <button
                  onClick={() => toggle(day.date)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-5 py-2.5 text-left hover:bg-zinc-800/40 transition-colors"
                >
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-zinc-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="text-xs font-semibold text-zinc-200">{formatChangelogDate(day.date)}</span>
                  <span className="text-[10px] text-zinc-500">{day.groups.reduce((n, g) => n + g.items.length, 0)}</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 pl-10 space-y-3">
                    {day.groups.map(group => (
                      <div key={group.heading}>
                        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{group.heading}</h4>
                        <ul className="mt-1.5 space-y-1.5 list-disc pl-4 marker:text-zinc-600">
                          {group.items.map((item, i) => (
                            <li key={i} className="text-sm text-zinc-300 leading-relaxed">{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
