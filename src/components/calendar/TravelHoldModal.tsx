import React, { useMemo, useRef, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate } from '../../types';
import { getTypeLists, NON_SHOOT_ALL } from '../../lib/nonShootHelpers';
import { getDayTypes, getDayType, iconForType } from '../../lib/dayTypes';
import { getCategoryElements } from '../../lib/elements';
import { ELEMENT_CATEGORIES, getLabel, getCustomIcon } from '../../lib/categories';
import Modal, { ModalFooter } from '../Modal';
import { EntityDropdown } from '../EntityDropdown';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { usePortalTarget } from '../../lib/popoutTarget';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import { Plus, X, Check, ChevronDown, Link2, Sun } from 'lucide-react';

interface AttachRow {
  category: string;
  keys: string[];
  all: boolean;
}

interface TravelHoldModalProps {
  dateKey: string;
  entry?: NonShootDate | null;
  onSave: (entry: NonShootDate) => void;
  onClose: () => void;
}

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export const TravelHoldModal: React.FC<TravelHoldModalProps> = ({ dateKey, entry, onSave, onClose }) => {
  const { state } = useProject();
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

  const dayTypes = useMemo(() => getDayTypes(project), [project]);
  const [statusKey, setStatusKey] = useState<string | null>(entry?.status || null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const activeType = statusKey ? getDayType(project, statusKey) : undefined;
  const attachable = !!activeType?.attachable;

  const seedRows = (key: string | null): AttachRow[] => {
    const lists = getTypeLists(entry, key);
    const init: AttachRow[] = Object.entries(lists).map(([category, keys]) => ({ category, keys, all: keys.includes(NON_SHOOT_ALL) }));
    return init.length > 0 ? init : [{ category: 'cast', keys: [], all: false }];
  };

  const [rows, setRows] = useState<AttachRow[]>(() => seedRows(entry?.status || null));
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const changeStatus = (key: string | null) => {
    setStatusKey(key);
    setRows(seedRows(key));
  };

  const addRow = () => {
    const first = allCategoryKeys[0];
    setRows(prev => [...prev, { category: first ? first.key : 'cast', keys: [], all: false }]);
  };

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

  const setCategory = (idx: number, category: string) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, category, keys: [], all: false } : r));

  const setKeys = (idx: number, keys: string[]) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, keys, all: false } : r));

  const toggleAll = (idx: number) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, all: !r.all, keys: !r.all ? [NON_SHOOT_ALL] : [] } : r));

  const handleSave = () => {
    const nextLists: Record<string, Record<string, string[]>> = { ...(entry?.lists || {}) };
    if (statusKey && attachable) {
      const map: Record<string, string[]> = {};
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const raw = rowRefs.current[i]?.querySelector('input')?.value ?? '';
        const keys = r.all
          ? [NON_SHOOT_ALL]
          : (raw || r.keys.join(', ')).split(',').map(k => k.trim()).filter(Boolean);
        if (keys.length === 0) continue;
        map[r.category] = [...(map[r.category] || []), ...keys];
      }
      if (Object.keys(map).length > 0) nextLists[statusKey] = map;
      else delete nextLists[statusKey];
    } else if (statusKey) {
      delete nextLists[statusKey];
    } else {
      for (const k of Object.keys(nextLists)) delete nextLists[k];
    }
    const next: NonShootDate = {
      date: dateKey,
      ...(statusKey ? { status: statusKey } : {}),
      ...(Object.keys(nextLists).length > 0 ? { lists: nextLists } : {}),
    };
    onSave(next);
    onClose();
  };

  const getItemsFor = (category: string) => getCategoryElements(project, category);

  const StatusIcon = (key: string | null, sizeClass: string = XSZ) => {
    const Icon = getCustomIcon(iconForType(project.dayTypes, key));
    return <Icon className={sizeClass} />;
  };

  return (
    <Modal open onClose={onClose} title={`Day Status — ${formatDateLabel(dateKey)}`} width="max-w-2xl"
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
                onPointerDown={(e) => e.preventDefault()}
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

        {!statusKey ? (
          <p className={`${CREM_LABEL} text-zinc-600 italic`}>Pick a day type to attach cast or elements.</p>
        ) : !attachable ? (
          <p className={`${CREM_LABEL} text-zinc-600 italic`}>This day type doesn't support attaching cast or elements.</p>
        ) : (
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
              <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                <Link2 className={`${XSZ} text-zinc-400`} />
                Attached {activeType?.label || 'cast & elements'}
              </span>
              <button onPointerDown={(e) => { e.preventDefault(); addRow(); }} className={`${CREM_LABEL} text-zinc-400 hover:text-zinc-200 font-medium flex items-center gap-1`} style={{ padding: 0, background: 'none', border: 'none' }}>
                <Plus className={XSZ} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => {
                const isCast = r.category === 'cast';
                const items = getItemsFor(r.category);
                const catLabel = categoryLabelLookup[r.category] || r.category;
                return (
                  <div key={i} ref={el => { rowRefs.current[i] = el; }} className="flex items-center gap-2">
                    <CategoryDropdown
                      value={r.category}
                      onChange={(cat) => setCategory(i, cat)}
                      allCategoryKeys={allCategoryKeys}
                      categoryLabelLookup={categoryLabelLookup}
                      customCategories={project.customCategories}
                      open={openDropdown === `cat-${i}`}
                      onOpenChange={(o) => setOpenDropdown(o ? `cat-${i}` : null)}
                      btnClass={CREM_BTN_COND}
                      itemClass={CREM_DD_ITEM}
                    />
                    <EntityDropdown
                      value={r.all ? '' : r.keys.join(', ')}
                      onChange={val => setKeys(i, val.split(',').map(x => x.trim()).filter(Boolean))}
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
                      onPointerDown={(e) => { e.preventDefault(); toggleAll(i); }}
                      title={`All ${catLabel}`}
                      className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-zinc-800 transition-colors shrink-0"
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${r.all ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-600'}`}>
                        {r.all && <Check className="w-3 h-3 text-zinc-200" />}
                      </span>
                      <span className={`${CREM_TEXT} text-zinc-400`}>All</span>
                    </button>
                    <button onPointerDown={(e) => { e.preventDefault(); removeRow(i); }} className="text-zinc-600 hover:text-red-400 transition-colors p-0.5 shrink-0">
                      <X className={XSZ} />
                    </button>
                  </div>
                );
              })}
              {rows.length === 1 && rows[0].keys.length === 0 && !rows[0].all && (
                <p className={`${CREM_LABEL} text-zinc-600 italic`}>Nothing marked — press Add to mark elements.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};