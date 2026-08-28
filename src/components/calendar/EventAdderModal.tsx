import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate } from '../../types';
import { getMarkableDayTypes, getDayType, typeIconComponent } from '../../lib/dayTypes';
import { getNonShootEntryMap, upsertNonShootDate, NON_SHOOT_ALL, resolveElementName } from '../../lib/nonShootHelpers';
import { getCategoryElements } from '../../lib/elements';
import { anchoredKeysFor } from '../../lib/elementLinks';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import Modal, { ModalFooter } from '../Modal';
import DatePicker from '../DatePicker';
import { EntityDropdown } from '../EntityDropdown';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { RuleEditorPanel } from '../rules/RuleEditorPanel';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { usePortalTarget } from '../../lib/popoutTarget';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import Button from '../Button';
import Checkbox from '../Checkbox';
import { Plus, X, ChevronDown, Sun, Clock4, MessageSquare } from 'lucide-react';

interface AdderRow {
  id: string;
  category: string;
  /** Element keys for this category (cast = IDs, others = names). */
  keys: string[];
  all: boolean;
  /** Per-element notes keyed by element key (saved into
   *  `comments[status][category][key]` — each element's card carries its own). */
  notes: Record<string, string>;
  noteOpen: boolean;
}

let adderRowSeq = 0;
const newRowId = () => `arow-${++adderRowSeq}`;

interface EventAdderModalProps {
  /** Pre-targeted date (calendar right-click). When absent the adder shows
   *  the date picker. */
  date?: string;
  /** Element-locked mode (Element Manager): a fixed category + element(s) —
   *  only that element's cards are created. Without it, rows are free-form
   *  (comma-typed multi elements per category, like the day manager). */
  preseed?: { category: string; keys: string[] };
  onClose: () => void;
}

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** The unified "Add Events" modal (roadmap 46): one creation surface for
 *  events on a date. Pick the date (or land pre-targeted), the event type,
 *  then elements — comma-typed multi rows per category (parentless mode) or
 *  locked to one element (Element Manager mode). Create merges into the
 *  day's entry; each element renders as its own card. A "Create Rule
 *  instead" swap builds a rule on the same date via the shared editor. */
