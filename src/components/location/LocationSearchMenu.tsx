import React, { useMemo } from 'react';
import { Plus, X, MapPin } from 'lucide-react';
import { SearchMenu, useKitTheme } from '@gabriel/ui-kit';
import type { SearchMenuGroup, SearchMenuItem } from '@gabriel/ui-kit';
import { ADD_LOCATION_SENTINEL, type LocationOption } from '../../lib/locationOptions';
import { clipTriggerLabel } from '../../lib/searchMenuTrigger';

/**
 * The SearchMenu face of every STANDALONE location picker (roadmap 318).
 *
 * Locations are always a catalogue: grouped by location type, deep-searchable
 * through name + address + contact + phone, with an optional "add the typed
 * name" empty action. Cell editors keep `EntityDropdown` — this is the
 * button->search-field control used by the Day Manager's master location,
 * the Locations card's Add location, and the crew Report-to headers.
 *
 * The committed value stays a Locations-DB **id**. Read-only hosts get the
 * plain value field (SearchMenu has no disabled state by design).
 */
export interface LocationSearchMenuProps {
  /** `locationOptions(project, …)`; the add-new sentinel is ignored. */
  items: LocationOption[];
  /** Selected Locations-DB id ('' = none). */
  value?: string;
  onSelect: (locationId: string) => void;
  /** No-match action — receives the typed query so the map picker can prefill
   *  it as the address. Omit to hide the action. */
  onAddNew?: (query: string) => void;
  /** Clears the current value (icon button beside the field). */
  onClear?: () => void;
  readOnly?: boolean;
  /** Trigger label when nothing is selected. */
  placeholder?: string;
  /** Category behaviour:
   *  - `open` (default) — plain type headers with every location visible; the
   *    master-location field is one glance.
   *  - `accordion` — folded type categories with a chevron, one open at a
   *    time; the Report-to pickers and the Add-location catalogue use it. */
  browse?: 'open' | 'accordion';
  /** Pin a `New location…` action above the catalogue (the Add-location
   *  menu's create path). Requires `onAddNew`. */
  newActionFirst?: boolean;
  /** Trigger leading icon (default: a map pin — the location cue). */
  icon?: React.ReactNode;
  /** Expandable-mode widths (px). */
  collapsedWidth?: number;
  expandedWidth?: number;
  panelWidth?: number | string;
  maxMenuHeight?: number;
  theme?: 'light' | 'dark';
  className?: string;
}

const UNGROUPED = '__ungrouped__';

export const LocationSearchMenu: React.FC<LocationSearchMenuProps> = ({
  items,
  value,
  onSelect,
  onAddNew,
  onClear,
  readOnly,
  placeholder = 'Choose a location…',
  icon = <MapPin className="w-3.5 h-3.5" />,
  browse = 'open',
  newActionFirst = false,
  collapsedWidth = 220,
  expandedWidth = 280,
  panelWidth = 320,
  maxMenuHeight,
  theme,
  className = '',
}) => {
  const ambient = useKitTheme();
  const { groups, searchItems, labelById } = useMemo(() => {
    const labelById = new Map<string, string>();
    const groups: SearchMenuGroup[] = [];
    const groupByLabel = new Map<string, SearchMenuGroup>();
    const keyOf = (group?: string) => group || UNGROUPED;
    const pushGroup = (key: string, label: string) => {
      let group = groupByLabel.get(key);
      if (!group) {
        group = { key, label, count: 0 };
        groupByLabel.set(key, group);
        groups.push(group);
      }
      return group;
    };
    const searchItems: SearchMenuItem[] = [];
    for (const item of items) {
      if (item.id === ADD_LOCATION_SENTINEL) continue;
      const label = item.name || 'Unnamed location';
      labelById.set(item.id, label);
      const key = keyOf(item.group);
      const group = pushGroup(key, item.group || 'Locations');
      group.count = (group.count || 0) + 1;
      searchItems.push({
        id: item.id,
        label,
        group: key,
        fields: item.fields,
      });
    }
    return { groups, searchItems, labelById };
  }, [items]);

  const label = value ? labelById.get(value) || '' : '';

  // The kit trigger is a fixed-width button and renders its label unclipped —
  // keep long location names from spilling past the box (the panel shows the
  // full name).
  const triggerLabel = label || placeholder;
  const clippedTriggerLabel = clipTriggerLabel(triggerLabel, collapsedWidth);

  if (readOnly) {
    return (
      <div className={`flex min-h-[28px] items-center rounded border border-[color:var(--ui-border-strong)] bg-[var(--ui-panel-bg)] px-2 text-xs ${className}`}>
        <span className={`truncate ${label ? 'text-[color:var(--ui-text)]' : 'text-[color:var(--ui-text-faint)]'}`}>
          {label || placeholder}
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <SearchMenu
        mode="expandable"
        theme={theme ?? ambient?.mode ?? 'light'}
        items={searchItems}
        groups={groups}
        triggerLabel={clippedTriggerLabel}
        triggerIcon={icon}
        placeholder="Search locations…"
        onSelect={item => onSelect(item.id)}
        expandableGroups={browse === 'accordion'}
        browseExpanded={browse === 'open'}
        groupExpandMode="single"
        collapsedWidth={collapsedWidth}
        expandedWidth={expandedWidth}
        panelWidth={panelWidth}
        maxMenuHeight={maxMenuHeight}
        emptyHint="Try a location name, type, address, contact or phone."
        renderEmpty={({ query }) => (
          <>
            <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-medium text-zinc-500">
              {query.trim() ? `No locations match “${query.trim()}”` : 'Search locations'}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-400">
              {query.trim() ? 'Try a name, type, address, contact or phone.' : 'Type a name, type or address — or add a new one.'}
            </div>
          </>
        )}
        emptyActions={onAddNew ? [{
          label: (query: string) => query.trim() ? `Add “${query.trim()}”…` : 'Add new location…',
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: (query: string) => onAddNew(query),
        }] : undefined}
        leadingActions={newActionFirst && onAddNew ? [{
          label: 'New location…',
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: (query: string) => onAddNew(query),
        }] : undefined}
        hideLeadingOnEmpty={newActionFirst && !!onAddNew}
      />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear location"
          title="Clear location"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-faint)] transition-colors hover:bg-[var(--ui-card-hover)] hover:text-[color:var(--ui-text)]"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export default LocationSearchMenu;
