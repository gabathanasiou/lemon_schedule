import React, { useCallback, useMemo, useState } from 'react';
import { useProject } from '../../store';
import { ElementLink } from '../../types';
import { generateUUID } from '../../lib/utils';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { getCategoryElements } from '../../lib/elements';
import { applyLinkToScenes, isLinkableCategory } from '../../lib/elementLinks';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import { ElementPickerRow } from '../rules/ElementPicker';
import { Plus, Play, X } from 'lucide-react';

interface RowDraft {
  id: string;
  anchorCategory: string;
  anchorValue: string;
  linkedCategory: string;
  linkedValue: string;
}

const BTN = 'px-2 py-1.5 text-xs';
const ITEM = 'px-3 py-2 text-xs';

/**
 * Link Manager (roadmap 44): one-way anchor-based element links, opened from
 * the Element Manager. Each row = anchor picker + linked element picker;
 * links dispatch immediately (UPDATE_PROJECT) like the Scene Sheet's own
 * dropdowns. "Apply" retroactively adds the linked element to every scene
 * that already contains the anchor (batch = one undo entry).
 */
export function LinkManagerModal({ initialAnchorCategory, onClose }: { initialAnchorCategory?: string; onClose: () => void }) {
  const { state, dispatch } = useProject();
  const project = state.present;

  const [rows, setRows] = useState<RowDraft[]>(() => {
    const existing = (project.elementLinks || []).map(l => ({ ...l }));
    if (existing.length === 0 && initialAnchorCategory) {
      existing.push({ id: generateUUID(), anchorCategory: initialAnchorCategory, anchorValue: '', linkedCategory: 'props', linkedValue: '' });
    }
    return existing;
  });
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ index: number; count: number } | null>(null);
  const [appliedAll, setAppliedAll] = useState(false);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    for (const c of ELEMENT_CATEGORIES) {
      if (isLinkableCategory(c.key, project.customCategories)) keys.push({ key: c.key, isCustom: false });
    }
    for (const c of project.customCategories || []) {
      if (isLinkableCategory(c.key, project.customCategories)) keys.push({ key: c.key, isCustom: true });
    }
    return keys;
  }, [project.customCategories]);

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const elementsFor = useCallback((cat: string) => getCategoryElements(project, cat), [project]);

  const getElementName = useCallback((cat: string, elementId: string) => {
    const el = getCategoryElements(project, cat).find(e => (e.id || e.name) === elementId);
    return el?.name || elementId;
  }, [project]);

  const updateRow = (id: string, patch: Partial<RowDraft>) => {
    setRows(prev => {
      const next = prev.map(r => r.id === id ? { ...r, ...patch } : r);
      const links: ElementLink[] = next
        .filter(r => r.anchorCategory && r.anchorValue && r.linkedCategory && r.linkedValue)
        .map(r => ({ ...r }));
      const seen = new Set<string>();
      const deduped = links.filter(l => {
        const k = `${l.anchorCategory}|${l.anchorValue}|${l.linkedCategory}|${l.linkedValue}`.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      dispatch({ type: 'UPDATE_PROJECT', payload: { elementLinks: deduped } });
      return next;
    });
    setApplied(null);
    setAppliedAll(false);
  };

  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, {
      id: generateUUID(),
      anchorCategory: initialAnchorCategory || last?.anchorCategory || 'cast',
      anchorValue: '',
      linkedCategory: 'props',
      linkedValue: '',
    }]);
  };

  const applyOne = (index: number) => {
    const row = rows[index];
    if (!row.anchorCategory || !row.anchorValue || !row.linkedCategory || !row.linkedValue) return;
    const targets = applyLinkToScenes(project.customCategories, project.scenes, { ...row });
    if (targets.length === 0) { setApplied({ index, count: 0 }); return; }
    dispatch({ type: 'BATCH_START' });
    for (const t of targets) dispatch({ type: 'UPDATE_SCENE', payload: { id: t.id, ...t.updates } });
    dispatch({ type: 'BATCH_COMMIT' });
    setApplied({ index, count: targets.length });
  };

  const applyAll = () => {
    const links: ElementLink[] = rows
      .filter(r => r.anchorCategory && r.anchorValue && r.linkedCategory && r.linkedValue)
      .map(r => ({ ...r }));
    // Compose the canonical helper: each link resolves against the latest
    // accumulated scene state so links into the same category stack up.
    const working = new Map(project.scenes.map(s => [s.id, { ...s } as any]));
    const targets: { id: string; updates: Record<string, string> }[] = [];
    for (const link of links) {
      for (const t of applyLinkToScenes(project.customCategories, [...working.values()], link)) {
        working.get(t.id)![link.linkedCategory] = t.updates[link.linkedCategory];
        targets.push(t);
      }
    }
    if (targets.length === 0) return;
    dispatch({ type: 'BATCH_START' });
    for (const t of targets) dispatch({ type: 'UPDATE_SCENE', payload: { id: t.id, ...t.updates } });
    dispatch({ type: 'BATCH_COMMIT' });
    setAppliedAll(true);
  };

  const validCount = rows.filter(r => r.anchorCategory && r.anchorValue && r.linkedCategory && r.linkedValue).length;

  return (
    <Modal open onClose={onClose} title="Element Links" width="max-w-3xl"
      footer={
        <ModalFooter>
          <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Close</button>
          <button onClick={applyAll} disabled={validCount === 0} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Apply All Links
          </button>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Link elements one-way from an anchor: whenever the anchor is added to a scene, its linked elements are added too.
          Removing a linked element never touches the anchor; removing the anchor removes the linked elements as well.
        </p>

        {rows.map((row, idx) => {
          const anchorElements = elementsFor(row.anchorCategory);
          const linkedElements = elementsFor(row.linkedCategory);
          const isRowComplete = !!row.anchorValue && !!row.linkedValue;
          return (
            <div key={row.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <ElementPickerRow
                  category={row.anchorCategory}
                  elementValue={row.anchorValue}
                  onCategoryChange={(cat) => updateRow(row.id, { anchorCategory: cat, anchorValue: '' })}
                  onElementChange={(v) => updateRow(row.id, { anchorValue: v })}
                  allCategoryKeys={allCategoryKeys}
                  categoryLabelLookup={categoryLabelLookup}
                  customCategories={project.customCategories}
                  elements={anchorElements}
                  getElementName={getElementName}
                  openDropdown={openDropdown}
                  setOpenDropdown={setOpenDropdown}
                  idPrefix={`a-${idx}`}
                  btnClass={BTN}
                  itemClass={ITEM}
                />
                <span className="text-xs text-zinc-500 font-medium shrink-0">adds</span>
                <ElementPickerRow
                  category={row.linkedCategory}
                  elementValue={row.linkedValue}
                  onCategoryChange={(cat) => updateRow(row.id, { linkedCategory: cat, linkedValue: '' })}
                  onElementChange={(v) => updateRow(row.id, { linkedValue: v })}
                  allCategoryKeys={allCategoryKeys}
                  categoryLabelLookup={categoryLabelLookup}
                  customCategories={project.customCategories}
                  elements={linkedElements}
                  getElementName={getElementName}
                  openDropdown={openDropdown}
                  setOpenDropdown={setOpenDropdown}
                  idPrefix={`b-${idx}`}
                  btnClass={BTN}
                  itemClass={ITEM}
                  onRemove={() => removeRow(row.id)}
                  removeIcon={<X className="w-3 h-3" />}
                  trailing={
                    <button
                      onClick={() => applyOne(idx)}
                      disabled={!isRowComplete}
                      title="Add the linked element to every scene that already contains the anchor"
                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-zinc-300 border border-zinc-700 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      Apply
                    </button>
                  }
                />
              </div>
              {applied && applied.index === idx && (
                <p className="text-[10px] text-emerald-400 pl-1">
                  {applied.count === 0 ? 'No scenes contain this anchor yet' : `Applied: linked element added to ${applied.count} scene${applied.count === 1 ? '' : 's'}`}
                </p>
              )}
            </div>
          );
        })}

        <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Link
        </button>

        {appliedAll && (
          <p className="text-[10px] text-emerald-400">Applied all links to existing scenes.</p>
        )}
      </div>
    </Modal>
  );
}