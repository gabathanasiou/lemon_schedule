import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate, ProjectRule, RuleViolation } from '../../types';
import { getTypeLists, NON_SHOOT_ALL, resolveElementName } from '../../lib/nonShootHelpers';
import { getMarkableDayTypes, getDayType, typeIconComponent } from '../../lib/dayTypes';
import { getCategoryElements } from '../../lib/elements';
import { anchoredKeysFor } from '../../lib/elementLinks';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { getUniqueCastIds } from '../../lib/utils';
import Modal, { ModalFooter } from '../Modal';
import { EntityDropdown } from '../EntityDropdown';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { usePortalTarget } from '../../lib/popoutTarget';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import {
  describeRule,
} from '../rules/ruleMeta';
import { RuleCard } from '../rules/RuleCard';
import { RuleEditorPanel } from '../rules/RuleEditorPanel';
import { typeRankOf, categoryRankOf } from '../../lib/events';
import Button from '../Button';
import Checkbox from '../Checkbox';
import { Plus, X, Check, ChevronDown, Link2, Sun, Flag, MessageSquare, Trash2 } from 'lucide-react';

interface AttachRow {
  category: string;
  keys: string[];
  all: boolean;
}

/** One editable event type on the day — its attachment rows + PER-ELEMENT
 *  notes (each element's card carries its own note). */
