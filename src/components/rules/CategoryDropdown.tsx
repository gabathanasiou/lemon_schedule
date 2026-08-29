import React, { useEffect, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { CAT_ICONS, getCustomIcon } from '../../lib/categories';
import { DD_CHIP_TRIGGER_CLASS } from '../../lib/dropdown';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';

/**
 * Shared category picker (kit click-to-toggle menu) used by color-rule
 * condition rows and the calendar day-event modals. Built on the kit
 * DropdownMenu so it shares the overlay morph + theme styling with every
 * other dropdown surface; contentClassName lifts it above app modals
 * (kit menu default z-[200] sits under the modal's z-[10000]).
 */
export const CategoryDropdown: React.FC<{
  value: string;
  onChange: (cat: string) => void;
  allCategoryKeys: { key: string; isCustom: boolean }[];
  categoryLabelLookup: Record<string, string>;
  customCategories?: { key: string; icon?: string }[];
  /** Categories disabled in the menu (e.g. already used by another linked
   *  row) — shown visibly disabled, not hidden. */
  disabledKeys?: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  btnClass: string;
  minWidth?: string;
}> = ({ value, onChange, allCategoryKeys, categoryLabelLookup, customCategories, disabledKeys, open, onOpenChange, btnClass, minWidth }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const activeIndex = allCategoryKeys.findIndex(k => k.key === value);

  useEffect(() => {
    if (!open) return;
    // Scroll the active row into view (the kit's initialHighlightIndex lights
    // it — no focus stealing).
    const raf = requestAnimationFrame(() => {
      contentRef.current?.querySelector(`[data-cat="${value}"]`)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, value]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
      theme="dark"
      initialHighlightIndex={activeIndex >= 0 ? activeIndex : undefined}
      width={minWidth ? `${minWidth}!` : 'min-w-[160px]!'}
      contentClassName="z-[10001] max-h-64!"
      trigger={
        <button type="button" className={`${DD_CHIP_TRIGGER_CLASS} ${btnClass} shrink-0 ${minWidth || 'min-w-[120px]'} justify-between cursor-pointer`}>
          <span className="truncate">{categoryLabelLookup[value] || value}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
        </button>
      }
    >
      <div ref={contentRef} className="flex flex-col">
        {allCategoryKeys.map(({ key, isCustom }) => {
          const Icon = isCustom
            ? getCustomIcon(customCategories?.find(c => c.key === key)?.icon || 'Tag')
            : CAT_ICONS[key] || null;
          const active = key === value;
          const disabled = !!disabledKeys?.has(key);
          return (
            <div key={key} data-cat={key}>
              <DropdownItem
                onClick={() => onChange(key)}
                disabled={disabled}
                className={active ? 'bg-zinc-800 text-white' : ''}
                icon={Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                trailing={active ? <Check className="w-3 h-3 shrink-0" /> : undefined}
              >
                {categoryLabelLookup[key] || key}
              </DropdownItem>
            </div>
          );
        })}
      </div>
    </DropdownMenu>
  );
};
