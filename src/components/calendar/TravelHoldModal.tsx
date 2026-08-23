import React, { useMemo, useRef, useState } from 'react';
import { useProject } from '../../store';
import { NonShootDate } from '../../types';
import { getTravelHoldLists, NON_SHOOT_ALL } from '../../lib/nonShootHelpers';
import { getDayTypes } from '../../lib/dayTypes';
import { getCategoryElements } from '../../lib/elements';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { IS_COARSE } from '../../lib/device';
import Modal, { ModalFooter } from '../Modal';
import { EntityDropdown } from '../EntityDropdown';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { ruleModalSizes } from '../rules/ColorRuleFormParts';
import { usePortalTarget } from '../../lib/popoutTarget';
import { Plane, Pause, Plus, X, Check, Sun } from 'lucide-react';

interface TravelHoldRow {
  kind: 'travel' | 'hold';
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

  const [rows, setRows] = useState<TravelHoldRow[]>(() => {
    const { travel, hold } = getTravelHoldLists(entry);
    const init: TravelHoldRow[] = [];
    for (const [category, keys] of Object.entries(travel)) init.push({ kind: 'travel', category, keys, all: keys.includes(NON_SHOOT_ALL) });
    for (const [category, keys] of Object.entries(hold)) init.push({ kind: 'hold', category, keys, all: keys.includes(NON_SHOOT_ALL) });
    if (init.length === 0) init.push({ kind: 'travel', category: 'cast', keys: [], all: false });
    if (!init.some(r => r.kind === 'hold')) init.push({ kind: 'hold', category: 'cast', keys: [], all: false });
    return init;
  });
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [statusKey, setStatusKey] = useState<string | null>(entry?.status || null);
  const dayTypes = useMemo(() => getDayTypes(project), [project]);

  const addRow = (kind: 'travel' | 'hold') => {
    const first = allCategoryKeys[0];
    setRows(prev => [...prev, { kind, category: first ? first.key : 'cast', keys: [], all: false }]);
  };

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

  const setCategory = (idx: number, category: string) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, category, keys: [], all: false } : r));

  const setKeys = (idx: number, keys: string[]) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, keys, all: false } : r));

  const toggleAll = (idx: number) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, all: !r.all, keys: !r.all ? [NON_SHOOT_ALL] : [] } : r));

  const handleSave = () => {
    const travel: Record<string, string[]> = {};
    const hold: Record<string, string[]> = {};
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const raw = rowRefs.current[i]?.querySelector('input')?.value ?? '';
      const keys = r.all
        ? [NON_SHOOT_ALL]
        : (raw || r.keys.join(', ')).split(',').map(k => k.trim()).filter(Boolean);
      if (keys.length === 0) continue;
      const map = r.kind === 'travel' ? travel : hold;
      map[r.category] = [...(map[r.category] || []), ...keys];
    }
    const next: NonShootDate = {
      date: dateKey,
      ...(statusKey ? { status: statusKey } : {}),
      ...(Object.keys(travel).length > 0 ? { travel } : {}),
      ...(Object.keys(hold).length > 0 ? { hold } : {}),
    };
    onSave(next);
    onClose();
  };

  const getItemsFor = (category: string) => getCategoryElements(project, category);

  return (
    <Modal open onClose={onClose} title={`Travel / Hold — ${formatDateLabel(dateKey)}`} width="max-w-2xl"
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
          <div className="flex flex-wrap gap-1.5">
            <button
              onPointerDown={(e) => { e.preventDefault(); setStatusKey(null); }}
              title="No status (working day)"
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${statusKey === null ? 'bg-zinc-800 text-white border-zinc-600' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              None
            </button>
            {dayTypes.map(t => (
              <button
                key={t.key}
                onPointerDown={(e) => { e.preventDefault(); setStatusKey(t.key); }}
                title={t.label}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors flex items-center gap-1.5 ${statusKey === t.key ? 'bg-zinc-800 text-white border-zinc-600' : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-zinc-600" style={t.color ? { background: t.color } : undefined} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {(['travel', 'hold'] as const).map(kind => {
          const kindRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === kind);
          const isTravel = kind === 'travel';
          return (
            <div key={kind}>
              <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
                <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5`}>
                  {isTravel ? <Plane className={`${XSZ} text-purple-400`} /> : <Pause className={`${XSZ} text-red-400`} />}
                  {isTravel ? 'Traveling' : 'On Hold'}
                </span>
                <button onPointerDown={(e) => { e.preventDefault(); addRow(kind); }} className={`${CREM_LABEL} text-zinc-400 hover:text-zinc-200 font-medium flex items-center gap-1`} style={{ padding: 0, background: 'none', border: 'none' }}>
                  <Plus className={XSZ} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {kindRows.map(({ r, i }) => {
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
                {kindRows.length === 0 && (
                  <p className={`${CREM_LABEL} text-zinc-600 italic`}>Nothing marked — press Add to mark elements.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