interface EventSection {
  status: string;
  rows: AttachRow[];
  /** category → element key → note text (saved into
   *  `comments[status][category][key]`). */
  notes: Record<string, Record<string, string>>;
  /** category → note editor open. */
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
  /** Rule to open in the rule editor on mount (rule-card double-click) —
   *  opens on the Rules tab with the editor ready. */
  initialRule?: ProjectRule | null;
  /** Pre-attach this element on open (Element Manager events): the element's
   *  category row is seeded with the keys — merged into an existing section's
   *  same-category row, added to the first section, or a new section under
   *  the first attachable day type when the day has none. */
  preseedItems?: { category: string; keys: string[] };
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
 *  read-only Conflicts, and date-scoped Rules (edit/add via the shared
 *  RuleEditorPanel, pre-seeded with the date — same editor the Rules tab
 *  opens). Per-open section filter collapses by kind. */
export const DayEventsModal: React.FC<DayEventsModalProps> = ({ dateKey, entry, violations, rules = [], initialStatus, initialRule, preseedItems, onSave, onClose }) => {
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

  // Per-category anchor item keys — Anchor icons in the attachment pickers.
  const anchoredByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const cat of new Set((project.elementLinks || []).map(l => l.anchorCategory))) {
      map.set(cat, anchoredKeysFor(project.elementLinks, cat));
    }
    return map;
  }, [project.elementLinks]);

  const dayTypes = useMemo(() => getMarkableDayTypes(project), [project]);
  const [statusKey, setStatusKey] = useState<string | null>(entry?.status || null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const activeType = statusKey ? getDayType(project, statusKey) : undefined;

  // Tabbed layout (per-open, not persisted): one section at a time.
  const [activeTab, setActiveTab] = useState<'events' | 'conflicts' | 'rules'>(initialRule ? 'rules' : 'events');

  // Rule editor state: null closed, { rule: undefined } = add, { rule } = edit.
  // The editor itself is the shared RuleEditorPanel (rules/RuleEditorPanel.tsx).
  // `initialRule` (rule-card double-click) opens the Rules tab with the editor ready.
  const [ruleEditor, setRuleEditor] = useState<{ rule?: ProjectRule | null } | null>(initialRule ? { rule: initialRule } : null);
  // Radix stacks dialogs by open ORDER — mounting the nested modal in the same
  // commit as the day modal corrupts the stack (both get aria-hidden). Open it
  // one commit later so the day modal registers first.
  const [ruleModalReady, setRuleModalReady] = useState(!initialRule);
  useEffect(() => {
    if (initialRule) setRuleModalReady(true);
  }, [initialRule]);

  const openRuleEditor = (rule?: ProjectRule | null) => {
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
    const notesFor = (status: string): Record<string, Record<string, string>> => {
      const notes: Record<string, Record<string, string>> = {};
      if (entry?.comments?.[status] && typeof entry.comments[status] === 'object') {
        for (const [category, catNotes] of Object.entries(entry.comments[status])) {
          if (catNotes && typeof catNotes === 'object') notes[category] = { ...catNotes };
        }
      }
      return notes;
    };
    const out: EventSection[] = statuses.map(status => ({
      status,
      rows: Object.entries(entry!.lists![status]!)
        .map(([category, keys]) => ({ category, keys: [...keys], all: keys.includes(NON_SHOOT_ALL) }))
        .sort((a, b) => categoryRankOf(a.category) - categoryRankOf(b.category)),
      notes: notesFor(status),
      commentOpen: {},
    }));
    if (entry?.status && !out.some(s => s.status === entry.status)) {
      const t = getDayType(project, entry.status);
      if (t?.attachable) out.push({ status: entry.status, rows: blankRows(), notes: {}, commentOpen: {} });
    }
    if (initialStatus && !out.some(s => s.status === initialStatus)) {
      out.push({ status: initialStatus, rows: blankRows(), notes: {}, commentOpen: {} });
    }
    // Element Manager events: pre-add the element's cards (merge into an
    // existing same-category row, else the first section, else a new section
    // under the first attachable day type).
    if (preseedItems && preseedItems.keys.length > 0) {
      const { category: cat, keys } = preseedItems;
      const existingSection = out.find(s => s.rows.some(r => r.category === cat));
      if (existingSection) {
        const row = existingSection.rows.find(r => r.category === cat);
        if (row) {
          row.keys = [...new Set([...row.keys, ...keys])];
          row.all = false;
        } else {
          existingSection.rows.push({ category: cat, keys: [...keys], all: false });
        }
      } else if (out.length > 0) {
        out[0].rows.push({ category: cat, keys: [...keys], all: false });
      } else {
        const firstAttachable = getMarkableDayTypes(project).find(t => t.attachable !== false);
        if (firstAttachable) {
          out.push({ status: firstAttachable.key, rows: [{ category: cat, keys: [...keys], all: false }], notes: {}, commentOpen: {} });
        }
      }
    }
    // Same ordering as the calendar cards: manager's day-type order.
    return out.sort((a, b) => typeRankOf(project, a.status) - typeRankOf(project, b.status));
  };

  const [sections, setSections] = useState<EventSection[]>(seedSections);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const changeStatus = (key: string | null) => {
    setStatusKey(key);
    if (key && !sections.some(s => s.status === key)) {
      const t = getDayType(project, key);
      if (t?.attachable) {
        setSections(prev => [...prev, { status: key, rows: blankRows(), notes: {}, commentOpen: {} }]);
        requestAnimationFrame(() => {
          document.querySelector(`[data-event-section="${dateKey}-${key}"]`)?.scrollIntoView({ block: 'nearest' });
        });
      }
    }
  };

  const addSection = (status: string) => {
    if (sections.some(s => s.status === status)) return;
    setSections(prev => [...prev, { status, rows: blankRows(), notes: {}, commentOpen: {} }]);
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

  const setComment = (status: string, category: string, key: string, text: string) =>
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, notes: { ...s.notes, [category]: { ...(s.notes[category] || {}), [key]: text } } }
      : s));

  const toggleComment = (status: string, category: string) =>
    setSections(prev => prev.map(s => s.status === status
      ? { ...s, commentOpen: { ...s.commentOpen, [category]: !s.commentOpen[category] } }
      : s));

  const handleSave = () => {
    const nextLists: Record<string, Record<string, string[]>> = {};
    const nextComments: Record<string, Record<string, Record<string, string>>> = {};
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
      for (const [cat, notes] of Object.entries(sec.notes)) {
        const nonEmpty: Record<string, string> = {};
        for (const [key, text] of Object.entries(notes)) {
          const trimmed = text.trim();
          if (trimmed) nonEmpty[key] = trimmed;
        }
        if (Object.keys(nonEmpty).length > 0) {
          nextComments[sec.status] = nextComments[sec.status] || {};
          nextComments[sec.status][cat] = nonEmpty;
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

  const getItemsFor = (category: string) => getCategoryElements(project, category);

  const StatusIcon = (key: string | null, sizeClass: string = XSZ, color?: string) => {
    const Icon = typeIconComponent(project.dayTypes, key);
    return <Icon className={sizeClass} style={color ? { color } : undefined} />;
  };

  const addableTypes = dayTypes.filter(t => !sections.some(s => s.status === t.key));

  return (
    <>
    <Modal open onClose={onClose} title={`Day Events — ${formatDateLabel(dateKey)}`} width="max-w-2xl"
      footer={
        <ModalFooter>
          <Button theme="dark" variant="subtle" className="px-6 py-2 text-zinc-400" onPointerDown={(e) => { e.preventDefault(); onClose(); }}>
            Cancel
          </Button>
          <Button theme="dark" variant="primary" className="px-6 py-2" onPointerDown={(e) => { e.preventDefault(); handleSave(); }}>
            Save
          </Button>
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
                <Button theme="dark" variant="subtle" className="bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 flex items-center gap-2">
                  {StatusIcon(statusKey, XSZ, activeType?.color)}
                  <span className="truncate text-zinc-200">{activeType?.label || 'None'}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                </Button>
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
                  <Button theme="dark" variant="primary" className="flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add event type
                  </Button>
                }
              >
                {addableTypes.length === 0 ? (
                  <DropdownItem onClick={() => setAddTypeOpen(false)}>All types are attached</DropdownItem>
                ) : addableTypes.map(t => (
                  <DropdownItem key={t.key} onClick={() => { addSection(t.key); setAddTypeOpen(false); }}
                    icon={StatusIcon(t.key, 'w-3.5 h-3.5', t.color)}
                  >
                    <span className="text-zinc-200">{t.label}</span>
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
                  const SecIcon = typeIconComponent(project.dayTypes, sec.status);
                  return (
                    <div key={sec.status} data-event-section={`${dateKey}-${sec.status}`} className="border border-zinc-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <SecIcon className={XSZ} style={def?.color ? { color: def.color } : undefined} />
                        <span className={`${CREM_TEXT} font-semibold text-zinc-200`}>{def?.label || sec.status}</span>
                        <Button theme="dark" variant="subtle" className="ml-auto flex items-center gap-1" onPointerDown={(e) => { e.preventDefault(); addRow(sec.status); }}>
                          <Plus className="w-3 h-3" /> Add
                        </Button>
                        <Button theme="dark" variant="danger-ghost" onPointerDown={(e) => { e.preventDefault(); removeSection(sec.status); }} title={`Remove ${def?.label || sec.status}`} className="p-1">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      {!attachable ? (
                        <p className={`${CREM_LABEL} text-zinc-600 italic`}>This day type doesn't support attaching cast or elements.</p>
                      ) : (
                        <div className="space-y-2">
                          {sec.rows.map((r, i) => {
                            const isCast = r.category === 'cast';
                            const items = getItemsFor(r.category);
                            const catLabel = categoryLabelLookup[r.category] || r.category;
                            const rowNotes = sec.notes[r.category] || {};
                            const open = sec.commentOpen[r.category];
                            const hasNotes = Object.values(rowNotes).some(t => t.trim());
                            const noteKeys = r.all ? [NON_SHOOT_ALL] : (r.keys.length > 0 ? r.keys : []);
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
                                    btnClass="px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors flex items-center gap-1.5"
                                    itemClass={CREM_DD_ITEM}
                                  />
                                  <EntityDropdown
                                    value={r.all ? '' : r.keys.join(', ')}
                                    onChange={val => setKeys(sec.status, i, val.split(',').map(x => x.trim()).filter(Boolean))}
                                    items={items}
                                    positioning="fixed"
                                    portalTarget={portalTarget ?? document.body}
                                    mode="multi"
                                    variant="chip"
                                    placeholder={r.all ? 'All elements of this category' : isCast ? 'Search cast members...' : 'Search elements...'}
                                    className="text-xs flex-1 min-w-0"
                                    displayMode={isCast ? 'id' : 'name'}
                                    readOnly={r.all}
                                    anchoredKeys={anchoredByCategory.get(r.category)}
                                    renderItem={isCast ? (item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></> : undefined}
                                  />
                                  <Checkbox
                                    checked={r.all}
                                    onChange={() => toggleAll(sec.status, i)}
                                    label="All"
                                    theme="dark"
                                    className="shrink-0"
                                  />
                                  <Button
                                    theme="dark"
                                    variant="subtle"
                                    onPointerDown={(e) => { e.preventDefault(); toggleComment(sec.status, r.category); }}
                                    title={hasNotes ? `Notes for ${noteKeys.length} element${noteKeys.length === 1 ? '' : 's'}` : 'Add notes per element'}
                                    className={`p-1 shrink-0 ${hasNotes ? '!text-amber-300' : ''}`}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </Button>
                                  <Button theme="dark" variant="subtle" onPointerDown={(e) => { e.preventDefault(); removeRow(sec.status, i); }} className="p-1 shrink-0" title="Remove row">
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                                {(open || hasNotes) && noteKeys.length > 0 && (
                                  <div className="space-y-1.5 pl-10">
                                    {noteKeys.map(k => (
                                      <div key={k} className="flex items-center gap-2">
                                        <span className="text-[10px] text-zinc-400 truncate max-w-[130px] shrink-0">
                                          {r.all ? `All ${catLabel}` : resolveElementName(k, r.category, project)}
                                        </span>
                                        <input
                                          type="text"
                                          value={rowNotes[k] || ''}
                                          onChange={(e) => setComment(sec.status, r.category, k, e.target.value)}
                                          placeholder={`Note for ${r.all ? `all ${catLabel}` : resolveElementName(k, r.category, project)} — e.g. "Traveling from Singapore"`}
                                          className={`${CREM_TEXT} w-full px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500 placeholder-zinc-600`}
                                          autoFocus={open && !rowNotes[k]}
                                        />
                                      </div>
                                    ))}
                                  </div>
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
              <div className="space-y-1.5">
                {rules.map(r => (
                  <RuleCard
                    key={r.id}
                    rule={r}
                    castMembers={project.castMembers || []}
                    theme="dark"
                    onEdit={() => openRuleEditor(r)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </Modal>

    {ruleEditor && ruleModalReady && (
      <Modal open onClose={() => setRuleEditor(null)} title={ruleEditor.rule ? 'Edit Rule' : 'Add Rule'} width="max-w-lg">
        <div className="p-6">
          <RuleEditorPanel
            bare
            initial={ruleEditor.rule ?? null}
            preseedDateKey={dateKey}
            scenes={project.scenes}
            castMembers={project.castMembers || []}
            anchoredKeys={anchoredByCategory.get('cast')}
            onSave={(rules) => {
              for (const r of rules) {
                dispatch({ type: ruleEditor?.rule ? 'UPDATE_RULE' : 'ADD_RULE', payload: r });
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