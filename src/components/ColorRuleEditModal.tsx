import React, { useState, useMemo, useCallback } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject } from '../store';
import { ColorRule, ColorRuleCondition, ColorOverride, SceneColorEntry, ProjectElement } from '../types';
import { generateUUID } from '../lib/utils';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../lib/categories';
import { getIntExtOptions, getDayNightOptions, DEFAULT_COLOR_PALETTE } from '../lib/ribbonUtils';
import { IS_COARSE } from '../lib/device';
import Modal, { ModalFooter } from './Modal';
import { Plus, X, ChevronDown, Check } from 'lucide-react';

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
    return state.present.breakdownElements[cat] || [];
  }, [state.present.breakdownElements]);

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

  const XSZ = IS_COARSE ? 'w-4 h-4' : 'w-3 h-3';
  const CREM_LABEL = IS_COARSE ? 'text-xs' : 'text-[10px]';
  const CREM_TEXT = IS_COARSE ? 'text-sm' : 'text-xs';
  const CREM_BODY = IS_COARSE ? 'p-7 space-y-6' : 'p-6 space-y-5';
  const CREM_BTN_COND = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs';
  const CREM_DD_ITEM = IS_COARSE ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs';
  const CREM_COLOR = IS_COARSE ? 'w-12 h-12' : 'w-9 h-9';
  const CREM_COLOR_INPUT = IS_COARSE ? 'text-xs' : 'text-[10px]';
  const CREM_FOOTER_BTN = IS_COARSE ? 'px-7 py-2.5 text-sm' : 'px-6 py-2 text-xs';
  const CREM_CELL_BODY = IS_COARSE ? 'p-7 space-y-6' : 'p-6 space-y-5';
  const CREM_CELL_COLOR = IS_COARSE ? 'w-16 h-16' : 'w-14 h-14';

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
                <div key={idx} className="flex items-center gap-2">
                  <RadixDropdownMenu.Root modal={true} open={openDropdown === `cat-${idx}`} onOpenChange={(o) => setOpenDropdown(o ? `cat-${idx}` : null)}>
                    <RadixDropdownMenu.Trigger asChild>
                      <button className={`flex items-center gap-1.5 ${CREM_BTN_COND} bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-750 shrink-0 min-w-[120px] justify-between`}>
                        <span className="truncate">{catLabel}</span>
                        <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                      </button>
                    </RadixDropdownMenu.Trigger>
                    <RadixDropdownMenu.Portal>
                      <RadixDropdownMenu.Content
                        className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 max-h-64 overflow-y-auto min-w-[160px]"
                        align="start"
                        sideOffset={4}
                        collisionPadding={8}
                        onOpenAutoFocus={(e) => {
                          e.preventDefault();
                          const content = e.currentTarget as HTMLElement;
                          requestAnimationFrame(() => {
                            const active = content.querySelector(`[data-cat="${cond.category}"]`) as HTMLElement | null;
                            if (active) { active.focus(); active.scrollIntoView({ block: 'nearest' }); }
                          });
                        }}
                      >
                        {allCategoryKeys.map(({ key, isCustom }) => {
                          const Icon = isCustom
                            ? getCustomIcon(state.present.customCategories?.find(c => c.key === key)?.icon || 'Tag')
                            : CAT_ICONS[key] || null;
                          const active = key === cond.category;
                          return (
                            <RadixDropdownMenu.Item
                              key={key}
                              data-cat={key}
                              onSelect={() => setConditionCategory(idx, key)}
                              className={`flex items-center gap-2 ${CREM_DD_ITEM} rounded transition-colors outline-none cursor-pointer select-none ${
                                active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                              }`}
                            >
                              {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                              <span className="flex-1">{categoryLabelLookup[key] || key}</span>
                              {active && <Check className="w-3 h-3 shrink-0" />}
                            </RadixDropdownMenu.Item>
                          );
                        })}
                      </RadixDropdownMenu.Content>
                    </RadixDropdownMenu.Portal>
                  </RadixDropdownMenu.Root>

                  <span className="text-xs text-zinc-500 font-medium shrink-0">=</span>

                  <RadixDropdownMenu.Root modal={true} open={openDropdown === `el-${idx}`} onOpenChange={(o) => setOpenDropdown(o ? `el-${idx}` : null)}>
                    <RadixDropdownMenu.Trigger asChild>
                      <button className={`flex-1 flex items-center gap-1.5 ${CREM_BTN_COND} bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-750 shrink-0 min-w-0 justify-between`}>
                        <span className="truncate">
                          {cond.elementId
                            ? (isCast ? `${cond.elementId}. ${getElementName(cond.category, cond.elementId)}` : getElementName(cond.category, cond.elementId))
                            : 'Select...'}
                        </span>
                        <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                      </button>
                    </RadixDropdownMenu.Trigger>
                    <RadixDropdownMenu.Portal>
                      <RadixDropdownMenu.Content
                        className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 max-h-64 overflow-y-auto min-w-[160px]"
                        align="start"
                        sideOffset={4}
                        collisionPadding={8}
                        onOpenAutoFocus={(e) => {
                          e.preventDefault();
                          const content = e.currentTarget as HTMLElement;
                          requestAnimationFrame(() => {
                            const active = content.querySelector(`[data-el="${cond.elementId}"]`) as HTMLElement | null;
                            if (active) { active.focus(); active.scrollIntoView({ block: 'nearest' }); }
                          });
                        }}
                      >
                        {elements.length === 0 ? (
                          <div className={`${CREM_DD_ITEM} text-zinc-500`}>No elements</div>
                        ) : elements.slice().sort((a, b) => {
                          if (isCast) {
                            const ia = parseInt(a.id) ?? 0;
                            const ib = parseInt(b.id) ?? 0;
                            return ia - ib;
                          }
                          return (a.name || a.id).localeCompare(b.name || b.id);
                        }).map(el => {
                          const active = (el.id || el.name) === cond.elementId;
                          return (
                            <RadixDropdownMenu.Item
                              key={el.id || el.name}
                              data-el={el.id || el.name}
                              onSelect={() => setConditionElement(idx, el.id || el.name)}
                              className={`flex items-center gap-2 ${CREM_DD_ITEM} rounded transition-colors outline-none cursor-pointer select-none whitespace-nowrap ${
                                active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                              }`}
                            >
                              {isCast && <span className="text-zinc-400 shrink-0">{el.id}.</span>}
                              <span className="truncate">{el.name || el.id}</span>
                              {active && <Check className="w-3 h-3 shrink-0 ml-auto" />}
                            </RadixDropdownMenu.Item>
                          );
                        })}
                      </RadixDropdownMenu.Content>
                    </RadixDropdownMenu.Portal>
                  </RadixDropdownMenu.Root>

                  <button onClick={() => removeCondition(idx)} className="text-zinc-600 hover:text-red-400 transition-colors p-0.5 shrink-0">
                    <X className={XSZ} />
                  </button>
                </div>
              );
            })}
          </div>
          {conditions.length === 0 && (
            <p className={`${CREM_LABEL} text-zinc-600 italic mt-2`}>No conditions - rule will match all scenes.</p>
          )}
        </div>

        {/* Override */}
        <div>
          <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider border-b border-zinc-800 pb-1.5 mb-3 block`}>Override</span>
          <div className="flex gap-1.5 mb-4">
            <button
              onClick={() => setOverrideType('single')}
              className={`flex-1 px-3 py-1.5 rounded ${CREM_TEXT} font-medium transition-colors ${overrideType === 'single' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            >
              Single Color
            </button>
            <button
              onClick={() => setOverrideType('matrix')}
              className={`flex-1 px-3 py-1.5 rounded ${CREM_TEXT} font-medium transition-colors ${overrideType === 'matrix' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            >
              Custom Matrix
            </button>
          </div>

          {overrideType === 'single' ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`${CREM_LABEL} text-zinc-400`}>BG:</span>
                <input type="color" value={singleBg} onChange={e => setSingleBg(e.target.value)} className={`${CREM_COLOR} rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0.5`} />
                <input type="text" readOnly value={singleBg} className={`w-[4.5rem] ${CREM_COLOR_INPUT} text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 outline-none`} />
              </div>
              <div className="flex items-center gap-2">
                <span className={`${CREM_LABEL} text-zinc-400`}>Text:</span>
                <input type="color" value={singleText} onChange={e => setSingleText(e.target.value)} className={`${CREM_COLOR} rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0.5`} />
                <input type="text" readOnly value={singleText} className={`w-[4.5rem] ${CREM_COLOR_INPUT} text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 outline-none`} />
              </div>
              <div className="w-10 h-10 rounded border border-zinc-700 flex items-center justify-center text-[9px] font-bold" style={{ background: singleBg, color: singleText }}>
                Aa
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="w-14" />
                    {ieOptions.map(ie => (
                      <th key={ie} className="px-0.5 pb-1 text-center min-w-[80px]">
                        <span className={`${IS_COARSE ? 'text-[11px]' : 'text-[9px]'} font-bold text-zinc-500 uppercase tracking-wider`}>{ie}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dnOptions.map(dn => (
                    <tr key={dn}>
                      <td className="pr-2 py-0.5 align-middle text-right">
                        <span className={`${IS_COARSE ? 'text-[11px]' : 'text-[9px]'} font-bold text-zinc-500 uppercase tracking-wider`}>{dn}</span>
                      </td>
                      {ieOptions.map(ie => {
                        const idx = findEntryIdx(matrixColors, ie, dn);
                        const entry = idx >= 0 ? matrixColors[idx] : { background: '#ffffff', text: '#000000' };
                        return (
                          <td key={ie} className="px-0.5 py-0.5">
                            <button
                              onClick={() => openCellEdit(ie, dn)}
                              className={`w-full ${IS_COARSE ? 'h-12' : 'h-10'} rounded border border-zinc-700 hover:border-zinc-500 transition-colors flex items-center justify-center ${IS_COARSE ? 'text-[10px]' : 'text-[8px]'} font-semibold cursor-pointer`}
                              style={{ background: entry.background, color: entry.text }}
                            >
                              <span className="text-center leading-tight px-0.5">{ie}<br />{dn}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cell color editor for matrix */}
      {cellEdit && (
        <Modal open onClose={() => setCellEdit(null)} title={`Edit: ${cellEdit.ie} ${cellEdit.dn}`} width="max-w-sm"
          footer={
            <ModalFooter>
              <button onClick={() => setCellEdit(null)} className={`${CREM_FOOTER_BTN} text-zinc-400 font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors`}>Cancel</button>
              <button onClick={commitCellEdit} className={`${CREM_FOOTER_BTN} bg-zinc-800 text-white font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors`}>Apply</button>
            </ModalFooter>
          }
        >
          <div className={CREM_CELL_BODY}>
            <div className="flex items-center justify-between">
              <span className={`${CREM_TEXT} text-zinc-300`}>Background</span>
              <div className="flex items-center gap-2.5">
                <input type="color" value={cellBg} onChange={e => setCellBg(e.target.value)} className={`${CREM_CELL_COLOR} rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0.5`} />
                <input type="text" readOnly value={cellBg} className={`w-[5.5rem] ${CREM_TEXT} text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none`} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`${CREM_TEXT} text-zinc-300`}>Text Color</span>
              <div className="flex items-center gap-2.5">
                <input type="color" value={cellText} onChange={e => setCellText(e.target.value)} className={`${CREM_CELL_COLOR} rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0.5`} />
                <input type="text" readOnly value={cellText} className={`w-[5.5rem] ${CREM_TEXT} text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none`} />
              </div>
            </div>
            <div className="w-full h-10 rounded border border-zinc-700 flex items-center justify-center text-sm font-bold" style={{ background: cellBg, color: cellText }}>
              Aa
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
};
