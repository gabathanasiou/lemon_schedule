import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate } from '../../types';
import { getMarkableDayTypes, getDayType, typeIconComponent } from '../../lib/dayTypes';
import { getNonShootEntryMap, upsertNonShootDate, NON_SHOOT_ALL, resolveElementName } from '../../lib/nonShootHelpers';
import { getCategoryElements } from '../../lib/elements';
import { anchoredKeysFor } from '../../lib/elementLinks';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import DateField from '../DateField';
import { EntityDropdown } from '../EntityDropdown';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { usePortalTarget } from '../../lib/popoutTarget';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import Button from '../Button';
import Checkbox from '../Checkbox';
import { DD_CHIP_TRIGGER_CLASS } from '../../lib/dropdown';
import { Plus, X, ChevronDown, Sun, Clock4 } from 'lucide-react';

interface AdderRow {
  id: string;
  category: string;
  /** Element keys for this category (cast = IDs, others = names). */
  keys: string[];
  all: boolean;
}

let adderRowSeq = 0;
const newRowId = () => `arow-${++adderRowSeq}`;

interface EventAdderModalProps {
  /** Pre-targeted date (calendar right-click / the day modal's Add Event).
   *  When absent the adder shows the date picker. */
  date?: string;
  /** Element-locked mode (Element Manager): a fixed category + element(s) —
   *  only that element's cards are created. Without it, rows are free-form
   *  (comma-typed multi elements per category, like the day manager). */
  preseed?: { category: string; keys: string[] };
  /** Pre-selected event type (the day modal opens it with the day's status). */
  status?: string;
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
export function EventAdderModal({ date: preseedDate, preseed, status: statusProp, onClose }: EventAdderModalProps) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const portalTarget = usePortalTarget();
  const sizes = ruleModalSizes();
  const { XSZ, CREM_BODY, CREM_LABEL, CREM_TEXT } = sizes;

  const activeCalendarVersion = project.calendarVersions.find(v => v.id === project.activeCalendarVersionId);
  const nonShootDates = useMemo(() => activeCalendarVersion?.nonShootDates || [], [activeCalendarVersion?.nonShootDates]);
  const entryByDate = useMemo(() => getNonShootEntryMap(nonShootDates), [nonShootDates]);

  const attachableTypes = useMemo(
    () => getMarkableDayTypes(project).filter(t => t.attachable !== false),
    [project],
  );
  const [status, setStatus] = useState<string>(statusProp ?? (attachableTypes[0]?.key || 'travel'));
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // Element-locked mode: the category + element(s) are fixed by the caller.
  const locked = !!preseed;
  const [dateKeys, setDateKeys] = useState<string[]>(preseedDate ? [preseedDate] : []);
  const [rows, setRows] = useState<AdderRow[]>(
    preseed
      ? [{ id: newRowId(), category: preseed.category, keys: [...preseed.keys].filter(k => k !== NON_SHOOT_ALL), all: preseed.keys.length === 1 && preseed.keys[0] === NON_SHOOT_ALL }]
      : [{ id: newRowId(), category: 'cast', keys: [], all: false }],
  );
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

