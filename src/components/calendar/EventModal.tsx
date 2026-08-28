import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate } from '../../types';
import { getMarkableDayTypes, getDayType, typeIconComponent } from '../../lib/dayTypes';
import { getNonShootEntryMap, upsertNonShootDate, getTypeLists, NON_SHOOT_ALL, resolveElementName } from '../../lib/nonShootHelpers';
import { mergeItemsInto, removeItemsFrom } from '../../lib/events';
import Modal, { ModalFooter } from '../Modal';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import Button from '../Button';
import { ChevronDown, Sun, Trash2 } from 'lucide-react';

interface EventModalProps {
  /** The single event being edited: one element's card on one date. */
  dateKey: string;
  statusKey: string;
  category: string;
  elementKey: string;
  onClose: () => void;
}

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** The single-event editor (roadmap 46) — opened from the element events
 *  manager's row pencil. Edits ONE element's card on a date: its event type
 *  (changing it moves the card to the new type) and its own note. Delete
 *  removes the card. Never the whole-day editor — other elements' cards are
 *  untouched. */
export function EventModal({ dateKey, statusKey, category, elementKey, onClose }: EventModalProps) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const sizes = ruleModalSizes();
  const { XSZ, CREM_BODY, CREM_LABEL, CREM_TEXT } = sizes;

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const nonShootDates = useMemo(() => activeVersion?.nonShootDates || [], [activeVersion?.nonShootDates]);
  const entryByDate = useMemo(() => getNonShootEntryMap(nonShootDates), [nonShootDates]);

  const attachableTypes = useMemo(
    () => getMarkableDayTypes(project).filter(t => t.attachable !== false),
    [project],
  );
  const [type, setType] = useState<string>(statusKey);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [note, setNote] = useState<string>(() => {
    const entry = entryByDate.get(dateKey);
    const no = entry?.comments?.[statusKey]?.[category]?.[elementKey];
    return (no && typeof no === 'string' ? no : '') || '';
  });

  const activeType = getDayType(project, type);
  const TypeIcon = typeIconComponent(project.dayTypes, type);
  const NoteIcon = typeIconComponent(project.dayTypes, type);
  const name = resolveElementName(elementKey, category, project);
  const dayLabel = formatDateLabel(dateKey);

  const commit = (entryIn: NonShootDate | undefined) => {
    if (!activeVersion) return;
    const entry: NonShootDate = entryIn ?? { date: dateKey, lists: {} };
    dispatch({
      type: 'UPDATE_VERSION',
      payload: { id: activeVersion.id, nonShootDates: upsertNonShootDate(nonShootDates, dateKey, entry) },
    });
    onClose();
  };

  const save = () => {
    if (readOnly) return;
    let entry = entryByDate.get(dateKey);
    if (type !== statusKey) {
      // Move the card: remove this element from the OLD type's cards on the
      // date (whole-category cards are untouched — nothing to remove).
      for (const [cat, keys] of Object.entries(getTypeLists(entry, statusKey))) {
        if (keys.includes(NON_SHOOT_ALL)) continue;
        if (keys.includes(elementKey)) entry = removeItemsFrom(entry, statusKey, cat, [elementKey]);
      }
    }
    const trimmed = note.trim();
    entry = mergeItemsInto(entry, type, category, [elementKey], trimmed ? { [elementKey]: trimmed } : undefined);
    commit(entry);
  };

  const remove = () => {
    if (readOnly) return;
    let entry = entryByDate.get(dateKey);
    for (const st of Object.keys(entry?.lists || {})) {
      for (const [cat, keys] of Object.entries(getTypeLists(entry, st))) {
        if (keys.includes(NON_SHOOT_ALL)) continue;
        if (keys.includes(elementKey)) entry = removeItemsFrom(entry, st, cat, [elementKey]);
      }
    }
    commit(entry);
  };

  return (
    <Modal open onClose={onClose} title={`${name} — ${dayLabel}`} width="max-w-md"
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
          <p className={`${CREM_LABEL} text-zinc-600 mt-1.5`}>Changing the type moves this element's card on {dayLabel} to the new type.</p>
        </div>

        <div>
          <span className={`${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`}>
            <NoteIcon className={`${XSZ} text-zinc-500`} />
            Note for {name}
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`e.g. "Traveling from Singapore"`}
            className={`${CREM_TEXT} w-full px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500 placeholder-zinc-600`}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}