import React, { useState, useMemo, useCallback } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject } from '../store';
import { ColorRule, ColorRuleCondition, ColorOverride, SceneColorEntry, ProjectElement } from '../types';
import { generateUUID } from '../lib/utils';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../lib/categories';
import { getCategoryElements } from '../lib/elements';
import { getIntExtOptions, getDayNightOptions, DEFAULT_COLOR_PALETTE, getNoteBannerColors } from '../lib/ribbonUtils';
import { IS_COARSE } from '../lib/device';
import Modal, { ModalFooter } from './Modal';
import ColorField from './ColorField';
import { Plus, X, ChevronDown, Check } from 'lucide-react';

import { RuleConditionRow, RuleOverrideSection, MatrixCellEditor, ruleModalSizes } from './rules/ColorRuleFormParts';

interface Props {
  rule?: ColorRule | null;
  onSave: (rule: ColorRule) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

function findEntryIdx(entries: SceneColorEntry[], intExt: string, dayNight: string): number {
  const ie = intExt.toUpperCase();
  const dn = dayNight.toUpperCase();
  return entries.findIndex(e => e.intExt.toUpperCase() === ie && e.dayNight.toUpperCase() === dn);
}

export const ColorRuleEditModal: React.FC<Props> = ({ rule, onSave, onDelete, onClose }) => {
  const { state } = useProject();
  const palette = state.present.colorPalette || DEFAULT_COLOR_PALETTE;
  const ieOptions = getIntExtOptions(palette);
  const dnOptions = getDayNightOptions(palette);
  const isEditing = !!rule;

  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [conditions, setConditions] = useState<ColorRuleCondition[]>(() => {
    if (rule?.conditions?.length) return rule.conditions;
    const cats = [...ELEMENT_CATEGORIES, ...(state.present.customCategories || [])];
    const seen = new Set<string>();
    const firstCat = cats.find(c => { if (!seen.has(c.key)) { seen.add(c.key); return true; } return false; });
    if (firstCat) {
      const elements = state.present.breakdownElements[firstCat.key] || [];
      const firstEl = elements[0];
      return [{ category: firstCat.key, elementId: firstEl ? (firstEl.id || firstEl.name) : '' }];
    }
    return [];
  });
  const [overrideType, setOverrideType] = useState<'single' | 'matrix'>(
    rule?.override?.type || 'single'
  );
  const [singleBg, setSingleBg] = useState(
    rule?.override?.type === 'single' ? rule.override.background : '#ffffff'
  );
  const [singleText, setSingleText] = useState(
    rule?.override?.type === 'single' ? rule.override.text : '#000000'
  );
  const [matrixColors, setMatrixColors] = useState<SceneColorEntry[]>(() => {
    if (rule?.override?.type === 'matrix') return rule.override.sceneColors.map(c => ({ ...c }));
    return ieOptions.flatMap(ie =>
      dnOptions.map(dn => {
        const idx = findEntryIdx(palette.sceneColors, ie, dn);
        return {
          intExt: ie,
          dayNight: dn,
          background: idx >= 0 ? palette.sceneColors[idx].background : '#ffffff',
          text: idx >= 0 ? palette.sceneColors[idx].text : '#000000',
        };
      })
    );
  });

  const [cellEdit, setCellEdit] = useState<{ ie: string; dn: string } | null>(null);
  const [cellBg, setCellBg] = useState('#ffffff');
  const [cellText, setCellText] = useState('#000000');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null); // 'cat-{idx}' | 'el-{idx}' | null

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, state.present.categoryLabels);
    for (const c of state.present.customCategories || []) map[c.key] = c.label;
    return map;
  }, [state.present.categoryLabels, state.present.customCategories]);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    const seen = new Set<string>();
    for (const c of ELEMENT_CATEGORIES) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: false }); } }
    for (const c of state.present.customCategories || []) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: true }); } }
    return keys;
  }, [state.present.customCategories]);

  const getElementsForCategory = useCallback((cat: string): ProjectElement[] => {
    return getCategoryElements(state.present, cat);
  }, [state.present]);

  const getElementName = useCallback((cat: string, elementId: string): string => {
    const el = getElementsForCategory(cat).find(e => (e.id || e.name) === elementId);
    return el?.name || elementId;
  }, [getElementsForCategory]);

  const addCondition = () => {
    const firstCat = allCategoryKeys[0];
    if (!firstCat) return;
    const elements = getElementsForCategory(firstCat.key);
    const firstEl = elements[0];
    setConditions(prev => [...prev, {
      category: firstCat.key,
      elementId: firstEl ? (firstEl.id || firstEl.name) : '',
    }]);
  };

  const removeCondition = (idx: number) => {
    setConditions(prev => prev.filter((_, i) => i !== idx));
  };

  const setConditionCategory = (idx: number, cat: string) => {
    const elements = getElementsForCategory(cat);
    const firstEl = elements[0];
    setConditions(prev => prev.map((c, i) =>
      i === idx ? { category: cat, elementId: firstEl ? (firstEl.id || firstEl.name) : '' } : c
    ));
  };

  const setConditionElement = (idx: number, elementId: string) => {
    setConditions(prev => prev.map((c, i) =>
      i === idx ? { ...c, elementId } : c
    ));
  };

  const openCellEdit = (ie: string, dn: string) => {
    const idx = findEntryIdx(matrixColors, ie, dn);
    if (idx >= 0) {
      setCellBg(matrixColors[idx].background);
      setCellText(matrixColors[idx].text);
    } else {
      setCellBg('#ffffff');
      setCellText('#000000');
    }
    setCellEdit({ ie, dn });
  };

  const commitCellEdit = () => {
    if (!cellEdit) return;
    setMatrixColors(prev => {
      const next = prev.map(c => ({ ...c }));
      const idx = findEntryIdx(next, cellEdit.ie, cellEdit.dn);
      if (idx >= 0) {
        next[idx].background = cellBg;
        next[idx].text = cellText;
      }
      return next;
    });
    setCellEdit(null);
  };

  const handleSave = () => {
    const validConditions = conditions.filter(c => c.category && c.elementId);
    const name = validConditions.map(c => getElementName(c.category, c.elementId)).join(' + ') || 'New Rule';

    const override: ColorOverride = overrideType === 'single'
      ? { type: 'single', background: singleBg, text: singleText }
      : { type: 'matrix', sceneColors: matrixColors.map(c => ({ ...c })) };

    const newRule: ColorRule = {
      id: rule?.id || generateUUID(),
      name,
      enabled,
      conditions: validConditions,
      override,
    };

    onSave(newRule);
    onClose();
  };

  const sizes = ruleModalSizes();
  const { CREM_LABEL, CREM_TEXT, CREM_BODY, CREM_FOOTER_BTN, XSZ } = sizes;

  return (
    <Modal open onClose={onClose} title={isEditing ? 'Edit Color Rule' : 'New Color Rule'} width="max-w-2xl"
      footer={
        <ModalFooter>
          {isEditing && onDelete && (
            <button onClick={() => { onDelete(rule!.id); onClose(); }} className={`${CREM_FOOTER_BTN} text-red-400 font-medium rounded-lg hover:bg-red-900/30 hover:text-red-300 transition-colors mr-auto`}>
              Delete
            </button>
          )}
          <button onClick={onClose} className={`${CREM_FOOTER_BTN} text-zinc-400 font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors`}>
            Cancel
          </button>
          <button onClick={handleSave} className={`${CREM_FOOTER_BTN} bg-zinc-800 text-white font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors`}>
            Save
          </button>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY} style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif' }}>
        {/* Enabled toggle */}
        <button onClick={() => setEnabled(!enabled)} className="flex items-center gap-3 cursor-pointer">
          <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${enabled ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-600'}`}>
            {enabled && <Check className="w-3 h-3 text-zinc-200" />}
          </span>
          <span className={`${CREM_TEXT} text-zinc-300`}>Enabled</span>
        </button>

        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider`}>Conditions (AND)</span>
            <button onClick={addCondition} className={`${CREM_LABEL} text-zinc-400 hover:text-zinc-200 font-medium flex items-center gap-1`} style={{ padding: 0, background: 'none', border: 'none' }}>
              <Plus className={XSZ} /> Add
            </button>
          </div>
          <div className="space-y-2">
            {conditions.map((cond, idx) => {
              const elements = getElementsForCategory(cond.category);
              const catLabel = categoryLabelLookup[cond.category] || cond.category;
              const isCast = cond.category === 'cast';

              return (
                <React.Fragment key={idx}>
                <RuleConditionRow
                  cond={cond}
                  idx={idx}
                  categoryLabelLookup={categoryLabelLookup}
                  allCategoryKeys={allCategoryKeys}
                  elements={elements}
                  customCategories={state.present.customCategories}
                  openDropdown={openDropdown}
                  setOpenDropdown={setOpenDropdown}
                  setConditionCategory={setConditionCategory}
                  setConditionElement={setConditionElement}
                  removeCondition={removeCondition}
                  getElementName={getElementName}
                  sizes={sizes}
                />
                </React.Fragment>
              );
            })}
          </div>
          {conditions.length === 0 && (
            <p className={`${CREM_LABEL} text-zinc-600 italic mt-2`}>No conditions - rule will match all scenes.</p>
          )}
        </div>

        <RuleOverrideSection
          overrideType={overrideType}
          setOverrideType={setOverrideType}
          singleBg={singleBg}
          setSingleBg={setSingleBg}
          singleText={singleText}
          setSingleText={setSingleText}
          matrixColors={matrixColors}
          ieOptions={ieOptions}
          dnOptions={dnOptions}
          palette={palette}
          findEntryIdx={findEntryIdx}
          openCellEdit={openCellEdit}
          sizes={sizes}
        />
      </div>

      <MatrixCellEditor
        cellEdit={cellEdit}
        setCellEdit={setCellEdit}
        cellBg={cellBg}
        setCellBg={setCellBg}
        cellText={cellText}
        setCellText={setCellText}
        commitCellEdit={commitCellEdit}
        palette={palette}
        sizes={sizes}
      />
    </Modal>
  );
};
