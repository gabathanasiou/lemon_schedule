import React, { useEffect, useMemo, useState } from 'react';
import { useProject } from '../../store';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { elementKey } from '../../lib/elements';
import { ChevronDown, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Seg } from '@gabriel/ui-kit';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { ElementPropertiesSection, elementViewOptions } from './ElementPropertiesSection';
import { ElementEventsSection } from './ElementEventsSection';
import { ElementCrewLinksSection } from '../crew/ElementCrewLinksSection';

/**
 * Element View (roadmap 306) — ONE per-element panel, launched from the
 * Element Manager. Header picker + prev/next (the Day Manager's day-picker
 * pattern), then Properties / Crew / Events. Category-agnostic: cast shows the
 * 157 performer set, every other category its built-in fields. This replaces
 * the two old per-element modals (crew links + events) — don't re-add them.
 */

type Tab = 'properties' | 'crew' | 'events';

const TAB_OPTIONS = [
  { v: 'properties', l: 'Properties' },
  { v: 'crew', l: 'Crew' },
  { v: 'events', l: 'Events' },
];

function ElementPicker({ options, selectedKey, onSelect }: {
  options: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const i = options.findIndex(o => o.key === selectedKey);
  const selected = i >= 0 ? options[i] : undefined;
  const step = (delta: number) => {
    const next = options[i + delta];
    if (next) { onSelect(next.key); setOpen(false); }
  };
  const arrow = 'p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-25 disabled:hover:bg-transparent transition-colors';
  return (
    <div className="flex items-center gap-1" data-element-view-picker>
      <button type="button" onClick={() => step(-1)} disabled={i <= 0} className={arrow} title="Previous element" aria-label="Previous element">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        onClose={() => setOpen(false)}
        theme="dark"
        align="left"
        width="w-72"
        trigger={
          <button
            type="button"
            aria-haspopup="listbox"
            className="inline-flex items-center gap-1.5 max-w-[22rem] px-2 py-1 rounded text-xs font-semibold text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <span className="truncate">{selected ? selected.label : 'Select element'}</span>
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-400" />
          </button>
        }
      >
        <div className="max-h-72 overflow-y-auto">
          {options.length === 0 && <div className="px-3 py-2 text-xs text-zinc-500">No elements in this category yet.</div>}
          {options.map(o => (
            <DropdownItem key={o.key} selected={o.key === selectedKey} onClick={() => { onSelect(o.key); setOpen(false); }}>
              {o.label}
            </DropdownItem>
          ))}
        </div>
      </DropdownMenu>
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
  const elementName = selected?.name || selected?.label || '';

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
          <ElementPicker options={options} selectedKey={selectedKey} onSelect={setSelectedKey} />
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
        ) : tab === 'crew' ? (
          <ElementCrewLinksSection category={category} elementKey={elementKey(selected)} elementName={elementName} />
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
