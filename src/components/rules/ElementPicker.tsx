import React, { useEffect, useRef } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, X } from 'lucide-react';
import { ProjectElement } from '../../types';
import { CategoryDropdown } from './CategoryDropdown';

/**
 * Shared element-selection primitives (app-level, next to CategoryDropdown —
 * intentionally NOT the ui-kit: they embed app domain like the icon registry,
 * custom categories and cast Board-ID display).
 *
 * `ElementDropdown` = single element picker (Radix, click-to-toggle).
 * `ElementPickerRow` = the Color Rules condition-row layout: category
 * dropdown + "=" + element dropdown, reused by the Element Link Manager.
 */

export const ElementDropdown: React.FC<{
  category: string;
  value: string;
  onChange: (elementId: string) => void;
  elements: ProjectElement[];
  getElementName: (category: string, elementId: string) => string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  btnClass: string;
  itemClass: string;
  placeholder?: string;
}> = ({ category, value, onChange, elements, getElementName, open, onOpenChange, btnClass, itemClass, placeholder }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isCast = category === 'cast';

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const active = contentRef.current?.querySelector(`[data-el="${value}"]`) as HTMLElement | null;
      if (active) { active.focus(); active.scrollIntoView({ block: 'nearest' }); }
    });
    return () => cancelAnimationFrame(raf);
  }, [open, value]);

  return (
    <RadixDropdownMenu.Root modal={true} open={open} onOpenChange={onOpenChange}>
      <RadixDropdownMenu.Trigger asChild>
        <button className={`flex-1 flex items-center gap-1.5 ${btnClass} bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-750 shrink-0 min-w-0 justify-between`}>
          <span className="truncate">
            {value
              ? (isCast ? `${value}. ${getElementName(category, value)}` : getElementName(category, value))
              : (placeholder || 'Select...')}
          </span>
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
          {elements.length === 0 ? (
            <div className={`${itemClass} text-zinc-500`}>No elements</div>
          ) : elements.slice().sort((a, b) => {
            if (isCast) {
              const ia = parseInt(a.id) ?? 0;
              const ib = parseInt(b.id) ?? 0;
              return ia - ib;
            }
            return (a.name || a.id).localeCompare(b.name || b.id);
          }).map(el => {
            const active = (el.id || el.name) === value;
            return (
              <RadixDropdownMenu.Item
                key={el.id || el.name}
                data-el={el.id || el.name}
                onSelect={() => onChange(el.id || el.name)}
                className={`flex items-center gap-2 ${itemClass} rounded transition-colors outline-none cursor-pointer select-none whitespace-nowrap ${
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
  );
};

export const ElementPickerRow: React.FC<{
  category: string;
  elementValue: string;
  onCategoryChange: (cat: string) => void;
  onElementChange: (elementId: string) => void;
  allCategoryKeys: { key: string; isCustom: boolean }[];
  categoryLabelLookup: Record<string, string>;
  customCategories?: { key: string; icon?: string }[];
  elements: ProjectElement[];
  getElementName: (category: string, elementId: string) => string;
  openDropdown: string | null;
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>;
  idPrefix: string;
  btnClass: string;
  itemClass: string;
  onRemove?: () => void;
  removeIcon?: React.ReactNode;
  /** Extra content right of the element dropdown (e.g. a per-row Apply button). */
  trailing?: React.ReactNode;
}> = ({ category, elementValue, onCategoryChange, onElementChange, allCategoryKeys, categoryLabelLookup, customCategories, elements, getElementName, openDropdown, setOpenDropdown, idPrefix, btnClass, itemClass, onRemove, removeIcon, trailing }) => {
  return (
    <div className="flex items-center gap-2">
      <CategoryDropdown
        value={category}
        onChange={onCategoryChange}
        allCategoryKeys={allCategoryKeys}
        categoryLabelLookup={categoryLabelLookup}
        customCategories={customCategories}
        open={openDropdown === `cat-${idPrefix}`}
        onOpenChange={(o) => setOpenDropdown(o ? `cat-${idPrefix}` : null)}
        btnClass={btnClass}
        itemClass={itemClass}
      />

      <span className="text-xs text-zinc-500 font-medium shrink-0">=</span>

      <ElementDropdown
        category={category}
        value={elementValue}
        onChange={onElementChange}
        elements={elements}
        getElementName={getElementName}
        open={openDropdown === `el-${idPrefix}`}
        onOpenChange={(o) => setOpenDropdown(o ? `el-${idPrefix}` : null)}
        btnClass={btnClass}
        itemClass={itemClass}
      />

      {trailing}

      {onRemove && (
        <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 transition-colors p-0.5 shrink-0">
          {removeIcon || <X className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
};