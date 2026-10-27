import React, { useMemo, useRef, useState } from 'react';
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
const GROUP_FALLBACK = { icon: SlidersHorizontal, label: 'text-[color:var(--ui-text-muted)]', rail: 'border-[color:var(--ui-border-strong)]' };

/** Renders the light inline markdown the writer may use (**bold**, *italic*). */
function InlineText({ text }: { text: string }) {
  const segments = parseInline(text);
  if (segments.length === 1 && !segments[0].bold && !segments[0].italic) return <>{text}</>;
  return (
    <>
      {segments.map((segment, i) =>
        segment.bold ? (
          <strong key={i} className="font-semibold text-[color:var(--ui-text-strong)]">{segment.text}</strong>
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
      <strong className="font-semibold text-[color:var(--ui-text-strong)]">{lead.tag}</strong>
      {!!lead.rest && /^[A-Za-z0-9]/.test(lead.rest) && <span className="text-[color:var(--ui-text-faint)]"> — </span>}
      <InlineText text={lead.rest} />
    </>
  );
}

/** File → Help → What's New: the public CHANGELOG.md, newest first, one day open at a time. */
export default function WhatsNewModal({ onClose }: WhatsNewModalProps) {
  const days = useMemo(() => parseChangelog(changelogRaw), []);
  const [openDate, setOpenDate] = useState<string | null>(() => days[0]?.date ?? null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const toggle = (date: string, el: HTMLElement) => {
    const willOpen = openDate !== date;
    setOpenDate(willOpen ? date : null);
    if (!willOpen) return;
    // The accordion swap shifts the clicked day (the previously open day above
    // folds away) — once the fold settles, make sure the whole row (date +
    // title) clears the sticky strip and sits inside the viewport.
    window.setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const safeTop = cRect.top + (stripRef.current?.offsetHeight ?? 34) + 6;
      let delta = 0;
      if (eRect.top < safeTop) delta = eRect.top - safeTop; // slid under the strip → scroll up
      else if (eRect.bottom > cRect.bottom) delta = Math.min(eRect.bottom - cRect.bottom + 8, eRect.top - safeTop); // below the fold → scroll down, never under the strip
      if (delta !== 0) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        container.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
      }
    }, 220);
  };

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
      <div ref={scrollRef} className="max-h-[65vh] overflow-y-auto">
        <div ref={stripRef} className="sticky top-0 z-10 flex items-center justify-between px-5 py-2 border-b border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)]">
          <span className="text-[11px] text-[color:var(--ui-text-faint)]">Newest first</span>
          <span className="text-[11px] text-[color:var(--ui-text-faint)]">{days.length} days</span>
        </div>
        {days.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[color:var(--ui-text-faint)]">No updates yet.</p>
        ) : (
          days.map(day => {
            const isOpen = openDate === day.date;
            return (
              <div key={day.date} className="border-b border-[color:var(--ui-border)] last:border-b-0">
                <button
                  onClick={e => toggle(day.date, e.currentTarget)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-5 py-2.5 text-left hover:bg-[var(--ui-card-bg)] transition-colors"
                >
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-[color:var(--ui-text-faint)] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="shrink-0 text-sm font-semibold text-[color:var(--ui-text-strong)]">{formatChangelogDate(day.date)}</span>
                  <span className="shrink-0 text-[10px] text-[color:var(--ui-text-faint)]">{day.groups.reduce((n, g) => n + g.items.length, 0)}</span>
                  <span className="flex-1" />
                  {day.title && <span className="min-w-0 truncate text-right text-xs text-[color:var(--ui-text-muted)]">{day.title}</span>}
                </button>
                <div
                  aria-hidden={!isOpen}
                  className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="overflow-hidden">
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
                            <ul className="space-y-1.5 list-disc pl-4 marker:text-[color:var(--ui-text-faint)]">
                              {group.items.map((item, i) => (
                                <li key={i} className="text-sm text-[color:var(--ui-text)] leading-relaxed">
                                  <BulletText text={item} />
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
