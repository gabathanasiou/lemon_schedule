import React from 'react';
import type { CustomCategoryDef, Project, ProjectElement } from '../../types';
import { getFieldItems } from '../../lib/categories';
import { CREW_TARGET, LOCATION_TARGET } from '../../lib/linkDrafts';
import { crewPickerIds, crewTargetItems, locationTargetItems } from '../../lib/linkTargets';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { ElementPickerRow } from '../rules/ElementPicker';
import { GroupedSelect } from '../production/day/GroupedSelect';
import { X } from 'lucide-react';

/**
 * ONE linked row for the Link Manager and the Element View Links tab
 * (roadmap 308). Element categories reuse `ElementPickerRow` (EntityDropdown
 * chip, Board IDs for cast). Crew and Locations use the Day Manager's
 * `GroupedSelect` — names, grouped by department / location type, no raw-id
 * text box — and crew rows offer an "All <department>" select-all entry.
 */
export const LinkRow: React.FC<{
  project: Project;
  category: string;
  value: string;
  onCategoryChange: (cat: string) => void;
  onChange: (value: string) => void;
  onRemove?: () => void;
  allCategoryKeys: { key: string; isCustom: boolean }[];
  categoryLabelLookup: Record<string, string>;
  customCategories?: CustomCategoryDef[];
  items: ProjectElement[];
  mode?: 'single' | 'multi';
  disabledCategoryKeys?: ReadonlySet<string>;
  anchoredKeys?: Set<string>;
  onCreateItem?: (item: string) => void;
  openDropdown: string | null;
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>;
  idPrefix: string;
  btnClass: string;
  placeholder?: string;
  removeIcon?: React.ReactNode;
  removeBtnClass?: string;
  wrapValue?: boolean;
}> = ({
  project, category, value, onCategoryChange, onChange, onRemove,
  allCategoryKeys, categoryLabelLookup, customCategories, items, mode,
  disabledCategoryKeys, anchoredKeys, onCreateItem, openDropdown, setOpenDropdown,
  idPrefix, btnClass, placeholder, removeIcon, removeBtnClass, wrapValue,
}) => {
  if (category === CREW_TARGET || category === LOCATION_TARGET) {
    const isCrew = category === CREW_TARGET;
    // Crew values mix person ids with `dept:<name>` tag tokens; both are
    // first-class selections (a department tag covers future joiners).
    const selectedIds = isCrew ? crewPickerIds(value) : getFieldItems(LOCATION_TARGET, value);
    const targetItems = isCrew ? crewTargetItems(project) : locationTargetItems(project);
    return (
      <div className="flex items-center gap-2" data-link-row={category}>
        <CategoryDropdown
          value={category}
          onChange={onCategoryChange}
          allCategoryKeys={allCategoryKeys}
          categoryLabelLookup={categoryLabelLookup}
          customCategories={customCategories}
          disabledKeys={disabledCategoryKeys}
          open={openDropdown === `cat-${idPrefix}`}
          onOpenChange={o => setOpenDropdown(o ? `cat-${idPrefix}` : null)}
          btnClass={btnClass}
        />

        <span className="text-xs text-zinc-500 font-medium shrink-0">=</span>

        <GroupedSelect
          className="flex-1 min-w-0"
          theme="dark"
          mode="multi"
          items={targetItems}
          selectedIds={selectedIds}
          onChange={ids => onChange(ids.join(', '))}
          placeholder={placeholder || (isCrew ? 'Select crew…' : 'Select locations…')}
        />

        {onRemove && (
          <button
            onClick={onRemove}
            aria-label="Remove linked element"
            className={removeBtnClass || 'text-zinc-600 hover:text-red-400 transition-colors p-0.5 shrink-0'}
          >
            {removeIcon || <X className="w-3 h-3" />}
          </button>
        )}
      </div>
    );
  }

  return (
    <ElementPickerRow
      category={category}
      elementValue={value}
      onCategoryChange={onCategoryChange}
      onElementChange={onChange}
      onCreateItem={onCreateItem}
      allCategoryKeys={allCategoryKeys}
      categoryLabelLookup={categoryLabelLookup}
      customCategories={customCategories}
      items={items}
      mode={mode}
      disabledCategoryKeys={disabledCategoryKeys}
      anchoredKeys={anchoredKeys}
      openDropdown={openDropdown}
      setOpenDropdown={setOpenDropdown}
      idPrefix={idPrefix}
      btnClass={btnClass}
      dataProps={{ 'data-link-row': category }}
      wrapValue={wrapValue}
      placeholder={placeholder}
      onRemove={onRemove}
      removeIcon={removeIcon}
      removeBtnClass={removeBtnClass}
    />
  );
};

export default LinkRow;
