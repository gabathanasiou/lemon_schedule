import React from 'react';
import { X } from 'lucide-react';
import { ProjectElement } from '../../types';
import { CategoryDropdown } from './CategoryDropdown';
import { EntityDropdown } from '../EntityDropdown';
import { usePortalTarget } from '../../lib/popoutTarget';

/**
 * Shared element-selection row (app-level, next to CategoryDropdown —
 * intentionally NOT the ui-kit: it embeds app domain like the icon registry,
 * custom categories and cast Board-ID display).
 *
 * Row = category dropdown + "=" + EntityDropdown in `variant="chip"` (dark
 * button-like trigger) — the day-status modal pattern (TravelHoldModal),
 * proven inside app Modals. Single-select: the Color Rules condition rows
 * and the Link Manager anchor picker. Commit of free text is left to the
 * EntityDropdown semantics (typing + blur commits the query as-is).
 */

export const ElementPickerRow: React.FC<{
  category: string;
  elementValue: string;
  onCategoryChange: (cat: string) => void;
  onElementChange: (elementId: string) => void;
  allCategoryKeys: { key: string; isCustom: boolean }[];
  categoryLabelLookup: Record<string, string>;
  customCategories?: { key: string; icon?: string }[];
  items: ProjectElement[];
  openDropdown: string | null;
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>;
  idPrefix: string;
  btnClass: string;
  onRemove?: () => void;
  removeIcon?: React.ReactNode;
  removeBtnClass?: string;
  /** Extra content right of the element dropdown (e.g. an Apply button). */
  trailing?: React.ReactNode;
  placeholder?: string;
  /** EntityDropdown selection mode: 'single' (search-then-select) or 'multi'
   *  (comma-separated values per category — the day-status modal pattern). */
  mode?: 'single' | 'multi';
  /** Categories disabled in the row's category dropdown (already used by
   *  another linked row in the same card). */
  disabledCategoryKeys?: ReadonlySet<string>;
  /** Item keys that are element-link anchors — Anchor icon in the picker panel. */
  anchoredKeys?: Set<string>;
  /** Called by the EntityDropdown for committed values with no matching
   *  element — auto-creates new elements (cast naming flow). */
  onCreateItem?: (item: string) => void;
}> = ({ category, elementValue, onCategoryChange, onElementChange, allCategoryKeys, categoryLabelLookup, customCategories, items, openDropdown, setOpenDropdown, idPrefix, btnClass, onRemove, removeIcon, removeBtnClass, trailing, placeholder, mode = 'single', disabledCategoryKeys, anchoredKeys, onCreateItem }) => {
  const portalTarget = usePortalTarget();
  const isCast = category === 'cast';
  return (
    <div className="flex items-center gap-2">
      <CategoryDropdown
        value={category}
        onChange={onCategoryChange}
        allCategoryKeys={allCategoryKeys}
        categoryLabelLookup={categoryLabelLookup}
        customCategories={customCategories}
        disabledKeys={disabledCategoryKeys}
        open={openDropdown === `cat-${idPrefix}`}
        onOpenChange={(o) => setOpenDropdown(o ? `cat-${idPrefix}` : null)}
        btnClass={btnClass}
      />

      <span className="text-xs text-zinc-500 font-medium shrink-0">=</span>

      <span data-el-dropdown className="flex-1 min-w-0">
        <EntityDropdown
          value={elementValue}
          onChange={onElementChange}
          items={items}
          positioning="fixed"
          portalTarget={portalTarget ?? document.body}
          mode={mode}
          variant="chip"
          className="flex-1 min-w-0 text-xs"
          displayMode={isCast ? 'id' : 'name'}
          placeholder={placeholder || 'Select...'}
          anchoredKeys={anchoredKeys}
          onCreateItem={onCreateItem}
          renderItem={isCast ? (item) => (<><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span></>) : undefined}
        />
      </span>

      {trailing}

      {onRemove && (
        <button onClick={onRemove} className={removeBtnClass || 'text-zinc-600 hover:text-red-400 transition-colors p-0.5 shrink-0'}>
          {removeIcon || <X className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
};