import React, { useEffect, useRef } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { CAT_ICONS, getCustomIcon } from '../../lib/categories';

/**
 * Shared category picker (Radix click-to-toggle) used by color-rule
 * condition rows and the calendar travel/hold modal.
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
  itemClass: string;
  minWidth?: string;
}> = ({ value, onChange, allCategoryKeys, categoryLabelLookup, customCategories, disabledKeys, open, onOpenChange, btnClass, itemClass, minWidth }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const active = contentRef.current?.querySelector(`[data-cat="${value}"]`) as HTMLElement | null;
      if (active) { active.focus(); active.scrollIntoView({ block: 'nearest' }); }
    });
    return () => cancelAnimationFrame(raf);
  }, [open, value]);

  return (
    <RadixDropdownMenu.Root modal={true} open={open} onOpenChange={onOpenChange}>
      <RadixDropdownMenu.Trigger asChild>
        <button className={`flex items-center gap-1.5 ${btnClass} bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-750 shrink-0 ${minWidth || 'min-w-[120px]'} justify-between`}>
          <span className="truncate">{categoryLabelLookup[value] || value}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
        </button>
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          ref={contentRef}
          className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 max-h-64 overflow-y-auto min-w-[160px]"
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          {allCategoryKeys.map(({ key, isCustom }) => {
            const Icon = isCustom
              ? getCustomIcon(customCategories?.find(c => c.key === key)?.icon || 'Tag')
              : CAT_ICONS[key] || null;
            const active = key === value;
            const disabled = !!disabledKeys?.has(key);
            return (
              <RadixDropdownMenu.Item
                key={key}
                data-cat={key}
                disabled={disabled}
                onSelect={() => onChange(key)}
                className={`flex items-center gap-2 ${itemClass} rounded transition-colors outline-none cursor-pointer select-none ${
                  disabled
                    ? 'text-zinc-600 opacity-60 cursor-not-allowed'
                    : active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
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
  );
};
