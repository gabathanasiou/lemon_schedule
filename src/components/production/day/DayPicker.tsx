import React, { useMemo, useRef } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { SearchMenu, useRevealRowOnOpen } from '@gabriel/ui-kit';
import type { SearchMenuGroup, SearchMenuItem } from '@gabriel/ui-kit';
import { formatDateShort } from '../../../lib/utils';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';

/**
 * The ONE day selector — a `< [DAY N] >` group used by BOTH the Days page and
 * the call-sheet editor header. The whole group is the trigger (so the panel
 * opens aligned with the group's left edge); prev/next step a day without
 * opening it. `theme` adapts to the light Days page or the dark call-sheet
 * editor; both headers share this component.
 *
 * The menu is the kit's SEARCHABLE + ACCORDION `SearchMenu` (the Report-to
 * pattern, roadmap 324 follow-up), not a bespoke menu: weeks are the
 * categories, every week starts expanded (and can fold) while the current day
 * is scrolled into view, and the field filters by day number,
 * ISO/short/long date, weekday or week. The Reports Designer's View → Report
 * day submenu reuses `DayPickerList` FLAT (a submenu has no field).
 */
export interface DayPickerOption {
  sectionIndex: number;
  chronoDay: number;
  date: string;
  /** Conflict count shown as a red dot in the list (no sidebar day list). */
  conflicts?: number;
}

export interface DayPickerProps {
  options: DayPickerOption[];
  selectedIndex: number;
  onSelect: (sectionIndex: number) => void;
  theme?: 'light' | 'dark';
  disabled?: boolean;
  /** Presence pointer-anchor key for the picker (roadmap 236), stable per
   *  surface — e.g. `toolbar:days:day-picker`. The prev/next arrows anchor as
   *  `<key>:prev` / `<key>:next`. */
  presenceKey?: string;
}

/** Monday-based ISO key of the week a date belongs to (LOCAL — `toISOString`
 *  would shift a UTC+ midnight into the previous day). */
function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Everything a day can be searched by — the SearchMenu matches label, detail,
 *  keywords and the category label. */
