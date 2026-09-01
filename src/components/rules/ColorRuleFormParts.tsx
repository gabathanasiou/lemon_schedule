import React from 'react';
import { X } from 'lucide-react';
import { ColorRuleCondition, SceneColorEntry, SceneColorPalette, ProjectElement } from '../../types';
import { getNoteBannerColors } from '../../lib/ribbonUtils';
import { IS_COARSE } from '../../lib/device';
import ColorField from '../ColorField';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { ElementPickerRow } from './ElementPicker';

export interface ColorRuleSizes {
  XSZ: string;
  CREM_LABEL: string;
  CREM_TEXT: string;
  CREM_BODY: string;
  CREM_BTN_COND: string;
  CREM_CELL_BODY: string;
}

export const ruleModalSizes = (): ColorRuleSizes => ({
  XSZ: IS_COARSE ? 'w-4 h-4' : 'w-3 h-3',
  CREM_LABEL: IS_COARSE ? 'text-xs' : 'text-[10px]',
  CREM_TEXT: IS_COARSE ? 'text-sm' : 'text-xs',
  CREM_BODY: IS_COARSE ? 'p-7 space-y-6' : 'p-6 space-y-5',
  CREM_BTN_COND: IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs',
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
  onCreateItem?: (item: string) => void;
  sizes: ColorRuleSizes;
}

export function RuleConditionRow({
  cond, idx, categoryLabelLookup, allCategoryKeys, elements, customCategories,
  openDropdown, setOpenDropdown, setConditionCategory, setConditionElement, removeCondition,
  onCreateItem, sizes,
}: RuleConditionRowProps) {
  const { XSZ, CREM_BTN_COND } = sizes;
  return (
    <ElementPickerRow
      category={cond.category}
      elementValue={cond.elementId}
      onCategoryChange={(cat) => setConditionCategory(idx, cat)}
      onElementChange={(el) => setConditionElement(idx, el)}
      onCreateItem={onCreateItem}
      allCategoryKeys={allCategoryKeys}
      categoryLabelLookup={categoryLabelLookup}
      customCategories={customCategories}
      items={elements}
      openDropdown={openDropdown}
      setOpenDropdown={setOpenDropdown}
      idPrefix={String(idx)}
      btnClass={CREM_BTN_COND}
      onRemove={() => removeCondition(idx)}
      removeIcon={<X className={XSZ} />}
    />
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
  const { CREM_CELL_BODY, CREM_TEXT } = sizes;
  return (
    <Modal open onClose={() => setCellEdit(null)} title={`Edit: ${cellEdit.ie} ${cellEdit.dn}`} width="max-w-sm"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={() => setCellEdit(null)}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={commitCellEdit}>Apply</ModalFooterButton>
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
