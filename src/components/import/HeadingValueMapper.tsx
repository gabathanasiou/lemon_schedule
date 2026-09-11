import React, { useMemo, useState } from 'react';
import { ChevronDown, Languages } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import type { HeadingMapping, HeadingValueChoice } from '../../lib/import';

/**
 * Custom/localized heading-value mapping (roadmap 127) — shown when an imported
 * screenplay carries INT/EXT or day/night values the project doesn't know.
 * "Add as new" writes to the Colors tab options; "Map to" records an alias.
 * Built from kit primitives (Modal + Button + DropdownMenu) per DESIGN-LANGUAGE.
 */

interface Props {
  unknown: { intExt: string[]; dayNight: string[] };
  knownIntExt: string[];
  knownDayNight: string[];
  onCancel: () => void;
  onConfirm: (mapping: HeadingMapping) => void;
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
        <Button theme="dark" variant="subtle" className="w-44 justify-between">
          <span className="truncate">{value}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500" />
        </Button>
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

function Row({ label, value, known, choice, onChange }: {
  label: string;
  value: string;
  known: string[];
  choice: HeadingValueChoice;
  onChange: (c: HeadingValueChoice) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800">
      <span className="text-zinc-100 text-xs font-mono w-24 shrink-0 truncate">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-16 shrink-0">{label}</span>
      <Button theme="dark" variant="subtle" active={choice.action === 'add'} onClick={() => onChange({ action: 'add' })}>
        Add as new
      </Button>
      <Button theme="dark" variant="subtle" active={choice.action === 'map'} onClick={() => onChange({ action: 'map', mapTo: choice.mapTo || known[0] })}>
        Map to
      </Button>
      {choice.action === 'map' && (
        <ValueMenu value={choice.mapTo || known[0]} options={known} onChange={v => onChange({ action: 'map', mapTo: v })} />
      )}
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
          This script uses heading values the project doesn't know. Add them to your Colors options, or map them to an existing value.
        </p>
        {unknown.intExt.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Interior / Exterior</h3>
            {unknown.intExt.map(v => (
              <Row key={v} label="INT/EXT" value={v} known={knownIntExt} choice={intExt[v]} onChange={c => setIntExt(prev => ({ ...prev, [v]: c }))} />
            ))}
          </div>
        )}
        {unknown.dayNight.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Day / Night</h3>
            {unknown.dayNight.map(v => (
              <Row key={v} label="Day/Night" value={v} known={knownDayNight} choice={dayNight[v]} onChange={c => setDayNight(prev => ({ ...prev, [v]: c }))} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
