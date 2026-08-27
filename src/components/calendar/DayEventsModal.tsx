import React, { useMemo, useRef, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate, ProjectRule, RuleViolation } from '../../types';
import { getTypeLists, NON_SHOOT_ALL } from '../../lib/nonShootHelpers';
import { getMarkableDayTypes, getDayType, iconForType } from '../../lib/dayTypes';
import { getCategoryElements } from '../../lib/elements';
import { ELEMENT_CATEGORIES, getLabel, getCustomIcon } from '../../lib/categories';
import { getUniqueCastIds } from '../../lib/utils';
import Modal, { ModalFooter } from '../Modal';
import { EntityDropdown } from '../EntityDropdown';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { usePortalTarget } from '../../lib/popoutTarget';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import DatePicker from '../DatePicker';
import {
  describeRule, RuleTypeIcon, RULE_TYPE_META, RULE_TYPES,
  RuleFormState, blankRuleForm, formFromRule, validateRuleForm, buildRulesFromForm,
} from '../rules/ruleMeta';
import { Plus, X, Check, ChevronDown, Link2, Sun, Flag, Pencil, MessageSquare, Trash2, AlertCircle } from 'lucide-react';

interface AttachRow {
  category: string;
  keys: string[];
  all: boolean;
}

/** One editable event type on the day — its attachment rows + per-row comments. */
interface EventSection {
  status: string;
  rows: AttachRow[];
  /** category → comment text. */
  comments: Record<string, string>;
  /** category → comment input open. */
  commentOpen: Record<string, boolean>;
}

interface DayEventsModalProps {
  dateKey: string;
  entry?: NonShootDate | null;
  violations?: RuleViolation[];
  /** Rules whose `dates` include this date (DATE_RESTRICTION + dated MAX_HOURS/TIME_WINDOW). */
  rules?: ProjectRule[];
  /** Event type to focus on open (card double-click) — its section is added
   *  if missing and scrolled into view. */
  initialStatus?: string;
  onSave: (entry: NonShootDate) => void;
  onClose: () => void;
}

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const blankRows = (): AttachRow[] => [{ category: 'cast', keys: [], all: false }];

/** The day-centric events editor (roadmap 45) — the shared shell item 46
 *  reuses. A day can carry MULTIPLE event types: one section per status with
 *  attachment rows (category + cast/elements + All) and a per-row comment
 *  ("Traveling from Singapore"), plus the single day status picker (header),
 *  read-only Conflicts, and date-scoped Rules (edit/add via RuleFormModal,
 *  pre-seeded with the date). Per-open section filter collapses by kind. */
