import React, { useMemo, useState } from 'react';
import { Bug, ChevronRight, SlidersHorizontal, Sparkles } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import changelogRaw from '../../CHANGELOG.md?raw';
import { parseChangelog, formatChangelogDate, parseInline, parseLeadTag } from '../lib/changelog';

interface WhatsNewModalProps {
  onClose: () => void;
}

/**
 * Group presentation (roadmap 260) — the colour rail + icon + tinted label is
 * what makes Features / Bug fixes / Changes readable apart at a glance, on
 * every existing day too.
 */
const GROUP_STYLES: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; rail: string }> = {
  'Features': { icon: Sparkles, label: 'text-emerald-400', rail: 'border-emerald-400/30' },
  'Bug fixes': { icon: Bug, label: 'text-red-400', rail: 'border-red-400/30' },
  'Changes': { icon: SlidersHorizontal, label: 'text-blue-400', rail: 'border-blue-400/30' },
};
const GROUP_FALLBACK = { icon: SlidersHorizontal, label: 'text-zinc-400', rail: 'border-zinc-600/40' };

/** Renders the light inline markdown the writer may use (**bold**, *italic*). */
function InlineText({ text }: { text: string }) {
  const segments = parseInline(text);
  if (segments.length === 1 && !segments[0].bold && !segments[0].italic) return <>{text}</>;
  return (
    <>
      {segments.map((segment, i) =>
        segment.bold ? (
          <strong key={i} className="font-semibold text-zinc-100">{segment.text}</strong>
        ) : segment.italic ? (
          <em key={i}>{segment.text}</em>
        ) : (
          <React.Fragment key={i}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * A short bold lead (`**Schedule** — …`) keeps its emphasis and gets a plain
 * dash before the note where one reads — no boxes; the emphasis alone is the
 * separation (roadmap 260).
 */
function BulletText({ text }: { text: string }) {
  const lead = parseLeadTag(text);
  if (!lead) return <InlineText text={text} />;
  return (
    <>
      <strong className="font-semibold text-zinc-100">{lead.tag}</strong>
      {!!lead.rest && /^[A-Za-z0-9]/.test(lead.rest) && <span className="text-zinc-500"> — </span>}
      <InlineText text={lead.rest} />
    </>
  );
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
                  <span className="shrink-0 text-sm font-semibold text-zinc-100">{formatChangelogDate(day.date)}</span>
                  <span className="shrink-0 text-[10px] text-zinc-500">{day.groups.reduce((n, g) => n + g.items.length, 0)}</span>
                  <span className="flex-1" />
                  {day.title && <span className="min-w-0 truncate text-right text-sm text-zinc-400">{day.title}</span>}
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 pl-10 space-y-3.5">
                    {day.groups.map(group => {
                      const style = GROUP_STYLES[group.heading] ?? GROUP_FALLBACK;
                      const Icon = style.icon;
                      return (
                        <div key={group.heading} className={`border-l-2 pl-3 ${style.rail}`}>
                          <div className={`flex items-center gap-1.5 mb-1.5 ${style.label}`}>
                            <Icon className="w-3 h-3 shrink-0" />
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider">{group.heading}</h4>
                          </div>
                          <ul className="space-y-1.5 list-disc pl-4 marker:text-zinc-600">
                            {group.items.map((item, i) => (
                              <li key={i} className="text-sm text-zinc-300 leading-relaxed">
                                <BulletText text={item} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
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
