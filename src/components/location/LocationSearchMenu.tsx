import React, { useMemo } from 'react';
import { Plus, X, MapPin } from 'lucide-react';
import { SearchMenu, useKitTheme } from '@gabriel/ui-kit';
import type { SearchMenuGroup, SearchMenuItem } from '@gabriel/ui-kit';
import { ADD_LOCATION_SENTINEL, type LocationOption } from '../../lib/locationOptions';
import { shortLocationLabel } from '../../lib/locations';

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
  /** Expandable-mode widths (px). `'auto'` hugs the value so a long location
   *  name is shown in full instead of clipped to a fixed box. */
  collapsedWidth?: number | 'auto';
  expandedWidth?: number;
  panelWidth?: number | string;
  maxMenuHeight?: number;
  theme?: 'light' | 'dark';
  /** Trigger face: `primary` (default) for a hero field, `outline` for a value
   *  field (Report to), `subtle` for an adder (Add location). */
  variant?: 'primary' | 'subtle' | 'outline';
  /** The shown value is a CUSTOM override (not inherited) — tint the trigger
   *  blue so "changed here" reads at a glance (Report to). */
  custom?: boolean;
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
  /* Location triggers are text-first — no decorative pin (roadmap 324). */
  icon = null,
  browse = 'open',
  newActionFirst = false,
  collapsedWidth = 220,
  expandedWidth = 280,
  panelWidth = 320,
  maxMenuHeight,
  theme,
  variant = 'primary',
  custom = false,
  className = '',
}) => {
  const ambient = useKitTheme();
  const resolvedTheme = theme ?? ambient?.mode ?? 'light';
  /* A hand-edited value (a Report-to override) gets a soft blue trigger — the
     outline field stays the same size, only the tint says "custom here". */
  const customTint = custom
    ? resolvedTheme === 'dark'
      ? 'bg-blue-950/40! text-blue-200! hover:bg-blue-900/40!'
      : 'bg-blue-50! text-blue-800! hover:bg-blue-100!'
    : undefined;
  /* Location fields read as values, not bold call-to-actions. */
  const triggerFace = ['font-normal!', customTint].filter(Boolean).join(' ');
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

  /* Closed state names the MAIN place ("Piccadilly Circus", "Great Queen St"),
     never the whole address; CSS truncates it if the button is narrower. The
     panel still lists every full location record. */
  const shortLabel = label ? shortLocationLabel(label) : '';
  const triggerLabel = shortLabel || placeholder;

  if (readOnly) {
    return (
      <div className={`flex min-h-[28px] items-center rounded border border-[color:var(--ui-border-strong)] bg-[var(--ui-panel-bg)] px-2 text-xs ${className}`}>
        <span className={`truncate ${label ? 'text-[color:var(--ui-text)]' : 'text-[color:var(--ui-text-faint)]'}`} title={label || undefined}>
          {shortLabel || placeholder}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex min-w-0 items-center gap-1 ${className}`}
      title={custom ? 'Custom value' : (label || undefined)}
    >
      <SearchMenu
        mode="expandable"
        theme={resolvedTheme}
        items={searchItems}
        groups={groups}
        triggerLabel={triggerLabel}
        triggerIcon={icon}
        triggerVariant={variant}
        triggerClassName={triggerFace}
        /* A picker that HOLDS a value opens ON it: the kit expands the
           accordion section holding this id and scrolls the row into view. */
        selectedId={value || undefined}
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
            <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ui-card-band)] text-[color:var(--ui-text-faint)]">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-medium text-[color:var(--ui-text-muted)]">
              {query.trim() ? `No locations match “${query.trim()}”` : 'Search locations'}
            </div>
            <div className="mt-0.5 text-[10px] text-[color:var(--ui-text-faint)]">
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
