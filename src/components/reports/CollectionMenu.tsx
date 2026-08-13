import React, { useState } from 'react';
import { ReportCollection } from '../../types';
import { COLLECTION_LABELS, scopedCollectionLabel } from '../../lib/reportBlocks';
import { CAT_ICONS, getCustomIcon } from '../../lib/categories';
import DropdownMenu from '../DropdownMenu';
import DropdownSubmenu from '../DropdownSubmenu';
import DropdownItem from '../DropdownItem';
import { ChevronDown, Check } from 'lucide-react';
import { TB_PICKER } from './FieldPicker';

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
  disabled?: boolean;
  width?: string;
  parentCollection?: ReportCollection;
  scopedToParent?: boolean;
  onChange: (collection: ReportCollection, category?: string) => void;
}

const CollectionMenu: React.FC<CollectionMenuProps> = ({
  value, category, collections, categoryKeys, categoryLabels, customCategories,
  disabled, width = 'w-40', parentCollection, scopedToParent = true, onChange,
}) => {
  const [open, setOpen] = useState(false);
  const scoped = scopedToParent !== false;
  const label = value === 'elements'
    ? `${scopedCollectionLabel('elements', parentCollection, scoped)} · ${categoryLabels[category] || category}`
    : scopedCollectionLabel(value, parentCollection, scoped);

  const pick = (collection: ReportCollection, cat?: string) => {
    onChange(collection, cat);
    setOpen(false);
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
