import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { useDaybreakSections } from '../../lib/useDaybreakSections';
import { useDialog } from '../Dialog';
import { Pencil, Trash2, CalendarDays, Flag, MessageSquare } from 'lucide-react';
import SidebarNav, { SidebarNavRow } from '../SidebarNav';
import { ProjectRule, RuleViolation, NonShootDate } from '../../types';
import {
  getDayTypes, getDayType, typeIconComponent, iconForType, DAY_TYPE_BUILTIN_KEYS, DAY_TYPE_BUILTIN_ICONS, slugifyDayType,
} from '../../lib/dayTypes';
import { getNonShootEntryMap, upsertNonShootDate, getTypeListGroups, resolveElementName } from '../../lib/nonShootHelpers';
import { computeSectionViolationMap, rulesRelevantToDay } from '../../lib/rulesEngine';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { DayEventsModal } from './DayEventsModal';
import { AddDayTypeModal, EditDayTypeModal } from './DayTypeModals';

/** Day Breakdown manager — ElementManager-style: sidebar of types (icon + label +
 *  usage count), edit modals (name/icon/color/attachable), delete with confirm.
 *  Edits dispatch SET_DAY_TYPES immediately (one undo entry per modal save);
 *  the reducer prunes statuses whose key vanished. */
export const DayTypesTab: React.FC = () => {
  const { state, dispatch, readOnly } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { productionSections, sectionDateMap, productionChronoDayMap } = useDaybreakSections();
  const dayTypes = useMemo(() => getDayTypes(project), [project]);

  const [selectedKey, setSelectedKey] = useState<string>(dayTypes[0]?.key || '');
  const [eventDate, setEventDate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Tag');
  const [color, setColor] = useState('');
  const [attachable, setAttachable] = useState(true);

  const activeCalendarVersion = project.calendarVersions.find(v => v.id === project.activeCalendarVersionId);
  const nonShootDates = useMemo(() => activeCalendarVersion?.nonShootDates || [], [activeCalendarVersion?.nonShootDates]);

  // Shared day-modal data: entry per date, rule violations per scheduled day,
  // date-scoped rules (same computations the Calendar tab uses).
  const nonShootEntryByDate = useMemo(() => getNonShootEntryMap(nonShootDates), [nonShootDates]);
  const violationMap = useMemo(() => {
    if (!activeVersion) return new Map<string, RuleViolation[]>();
    return computeSectionViolationMap(activeVersion.rows, productionSections, sectionDateMap, project.rules || [], project.scenes, project.castMembers || []);
  }, [activeVersion, productionSections, sectionDateMap, project.rules, project.scenes, project.castMembers]);
  const projectRules = useMemo(() => project.rules || [], [project.rules]);
  const dateRules = (dateKey: string) => rulesRelevantToDay(projectRules, dateKey);

  const categoryLabel = (key: string) => {
    const c = ELEMENT_CATEGORIES.find(x => x.key === key);
    if (c) return getLabel(key, c.label, project.categoryLabels);
    return project.customCategories?.find(x => x.key === key)?.label || key;
  };

  // Day summary for a row: attachment groups (type · category: names) + conflicts.
  const summaryFor = (dateKey: string, statusKey?: string | null) => {
    const entry = nonShootEntryByDate.get(dateKey);
    const groups = getTypeListGroups(entry);
    const parts = groups.map(g => {
      const t = getDayType(project, g.status);
      const names = g.keys.map(k => k === '*' ? 'All' : resolveElementName(k, g.category, project));
      return `${t?.label || g.status} ${categoryLabel(g.category)}: ${names.join(', ')}`;
    });
    const violations = violationMap.get(dateKey) || [];
    return { parts, violations };
  };

  // The Work built-in shows the schedule's actual working days
  // (canonical `useDaybreakSections` computation — never re-derived).
  const productionDays = useMemo(() => {
    const out: { date: string; day: number }[] = [];
    for (const s of productionSections) {
      const d = sectionDateMap.get(s.index);
      const day = productionChronoDayMap.get(s.index);
      if (d) out.push({ date: d, day: day ?? 0 });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [productionSections, sectionDateMap, productionChronoDayMap]);

  const isProductionRow = selectedKey === 'work';

  /** Dates where the type applies: as the day's status OR as a card (a
   *  `lists` group under that type — extra events count like statused days). */
  const appearsOn = (n: NonShootDate, key: string) =>
    n.status === key || Object.values(n.lists?.[key] || {}).some(v => v.length > 0);

  const countFor = (key: string) =>
    key === 'work' ? productionDays.length : nonShootDates.filter(n => appearsOn(n, key)).length;

  const usedDates = useMemo(() => {
    if (!selectedKey || isProductionRow) return [];
    return nonShootDates
      .filter(n => appearsOn(n, selectedKey))
      .map(n => n.date)
      .sort();
  }, [selectedKey, nonShootDates, isProductionRow]);

  const selected = dayTypes.find(t => t.key === selectedKey);
  const SelectedIcon = selected ? typeIconComponent(project.dayTypes, selected.key) : null;

  const rows: SidebarNavRow[] = dayTypes.map(t => ({
    key: t.key,
    label: `${t.label}`,
    icon: typeIconComponent(project.dayTypes, t.key),
    count: countFor(t.key),
    italic: !!DAY_TYPE_BUILTIN_KEYS.has(t.key),
  }));

  const openAdd = () => {
    setName('');
    setIcon('Tag');
    setColor('');
    setAttachable(true);
    setAddOpen(true);
  };

  const openEdit = (key: string) => {
    const t = dayTypes.find(x => x.key === key);
    if (!t) return;
    setName(t.label);
    setIcon(iconForType(project.dayTypes, key) || 'Tag');
    setColor(t.color || '');
    setAttachable(t.attachable !== false);
    setEditKey(key);
  };

  const create = () => {
    const label = name.trim();
    if (!label) return;
    let key = slugifyDayType(label);
    if (DAY_TYPE_BUILTIN_KEYS.has(key) || dayTypes.some(t => t.key === key)) {
      let n = 2;
      while (dayTypes.some(t => t.key === `${key}-${n}`)) n++;
      key = `${key}-${n}`;
    }
    const next: any = { key, label };
    if (color.trim()) next.color = color.trim();
    if (icon && icon !== 'Tag') next.icon = icon;
    if (attachable) next.attachable = true;
    dispatch({ type: 'SET_DAY_TYPES', payload: { dayTypes: [...dayTypes, next] } });
    setAddOpen(false);
    setSelectedKey(key);
  };

  const update = () => {
    const label = name.trim();
    if (!label || !editKey) return;
    dispatch({
      type: 'SET_DAY_TYPES',
      payload: {
        dayTypes: dayTypes.map(t => {
          if (t.key !== editKey) return t;
          const next: any = { ...t, label };
          if (icon && icon !== 'Tag' && icon !== (DAY_TYPE_BUILTIN_ICONS[editKey] || 'Tag')) next.icon = icon;
          else delete next.icon;
          if (color.trim()) next.color = color.trim();
          else delete next.color;
          if (attachable) next.attachable = true;
          else next.attachable = false;
          return next;
        }),
      },
    });
    setEditKey(null);
  };

  const remove = async (key: string) => {
    const t = dayTypes.find(x => x.key === key);
    const used = countFor(key);
    const ok = await dialog.confirm({
      title: `Delete "${t?.label}"?`,
      message: used > 0
        ? `This type is marked on ${used} day${used !== 1 ? 's' : ''}. Those days will fall back to no status (attachments are removed too).`
        : 'This day type will be removed from the calendar.',
      danger: true,
      suppressKey: 'lemon_schedule_dnwa_delete_day_type',
    });
    if (!ok) return;
    dispatch({ type: 'SET_DAY_TYPES', payload: { dayTypes: dayTypes.filter(x => x.key !== key) } });
    if (selectedKey === key) setSelectedKey(dayTypes[0]?.key || '');
  };

  const renderRowActions = (row: SidebarNavRow, active: boolean) => {
    if (DAY_TYPE_BUILTIN_KEYS.has(row.key)) return null;
    const hoverCls = active ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300';
    // Inner actions are spans (role=button) — they live inside the row's own
    // <button> and nested buttons are invalid HTML.
    const actionCls = (extra: string) => `p-0.5 rounded transition-colors cursor-pointer select-none ${extra} ${readOnly ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`;
    return (
      <>
        <span
          role="button"
          tabIndex={-1}
          aria-disabled={readOnly}
          onClick={(e) => { e.stopPropagation(); if (!readOnly) openEdit(row.key); }}
          title="Edit"
          className={actionCls(hoverCls)}
        >
          <Pencil className="w-3 h-3 text-zinc-400" />
        </span>
        <span
          role="button"
          tabIndex={-1}
          aria-disabled={readOnly}
          onClick={async (e) => { e.stopPropagation(); if (!readOnly) await remove(row.key); }}
          className={actionCls(active ? 'hover:bg-red-900/50' : 'hover:bg-red-100')}
        >
          <Trash2 className="w-3 h-3 text-red-400" />
        </span>
      </>
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-zinc-100">
      <SidebarNav
        title="Day Breakdown"
        rows={rows}
        activeKey={selectedKey}
        onSelect={setSelectedKey}
        onAdd={openAdd}
        addLabel="Add Day Type"
        addDisabled={readOnly}
        renderRowActions={renderRowActions}
      />

      <div className="flex-1 flex flex-col h-full px-4 py-4 min-w-0">
        <div className="flex-1 overflow-hidden rounded-xl bg-white border border-zinc-200/80 shadow-sm min-h-0 flex flex-col">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100 shrink-0">
            {SelectedIcon && <SelectedIcon className="w-4 h-4 text-zinc-500" />}
            <span className="w-3 h-3 rounded-full shrink-0 border border-zinc-300" style={selected?.color ? { background: selected.color } : undefined} />
            <span className="text-sm font-semibold text-zinc-800">{selected?.label || 'Day Breakdown'}</span>
            {selected?.color && <span className="text-[10px] font-mono text-zinc-400 uppercase">{selected.color}</span>}
            <span className="text-[11px] text-zinc-400 ml-auto">{isProductionRow ? productionDays.length : usedDates.length} {isProductionRow ? (productionDays.length === 1 ? 'production day' : 'production days') : (usedDates.length === 1 ? 'day' : 'days')}</span>
          </div>
          <div className="flex-1 overflow-y-auto tab-scroll p-4">
            {isProductionRow ? (
              productionDays.length === 0 ? (
                <div className="text-xs text-zinc-400 py-10 text-center">
                  <div className="flex justify-center mb-2"><CalendarDays className="w-5 h-5 text-zinc-300" /></div>
                  No production days yet.
                  <div className="text-[11px] text-zinc-400 mt-1">Add days to the schedule to populate production days.</div>
                </div>
              ) : (
                <ul className="space-y-1">
                  {productionDays.map(pd => {
                    const { parts, violations } = summaryFor(pd.date);
                    return (
                      <li key={pd.date}>
                        <button
                          onClick={() => setEventDate(pd.date)}
                          title="Open day events"
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-zinc-50 border border-zinc-100 text-xs text-zinc-700 hover:bg-zinc-100 hover:border-zinc-200 transition-colors text-left cursor-pointer"
                        >
                          <span className="font-bold">DAY {pd.day}</span>
                          <span className="font-semibold">{new Date(pd.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                          <span className="text-zinc-400 font-mono text-[10px]">{pd.date}</span>
                          {parts.length > 0 && <span className="truncate text-zinc-500 min-w-0">{parts.join(' · ')}</span>}
                          {violations.length > 0 && (
                            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-red-500 shrink-0">
                              <Flag className="w-3 h-3" /> {violations.length}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : usedDates.length === 0 ? (
              <div className="text-xs text-zinc-400 py-10 text-center">
                <div className="flex justify-center mb-2"><CalendarDays className="w-5 h-5 text-zinc-300" /></div>
                No days marked with this type yet.
                <div className="text-[11px] text-zinc-400 mt-1">Right-click a day in the Calendar tab to mark it.</div>
              </div>
            ) : (
              <ul className="space-y-1">
                {usedDates.map(date => {
                  const entry = nonShootEntryByDate.get(date);
                  const { parts, violations } = summaryFor(date, selectedKey);
                  const hasComments = !!entry?.comments?.[selectedKey] && Object.keys(entry.comments[selectedKey]).length > 0;
                  return (
                    <li key={date}>
                      <button
                        onClick={() => setEventDate(date)}
                        title="Open day events"
                        className="w-full flex flex-col gap-1 px-2.5 py-2 rounded-md bg-zinc-50 border border-zinc-100 text-xs text-zinc-700 hover:bg-zinc-100 hover:border-zinc-200 transition-colors text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-semibold">{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                          <span className="text-zinc-400 font-mono text-[10px]">{date}</span>
                          {hasComments && <MessageSquare className="w-3 h-3 text-amber-500" />}
                          {violations.length > 0 && (
                            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-red-500 shrink-0">
                              <Flag className="w-3 h-3" /> {violations.length}
                            </span>
                          )}
                        </span>
                        {parts.length > 0 && (
                          <span className="truncate text-zinc-500">{parts.join(' · ')}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <AddDayTypeModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        name={name}
        onNameChange={setName}
        icon={icon}
        onIconChange={setIcon}
        color={color}
        onColorChange={setColor}
        attachable={attachable}
        onAttachableChange={setAttachable}
        onSubmit={create}
      />
      <EditDayTypeModal
        open={editKey !== null}
        onClose={() => setEditKey(null)}
        name={name}
        onNameChange={setName}
        icon={icon}
        onIconChange={setIcon}
        color={color}
        onColorChange={setColor}
        attachable={attachable}
        onAttachableChange={setAttachable}
        onSubmit={update}
      />
      {eventDate && (
        <DayEventsModal
          dateKey={eventDate}
          violations={violationMap.get(eventDate) || []}
          rules={dateRules(eventDate)}
          initialStatus={isProductionRow ? undefined : selectedKey}
          onClose={() => setEventDate(null)}
        />
      )}
    </div>
  );
};