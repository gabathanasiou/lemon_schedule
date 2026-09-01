import React, { useEffect, useMemo, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate, ProjectRule, RuleViolation } from '../../types';
import { NON_SHOOT_ALL, getNonShootEntryMap, upsertNonShootDate } from '../../lib/nonShootHelpers';
import { getMarkableDayTypes, getDayType, typeIconComponent } from '../../lib/dayTypes';
import { DD_CHIP_TRIGGER_CLASS } from '../../lib/dropdown';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { usePortalTarget } from '../../lib/popoutTarget';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import { RULE_TYPE_META, RULE_TYPES } from '../rules/ruleMeta';
import { RuleCard } from '../rules/RuleCard';
import { RuleEditorPanel } from '../rules/RuleEditorPanel';
import { CardSection } from '@gabriel/ui-kit';
import { ItemRow, ITEM_ROW_BODY_WRAP } from '../cards/ItemRow';
import { removeItemsFrom, setNote, computeDayTypeCards } from '../../lib/events';
import { ELEMENT_CATEGORIES, getLabel, CAT_ICONS, getCustomIcon } from '../../lib/categories';
import { EventAdderModal } from './EventAdderModal';
import { EventModal } from './EventModal';
import Button from '../Button';
import { Plus, X, ChevronDown, Link2, Sun, Flag } from 'lucide-react';

interface DayEventsModalProps {
  dateKey: string;
  violations?: RuleViolation[];
  /** Rules whose `dates` include this date (DATE_RESTRICTION + dated MAX_HOURS/TIME_WINDOW). */
  rules?: ProjectRule[];
  /** Event type to focus on open (card double-click). */
  initialStatus?: string;
  /** Rule to open in the rule editor on mount (rule-card double-click) —
   *  opens on the Rules tab with the editor ready. */
  initialRule?: ProjectRule | null;
  onClose: () => void;
}

type NestedModal =
  | { kind: 'event'; status: string; category: string; refKey: string }
  | { kind: 'rule'; rule: ProjectRule | null }
  | { kind: 'adder' };

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** The day-centric events editor (roadmap 45) — the shared shell item 46
 *  reuses. Every mutation applies IMMEDIATELY (undoable): one collapsible
 *  CardSection per event type with a row per element (cast as "1. FISHERMAN",
 *  whole-category marks as "All <Category>"), row click opens the shared
 *  single-event editor, inline per-element notes, ✕ removes the group.
 *  "+ Add Event" opens the shared adder pre-targeted to this day. The
 *  day-status picker dispatches immediately too — the footer is just Done.
 *  Read-only Conflicts + date-scoped Rules (per-type cards) complete it. */
