import React, { useState } from 'react';
import { ReportCollection } from '../../types';
import { COLLECTION_LABELS, scopedCollectionLabel } from '../../lib/reportBlocks';
import { CAT_ICONS, getCustomIcon } from '../../lib/categories';
import DropdownMenu from '../DropdownMenu';
import DropdownSubmenu from '../DropdownSubmenu';
import DropdownItem from '../DropdownItem';
import { ChevronDown, Check } from 'lucide-react';
import { TB_PICKER } from '@gabriel/ui-kit';

// Collection picker for report blocks (Repeat over / Table over). Replaces the
// native selects with the shared Radix menu: top-level collections plus an
// Elements submenu for the category (no separate category row). Cast is not a
// top-level collection — it's reached via Elements → Cast. Contextual variants
// (listed for repeats when the caller passes them) render from COLLECTION_LABELS
// — e.g. "Elements (of this category)" inside a categories repeat; the trigger
// label surfaces the scoped state ("Scenes (of this day)").

interface CollectionMenuProps {
  value: ReportCollection;
  category: string;
  collections: ReportCollection[];
  categoryKeys: { key: string; isCustom: boolean }[];
  categoryLabels: Record<string, string>;
  customCategories?: { key: string; icon?: string }[];
  /** Location types for the Locations submenu (roadmap 6 — same shape as the
   *  Elements category submenu, backed by project.locationTypes). */
  locationTypes?: { key: string; label: string }[];
  disabled?: boolean;
  width?: string;
  parentCollection?: ReportCollection;
  scopedToParent?: boolean;
  /** Categories grayed out in the Elements submenu (self-redundant picks).
   *  The current value is always exempted — existing designs stay editable. */
  disabledCategories?: string[];
  onChange: (collection: ReportCollection, category?: string) => void;
}

const CollectionMenu: React.FC<CollectionMenuProps> = ({
  value, category, collections, categoryKeys, categoryLabels, customCategories, locationTypes,
  disabled, width = 'w-40', parentCollection, scopedToParent = true, disabledCategories,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const scoped = scopedToParent !== false;
  const typeLabel = (locationTypes || []).find(t => t.key === category)?.label;
  const label = value === 'elements'
    ? `${scopedCollectionLabel('elements', parentCollection, scoped)} · ${categoryLabels[category] || category}`
    : value === 'locations'
      ? `${scopedCollectionLabel('locations', parentCollection, scoped)}${typeLabel ? ` · ${typeLabel}` : ''}`
      : scopedCollectionLabel(value, parentCollection, scoped);

  const pick = (collection: ReportCollection, cat?: string) => {
    onChange(collection, cat);
    setOpen(false);
  };

  const categoryDisabled = (key: string) => {
    // Always exempt the current value — a self-repeat pick that's already the
    // block's value must stay selectable so existing designs keep editing.
    if (value === 'elements' && category === key) return false;
    return !!disabledCategories?.includes(key);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width={width}
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={`${width} ${TB_PICKER}`}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
        </button>
      }
    >
      {collections.map(c => {
        if (c === 'elements') {
          return (
            <React.Fragment key="elements">
              <DropdownSubmenu id="elements" label="Elements" width={width}>
                {categoryKeys.map(({ key, isCustom }) => {
                  const Icon = isCustom
                    ? getCustomIcon(customCategories?.find(x => x.key === key)?.icon || 'Tag')
                    : CAT_ICONS[key] || null;
                  return (
                    <DropdownItem
                      key={key}
                      onClick={() => pick('elements', key)}
                      disabled={categoryDisabled(key)}
                      icon={value === 'elements' && category === key ? <Check className="w-3.5 h-3.5" /> : Icon ? <Icon className="w-3.5 h-3.5" /> : undefined}
                    >
                      {categoryLabels[key] || key}
                    </DropdownItem>
                  );
                })}
              </DropdownSubmenu>
            </React.Fragment>
          );
        }
        if (c === 'locations' && locationTypes && locationTypes.length > 0) {
          return (
            <React.Fragment key="locations">
              <DropdownSubmenu id="locations" label="Locations" width={width}>
                {locationTypes.map(t => (
                  <DropdownItem
                    key={t.key}
                    onClick={() => pick('locations', t.key)}
                    icon={value === 'locations' && category === t.key ? <Check className="w-3.5 h-3.5" /> : undefined}
                  >
                    {t.label}
                  </DropdownItem>
                ))}
              </DropdownSubmenu>
            </React.Fragment>
          );
        }
        return (
          <DropdownItem key={c} onClick={() => pick(c)} icon={value === c ? <Check className="w-3.5 h-3.5" /> : undefined}>
            {COLLECTION_LABELS[c] || c}
          </DropdownItem>
        );
      })}
    </DropdownMenu>
  );
};

export default CollectionMenu;
