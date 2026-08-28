import React, { useEffect, useMemo, useState } from 'react';
import { useProject } from '../../store';
import { useDaybreakSections } from '../../lib/useDaybreakSections';
import { NonShootDate, ProjectRule, RuleViolation } from '../../types';
import { computeSectionViolationMap } from '../../lib/rulesEngine';
import { computeElementEvents, ElementEventGroup } from '../../lib/elementEvents';
import { getCategoryElements, elementMatchId, elementKey } from '../../lib/elements';
import { getNonShootEntryMap, upsertNonShootDate, isAllKeys, resolveElementName } from '../../lib/nonShootHelpers';
import { removeItemsFrom, setNote, typeRankOf, statusLabel } from '../../lib/events';
import { getDayType, typeIconComponent } from '../../lib/dayTypes';
import { anchoredKeysFor } from '../../lib/elementLinks';
import Modal, { ModalFooter } from '../Modal';
import Button from '../Button';
import { EventAdderModal } from '../calendar/EventAdderModal';
import { EventModal } from '../calendar/EventModal';
import { RuleCard } from '../rules/RuleCard';
import { RuleEditorPanel } from '../rules/RuleEditorPanel';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { ChevronDown, ChevronRight, CalendarDays, Plus, Pencil, X, MessageSquare, Flag, Clock4 } from 'lucide-react';

interface ElementEventsModalProps {
  category: string;
  /** Buffered row identity (elementKey snapshot). */
  rowKey: string;
  rowId: string;
  rowName: string;
  onClose: () => void;
}

type NestedModal =
  | { kind: 'event'; date: string; status: string }
  | { kind: 'rule'; rule: ProjectRule | null }
  | { kind: 'adder' };

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The element events manager (roadmap 46) — opened from an Element Manager
 *  row. One collapsible card per day type (Travel / Hold / Rehearsal…), each
 *  with the dates the element has that event on — only this element, its
 *  comment inline, Edit/Remove per group. Plus the element's Violations and
 *  Rules (Add Rule pre-scoped to the element). Add Event picks a date in a
 *  collapsed calendar and opens the shared day editor pre-seeded. */
