import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate } from '../../types';
import { getMarkableDayTypes, getDayType, typeIconComponent } from '../../lib/dayTypes';
import { getNonShootEntryMap, upsertNonShootDate, getTypeLists, NON_SHOOT_ALL, resolveElementName } from '../../lib/nonShootHelpers';
import { getCategoryElements } from '../../lib/elements';
import { anchoredKeysFor } from '../../lib/elementLinks';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { mergeItemsInto, removeItemsFrom } from '../../lib/events';
import Modal, { ModalFooter } from '../Modal';
import DatePicker from '../DatePicker';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { EntityDropdown } from '../EntityDropdown';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { usePortalTarget } from '../../lib/popoutTarget';
import Button from '../Button';
import { ChevronDown, Sun, Trash2, X, MessageSquare } from 'lucide-react';

interface EventModalProps {
  /** The single event being edited: one element's card on one date. */
  dateKey: string;
  statusKey: string;
  category: string;
  elementKey: string;
  /** When true (calendar card dblclick) the element + its category are
   *  editable; the element events manager keeps them locked. */
  editableElement?: boolean;
  onClose: () => void;
}

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** The single-event editor (roadmap 46) — one element's card on one date.
 *  From the calendar: the date, event type, element + category and the
 *  note are all editable (changing anything moves the card). From the
 *  element events manager the element + category stay locked. Delete
 *  removes the card. Never the whole-day editor — other cards untouched. */
