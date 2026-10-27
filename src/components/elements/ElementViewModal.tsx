import React, { useEffect, useMemo, useState } from 'react';
import { useProject } from '../../store';
import { ELEMENT_CATEGORIES, getLabel, CAT_ICONS } from '../../lib/categories';
import { elementKey, elementMatchId } from '../../lib/elements';
import { clipTriggerLabel } from '../../lib/searchMenuTrigger';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Seg, SearchMenu } from '@gabriel/ui-kit';
import type { SearchMenuItem } from '@gabriel/ui-kit';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { ElementPropertiesSection, elementViewOptions } from './ElementPropertiesSection';
import { ElementLinksSection } from './ElementLinksSection';
import { ElementEventsSection } from './ElementEventsSection';

/**
 * Element View (roadmap 306) — ONE per-element panel, launched from the
 * Element Manager. Header picker + prev/next (the Day Manager's day-picker
 * pattern), then Properties / Crew / Events. Category-agnostic: cast shows the
 * 157 performer set, every other category its built-in fields. This replaces
 * the two old per-element modals (crew links + events) — don't re-add them.
 */

type Tab = 'properties' | 'links' | 'events';

const TAB_OPTIONS = [
  { v: 'properties', l: 'Properties' },
  { v: 'links', l: 'Links' },
  { v: 'events', l: 'Events' },
];

function ElementPicker({ options, selectedKey, onSelect, groupIcon }: {
  options: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
  groupIcon?: React.ReactNode;
}) {
  const i = options.findIndex(o => o.key === selectedKey);
  const selected = i >= 0 ? options[i] : undefined;
  const step = (delta: number) => {
    const next = options[i + delta];
    if (next) onSelect(next.key);
  };
  // Roadmap 318 — the category's elements are the catalogue: `browseAll` opens
  // the FULL flat list (no category header — it would only repeat the trigger)
  // and `selectedId` marks + scrolls to the element we are on.
  const items: SearchMenuItem[] = options.map(o => ({ id: o.key, label: o.label }));
  const collapsedWidth = 216;
  const arrow = 'p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-25 disabled:hover:bg-transparent transition-colors';
  return (
    <div className="flex items-center gap-1" data-element-view-picker>
      <button type="button" onClick={() => step(-1)} disabled={i <= 0} className={arrow} title="Previous element" aria-label="Previous element">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <SearchMenu
        mode="expandable"
        theme="dark"
        items={items}
        triggerLabel={clipTriggerLabel(selected ? selected.label : 'Select element', collapsedWidth)}
        triggerIcon={groupIcon}
        placeholder="Search elements…"
        onSelect={item => onSelect(item.id)}
        browseAll
        selectedId={selectedKey}
        collapsedWidth={collapsedWidth}
        expandedWidth={260}
        panelWidth={320}
        maxMenuHeight={320}
        emptyTitle={options.length === 0 ? 'No elements in this category yet.' : undefined}
        emptyHint="Try a name or a Board ID."
      />
      <button type="button" onClick={() => step(1)} disabled={i < 0 || i >= options.length - 1} className={arrow} title="Next element" aria-label="Next element">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ElementViewModal({ category, rowKey, onClose }: {
  category: string;
  /** The manager row's elementKey at open time. */
  rowKey: string;
  onClose: () => void;
}) {
  const { state, locked } = useProject();
  const project = state.present;
  const options = useMemo(() => elementViewOptions(project, category), [project, category]);
  const [selectedKey, setSelectedKey] = useState(rowKey);
  const [tab, setTab] = useState<Tab>('properties');

  // The open row may vanish (undo, peer edit); fall back to the first element.
  useEffect(() => {
    if (!options.some(o => o.key === selectedKey)) setSelectedKey(options[0]?.key || '');
  }, [options, selectedKey]);

  const selected = options.find(o => o.key === selectedKey);
  const categoryLabel = getLabel(category, ELEMENT_CATEGORIES.find(c => c.key === category)?.label || category, project.categoryLabels);
  const CategoryIcon = CAT_ICONS[category];
  const elementName = selected?.name || selected?.label || '';
  // Link values use `elementMatchId` (cast = Board ID, others = the NAME), NOT
  // the picker's row key (`elementKey` = the element id — which differs after a
  // rename). Never pass the id into the Links tab: it would read as "no links"
  // and write rows nothing can resolve.
  const selectedMatchKey = selected ? elementMatchId(selected, category) : '';

  return (
    <Modal
      open
      onClose={onClose}
      title="Element view"
      width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="flex flex-col" data-element-view={category}>
        <div className="flex items-center justify-between gap-3 px-6 pt-4 pb-3 border-b border-zinc-800">
          <ElementPicker
            options={options}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            groupIcon={CategoryIcon ? <CategoryIcon className="w-3.5 h-3.5" /> : undefined}
          />
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Users className="w-3 h-3" />
            {categoryLabel}
          </span>
        </div>

        <div className="px-6 pt-3">
          <Seg
            variant="track"
            theme="dark"
            dense
            stretch
            tablist
            value={tab}
            options={TAB_OPTIONS}
            onChange={v => setTab(v as Tab)}
            ariaLabel="Element view section"
          />
        </div>

        {!selected ? (
          <div className="p-6 text-xs text-zinc-500">This category has no elements yet.</div>
        ) : tab === 'properties' ? (
          <ElementPropertiesSection category={category} elementKey={selectedKey} onKeyChange={setSelectedKey} />
        ) : tab === 'links' ? (
          <ElementLinksSection
            key={`${category}:${selectedMatchKey}`}
            category={category}
            elementKey={selectedMatchKey}
            onSelectElement={matchKey => {
              // Incoming link values are match keys; map back to the picker's key.
              const target = options.find(o =>
                elementMatchId({ id: o.id, name: o.name }, category).toLowerCase() === matchKey.toLowerCase());
              if (target) setSelectedKey(target.key);
            }}
          />
        ) : (
          <ElementEventsSection
            category={category}
            rowKey={elementKey(selected)}
            rowId={selected.id}
            rowName={selected.name}
          />
        )}

        {locked && (
          <p className="px-6 pb-3 text-[10px] text-zinc-600">Read-only — this project is not editable.</p>
        )}
      </div>
    </Modal>
  );
}