export function ElementEventsModal({ category, rowKey, rowId, rowName, onClose }: ElementEventsModalProps) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const { productionSections, sectionDateMap, activeVersion } = useDaybreakSections();
  const sizes = ruleModalSizes();
  const { CREM_BODY, CREM_LABEL, CREM_TEXT } = sizes;

  // Canonical match key (cast = Board ID, others = exact name) — resolve from
  // the stored element, falling back to the buffered row's own values (new,
  // unsaved rows have no stored element yet).
  const identity = useMemo(() => {
    const stored = getCategoryElements(project, category).find(e => elementKey(e) === rowKey);
    return {
      refKey: stored ? elementMatchId(stored, category) : (category === 'cast' ? rowId : (rowName || rowKey)),
      name: resolveElementName(
        stored ? elementMatchId(stored, category) : (category === 'cast' ? rowId : (rowName || rowKey)),
        category,
        project,
      ),
    };
  }, [project, category, rowKey, rowId, rowName]);

  const isCast = category === 'cast';

  // Type cards: dates grouped by day type, in manager order.
  const nonShootDates = useMemo(() => activeVersion?.nonShootDates || [], [activeVersion?.nonShootDates]);
  const entryByDate = useMemo(() => getNonShootEntryMap(nonShootDates), [nonShootDates]);

  // Same shared computation the Calendar + Day Types manager use.
  const violationMap = useMemo(() => {
    if (!activeVersion) return new Map<string, RuleViolation[]>();
    return computeSectionViolationMap(
      activeVersion.rows, productionSections, sectionDateMap,
      project.rules || [], project.scenes, project.castMembers || [],
    );
  }, [activeVersion, productionSections, sectionDateMap, project.rules, project.scenes, project.castMembers]);

  const data = useMemo(
    () => computeElementEvents(nonShootDates, identity.refKey, project.rules || [], violationMap),
    [nonShootDates, identity.refKey, project.rules, violationMap],
  );

  // Type cards: dates grouped by day type, in manager order.
  const typeCards = useMemo(() => {
    const byStatus = new Map<string, { date: string; groups: ElementEventGroup[] }[]>();
    for (const [date, groups] of data.attachments) {
      for (const g of groups) {
        const row = { date, groups: groups.filter(x => x.status === g.status) };
        const list = byStatus.get(g.status);
        if (list) {
          if (!list.some(r => r.date === date)) list.push(row);
        } else {
          byStatus.set(g.status, [row]);
        }
      }
    }
    return [...byStatus.entries()]
      .sort((a, b) => typeRankOf(project, a[0]) - typeRankOf(project, b[0]))
      .map(([status, rows]) => ({ status, rows: rows.sort((a, b) => a.date.localeCompare(b.date)) }));
  }, [data.attachments, project]);

  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const toggleType = (status: string) => {
    setCollapsedTypes(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };
  const [rulesCollapsed, setRulesCollapsed] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  /** Date whose note input is open (inline add/edit — Enter/blur commits). */
  const [noteDate, setNoteDate] = useState<string | null>(null);

  // Nested modals (Radix stacks dialogs by open order — mounting in the same
  // commit corrupts the stack) open one commit later.
  const [nested, setNested] = useState<NestedModal | null>(null);
  const [nestedReady, setNestedReady] = useState(false);
  useEffect(() => {
    if (nested) setNestedReady(true);
  }, [nested]);

  const openAddEvent = () => setNested({ kind: 'adder' });

  const removeGroup = (date: string, status: string, groups: ElementEventGroup[]) => {
    if (readOnly) return;
    let entry = entryByDate.get(date);
    for (const g of groups) {
      if (isAllKeys(g.keys)) continue;
      entry = removeItemsFrom(entry, g.status, g.category, [identity.refKey]);
    }
    if (!activeVersion || !entry) return;
    dispatch({
      type: 'UPDATE_VERSION',
      payload: { id: activeVersion.id, nonShootDates: upsertNonShootDate(nonShootDates, date, entry) },
    });
  };

  /** Inline note save — the note lives under the row's (status × category)
   *  slot keyed by THIS element; empty text clears it. */
  const commitNote = (date: string, status: string, category: string, text: string) => {
    if (!activeVersion) return;
    const entry = entryByDate.get(date) || { date };
    dispatch({
      type: 'UPDATE_VERSION',
      payload: { id: activeVersion.id, nonShootDates: upsertNonShootDate(nonShootDates, date, { ...entry, comments: setNote(entry.comments, status, category, identity.refKey, text) }) },
    });
  };

  // Add Rule: the panel is seeded with a skeleton rule so the element's cast
  // member is pre-filled; the empty id marks it as a new rule on save.
  const addRuleSkeleton = useMemo(() => {
    if (!isCast) return null;
    return { id: '', type: 'MAX_HOURS' as const, castId: identity.refKey, maxHours: 8 };
  }, [isCast, identity.refKey]);

  const saveRule = (rules: ProjectRule[]) => {
    const editing = nested?.kind === 'rule' && !!nested.rule?.id;
    for (const r of rules) {
      dispatch({ type: editing ? 'UPDATE_RULE' : 'ADD_RULE', payload: r });
    }
    setNested(null);
  };

  return (
    <Modal open onClose={onClose} title={`${identity.name} — Events`} width="max-w-2xl"
      footer={
        <ModalFooter>
          <Button theme="dark" variant="subtle" className="px-6 py-2 text-zinc-400" onPointerDown={(e) => { e.preventDefault(); onClose(); }}>
            Close
          </Button>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>

        {/* Add Event — opens the shared adder (element-locked) */}
        <div>
          <Button
            theme="dark"
            variant="primary"
            onClick={openAddEvent}
            disabled={readOnly}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add Event on a Date
          </Button>
        </div>

        {/* Events — one collapsible card per day type */}
        <div>
          <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-2`}>
            <CalendarDays className="w-3 h-3 text-zinc-400" />
            Events
          </span>
          {typeCards.length === 0 ? (
            <p className={`${CREM_LABEL} text-zinc-600 italic`}>No events yet — add {identity.name} to a day above.</p>
          ) : (
            <div className="space-y-2">
              {typeCards.map(({ status, rows }) => {
                const def = getDayType(project, status);
                const Icon = typeIconComponent(project.dayTypes, status);
                const collapsed = collapsedTypes.has(status);
                return (
                  <div key={status} data-element-event-type={status} className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleType(status)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700/50 transition-colors text-left"
                    >
                      {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                      <Icon className="w-3.5 h-3.5 shrink-0" style={def?.color ? { color: def.color } : undefined} />
                      <span className={`${CREM_TEXT} font-semibold text-zinc-200`}>{def?.label || status}</span>
                      <span className="text-[10px] text-zinc-500">{rows.length} {rows.length === 1 ? 'day' : 'days'}</span>
                    </button>
                    {!collapsed && (
                      <div className="border-t border-zinc-700/60 divide-y divide-zinc-700/60">
                        {rows.map(({ date, groups }) => {
                          const note = groups.map(g => g.comment).find(Boolean) || '';
                          const noteCategory = groups.find(g => !isAllKeys(g.keys))?.category || groups[0]?.category;
                          const wholeOnly = groups.every(g => isAllKeys(g.keys));
                          return (
                            <div key={date} data-element-event-date={date} className="flex items-center gap-2 px-3 py-1.5">
                              <span className="w-28 shrink-0 text-[11px] font-medium text-zinc-300">{formatDateLabel(date)}</span>
                              <div className="flex-1 min-w-0">
                                {noteDate === date && noteCategory && !readOnly ? (
                                  <input
                                    autoFocus
                                    type="text"
                                    defaultValue={note}
                                    placeholder="Add a note — e.g. 'Traveling from Singapore'"
                                    onBlur={(e) => { setNoteDate(null); commitNote(date, status, noteCategory, e.target.value); }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                      if (e.key === 'Escape') { setNoteDate(null); }
                                    }}
                                    className={`${CREM_TEXT} w-full px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500 placeholder-zinc-600 text-[11px]`}
                                  />
                                ) : note ? (
                                  <button
                                    type="button"
                                    onClick={() => !readOnly && setNoteDate(date)}
                                    title={readOnly ? note : 'Edit note'}
                                    className="flex items-center gap-1 text-[11px] text-zinc-400 italic hover:text-zinc-200 transition-colors w-full text-left min-w-0"
                                  >
                                    <MessageSquare className="w-2.5 h-2.5 shrink-0 text-amber-500" />
                                    <span className="truncate">"{note}"</span>
                                  </button>
                                ) : !readOnly ? (
                                  <button
                                    type="button"
                                    onClick={() => setNoteDate(date)}
                                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors"
                                  >
                                    <MessageSquare className="w-2.5 h-2.5" /> Add note
                                  </button>
                                ) : (
                                  <span className={`${CREM_LABEL} text-zinc-600 italic`}>No note</span>
                                )}
                              </div>
                              {!readOnly && (
                                <>
                                  <button
                                    onClick={() => setNested({ kind: 'event', date, status })}
                                    title="Edit this event"
                                    className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => removeGroup(date, status, groups)}
                                    disabled={wholeOnly}
                                    title={wholeOnly ? `The whole ${statusLabel(status, project)} category is marked — remove the day's events in the editor` : `Remove ${identity.name} from this day`}
                                    aria-label={`Remove ${identity.name} from this day`}
                                    className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Violations — the element's rules firing on scheduled days */}
        <div>
          <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-2`}>
            <Flag className="w-3 h-3 text-red-400" />
            Violations
          </span>
          {data.violations.size === 0 ? (
            <p className={`${CREM_LABEL} text-zinc-600 italic`}>No violations on any scheduled day.</p>
          ) : (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800 divide-y divide-zinc-700/60">
              {[...data.violations.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, vs]) => vs.map(v => (
                  <div key={`${date}-${v.ruleId}`} data-element-violation={date}
                    className="flex items-start gap-2 px-3 py-2 text-[11px] text-zinc-300">
                    <Flag className="w-3 h-3 shrink-0 mt-[1px] fill-red-400 text-red-400" />
                    <span className="w-24 shrink-0 font-medium text-zinc-200">{formatDateLabel(date)}</span>
                    <span className="text-red-300">{v.message}</span>
                  </div>
                )))}
            </div>
          )}
        </div>

        {/* Rules referencing this element */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setRulesCollapsed(c => !c)}
              className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 hover:text-zinc-200 transition-colors`}
            >
              {rulesCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <Clock4 className="w-3 h-3" />
              Rules
              <span className="text-zinc-500 normal-case font-medium text-[10px]">({data.rules.length})</span>
            </button>
            {isCast && !readOnly && (
              <Button theme="dark" variant="subtle" className="flex items-center gap-1" onClick={() => setNested({ kind: 'rule', rule: addRuleSkeleton })}>
                <Plus className="w-3 h-3" /> Add Rule
              </Button>
            )}
          </div>
          {!rulesCollapsed && (
            isCast ? (
              data.rules.length === 0 ? (
                <p className={`${CREM_LABEL} text-zinc-600 italic`}>No rules reference this cast member.</p>
              ) : (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-2 space-y-1.5">
                  {data.rules.map(r => (
                    <RuleCard key={r.id} rule={r} castMembers={project.castMembers || []} theme="dark"
                      onEdit={readOnly ? () => {} : () => setNested({ kind: 'rule', rule: r })} />
                  ))}
                </div>
              )
            ) : (
              <p className={`${CREM_LABEL} text-zinc-600 italic`}>Rules reference cast members by Board ID — this element can't carry rules.</p>
            )
          )}
        </div>
      </div>

      {/* Nested shared editors (deferred mount — Radix dialog stack) */}
      {nested?.kind === 'event' && nestedReady && (
        <EventModal
          dateKey={nested.date}
          statusKey={nested.status}
          category={category}
          elementKey={identity.refKey}
          onClose={() => setNested(null)}
        />
      )}
      {nested?.kind === 'adder' && nestedReady && (
        <EventAdderModal
          preseed={{ category, keys: [identity.refKey] }}
          onClose={() => setNested(null)}
        />
      )}
      {nested?.kind === 'rule' && nestedReady && (
        <Modal open onClose={() => setNested(null)} title={nested.rule && nested.rule.id ? 'Edit Rule' : 'Add Rule'} width="max-w-lg">
          <div className="p-6">
            <RuleEditorPanel
              bare
              initial={nested.rule ?? null}
              scenes={project.scenes}
              castMembers={project.castMembers || []}
              anchoredKeys={anchoredKeysFor(project.elementLinks, 'cast')}
              onSave={saveRule}
              onDelete={nested.rule && nested.rule.id ? () => {
                dispatch({ type: 'DELETE_RULE', payload: nested.rule!.id });
                setNested(null);
              } : undefined}
              onClose={() => setNested(null)}
            />
          </div>
        </Modal>
      )}
    </Modal>
  );
}