export const DayEventsModal: React.FC<DayEventsModalProps> = ({ dateKey, entry, violations, rules = [], initialStatus, onSave, onClose }) => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const portalTarget = usePortalTarget();

  const sizes = ruleModalSizes();
  const { XSZ, CREM_LABEL, CREM_TEXT, CREM_BODY, CREM_BTN_COND, CREM_DD_ITEM, CREM_FOOTER_BTN } = sizes;

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    const seen = new Set<string>();
    for (const c of ELEMENT_CATEGORIES) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: false }); } }
    for (const c of project.customCategories || []) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: true }); } }
    return keys;
  }, [project.customCategories]);

  const dayTypes = useMemo(() => getMarkableDayTypes(project), [project]);
  const [statusKey, setStatusKey] = useState<string | null>(entry?.status || null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const activeType = statusKey ? getDayType(project, statusKey) : undefined;

  // Per-open section filter (not persisted): status / attachments / conflicts / rules
  const [showStatus, setShowStatus] = useState(true);
  const [showAttachments, setShowAttachments] = useState(true);
  const [showConflicts, setShowConflicts] = useState(true);
  const [showRules, setShowRules] = useState(true);

  // Inline rule editor state: null closed, { rule: undefined } = add, { rule } = edit
  const [ruleEditor, setRuleEditor] = useState<{ rule?: ProjectRule | null } | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(blankRuleForm());
  const [ruleError, setRuleError] = useState('');

  const openRuleEditor = (rule?: ProjectRule | null) => {
    setRuleForm(rule ? formFromRule(rule) : { ...blankRuleForm(), type: 'DATE_RESTRICTION', dates: [dateKey], datesMode: 'specific' });
    setRuleError('');
    setRuleEditor({ rule });
  };

  const castOptions = useMemo(() => {
    const ids = [...new Set([
      ...getUniqueCastIds(project.scenes),
      ...(project.castMembers || []).map(m => m.id),
    ])].sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
    return ids.map(id => {
      const m = (project.castMembers || []).find(c => c.id === id);
      return { id, name: m?.name || '?' };
    });
  }, [project.scenes, project.castMembers]);

  const seedSections = (): EventSection[] => {
    const statuses = Object.keys(entry?.lists || {}).filter(s => {
      const v = Object.values(entry!.lists![s] || {});
      return v.some(arr => arr.length > 0);
    });
    const out: EventSection[] = statuses.map(status => ({
      status,
      rows: Object.entries(entry!.lists![status]!).map(([category, keys]) => ({ category, keys: [...keys], all: keys.includes(NON_SHOOT_ALL) })),
      comments: { ...(entry?.comments?.[status] || {}) },
      commentOpen: {},
    }));
    if (entry?.status && !out.some(s => s.status === entry.status)) {
      const t = getDayType(project, entry.status);
      if (t?.attachable) out.push({ status: entry.status, rows: blankRows(), comments: {}, commentOpen: {} });
    }
    if (initialStatus && !out.some(s => s.status === initialStatus)) {
      out.push({ status: initialStatus, rows: blankRows(), comments: {}, commentOpen: {} });
    }
    return out;
  };

  const [sections, setSections] = useState<EventSection[]>(seedSections);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const changeStatus = (key: string | null) => {
    setStatusKey(key);
    if (key && !sections.some(s => s.status === key)) {
      const t = getDayType(project, key);
      if (t?.attachable) {
        setSections(prev => [...prev, { status: key, rows: blankRows(), comments: {}, commentOpen: {} }]);
        requestAnimationFrame(() => {
          document.querySelector(`[data-event-section="${dateKey}-${key}"]`)?.scrollIntoView({ block: 'nearest' });
        });
      }
    }
  };

  const addSection = (status: string) => {
    if (sections.some(s => s.status === status)) return;
    setSections(prev => [...prev, { status, rows: blankRows(), comments: {}, commentOpen: {} }]);
    requestAnimationFrame(() => {
      document.querySelector(`[data-event-section="${dateKey}-${status}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  };

  const removeSection = (status: string) =>
    setSections(prev => prev.filter(s => s.status !== status));

  const sectionFor = (status: string) => sections.find(s => s.status === status)!;

  const addRow = (status: string) => {
    const first = allCategoryKeys[0];
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, rows: [...s.rows, { category: first ? first.key : 'cast', keys: [], all: false }] }
      : s));
  };

  const removeRow = (status: string, idx: number) =>
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, rows: s.rows.filter((_, i) => i !== idx) }
      : s));

  const setCategory = (status: string, idx: number, category: string) =>
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, rows: s.rows.map((r, i) => i === idx ? { ...r, category, keys: [], all: false } : r) }
      : s));

  const setKeys = (status: string, idx: number, keys: string[]) =>
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, rows: s.rows.map((r, i) => i === idx ? { ...r, keys, all: false } : r) }
      : s));

  const toggleAll = (status: string, idx: number) =>
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, rows: s.rows.map((r, i) => i === idx ? { ...r, all: !r.all, keys: !r.all ? [NON_SHOOT_ALL] : [] } : r) }
      : s));

  const setComment = (status: string, category: string, text: string) =>
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, comments: { ...s.comments, [category]: text } }
      : s));

  const toggleComment = (status: string, category: string) =>
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, commentOpen: { ...s.commentOpen, [category]: !s.commentOpen[category] } }
      : s));

  const handleSave = () => {
    const nextLists: Record<string, Record<string, string[]>> = {};
    const nextComments: Record<string, Record<string, string>> = {};
    for (const sec of sections) {
      const map: Record<string, string[]> = {};
      for (let i = 0; i < sec.rows.length; i++) {
        const r = sec.rows[i];
        const raw = rowRefs.current.get(`${sec.status}-${i}`)?.querySelector('input')?.value ?? '';
        const keys = r.all
          ? [NON_SHOOT_ALL]
          : (raw || r.keys.join(', ')).split(',').map(k => k.trim()).filter(Boolean);
        if (keys.length === 0) continue;
        map[r.category] = [...(map[r.category] || []), ...keys];
      }
      if (Object.keys(map).length > 0) nextLists[sec.status] = map;
      for (const [cat, text] of Object.entries(sec.comments)) {
        const trimmed = text.trim();
        if (trimmed) {
          nextComments[sec.status] = nextComments[sec.status] || {};
          nextComments[sec.status][cat] = trimmed;
        }
      }
    }
    const next: NonShootDate = {
      date: dateKey,
      ...(statusKey ? { status: statusKey } : {}),
      ...(Object.keys(nextLists).length > 0 ? { lists: nextLists } : {}),
      ...(Object.keys(nextComments).length > 0 ? { comments: nextComments } : {}),
    };
    onSave(next);
    onClose();
  };

  const handleRuleSave = () => {
    const err = validateRuleForm(ruleForm);
    if (err) { setRuleError(err); return; }
    const rules = buildRulesFromForm(ruleForm, ruleEditor?.rule ?? null);
    for (const r of rules) {
      dispatch({ type: ruleEditor?.rule ? 'UPDATE_RULE' : 'ADD_RULE', payload: r });
    }
    setRuleEditor(null);
    setRuleError('');
  };

  const getItemsFor = (category: string) => getCategoryElements(project, category);

  const StatusIcon = (key: string | null, sizeClass: string = XSZ) => {
    const Icon = getCustomIcon(iconForType(project.dayTypes, key));
    return <Icon className={sizeClass} />;
  };

  const addableTypes = dayTypes.filter(t => !sections.some(s => s.status === t.key));

  return (
    <Modal open onClose={onClose} title={`Day Events — ${formatDateLabel(dateKey)}`} width="max-w-2xl"
      footer={
        <ModalFooter>
          <button onPointerDown={(e) => { e.preventDefault(); onClose(); }} className={`${CREM_FOOTER_BTN} text-zinc-400 font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors`}>
            Cancel
          </button>
          <button onPointerDown={(e) => { e.preventDefault(); handleSave(); }} className={`${CREM_FOOTER_BTN} bg-zinc-800 text-white font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors`}>
            Save
          </button>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>
        {/* Section filter (per-open, not persisted) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 border border-zinc-800 rounded-lg px-3 py-2">
          {[
            { key: 'status' as const, label: 'Status', on: showStatus, set: setShowStatus },
            { key: 'attachments' as const, label: 'Attachments', on: showAttachments, set: setShowAttachments },
            { key: 'conflicts' as const, label: 'Conflicts', on: showConflicts, set: setShowConflicts },
            { key: 'rules' as const, label: 'Rules', on: showRules, set: setShowRules },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => t.set(!t.on)}
              className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${t.on ? 'text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${t.on ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-700'}`}>
                {t.on && <Check className="w-2.5 h-2.5 text-zinc-200" />}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        {showStatus && (
          <div className="mb-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2.5">
              <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                <Sun className={`${XSZ} text-zinc-500`} />
                Day Status
              </span>
            </div>
            <DropdownMenu
              open={statusMenuOpen}
              onClose={() => setStatusMenuOpen(false)}
              onOpenChange={setStatusMenuOpen}
              width="w-52"
              theme="dark"
              trigger={
                <button
                  type="button"
                  className={`${CREM_BTN_COND} flex items-center gap-2`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-zinc-600" style={activeType?.color ? { background: activeType.color } : undefined} />
                  {StatusIcon(statusKey)}
                  <span className="truncate">{activeType?.label || 'None'}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0" />
                </button>
              }
            >
              <DropdownItem onClick={() => { changeStatus(null); setStatusMenuOpen(false); }} icon={<X className="w-3.5 h-3.5" />}>
                None
              </DropdownItem>
              <DropdownDivider />
              {dayTypes.map(t => (
                <DropdownItem key={t.key} onClick={() => { changeStatus(t.key); setStatusMenuOpen(false); }}
                  icon={
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-zinc-600" style={t.color ? { background: t.color } : undefined} />
                      {StatusIcon(t.key, 'w-3.5 h-3.5')}
                    </span>
                  }
                >
                  {t.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </div>
        )}

        {showAttachments && (
          <div className="mb-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
              <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                <Link2 className={`${XSZ} text-zinc-400`} />
                Event Types
              </span>
              <DropdownMenu
                open={addTypeOpen}
                onOpenChange={setAddTypeOpen}
                width="w-52"
                theme="dark"
                trigger={
                  <button className={`${CREM_LABEL} text-zinc-400 hover:text-zinc-200 font-medium flex items-center gap-1`} style={{ padding: 0, background: 'none', border: 'none' }}>
                    <Plus className={XSZ} /> Add event type
                  </button>
                }
              >
                {addableTypes.length === 0 ? (
                  <DropdownItem onClick={() => setAddTypeOpen(false)}>All types are attached</DropdownItem>
                ) : addableTypes.map(t => (
                  <DropdownItem key={t.key} onClick={() => { addSection(t.key); setAddTypeOpen(false); }}
                    icon={
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-zinc-600" style={t.color ? { background: t.color } : undefined} />
                        {StatusIcon(t.key, 'w-3.5 h-3.5')}
                      </span>
                    }
                  >
                    {t.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </div>

            {sections.length === 0 ? (
              <p className={`${CREM_LABEL} text-zinc-600 italic`}>No event types attached — pick a day status or add an event type.</p>
            ) : (
              <div className="space-y-4">
                {sections.map(sec => {
                  const def = getDayType(project, sec.status);
                  const attachable = def?.attachable !== false;
                  const SecIcon = getCustomIcon(iconForType(project.dayTypes, sec.status));
                  return (
                    <div key={sec.status} data-event-section={`${dateKey}-${sec.status}`} className="border border-zinc-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-zinc-600" style={def?.color ? { background: def.color } : undefined} />
                        <SecIcon className={`${XSZ} text-zinc-300`} />
                        <span className={`${CREM_TEXT} text-zinc-200 font-semibold`}>{def?.label || sec.status}</span>
                        <button onPointerDown={(e) => { e.preventDefault(); addRow(sec.status); }} className={`${CREM_LABEL} text-zinc-400 hover:text-zinc-200 font-medium flex items-center gap-1 ml-auto`} style={{ padding: 0, background: 'none', border: 'none' }}>
                          <Plus className={XSZ} /> Add
                        </button>
                        <button onPointerDown={(e) => { e.preventDefault(); removeSection(sec.status); }} className="text-zinc-600 hover:text-red-400 transition-colors p-0.5" title={`Remove ${def?.label || sec.status}`}>
                          <Trash2 className={XSZ} />
                        </button>
                      </div>
                      {!attachable ? (
                        <p className={`${CREM_LABEL} text-zinc-600 italic`}>This day type doesn't support attaching cast or elements.</p>
                      ) : (
                        <div className="space-y-2">
                          {sec.rows.map((r, i) => {
                            const isCast = r.category === 'cast';
                            const items = getItemsFor(r.category);
                            const catLabel = categoryLabelLookup[r.category] || r.category;
                            const comment = sec.comments[r.category] || '';
                            const open = sec.commentOpen[r.category];
                            return (
                              <div key={`${sec.status}-${i}`} className="space-y-1">
                                <div ref={el => { rowRefs.current.set(`${sec.status}-${i}`, el); }} className="flex items-center gap-2">
                                  <CategoryDropdown
                                    value={r.category}
                                    onChange={(cat) => setCategory(sec.status, i, cat)}
                                    allCategoryKeys={allCategoryKeys}
                                    categoryLabelLookup={categoryLabelLookup}
                                    customCategories={project.customCategories}
                                    open={openDropdown === `cat-${sec.status}-${i}`}
                                    onOpenChange={(o) => setOpenDropdown(o ? `cat-${sec.status}-${i}` : null)}
                                    btnClass={CREM_BTN_COND}
                                    itemClass={CREM_DD_ITEM}
                                  />
                                  <EntityDropdown
                                    value={r.all ? '' : r.keys.join(', ')}
                                    onChange={val => setKeys(sec.status, i, val.split(',').map(x => x.trim()).filter(Boolean))}
                                    items={items}
                                    positioning="fixed"
                                    portalTarget={portalTarget ?? document.body}
                                    mode="multi"
                                    placeholder={r.all ? 'All elements of this category' : isCast ? 'Search cast members...' : 'Search elements...'}
                                    className="text-xs flex-1 min-w-0"
                                    displayMode={isCast ? 'id' : 'name'}
                                    readOnly={r.all}
                                    renderItem={isCast ? (item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></> : undefined}
                                  />
                                  <button
                                    onPointerDown={(e) => { e.preventDefault(); toggleAll(sec.status, i); }}
                                    title={`All ${catLabel}`}
                                    className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-zinc-800 transition-colors shrink-0"
                                  >
                                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${r.all ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-600'}`}>
                                      {r.all && <Check className="w-3 h-3 text-zinc-200" />}
                                    </span>
                                    <span className={`${CREM_TEXT} text-zinc-400`}>All</span>
                                  </button>
                                  <button
                                    onPointerDown={(e) => { e.preventDefault(); toggleComment(sec.status, r.category); }}
                                    title={comment ? `Comment: ${comment}` : 'Add a comment'}
                                    className={`p-0.5 shrink-0 transition-colors ${comment ? 'text-amber-300' : 'text-zinc-600 hover:text-zinc-300'}`}
                                  >
                                    <MessageSquare className={XSZ} />
                                  </button>
                                  <button onPointerDown={(e) => { e.preventDefault(); removeRow(sec.status, i); }} className="text-zinc-600 hover:text-red-400 transition-colors p-0.5 shrink-0">
                                    <X className={XSZ} />
                                  </button>
                                </div>
                                {(open || comment) && (
                                  <input
                                    type="text"
                                    value={comment}
                                    onChange={(e) => setComment(sec.status, r.category, e.target.value)}
                                    placeholder={`Comment for ${catLabel} — e.g. "Traveling from Singapore"`}
                                    className={`${CREM_TEXT} w-full px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500 placeholder-zinc-600`}
                                    autoFocus={open && !comment}
                                  />
                                )}
                              </div>
                            );
                          })}
                          {sec.rows.length === 1 && sec.rows[0].keys.length === 0 && !sec.rows[0].all && (
                            <p className={`${CREM_LABEL} text-zinc-600 italic`}>Nothing marked — press Add to mark elements.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {showConflicts && violations && violations.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2.5">
              <span className={`${CREM_LABEL} text-red-400/80 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                <Flag className={`${XSZ} text-red-400`} />
                Conflicts
              </span>
            </div>
            <ul className="space-y-1.5">
              {violations.map(v => (
                <li key={v.ruleId} className="text-[11px] leading-snug">
                  <span className="text-red-300 font-medium">{v.message}</span>
                  {v.detail && <span className="text-zinc-500"> — {v.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showRules && (
          <div className="mb-1">
            {ruleEditor ? (
              <div className="border border-zinc-700 rounded-lg p-3 space-y-4" data-rule-editor>
                <div className="flex items-center justify-between">
                  <span className={`${CREM_LABEL} text-zinc-300 uppercase font-semibold tracking-wider`}>
                    {ruleEditor.rule ? 'Edit Rule' : 'Add Rule'}
                  </span>
                  <button onClick={() => setRuleEditor(null)} className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5">
                    <X className={XSZ} />
                  </button>
                </div>

                {/* Rule type */}
                <div className="grid grid-cols-2 gap-1.5">
                  {RULE_TYPES.map(t => {
                    const m = RULE_TYPE_META[t];
                    const Icon = m.icon;
                    const selected = ruleForm.type === t;
                    return (
                      <button key={t} type="button" onClick={() => setRuleForm(f => ({ ...f, type: t }))}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-semibold transition-colors text-left ${
                          selected ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        <Icon className="w-3 h-3 shrink-0" />
                        <span className="truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Cast */}
                {ruleForm.type !== 'CAST_CONFLICT' && ruleForm.type !== 'CAST_SCENE_FLAG' ? (
                  <div>
                    <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Board IDs</label>
                    <EntityDropdown
                      value={ruleForm.castIds.join(', ')}
                      onChange={val => setRuleForm(f => ({ ...f, castIds: val.split(',').map(x => x.trim()).filter(Boolean) }))}
                      items={castOptions}
                      positioning="fixed"
                      portalTarget={portalTarget ?? document.body}
                      mode="multi"
                      showSceneCounts
                      scenes={project.scenes}
                      placeholder="e.g. 1, 2, JOHN"
                      className="text-xs"
                      displayMode="id"
                      renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></>}
                    />
                  </div>
                ) : ruleForm.type === 'CAST_SCENE_FLAG' ? (
                  <div>
                    <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Cast</label>
                    <EntityDropdown
                      value={ruleForm.castIds.join(', ')}
                      onChange={val => setRuleForm(f => ({ ...f, castIds: val.split(',').map(x => x.trim()).filter(Boolean) }))}
                      items={castOptions}
                      positioning="fixed"
                      portalTarget={portalTarget ?? document.body}
                      mode="multi"
                      placeholder="e.g. 1, 2"
                      className="text-xs"
                      displayMode="id"
                      renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></>}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Group A</label>
                      <EntityDropdown
                        value={ruleForm.castIds.join(', ')}
                        onChange={val => setRuleForm(f => ({ ...f, castIds: val.split(',').map(x => x.trim()).filter(Boolean) }))}
                        items={castOptions}
                        positioning="fixed"
                        portalTarget={portalTarget ?? document.body}
                        mode="multi"
                        placeholder="e.g. 1, 2"
                        className="text-xs"
                        displayMode="id"
                        renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></>}
                      />
                    </div>
                    <div>
                      <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Group B</label>
                      <EntityDropdown
                        value={ruleForm.conflictCastIds.join(', ')}
                        onChange={val => setRuleForm(f => ({ ...f, conflictCastIds: val.split(',').map(x => x.trim()).filter(Boolean) }))}
                        items={castOptions}
                        positioning="fixed"
                        portalTarget={portalTarget ?? document.body}
                        mode="multi"
                        placeholder="e.g. 3, 4"
                        className="text-xs"
                        displayMode="id"
                        renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></>}
                      />
                    </div>
                  </div>
                )}

                {/* Dates */}
                {(ruleForm.type === 'DATE_RESTRICTION' || ruleForm.type === 'MAX_HOURS' || ruleForm.type === 'TIME_WINDOW') && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider`}>Dates</label>
                      {ruleForm.type !== 'DATE_RESTRICTION' && (
                        <button
                          onClick={() => setRuleForm(f => ({ ...f, datesMode: f.datesMode === 'all' ? 'specific' : 'all', dates: f.datesMode === 'all' ? [dateKey] : [] }))}
                          className={`${CREM_LABEL} font-medium flex items-center gap-1.5 transition-colors ${ruleForm.datesMode === 'all' ? 'text-zinc-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${ruleForm.datesMode === 'all' ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-700'}`}>
                            {ruleForm.datesMode === 'all' && <Check className="w-2.5 h-2.5 text-zinc-200" />}
                          </span>
                          Every day
                        </button>
                      )}
                    </div>
                    {ruleForm.datesMode === 'all' ? (
                      <p className={`${CREM_LABEL} text-zinc-500 italic`}>Applies every day.</p>
                    ) : (
                      <DatePicker
                        selected={ruleForm.dates}
                        onChange={dates => setRuleForm(f => ({ ...f, dates }))}
                        theme="dark"
                      />
                    )}
                  </div>
                )}

                {/* Per-type fields */}
                {ruleForm.type === 'MAX_HOURS' && (
                  <div>
                    <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Max hours per day</label>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={ruleForm.maxHours}
                      onChange={e => setRuleForm(f => ({ ...f, maxHours: e.target.value }))}
                      className={`${CREM_TEXT} w-24 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500`}
                    />
                  </div>
                )}
                {ruleForm.type === 'TIME_WINDOW' && (
                  <div className="flex items-center gap-3">
                    <div>
                      <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1 block`}>Start</label>
                      <input
                        type="time"
                        value={ruleForm.windowStart || ''}
                        onChange={e => setRuleForm(f => ({ ...f, windowMode: 'range', windowStart: e.target.value }))}
                        className={`${CREM_TEXT} px-2 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500`}
                      />
                    </div>
                    <div>
                      <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1 block`}>End</label>
                      <input
                        type="time"
                        value={ruleForm.windowEnd || ''}
                        onChange={e => setRuleForm(f => ({ ...f, windowMode: 'range', windowEnd: e.target.value }))}
                        className={`${CREM_TEXT} px-2 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500`}
                      />
                    </div>
                  </div>
                )}

                {ruleError && (
                  <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-950/40 border border-red-900/50 rounded px-2.5 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {ruleError}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  {ruleEditor.rule ? (
                    <button
                      onClick={() => { if (ruleEditor.rule) dispatch({ type: 'DELETE_RULE', payload: ruleEditor.rule.id }); setRuleEditor(null); setRuleError(''); }}
                      className={`${CREM_LABEL} text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition-colors`}
                    >
                      <Trash2 className={XSZ} /> Delete
                    </button>
                  ) : <div />}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setRuleEditor(null)} className={`${CREM_LABEL} text-zinc-400 hover:text-zinc-200 font-medium transition-colors`}>Cancel</button>
                    <button onClick={handleRuleSave} className={`${CREM_LABEL} bg-zinc-700 hover:bg-zinc-600 text-white font-semibold px-3 py-1.5 rounded transition-colors`}>
                      {ruleEditor.rule ? 'Save Changes' : 'Add Rule'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2.5">
                  <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                    <Sun className={`${XSZ} text-zinc-500`} />
                    Rules
                  </span>
                  <button onClick={() => openRuleEditor()} className={`${CREM_LABEL} text-zinc-400 hover:text-zinc-200 font-medium flex items-center gap-1`} style={{ padding: 0, background: 'none', border: 'none' }}>
                    <Plus className={XSZ} /> Add rule
                  </button>
                </div>
                {rules.length === 0 ? (
                  <p className={`${CREM_LABEL} text-zinc-600 italic`}>No date-scoped rules on this day.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {rules.map(r => (
                      <li key={r.id} className="flex items-center gap-2">
                        <RuleTypeIcon type={r.type} className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span className="flex-1 min-w-0 text-[11px] text-zinc-300 truncate">{describeRule(r)}</span>
                        <button
                          onClick={() => openRuleEditor(r)}
                          className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
                          title="Edit rule"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};