export const DayEventsModal: React.FC<DayEventsModalProps> = ({ dateKey, violations, rules = [], initialStatus, initialRule, onClose }) => {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const portalTarget = usePortalTarget();

  const sizes = ruleModalSizes();
  const { XSZ, CREM_BODY, CREM_LABEL, CREM_TEXT } = sizes;

  // Live from the store (the modal mutates directly — no staged save).
  const activeCalendarVersion = state.present.calendarVersions.find(v => v.id === state.present.activeCalendarVersionId);
  const nonShootDates = useMemo(() => activeCalendarVersion?.nonShootDates || [], [activeCalendarVersion?.nonShootDates]);
  const entryByDate = useMemo(() => getNonShootEntryMap(nonShootDates), [nonShootDates]);
  const entry = entryByDate.get(dateKey);

  const dayTypes = useMemo(() => getMarkableDayTypes(project), [project]);
  const [statusKey, setStatusKey] = useState<string | null>(initialStatus ?? entry?.status ?? null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const activeType = statusKey ? getDayType(project, statusKey) : undefined;

  // Category labels + icons — each element row shows its category (a type
  // card mixes cast + props + wardrobe, so the origin must be visible).
  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);
  const catIcon = (category: string, className: string) => {
    const custom = (project.customCategories || []).find(c => c.key === category);
    if (custom) {
      const I = getCustomIcon(custom.icon || 'Tag');
      return <I className={className} />;
    }
    const I = CAT_ICONS[category];
    return I ? <I className={className} /> : null;
  };

  // Event-type cards: one per type, rows = the elements marked on this day.
  const typeCards = useMemo(
    () => computeDayTypeCards(project, entry),
    [project, entry],
  );
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const toggleType = (status: string) => {
    setCollapsedTypes(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };
  /** Row whose note input is open (inline add/edit — Enter/blur commits). */
  const [noteFor, setNoteFor] = useState<{ status: string; category: string; refKey: string } | null>(null);

  // Rules grouped by type, in the manager's rule-type order — one CardSection
  // per type (the element events manager's rules view, shared).
  const rulesByType = useMemo(() => {
    const map = new Map<string, ProjectRule[]>();
    for (const r of rules) {
      const list = map.get(r.type);
      if (list) list.push(r); else map.set(r.type, [r]);
    }
    return [...map.entries()].sort(
      (a, b) => (RULE_TYPES as string[]).indexOf(a[0]) - (RULE_TYPES as string[]).indexOf(b[0]),
    );
  }, [rules]);
  const [collapsedRuleTypes, setCollapsedRuleTypes] = useState<Set<string>>(new Set());
  const toggleRuleType = (type: string) => {
    setCollapsedRuleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  // Tabbed layout (per-open, not persisted): one section at a time.
  const [activeTab, setActiveTab] = useState<'events' | 'conflicts' | 'rules'>(initialRule ? 'rules' : 'events');

  // Rule editor state: null closed, { rule: undefined } = add, { rule } = edit.
  const [ruleEditor, setRuleEditor] = useState<{ rule?: ProjectRule | null } | null>(initialRule ? { rule: initialRule } : null);
  // Radix stacks dialogs by open ORDER — mounting the nested modal in the same
  // commit as the day modal corrupts the stack (both get aria-hidden). Open it
  // one commit later so the day modal registers first.
  const [ruleModalReady, setRuleModalReady] = useState(!initialRule);
  useEffect(() => {
    if (initialRule) setRuleModalReady(true);
  }, [initialRule]);

  const [nested, setNested] = useState<NestedModal | null>(null);
  const [nestedReady, setNestedReady] = useState(false);
  useEffect(() => {
    if (nested) setNestedReady(true);
  }, [nested]);

  const openRuleEditor = (rule?: ProjectRule | null) => {
    setRuleEditor({ rule });
  };

  /** The day status applies IMMEDIATELY (undoable) — nothing is staged. */
  const changeStatus = (key: string | null) => {
    setStatusKey(key);
    if (!activeCalendarVersion) return;
    const base = entryByDate.get(dateKey);
    const next: NonShootDate = {
      ...(base || { date: dateKey }),
      date: dateKey,
      ...(key ? { status: key } : {}),
    };
    if (!key) delete next.status;
    dispatch({
      type: 'UPDATE_CALENDAR_VERSION',
      payload: { id: activeCalendarVersion.id, nonShootDates: upsertNonShootDate(nonShootDates, dateKey, next) },
    });
  };

  /** Removes ONE element's group of a type (the day's whole-category mark
   *  when `all`). A fully-emptied entry prunes the date row. */
  const removeGroup = (status: string, category: string, refKey: string, all: boolean) => {
    if (readOnly || !activeCalendarVersion) return;
    const next = removeItemsFrom(entryByDate.get(dateKey), status, category, all ? [NON_SHOOT_ALL] : [refKey]);
    dispatch({
      type: 'UPDATE_CALENDAR_VERSION',
      payload: { id: activeCalendarVersion.id, nonShootDates: upsertNonShootDate(nonShootDates, dateKey, next ?? { date: dateKey }) },
    });
  };

  /** Inline note save — `comments[status][category][refKey]` ('*' for the
   *  whole-category mark); empty text clears it. */
  const commitNote = (status: string, category: string, refKey: string, text: string) => {
    if (!activeCalendarVersion) return;
    const base = entryByDate.get(dateKey) || { date: dateKey };
    dispatch({
      type: 'UPDATE_CALENDAR_VERSION',
      payload: { id: activeCalendarVersion.id, nonShootDates: upsertNonShootDate(nonShootDates, dateKey, { ...base, comments: setNote(base.comments, status, category, refKey, text) }) },
    });
  };

  const StatusIcon = (key: string | null, sizeClass: string = XSZ, color?: string) => {
    const Icon = typeIconComponent(project.dayTypes, key);
    return <Icon className={sizeClass} style={color ? { color } : undefined} />;
  };

  return (
    <>
    <Modal open onClose={onClose} title={`Day Events — ${formatDateLabel(dateKey)}`} width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>
        {/* Day status + section tabs — one row, status always settable */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-800 mb-3">
          <div className="flex items-center gap-2.5">
          <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
            <Sun className={`${XSZ} text-zinc-500`} />
            Day Status
          </span>
            <DropdownMenu
              open={statusMenuOpen}
              onClose={() => setStatusMenuOpen(false)}
              onOpenChange={setStatusMenuOpen}
              width="w-52"
              theme="dark"
              trigger={
                <button type="button" className={`${DD_CHIP_TRIGGER_CLASS} text-xs cursor-pointer`}>
                  {StatusIcon(statusKey, XSZ, activeType?.color)}
                  <span className="truncate">{activeType?.label || 'None'}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                </button>
              }
            >
              <DropdownItem onClick={() => { changeStatus(null); setStatusMenuOpen(false); }} icon={<X className="w-3.5 h-3.5" />}>
                None
              </DropdownItem>
              <DropdownDivider />
              {dayTypes.map(t => (
                <DropdownItem key={t.key} onClick={() => { changeStatus(t.key); setStatusMenuOpen(false); }}
                  icon={StatusIcon(t.key, 'w-3.5 h-3.5', t.color)}
                >
                  <span className="text-zinc-200">{t.label}</span>
                </DropdownItem>
              ))}
            </DropdownMenu>
          </div>
          <div className="flex border border-zinc-800 rounded p-0.5 bg-zinc-950 w-fit">
            {([
              { key: 'events' as const, label: 'Events' },
              { key: 'conflicts' as const, label: 'Conflicts' },
              { key: 'rules' as const, label: 'Rules' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${activeTab === t.key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'events' && (
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
              <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                <Link2 className={`${XSZ} text-zinc-400`} />
                Events
              </span>
              <Button theme="dark" variant="subtle" className="flex items-center gap-1" onClick={() => setNested({ kind: 'adder' })} disabled={readOnly}>
                <Plus className="w-3 h-3" /> Add Event
              </Button>
            </div>

            {typeCards.length === 0 ? (
              <p className={`${CREM_LABEL} text-zinc-600 italic`}>No events on this day — add an event.</p>
            ) : (
              <div className="space-y-2">
                {typeCards.map(({ status, rows }) => {
                  const def = getDayType(project, status);
                  const Icon = typeIconComponent(project.dayTypes, status);
                  const collapsed = collapsedTypes.has(status);
                  return (
                    <CardSection
                      key={status}
                      icon={<Icon className="w-3.5 h-3.5 shrink-0" style={def?.color ? { color: def.color } : undefined} />}
                      title={def?.label || status}
                      count={`${rows.length} ${rows.length === 1 ? 'element' : 'elements'}`}
                      collapsed={collapsed}
                      onToggle={() => toggleType(status)}
                      dataProps={{ 'data-event-card': status }}
                    >
                      {rows.map(row => (
                        <ItemRow
                          key={`${row.category}|${row.refKey}`}
                          onClick={() => setNested({ kind: 'event', status, category: row.category, refKey: row.refKey })}
                          titleAttr={`Edit ${row.name}'s ${def?.label || status} event on this day`}
                          titleClass="w-56 shrink-0 text-left text-[11px] font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors cursor-pointer flex items-center gap-1.5"
                          bodyClass={ITEM_ROW_BODY_WRAP}
                          title={
                            <>
                              {catIcon(row.category, 'w-3.5 h-3.5 shrink-0 text-zinc-500')}
                              {!row.all && (
                                <span className="shrink-0 text-[9px] uppercase tracking-wider text-zinc-500">
                                  {categoryLabelLookup[row.category] || row.category}
                                </span>
                              )}
                              <span className="truncate">{row.name}</span>
                            </>
                          }
                          dataProps={{ 'data-event-row': `${status}|${row.category}|${row.refKey}` }}
                          trailing={!readOnly && (
                            <button
                              onClick={() => removeGroup(status, row.category, row.refKey, row.all)}
                              aria-label={`Remove ${row.name} from this day`}
                              title={`Remove ${row.name}'s ${def?.label || status} event`}
                              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        >
                          {noteFor && noteFor.status === status && noteFor.category === row.category && noteFor.refKey === row.refKey && !readOnly ? (
                            <input
                              autoFocus
                              type="text"
                              defaultValue={row.comment || ''}
                              placeholder="Add a note — e.g. 'Traveling from Singapore'"
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => { setNoteFor(null); commitNote(status, row.category, row.refKey, e.target.value); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') { setNoteFor(null); }
                              }}
                              className={`${CREM_TEXT} px-2 py-0.5 rounded bg-zinc-950 border border-transparent hover:border-zinc-600 focus:border-zinc-500 transition-colors outline-none placeholder-zinc-600 text-[11px] [field-sizing:content] min-w-60 cursor-text`}
                            />
                          ) : row.comment ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setNoteFor({ status, category: row.category, refKey: row.refKey }); }}
                              title={readOnly ? row.comment : 'Edit note'}
                              className="inline-flex max-w-full items-baseline gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-text"
                            >
                              <span className="text-zinc-500 shrink-0 font-medium">Notes:</span>
                              <span className="truncate italic">"{row.comment}"</span>
                            </button>
                          ) : !readOnly ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setNoteFor({ status, category: row.category, refKey: row.refKey }); }}
                              className="text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors cursor-text"
                            >
                              Add note
                            </button>
                          ) : null}
                        </ItemRow>
                      ))}
                    </CardSection>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'conflicts' && (
          <div className="mb-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2.5">
              <span className={`${CREM_LABEL} text-red-400/80 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                <Flag className={`${XSZ} text-red-400`} />
                Conflicts
              </span>
            </div>
            {!violations || violations.length === 0 ? (
              <p className={`${CREM_LABEL} text-zinc-600 italic`}>No conflicts on this day.</p>
            ) : (
              <ul className="space-y-1.5">
                {violations.map(v => (
                  <li key={v.ruleId} className="text-[11px] leading-snug">
                    <span className="text-red-300 font-medium">{v.message}</span>
                    {v.detail && <span className="text-zinc-500"> — {v.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="mb-1">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2.5">
              <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                <Sun className={`${XSZ} text-zinc-500`} />
                Rules
              </span>
              <Button theme="dark" variant="subtle" className="flex items-center gap-1" onClick={() => openRuleEditor()}>
                <Plus className="w-3 h-3" /> Add rule
              </Button>
            </div>
            {rules.length === 0 ? (
              <p className={`${CREM_LABEL} text-zinc-600 italic`}>No rules on this day.</p>
            ) : (
              <div className="space-y-2">
                {rulesByType.map(([type, rs]) => {
                  const meta = RULE_TYPE_META[type];
                  const Icon = meta.icon;
                  return (
                    <CardSection
                      key={type}
                      icon={<Icon className={`w-3.5 h-3.5 shrink-0 ${meta.chipIcon}`} />}
                      title={meta.label}
                      count={`${rs.length} ${rs.length === 1 ? 'rule' : 'rules'}`}
                      collapsed={collapsedRuleTypes.has(type)}
                      onToggle={() => toggleRuleType(type)}
                      dataProps={{ 'data-rule-type': type }}
                    >
                      {rs.map(r => (
                        <RuleCard
                          key={r.id}
                          rule={r}
                          castMembers={project.castMembers || []}
                          theme="dark"
                          compact
                          onEdit={() => openRuleEditor(r)}
                          onDelete={readOnly ? undefined : () => dispatch({ type: 'DELETE_RULE', payload: r.id })}
                        />
                      ))}
                    </CardSection>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </Modal>

    {nested?.kind === 'event' && nestedReady && (
      <EventModal
        dateKey={dateKey}
        statusKey={nested.status}
        category={nested.category}
        elementKey={nested.refKey}
        onClose={() => setNested(null)}
      />
    )}
    {nested?.kind === 'adder' && nestedReady && (
      <EventAdderModal
        date={dateKey}
        status={statusKey || undefined}
        onClose={() => setNested(null)}
      />
    )}

    {ruleEditor && ruleModalReady && (
      <Modal open onClose={() => setRuleEditor(null)} title={ruleEditor.rule ? 'Edit Rule' : 'Add Rule'} width="max-w-lg">
        <div className="p-6">
          <RuleEditorPanel
            bare
            initial={ruleEditor.rule ?? null}
            preseedDateKey={dateKey}
            scenes={project.scenes}
            castMembers={project.castMembers || []}
            anchoredKeys={undefined}
            productionStart={activeCalendarVersion?.productionStart}
            onSave={(rules) => {
              for (const r of rules) {
                // Multi-ID expansion: the FIRST rule keeps the edited rule's
                // id (UPDATE), the extras are NEW rules (ADD) — decide per
                // rule, never once for the batch.
                dispatch({ type: ruleEditor?.rule && r.id === ruleEditor.rule.id ? 'UPDATE_RULE' : 'ADD_RULE', payload: r });
              }
              setRuleEditor(null);
            }}
            onDelete={() => {
              if (ruleEditor?.rule) dispatch({ type: 'DELETE_RULE', payload: ruleEditor.rule.id });
              setRuleEditor(null);
            }}
            onClose={() => setRuleEditor(null)}
          />
        </div>
      </Modal>
    )}
    </>
  );
};