export function EventModal({ dateKey, statusKey, category, elementKey, editableElement, onClose }: EventModalProps) {
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
  const [date, setDate] = useState<string>(dateKey);
  const [type, setType] = useState<string>(statusKey);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [cat, setCat] = useState<string>(category);
  const [key, setKey] = useState<string>(elementKey);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [note, setNote] = useState<string>(() => {
    const entry = entryByDate.get(dateKey);
    const no = entry?.comments?.[statusKey]?.[category]?.[elementKey];
    return (no && typeof no === 'string' ? no : '') || '';
  });

  const windowBounds = useMemo(() => {
    const lo = activeVersion?.prepStart || activeVersion?.productionStart;
    const hi = activeVersion?.postEnd;
    if (!lo && !hi) return null;
    return { lo: lo || '0000-01-01', hi: hi || '9999-12-31' };
  }, [activeVersion]);
  const dateOutOfWindow = !!windowBounds && (date < windowBounds.lo || date > windowBounds.hi);

  const activeType = getDayType(project, type);
  const TypeIcon = typeIconComponent(project.dayTypes, type);
  const NoteIcon = typeIconComponent(project.dayTypes, type);
  const name = resolveElementName(key, cat, project);
  const dayLabel = formatDateLabel(date);

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
    for (const cat2 of new Set((project.elementLinks || []).map(l => l.anchorCategory))) {
      map.set(cat2, anchoredKeysFor(project.elementLinks, cat2));
    }
    return map;
  }, [project.elementLinks]);

  const save = () => {
    if (readOnly) return;
    const trimmed = note.trim();
    const changed = date !== dateKey || type !== statusKey || cat !== category || key !== elementKey;

    // Remove the ORIGINAL card (old date × old type, any category holding the
    // old element — its note goes with it). Whole-category cards untouched.
    let entryOld = entryByDate.get(dateKey);
    if (changed) {
      for (const [c, keys] of Object.entries(getTypeLists(entryOld, statusKey))) {
        if (keys.includes(NON_SHOOT_ALL)) continue;
        if (keys.includes(elementKey)) entryOld = removeItemsFrom(entryOld, statusKey, c, [elementKey]);
      }
    }

    // Add/move the card under the new identity with its note.
    let entryNew = date === dateKey ? entryOld : entryByDate.get(date);
    entryNew = mergeItemsInto(entryNew, type, cat, [key], trimmed ? { [key]: trimmed } : undefined);

    const updates: { type: 'UPDATE_VERSION'; payload: { id: string; nonShootDates: NonShootDate[] } }[] = [];
    if (date === dateKey) {
      updates.push({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, nonShootDates: upsertNonShootDate(nonShootDates, date, entryNew) } });
    } else {
      updates.push({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, nonShootDates: upsertNonShootDate(nonShootDates, dateKey, entryOld) } });
      updates.push({ type: 'UPDATE_VERSION', payload: { id: activeVersion!.id, nonShootDates: upsertNonShootDate(nonShootDates, date, entryNew) } });
    }
    dispatch({ type: 'BATCH_START' });
    for (const u of updates) dispatch(u);
    dispatch({ type: 'BATCH_COMMIT' });
    onClose();
  };

  const remove = () => {
    if (readOnly) return;
    // Delete the ORIGINAL card wherever it sits.
    let entry = entryByDate.get(dateKey);
    for (const st of Object.keys(entry?.lists || {})) {
      if (st !== statusKey) continue;
      for (const [c, keys] of Object.entries(getTypeLists(entry, st))) {
        if (keys.includes(NON_SHOOT_ALL)) continue;
        if (keys.includes(elementKey)) entry = removeItemsFrom(entry, st, c, [elementKey]);
      }
    }
    if (!activeVersion) return;
    dispatch({
      type: 'UPDATE_VERSION',
      payload: { id: activeVersion.id, nonShootDates: upsertNonShootDate(nonShootDates, dateKey, entry ?? { date: dateKey, lists: {} }) },
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${name} — ${dayLabel}`} width="max-w-lg"
      footer={
        <ModalFooter>
          <Button theme="dark" variant="danger-ghost" className="px-6 py-2 mr-auto" onPointerDown={(e) => { e.preventDefault(); remove(); }}>
            <Trash2 className="w-3.5 h-3.5" /> Delete Event
          </Button>
          <Button theme="dark" variant="subtle" className="px-6 py-2 text-zinc-400" onPointerDown={(e) => { e.preventDefault(); onClose(); }}>
            Cancel
          </Button>
          <Button theme="dark" variant="primary" className="px-6 py-2" onPointerDown={(e) => { e.preventDefault(); save(); }}>
            Save
          </Button>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>
        {/* Element — at the top (editable from the calendar; the element
            manager locks it — the title already names the element) */}
        {editableElement && (
          <div>
            <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
              <Sun className={`${XSZ} text-zinc-500`} />
              Element
            </span>
            <div className="flex items-center gap-2">
              <CategoryDropdown
                value={cat}
                onChange={(c) => setCat(c)}
                allCategoryKeys={allCategoryKeys}
                categoryLabelLookup={categoryLabelLookup}
                customCategories={project.customCategories}
                open={openDropdown === 'ev-cat'}
                onOpenChange={(o) => setOpenDropdown(o ? 'ev-cat' : null)}
                btnClass="px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors flex items-center gap-1.5"
                itemClass={CREM_DD_ITEM}
              />
              <EntityDropdown
                value={key}
                onChange={setKey}
                items={getCategoryElements(project, cat)}
                positioning="fixed"
                portalTarget={portalTarget ?? document.body}
                mode="single"
                variant="chip"
                placeholder={cat === 'cast' ? 'Search cast members...' : 'Search elements...'}
                className="text-xs flex-1 min-w-0"
                displayMode={cat === 'cast' ? 'id' : 'name'}
                anchoredKeys={anchoredByCategory.get(cat)}
                renderItem={cat === 'cast' ? (item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></> : undefined}
              />
            </div>
          </div>
        )}

        {/* Date + Event Type — side by side */}
        <div className="grid grid-cols-2 gap-3 items-start">
          <div>
            <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
              <Sun className={`${XSZ} text-zinc-500`} />
              Date
            </span>
            {date ? (
              <button
                type="button"
                onClick={() => setDate('')}
                title="Change date"
                className="px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                {formatDateLabel(date)}
                <X className="w-3 h-3 text-zinc-500" />
              </button>
            ) : (
              <DatePicker
                selected={[]}
                onChange={(ds) => setDate(ds[0] || '')}
                theme="dark"
              />
            )}
            {dateOutOfWindow && (
              <p className={`${CREM_LABEL} text-amber-400 mt-1`}>Outside this production's date range — events still work, but the calendar may not show the day.</p>
            )}
          </div>

          <div>
            <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
              <Sun className={`${XSZ} text-zinc-500`} />
              Event Type
            </span>
            <DropdownMenu
              open={typeMenuOpen}
              onOpenChange={setTypeMenuOpen}
              width="w-52"
              theme="dark"
              trigger={
                <Button theme="dark" variant="subtle" className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 flex items-center gap-2">
                  <TypeIcon className={XSZ} style={activeType?.color ? { color: activeType.color } : undefined} />
                  <span className="truncate text-zinc-200">{activeType?.label || type}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                </Button>
              }
            >
              {attachableTypes.map(t => {
                const Icon = typeIconComponent(project.dayTypes, t.key);
                return (
                  <DropdownItem key={t.key} onClick={() => { setType(t.key); setTypeMenuOpen(false); }}
                    icon={<Icon className="w-3.5 h-3.5" style={t.color ? { color: t.color } : undefined} />}
                  >
                    <span className="text-zinc-200">{t.label}</span>
                  </DropdownItem>
                );
              })}
            </DropdownMenu>
            <p className={`${CREM_LABEL} text-zinc-600 mt-1.5`}>Changing the type moves this element's card to the new type.</p>
          </div>
        </div>

        {/* Note — open by default */}
        <div>
          <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
            <NoteIcon className={`${XSZ} text-zinc-500`} />
            Note for {name}
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='e.g. "Traveling from Singapore"'
            className={`${CREM_TEXT} w-full px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500 placeholder-zinc-600`}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}