import React, { useMemo, useState } from 'react';
import { ChevronDown, Languages } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { DD_CHIP_TRIGGER_CLASS } from '../../lib/dropdown';
import type { HeadingMapping, HeadingValueChoice } from '../../lib/import';

/**
 * Custom/localized heading-value mapping (roadmap 127) — shown when an imported
 * screenplay carries INT/EXT or day/night values the project doesn't know.
 * "New option" writes to the Colors tab options (the source of truth); "Replace
 * with" records an alias so later imports replace silently. Built from kit
 * primitives (Modal + DropdownMenu + the standard segmented toggle).
 */

interface Props {
  unknown: { intExt: string[]; dayNight: string[] };
  knownIntExt: string[];
  knownDayNight: string[];
  onCancel: () => void;
  onConfirm: (mapping: HeadingMapping) => void;
}

const SEG_BTN = 'px-3 py-1.5 rounded text-xs font-semibold transition-colors';
const GROUP_LABEL = 'text-[10px] font-semibold uppercase tracking-wider text-zinc-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className={GROUP_LABEL}>{title}</h3>
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 divide-y divide-zinc-700/60 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function ValueMenu({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      align="left"
      width="w-44"
      contentClassName="z-[10001]"
      trigger={
        <button type="button" className={`${DD_CHIP_TRIGGER_CLASS} text-xs cursor-pointer`}>
          <span className="truncate">{value}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
        </button>
      }
    >
      {options.map(opt => (
        <DropdownItem key={opt} selected={opt === value} onClick={() => { onChange(opt); setOpen(false); }}>
          {opt}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
}

function Row({ value, known, choice, onChange }: {
  value: string;
  known: string[];
  choice: HeadingValueChoice;
  onChange: (c: HeadingValueChoice) => void;
}) {
  const isMatch = choice.action === 'map';
  const matchTo = choice.mapTo || known[0];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 text-sm font-semibold text-zinc-100 truncate">{value}</div>
      <div className="flex border border-zinc-700 rounded p-0.5 bg-zinc-950 w-fit" role="group" aria-label={`How to handle ${value}`}>
        <button
          type="button"
          aria-pressed={!isMatch}
          onClick={() => onChange({ action: 'add' })}
          className={`${SEG_BTN} ${!isMatch ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          New option
        </button>
        <button
          type="button"
          aria-pressed={isMatch}
          onClick={() => onChange({ action: 'map', mapTo: matchTo })}
          className={`${SEG_BTN} ${isMatch ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Replace with
        </button>
      </div>
      {isMatch && <ValueMenu value={matchTo} options={known} onChange={v => onChange({ action: 'map', mapTo: v })} />}
    </div>
  );
}

export default function HeadingValueMapper({ unknown, knownIntExt, knownDayNight, onCancel, onConfirm }: Props) {
  const [intExt, setIntExt] = useState<Record<string, HeadingValueChoice>>(() =>
    Object.fromEntries(unknown.intExt.map(v => [v, { action: 'add' as const }])));
  const [dayNight, setDayNight] = useState<Record<string, HeadingValueChoice>>(() =>
    Object.fromEntries(unknown.dayNight.map(v => [v, { action: 'add' as const }])));

  const total = unknown.intExt.length + unknown.dayNight.length;
  const mapping = useMemo<HeadingMapping>(() => ({ intExt, dayNight }), [intExt, dayNight]);

  return (
    <Modal
      open
      onClose={onCancel}
      title="Map script headings"
      icon={<Languages className="w-4 h-4" />}
      width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onCancel}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={() => onConfirm(mapping)}>Import {total} value{total === 1 ? '' : 's'}</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <p className="text-xs text-zinc-400 leading-relaxed">
          This script uses heading values your Colors options don't include yet. For each value
          below, either add it as a new option, or replace it with one you already use.
        </p>
        {unknown.intExt.length > 0 && (
          <Section title="Interior / exterior">
            {unknown.intExt.map(v => (
              <Row key={v} value={v} known={knownIntExt}
                choice={intExt[v]} onChange={c => setIntExt(prev => ({ ...prev, [v]: c }))} />
            ))}
          </Section>
        )}
        {unknown.dayNight.length > 0 && (
          <Section title="Day / night">
            {unknown.dayNight.map(v => (
              <Row key={v} value={v} known={knownDayNight}
                choice={dayNight[v]} onChange={c => setDayNight(prev => ({ ...prev, [v]: c }))} />
            ))}
          </Section>
        )}
      </div>
    </Modal>
  );
}