export function EventAdderModal({ date: preseedDate, preseed, onClose }: EventAdderModalProps) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const portalTarget = usePortalTarget();
  const sizes = ruleModalSizes();
  const { XSZ, CREM_BODY, CREM_LABEL, CREM_TEXT, CREM_DD_ITEM } = sizes;

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const nonShootDates = useMemo(() => activeVersion?.nonShootDates || [], [activeVersion?.nonShootDates]);
  const entryByDate = useMemo(() => getNonShootEntryMap(nonShootDates), [nonShootDates]);

  const attachableTypes = useMemo(
    () => getMarkableDayTypes(project).filter(t => t.attachable !== false),
    [project],
  );
  const [status, setStatus] = useState<string>(attachableTypes[0]?.key || 'travel');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // Element-locked mode: the category + element(s) are fixed by the caller.
  const locked = !!preseed;
  const [dateKey, setDateKey] = useState<string | null>(preseedDate || null);
  const [rows, setRows] = useState<AdderRow[]>(
    preseed
      ? [{ id: newRowId(), category: preseed.category, keys: [...preseed.keys].filter(k => k !== NON_SHOOT_ALL), all: preseed.keys.length === 1 && preseed.keys[0] === NON_SHOOT_ALL, notes: {}, noteOpen: true }]
      : [{ id: newRowId(), category: 'cast', keys: [], all: false, notes: {}, noteOpen: true }],
  );
  const [ruleMode, setRuleMode] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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

  const anchoredByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const cat of new Set((project.elementLinks || []).map(l => l.anchorCategory))) {
      map.set(cat, anchoredKeysFor(project.elementLinks, cat));
    }
    return map;
  }, [project.elementLinks]);

  const activeType = getDayType(project, status);
  const StatusIcon = typeIconComponent(project.dayTypes, status);
  const elementName = useMemo(() => {
    if (!locked || preseed!.keys.length === 0) return '';
    return resolveElementName(preseed!.keys[0], preseed!.category, project);
  }, [locked, preseed, project]);

  const patchRow = (id: string, patch: Partial<AdderRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const create = () => {
    if (!dateKey || !activeVersion || readOnly) return;
    const entry = entryByDate.get(dateKey);
    const lists = { ...(entry?.lists || {}) };
    const statusLists = { ...(lists[status] || {}) };
    const usedByCategory = new Map<string, string[]>();
    for (const r of rows) {
      if (r.all) {
        usedByCategory.set(r.category, [NON_SHOOT_ALL]);
        continue;
      }
      const keys = r.keys.map(k => k.trim()).filter(Boolean);
      if (keys.length === 0) continue;
      const prev = usedByCategory.get(r.category) || [];
      usedByCategory.set(r.category, [...new Set([...prev, ...keys])]);
    }
    const nextComments: Record<string, Record<string, Record<string, string>>> = {};
    for (const [cat, keys] of usedByCategory) {
      if (keys[0] === NON_SHOOT_ALL) {
        statusLists[cat] = [NON_SHOOT_ALL];
      } else {
        statusLists[cat] = [...new Set([...(statusLists[cat] || []).filter(k => k !== NON_SHOOT_ALL), ...keys])];
      }
      const row = rows.find(r => r.category === cat);
      const nonEmpty: Record<string, string> = {};
      for (const [k, t] of Object.entries(row?.notes || {})) {
        const trimmed = t.trim();
        if (trimmed) nonEmpty[k] = trimmed;
      }
      if (Object.keys(nonEmpty).length > 0) nextComments[status] = { ...(nextComments[status] || {}), [cat]: nonEmpty };
    }
    if (Object.keys(statusLists).length === 0) return;
    lists[status] = statusLists;
    const next: NonShootDate = {
      date: dateKey,
      ...(entry?.status ? { status: entry.status } : {}),
      lists,
    };
    if (Object.keys(nextComments).length > 0) {
      const comments = entry?.comments ? { ...entry.comments } : {};
      comments[status] = { ...(comments[status] || {}), ...nextComments[status] };
      next.comments = comments;
    }
    dispatch({
      type: 'UPDATE_VERSION',
      payload: { id: activeVersion.id, nonShootDates: upsertNonShootDate(nonShootDates, dateKey, next) },
    });
    onClose();
  };

  const windowBounds = useMemo(() => {
    const lo = activeVersion?.prepStart || activeVersion?.productionStart;
    const hi = activeVersion?.postEnd;
    if (!lo && !hi) return null;
    return { lo: lo || '0000-01-01', hi: hi || '9999-12-31' };
  }, [activeVersion]);
  const dateOutOfWindow = !!dateKey && !!windowBounds && (dateKey < windowBounds.lo || dateKey > windowBounds.hi);

  return (
    <Modal open onClose={onClose} title={locked ? `Add Event${elementName ? ` — ${elementName}` : ''}` : 'Add Events'} width="max-w-xl"
      footer={
        <ModalFooter>
          <Button theme="dark" variant="subtle" className="px-6 py-2 text-zinc-400" onPointerDown={(e) => { e.preventDefault(); onClose(); }}>
            Cancel
          </Button>
          {!ruleMode && (
            <Button theme="dark" variant="primary" className="px-6 py-2" disabled={!dateKey} onPointerDown={(e) => { e.preventDefault(); create(); }}>
              Create
            </Button>
          )}
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>
        {ruleMode ? (
          <RuleEditorPanel
            bare
            initial={null}
            preseedDateKey={dateKey || undefined}
            scenes={project.scenes}
            castMembers={project.castMembers || []}
            anchoredKeys={anchoredByCategory.get('cast')}
            onSave={(rules) => {
              for (const r of rules) dispatch({ type: 'ADD_RULE', payload: r });
              onClose();
            }}
            onClose={() => setRuleMode(false)}
          />
        ) : (
          <div className="space-y-5">
            {/* Date: pre-targeted label, else the picker */}
            <div>
              <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
                <Sun className={`${XSZ} text-zinc-500`} />
                Date
              </span>
              {dateKey ? (
                <button
                  type="button"
                  onClick={() => setDateKey(null)}
                  title="Change date"
                  className="px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                >
                  {formatDateLabel(dateKey)}
                  <X className="w-3 h-3 text-zinc-500" />
                </button>
              ) : (
                <DatePicker
                  selected={[]}
                  onChange={(ds) => setDateKey(ds[0] || null)}
                  theme="dark"
                />
              )}
              {dateOutOfWindow && (
                <p className={`${CREM_LABEL} text-amber-400 mt-1`}>Outside this production's date range — events still work, but the calendar may not show the day.</p>
              )}
            </div>

            {/* Event type */}
            <div>
              <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
                <Clock4 className={`${XSZ} text-zinc-500`} />
                Event Type
              </span>
              <DropdownMenu
                open={statusMenuOpen}
                onOpenChange={setStatusMenuOpen}
                width="w-52"
                theme="dark"
                trigger={
                  <Button theme="dark" variant="subtle" className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 flex items-center gap-2">
                    <StatusIcon className={XSZ} style={activeType?.color ? { color: activeType.color } : undefined} />
                    <span className="truncate text-zinc-200">{activeType?.label || status}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                  </Button>
                }
              >
                {attachableTypes.map(t => {
                  const Icon = typeIconComponent(project.dayTypes, t.key);
                  return (
                    <DropdownItem key={t.key} onClick={() => { setStatus(t.key); setStatusMenuOpen(false); }}
                      icon={<Icon className="w-3.5 h-3.5" style={t.color ? { color: t.color } : undefined} />}
                    >
                      <span className="text-zinc-200">{t.label}</span>
                    </DropdownItem>
                  );
                })}
              </DropdownMenu>
            </div>

            {/* Elements: locked to the element, or comma-typed rows per category */}
            <div>
              <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
                <Plus className={`${XSZ} text-zinc-500`} />
                Cast & Elements
              </span>
              <div className="space-y-2">
                {rows.map(r => {
                  const isCast = r.category === 'cast';
                  const items = getCategoryElements(project, r.category);
                  const catDef = categoryLabelLookup[r.category] || r.category;
                  const hasNotes = Object.values(r.notes).some(t => t.trim());
                  const noteKeys = r.all ? [NON_SHOOT_ALL] : r.keys;
                  return (
                    <div key={r.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        {locked ? (
                          <span className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-300 flex items-center gap-1.5 shrink-0">
                            {catDef}
                          </span>
                        ) : (
                          <CategoryDropdown
                            value={r.category}
                            onChange={(cat) => patchRow(r.id, { category: cat, keys: [], all: false })}
                            allCategoryKeys={allCategoryKeys}
                            categoryLabelLookup={categoryLabelLookup}
                            customCategories={project.customCategories}
                            open={openDropdown === `cat-${r.id}`}
                            onOpenChange={(o) => setOpenDropdown(o ? `cat-${r.id}` : null)}
                            btnClass="px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors flex items-center gap-1.5"
                            itemClass={CREM_DD_ITEM}
                          />
                        )}
                        {locked && r.all ? (
                          <span className={`${CREM_TEXT} text-xs text-zinc-300`}>All {catDef}</span>
                        ) : (
                          <EntityDropdown
                            value={r.keys.join(', ')}
                            onChange={val => patchRow(r.id, { keys: val.split(',').map(x => x.trim()).filter(Boolean), all: false })}
                            items={items}
                            positioning="fixed"
                            portalTarget={portalTarget ?? document.body}
                            mode={locked ? 'single' : 'multi'}
                            variant="chip"
                            placeholder={locked ? 'This element' : isCast ? 'Type cast members, comma-separated — e.g. 1, 2' : 'Type elements, comma-separated'}
                            className="text-xs flex-1 min-w-0"
                            displayMode={isCast ? 'id' : 'name'}
                            readOnly={locked}
                            anchoredKeys={anchoredByCategory.get(r.category)}
                            renderItem={isCast ? (item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></> : undefined}
                          />
                        )}
                        <Button
                          theme="dark"
                          variant="subtle"
                          onPointerDown={(e) => { e.preventDefault(); patchRow(r.id, { noteOpen: !r.noteOpen }); }}
                          title="Notes per element"
                          className={`p-1 shrink-0 ${hasNotes ? '!text-amber-300' : ''}`}
                        >
                          <MessageSquare className="w-3 h-3" />
                        </Button>
                        {!locked && (
                          <>
                            <Checkbox
                              checked={r.all}
                              onChange={() => patchRow(r.id, { all: !r.all, keys: !r.all ? [NON_SHOOT_ALL] : [] })}
                              label="All"
                              theme="dark"
                              className="shrink-0"
                            />
                            <Button theme="dark" variant="subtle" onPointerDown={(e) => { e.preventDefault(); setRows(prev => prev.filter(x => x.id !== r.id)); }} className="p-1 shrink-0" title={`Remove this ${catDef} row`}>
                              <X className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                      {(r.noteOpen || hasNotes) && noteKeys.length > 0 && (
                        <div className="space-y-1.5 pl-10">
                          {noteKeys.map(k => (
                            <div key={k} className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-400 truncate max-w-[130px] shrink-0">
                                {r.all ? `All ${catDef}` : resolveElementName(k, r.category, project)}
                              </span>
                              <input
                                type="text"
                                value={r.notes[k] || ''}
                                onChange={(e) => patchRow(r.id, { notes: { ...r.notes, [k]: e.target.value } })}
                                placeholder={`Note for ${r.all ? `all ${catDef}` : resolveElementName(k, r.category, project)} — e.g. "Traveling from Singapore"`}
                                className={`${CREM_TEXT} w-full px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500 placeholder-zinc-600`}
                                autoFocus={r.noteOpen && !r.notes[k]}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!locked && (
                <button
                  type="button"
                  onClick={() => setRows(prev => [...prev, { id: newRowId(), category: allCategoryKeys[0]?.key || 'cast', keys: [], all: false, notes: {}, noteOpen: true }])}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add {categoryLabelLookup[allCategoryKeys[0]?.key] || 'category'} row
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              {locked && rows[0]?.keys.length > 0 && (
                <span className={`${CREM_LABEL} text-zinc-500 flex items-center gap-1.5`}>
                  <Sun className="w-3 h-3" />
                  Will create {rows[0].keys.length} card{rows[0].keys.length === 1 ? '' : 's'} on {dateKey ? formatDateLabel(dateKey) : 'the picked date'}
                </span>
              )}
              <button
                type="button"
                onClick={() => setRuleMode(true)}
                className="ml-auto flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Clock4 className="w-3 h-3" /> Create a rule instead
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}