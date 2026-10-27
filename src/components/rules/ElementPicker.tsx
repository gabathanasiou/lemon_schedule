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
  /** Let a long comma-list wrap onto multiple lines (the EntityDropdown
   *  `wrapValue` contract) — the row grows with the value. */
  wrapValue?: boolean;
  /** Extra DOM data attributes for tests/scoping (applied to the row). */
  dataProps?: Record<string, string>;
  /** Committed values are ids (crew/locations) while the picker shows names. */
  resolveBy?: 'id' | 'name';
}> = ({ category, elementValue, onCategoryChange, onElementChange, allCategoryKeys, categoryLabelLookup, customCategories, items, openDropdown, setOpenDropdown, idPrefix, btnClass, onRemove, removeIcon, removeBtnClass, trailing, placeholder, mode = 'single', disabledCategoryKeys, anchoredKeys, onCreateItem, wrapValue, dataProps, resolveBy }) => {
  const portalTarget = usePortalTarget();
  const isCast = category === 'cast';
  return (
    <div className="flex items-center gap-2" {...dataProps}>
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

      <span className="text-xs text-[color:var(--ui-text-faint)] font-medium shrink-0">=</span>

      <span data-el-dropdown className="flex-1 min-w-0">
        <EntityDropdown
          value={elementValue}
          onChange={onElementChange}
          items={items}
         
          portalTarget={portalTarget ?? document.body}
          mode={mode}
          variant="chip"
          className="flex-1 min-w-0 text-xs"
          displayMode={isCast ? 'id' : 'name'}
          resolveBy={resolveBy}
          placeholder={placeholder || 'Select...'}
          anchoredKeys={anchoredKeys}
          onCreateItem={onCreateItem}
          wrapValue={wrapValue}
        />
      </span>

      {trailing}

      {onRemove && (
        <button onClick={onRemove} aria-label="Remove linked element" className={removeBtnClass || 'text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-danger-text)] transition-colors p-0.5 shrink-0'}>
          {removeIcon || <X className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
};