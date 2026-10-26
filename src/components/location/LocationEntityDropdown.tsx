import React, { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { EntityDropdown, type EntityItem } from '../EntityDropdown';
import type { LocationOption } from '../../lib/locationOptions';

/**
 * The category version of every standalone location picker.
 *
 * Locations are ALWAYS grouped by their location type (Set, Unit Base, …) —
 * never a flat list. The Locations day grid and the crew Report-to cells use
 * the same `locationOptions(project)` list through their EntityDropdown
 * editors; this is the standalone-field face used by the Day Details master
 * picker. The committed value stays a Locations-DB **id**; the name-keyed
 * items are only the display adapter (the dropdown maps the picked label back
 * to its id), matching how the rest of the app stores locations.
 */
export interface LocationEntityDropdownProps {
  /** Selected Locations-DB id ('' = none). */
  value: string;
  onChange: (locationId: string) => void;
  /** Normally `locationOptions(project)` (or the attached subset, pre-grouped). */
  items: LocationOption[];
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

export const LocationEntityDropdown: React.FC<LocationEntityDropdownProps> = ({
  value,
  onChange,
  items,
  readOnly,
  placeholder = 'Select…',
  className = '',
}) => {
  // EntityDropdown's opened picker is name-keyed (displayMode="name"); the
  // closed field must therefore show the same label the panel commits. Duplicate
  // display names get their type appended so every option stays distinct.
  const { dropdownItems, labelById, idByLabel } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.name, (counts.get(item.name) || 0) + 1);
    const labelById = new Map<string, string>();
    const idByLabel = new Map<string, string>();
    const dropdownItems: EntityItem[] = items.map(item => {
      const label = (counts.get(item.name) || 0) > 1 && item.group ? `${item.name} (${item.group})` : item.name;
      labelById.set(item.id, label);
      idByLabel.set(label, item.id);
      return { id: label, name: label, group: item.group };
    });
    return { dropdownItems, labelById, idByLabel };
  }, [items]);

  return (
    <div
      className={`relative flex min-h-[28px] cursor-text items-center rounded border border-[color:var(--ui-border-strong)] bg-[var(--ui-panel-bg)] px-2 text-xs text-[color:var(--ui-text)] transition-colors focus-within:border-[color:var(--ui-input-focus-border)] focus-within:ring-1 focus-within:ring-[color:var(--ui-accent-focus)] ${className}`}
      onMouseDown={e => {
        // The transparent cell-style input is only as tall as its text line;
        // clicking the field's padding should still focus/open the picker.
        if (e.target === e.currentTarget) {
          (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus();
        }
      }}
    >
      <EntityDropdown
        value={labelById.get(value) || ''}
        onChange={label => {
          const id = idByLabel.get(label);
          if (id) onChange(id);
        }}
        items={dropdownItems}
        mode="single"
        displayMode="name"
        readOnly={readOnly}
        placeholder={placeholder}
        searchFields={['name', 'group']}
        // The list is pre-ordered by the type registry; sorting would split
        // the type group headers.
        sortItems={list => list}
        panelMinWidth="min-w-[260px]"
        renderItem={item => <span className="truncate">{item.name}</span>}
        className="min-w-0 flex-1"
      />
      {!readOnly && <ChevronDown className="pointer-events-none ml-1 h-3 w-3 shrink-0 text-[color:var(--ui-text-faint)]" />}
    </div>
  );
};

export default LocationEntityDropdown;