  /** Builds the day's entry for ONE date (existing lists merge, cards append). */
  const buildEntry = (date: string): NonShootDate | null => {
    const entry = entryByDate.get(date);
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
    }
    if (Object.keys(statusLists).length === 0) return null;
    lists[status] = statusLists;
    const next: NonShootDate = {
      date,
      ...(entry?.status ? { status: entry.status } : {}),
      lists,
    };
    return next;
  };

  const create = () => {
    if (dateKeys.length === 0 || !activeCalendarVersion || readOnly) return;
    const created: { date: string; entry: NonShootDate }[] = [];
    for (const d of dateKeys) {
      const entry = buildEntry(d);
      if (entry) created.push({ date: d, entry });
    }
    if (created.length === 0) return;
    // UPDATE_CALENDAR_VERSION REPLACES the calendar version's nonShootDates
    // wholesale — each dispatch carries a full snapshot, so a loop of
    // dispatches computed from the same base would clobber earlier dates
    // (only the last lands). Accumulate into ONE merged array and dispatch once.
    let merged = nonShootDates;
    for (const { date, entry } of created) merged = upsertNonShootDate(merged, date, entry);
    dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: activeCalendarVersion.id, nonShootDates: merged } });
    onClose();
  };

  const windowBounds = useMemo(() => {
    const lo = activeCalendarVersion?.prepStart || activeCalendarVersion?.productionStart;
    const hi = activeCalendarVersion?.postEnd;
    if (!lo && !hi) return null;
    return { lo: lo || '0000-01-01', hi: hi || '9999-12-31' };
  }, [activeCalendarVersion]);
  const dateOutOfWindow = !!windowBounds && dateKeys.some(d => d < windowBounds.lo || d > windowBounds.hi);

  return (
    <Modal open onClose={onClose} title={locked ? `Add Event${elementName ? ` — ${elementName}` : ''}` : 'Add Events'} width="max-w-xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={create} disabled={dateKeys.length === 0}>Create</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>
        <div className="space-y-5">
            {/* Date: pre-targeted label, else the picker */}
          <div>
            <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
              <Sun className={`${XSZ} text-zinc-500`} />
              Date
            </span>
            <DateField
              value={dateKeys}
              onChange={setDateKeys}
              placeholder="Pick a date"
              variant={locked ? 'inline' : 'chrome'}
              multi={locked}
              className={locked ? undefined : 'w-full'}
            />
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
                  <button type="button" className={`${DD_CHIP_TRIGGER_CLASS} text-xs cursor-pointer w-full justify-between`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <StatusIcon className={XSZ} style={activeType?.color ? { color: activeType.color } : undefined} />
                      <span className="truncate">{activeType?.label || status}</span>
                    </span>
                    <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                  </button>
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

            {locked ? (
            /* Element-locked: no cast & elements section — the element is in
               the title. Nothing else to pick. */
            <p className={`${CREM_LABEL} text-zinc-600 italic`}>
              {elementName} will be added on the selected date{dateKeys.length > 1 ? 's' : ''}.
            </p>
          ) : (
            <>
            {/* Elements: comma-typed rows per category (parentless mode) */}
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
                  return (
                    <div key={r.id} className="flex items-center gap-2">
                      <CategoryDropdown
                        value={r.category}
                        onChange={(cat) => patchRow(r.id, { category: cat, keys: [], all: false })}
                        allCategoryKeys={allCategoryKeys}
                        categoryLabelLookup={categoryLabelLookup}
                        customCategories={project.customCategories}
                        open={openDropdown === `cat-${r.id}`}
                        onOpenChange={(o) => setOpenDropdown(o ? `cat-${r.id}` : null)}
                        btnClass="text-xs"
                      />
                      <EntityDropdown
                        value={r.keys.join(', ')}
                        onChange={val => patchRow(r.id, { keys: val.split(',').map(x => x.trim()).filter(Boolean), all: false })}
                        items={items}
                        positioning="fixed"
                        portalTarget={portalTarget ?? document.body}
                        mode="multi"
                        variant="chip"
                        placeholder={isCast ? 'Type cast members, comma-separated — e.g. 1, 2' : 'Type elements, comma-separated'}
                        className="text-xs flex-1 min-w-0"
                        displayMode={isCast ? 'id' : 'name'}
                        anchoredKeys={anchoredByCategory.get(r.category)}
                        renderItem={isCast ? (item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></> : undefined}
                      />
                      <Checkbox
                        checked={r.all}
                        onChange={() => patchRow(r.id, { all: !r.all, keys: !r.all ? [NON_SHOOT_ALL] : [] })}
                        label="All"
                        theme="dark"
                        variant="plain"
                        className="shrink-0"
                      />
                      <Button theme="dark" variant="subtle" onPointerDown={(e) => { e.preventDefault(); setRows(prev => prev.filter(x => x.id !== r.id)); }} className="p-1 shrink-0" title={`Remove this ${catDef} row`}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setRows(prev => [...prev, { id: newRowId(), category: allCategoryKeys[0]?.key || 'cast', keys: [], all: false }])}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add element
              </button>
            </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}