function dayKeywords(o: DayPickerOption): string {
  const d = new Date(o.date + 'T00:00:00');
  const long = isNaN(d.getTime())
    ? o.date
    : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const month = isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${o.date} ${long} ${month} week of ${formatDateShort(weekStart(o.date))}`;
}

export interface DayPickerListProps {
  options: DayPickerOption[];
  selectedIndex: number;
  onSelect: (sectionIndex: number) => void;
  /** Dark surface (the Reports Designer's View submenu) — colors the week
   *  headers; the items themselves inherit the enclosing menu's theme. */
  dark?: boolean;
  /** Optional leading whole-range row (Reports Designer, roadmap 198): shown
   *  when no option matches `selectedIndex`; picking it calls `onSelect(-1)`.
   *  The Call Sheet / Days page dropdowns never pass it. */
  allLabel?: string;
}

/** The PLAIN day-list body for the Reports Designer's View → Report day
 *  submenu: week-grouped, every week open (a menu has no search field). The
 *  picker itself uses the kit `SearchMenu` above. */
export const DayPickerList: React.FC<DayPickerListProps> = ({ options, selectedIndex, onSelect, dark = false, allLabel }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const allSelected = allLabel != null && !options.some(o => o.sectionIndex === selectedIndex);

  // The list mounts with the submenu content, so "open" is its mount. The
  // current day is revealed centred BEFORE the menu paints and the list never
  // moves afterwards (the shared preselected-surface contract).
  const reveal = useRevealRowOnOpen({
    open: true,
    block: 'center',
    row: () => listRef.current?.querySelector<HTMLElement>(`[data-day="${selectedIndex}"]`) ?? null,
  });

  const weeks: WeekGroup[] = [];
  for (const o of options) {
    const key = weekStart(o.date);
    let w = weeks.find(x => x.key === key);
    if (!w) { w = { key, days: [] }; weeks.push(w); }
    w.days.push(o);
  }

  return (
    <div ref={listRef} onPointerEnter={reveal.engage} onPointerDown={reveal.engage} className="flex flex-col">
      {allLabel != null && (
        <DropdownItem selected={allSelected} onClick={() => onSelect(-1)}>
          {allLabel}
        </DropdownItem>
      )}
      {weeks.length === 0 && <div className="px-3 py-2 text-xs text-[color:var(--ui-text-muted)]">No production days yet.</div>}
      {weeks.map(week => (
        <React.Fragment key={week.key}>
          <div className={`px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-[color:var(--ui-text-faint)]' : 'text-[color:var(--ui-label)]'}`}>
            Week of {formatDateShort(week.key)}
          </div>
          {week.days.map(d => (
            <div key={d.sectionIndex} data-day={d.sectionIndex}>
              <DropdownItem
                selected={d.sectionIndex === selectedIndex}
                onClick={() => onSelect(d.sectionIndex)}
                trailing={d.conflicts ? (
                  <span className="inline-flex items-center rounded-full bg-red-500 text-white px-1.5 text-[9px] font-bold" title={`${d.conflicts} conflict${d.conflicts !== 1 ? 's' : ''}`}>
                    {d.conflicts}
                  </span>
                ) : undefined}
              >
                DAY {d.chronoDay} · {formatDateShort(d.date)}
              </DropdownItem>
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};

interface WeekGroup {
  key: string;
  days: DayPickerOption[];
}

const DayPicker: React.FC<DayPickerProps> = ({ options, selectedIndex, onSelect, theme = 'light', disabled, presenceKey }) => {
  const selected = options.find(o => o.sectionIndex === selectedIndex);
  const dayById = useMemo(() => new Map(options.map(o => [String(o.sectionIndex), o])), [options]);

  const { items, groups } = useMemo(() => {
    const groups: SearchMenuGroup[] = [];
    const groupByKey = new Map<string, SearchMenuGroup>();
    const items: SearchMenuItem[] = options.map(o => {
      const key = weekStart(o.date);
      if (!groupByKey.has(key)) {
        const group = { key, label: `Week of ${formatDateShort(key)}` };
        groupByKey.set(key, group);
        groups.push(group);
      }
      return {
        id: String(o.sectionIndex),
        label: `DAY ${o.chronoDay}`,
        detail: formatDateShort(o.date),
        group: key,
        keywords: dayKeywords(o),
      };
    });
    return { items, groups };
  }, [options]);

  const step = (delta: number) => {
    if (disabled) return;
    const i = options.findIndex(o => o.sectionIndex === selectedIndex);
    const n = options[i + delta];
    if (n) onSelect(n.sectionIndex);
  };

  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };
  const arrowCls = 'px-1.5 py-1 text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-card-hover)] rounded transition-colors';

  return (
    <SearchMenu
      mode="expandable"
      theme={theme}
      items={items}
      groups={groups}
      /* The kit's accordion browse, ALL weeks open on every open (the old flat
         list stays one glance) while each category can still fold — chevrons
         render because `expandableGroups` is set, `browseExpanded` seeds every
         group expanded. The current day is still scrolled into view (kit
         0.1.172). */
      expandableGroups
      browseExpanded
      selectedId={selected ? String(selected.sectionIndex) : undefined}
      placeholder="Search days…"
      onSelect={item => onSelect(Number(item.id))}
      collapsedWidth="auto"
      expandedWidth={210}
      panelWidth={300}
      panelMinWidth={300}
      maxMenuHeight={380}
      emptyHint="Try a day number, a date, a weekday or a week."
      renderItem={(item, { checked }) => {
        const day = dayById.get(item.id);
        if (!day) return item.label;
        return (
          <>
            <span className="shrink-0 font-semibold">DAY {day.chronoDay}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-[color:var(--ui-text-faint)]">
              {formatDateShort(day.date)}
            </span>
            {day.conflicts ? (
              <span
                className="inline-flex shrink-0 items-center rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white"
                title={`${day.conflicts} conflict${day.conflicts !== 1 ? 's' : ''}`}
              >
                {day.conflicts}
              </span>
            ) : null}
            {checked && <Check className="ui-icon h-3.5 w-3.5 shrink-0" aria-hidden />}
          </>
        );
      }}
      renderTrigger={({ toggle }) => (
        <span
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-disabled={disabled || undefined}
          aria-label={`Select day${selected ? `, currently DAY ${selected.chronoDay}` : ''}`}
          data-presence-anchor={presenceKey}
          data-mode={theme}
          onClick={() => { if (!disabled) toggle(); }}
          onKeyDown={e => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
          }}
          className={`inline-flex items-center rounded border border-[color:var(--ui-border-strong)] bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] shadow-sm ${disabled ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
        >
          <span
            role="button"
            aria-label="Previous day"
            data-presence-anchor={presenceKey ? `${presenceKey}:prev` : undefined}
            className={arrowCls}
            onClick={e => { stop(e); step(-1); }}
            onPointerDown={stop}
          >
            <ChevronLeft className="w-4 h-4" />
          </span>
          <span className="px-2 text-xs font-bold whitespace-nowrap text-[color:var(--ui-text)]">
            DAY {selected?.chronoDay ?? '—'}
          </span>
          <span
            role="button"
            aria-label="Next day"
            data-presence-anchor={presenceKey ? `${presenceKey}:next` : undefined}
            className={arrowCls}
            onClick={e => { stop(e); step(1); }}
            onPointerDown={stop}
          >
            <ChevronRight className="w-4 h-4" />
          </span>
        </span>
      )}
    />
  );
};

export default DayPicker;
