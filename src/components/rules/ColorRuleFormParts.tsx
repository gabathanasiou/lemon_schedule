import React from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { ColorRuleCondition, SceneColorEntry, SceneColorPalette, ProjectElement } from '../../types';
import { getNoteBannerColors } from '../../lib/ribbonUtils';
import { IS_COARSE } from '../../lib/device';
import ColorField from '../ColorField';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import { CategoryDropdown } from './CategoryDropdown';

export interface ColorRuleSizes {
  XSZ: string;
  CREM_LABEL: string;
  CREM_TEXT: string;
  CREM_BODY: string;
  CREM_BTN_COND: string;
  CREM_DD_ITEM: string;
  CREM_FOOTER_BTN: string;
  CREM_CELL_BODY: string;
}

export const ruleModalSizes = (): ColorRuleSizes => ({
  XSZ: IS_COARSE ? 'w-4 h-4' : 'w-3 h-3',
  CREM_LABEL: IS_COARSE ? 'text-xs' : 'text-[10px]',
  CREM_TEXT: IS_COARSE ? 'text-sm' : 'text-xs',
  CREM_BODY: IS_COARSE ? 'p-7 space-y-6' : 'p-6 space-y-5',
  CREM_BTN_COND: IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs',
  CREM_DD_ITEM: IS_COARSE ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs',
  CREM_FOOTER_BTN: IS_COARSE ? 'px-7 py-2.5 text-sm' : 'px-6 py-2 text-xs',
  CREM_CELL_BODY: IS_COARSE ? 'p-7 space-y-6' : 'p-6 space-y-5',
});

interface RuleConditionRowProps {
  cond: ColorRuleCondition;
  idx: number;
  categoryLabelLookup: Record<string, string>;
  allCategoryKeys: { key: string; isCustom: boolean }[];
  elements: ProjectElement[];
  customCategories: { key: string; icon?: string }[] | undefined;
  openDropdown: string | null;
  setOpenDropdown: (v: string | null) => void;
  setConditionCategory: (idx: number, cat: string) => void;
  setConditionElement: (idx: number, elementId: string) => void;
  removeCondition: (idx: number) => void;
  getElementName: (cat: string, elementId: string) => string;
  sizes: ColorRuleSizes;
}

export function RuleConditionRow({
  cond, idx, categoryLabelLookup, allCategoryKeys, elements, customCategories,
  openDropdown, setOpenDropdown, setConditionCategory, setConditionElement, removeCondition,
  getElementName, sizes,
}: RuleConditionRowProps) {
  const { XSZ, CREM_BTN_COND, CREM_DD_ITEM } = sizes;
  const isCast = cond.category === 'cast';

  return (
    <div className="flex items-center gap-2">
      <CategoryDropdown
        value={cond.category}
        onChange={(cat) => setConditionCategory(idx, cat)}
        allCategoryKeys={allCategoryKeys}
        categoryLabelLookup={categoryLabelLookup}
        customCategories={customCategories}
        open={openDropdown === `cat-${idx}`}
        onOpenChange={(o) => setOpenDropdown(o ? `cat-${idx}` : null)}
        btnClass={CREM_BTN_COND}
        itemClass={CREM_DD_ITEM}
      />

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
}

interface RuleOverrideSectionProps {
  overrideType: 'single' | 'matrix';
  setOverrideType: (t: 'single' | 'matrix') => void;
  singleBg: string;
  setSingleBg: (v: string) => void;
  singleText: string;
  setSingleText: (v: string) => void;
  matrixColors: SceneColorEntry[];
  ieOptions: string[];
  dnOptions: string[];
  palette: SceneColorPalette;
  findEntryIdx: (entries: SceneColorEntry[], ie: string, dn: string) => number;
  openCellEdit: (ie: string, dn: string) => void;
  sizes: ColorRuleSizes;
}

export function RuleOverrideSection({
  overrideType, setOverrideType, singleBg, setSingleBg, singleText, setSingleText,
  matrixColors, ieOptions, dnOptions, palette, findEntryIdx, openCellEdit, sizes,
}: RuleOverrideSectionProps) {
  const { CREM_LABEL, CREM_TEXT } = sizes;
  return (
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
            <ColorField value={singleBg} onChange={setSingleBg} hexVariant="sm" swatchClass={IS_COARSE ? 'w-12 h-12' : ''} defaultValue={getNoteBannerColors(palette).background} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`${CREM_LABEL} text-zinc-400`}>Text:</span>
            <ColorField value={singleText} onChange={setSingleText} hexVariant="sm" swatchClass={IS_COARSE ? 'w-12 h-12' : ''} defaultValue={getNoteBannerColors(palette).color} />
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
  );
}

interface MatrixCellEditorProps {
  cellEdit: { ie: string; dn: string } | null;
  setCellEdit: (v: { ie: string; dn: string } | null) => void;
  cellBg: string;
  setCellBg: (v: string) => void;
  cellText: string;
  setCellText: (v: string) => void;
  commitCellEdit: () => void;
  palette: SceneColorPalette;
  sizes: ColorRuleSizes;
}

export function MatrixCellEditor({ cellEdit, setCellEdit, cellBg, setCellBg, cellText, setCellText, commitCellEdit, palette, sizes }: MatrixCellEditorProps) {
  if (!cellEdit) return null;
  const { CREM_FOOTER_BTN, CREM_CELL_BODY, CREM_TEXT } = sizes;
  return (
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
          <ColorField value={cellBg} onChange={setCellBg} size="lg" swatchClass={IS_COARSE ? 'w-16 h-16' : ''} defaultValue={getNoteBannerColors(palette).background} />
        </div>
        <div className="flex items-center justify-between">
          <span className={`${CREM_TEXT} text-zinc-300`}>Text Color</span>
          <ColorField value={cellText} onChange={setCellText} size="lg" swatchClass={IS_COARSE ? 'w-16 h-16' : ''} defaultValue={getNoteBannerColors(palette).color} />
        </div>
        <div className="w-full h-10 rounded border border-zinc-700 flex items-center justify-center text-sm font-bold" style={{ background: cellBg, color: cellText }}>
          Aa
        </div>
      </div>
    </Modal>
  );
}
