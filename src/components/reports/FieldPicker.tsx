import React, { useState } from 'react';
import { ReportFieldDef } from '../../lib/reportFields';
import DropdownMenu from '../DropdownMenu';
import DropdownSubmenu from '../DropdownSubmenu';
import DropdownItem from '../DropdownItem';
import { ChevronDown, Check } from 'lucide-react';

// Attribute picker for the reports toolbar: replaces flat native selects with
// the shared Radix menu, grouped into submenus by field group (Scene Info,
// Shooting, Production, ...). Uses the app's DropdownMenu primitives.

interface FieldPickerProps {
  value: string;
  fields: ReportFieldDef[];
  onChange: (key: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  width?: string;
}

export const FieldPicker: React.FC<FieldPickerProps> = ({ value, fields, onChange, disabled, placeholder = '—', className, width = 'w-56' }) => {
  const [open, setOpen] = useState(false);
  const current = fields.find(f => f.key === value);

  const groups: { label: string; fields: ReportFieldDef[] }[] = [];
  for (const f of fields) {
    let g = groups.find(x => x.label === f.group);
    if (!g) { g = { label: f.group, fields: [] }; groups.push(g); }
    g.fields.push(f);
  }

  const pick = (key: string) => { onChange(key); setOpen(false); };
  const triggerCls = className || 'bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30 disabled:pointer-events-none';
  const items = (list: ReportFieldDef[]) => list.map(f => (
    <DropdownItem key={f.key} onClick={() => pick(f.key)} icon={f.key === value ? <Check className="w-3.5 h-3.5" /> : undefined}>
      {f.label}
    </DropdownItem>
  ));

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width={width}
      trigger={
        <button
          type="button"
          disabled={disabled}
          title={current?.label || placeholder}
          className={`flex items-center justify-between gap-1 ${triggerCls}`}
        >
          <span className="truncate">{current?.label || placeholder}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
        </button>
      }
    >
      {value !== '' && (
        <DropdownItem onClick={() => pick('')}>— none —</DropdownItem>
      )}
      {groups.length <= 1 ? items(groups[0]?.fields || []) : groups.map(g => (
        <React.Fragment key={g.label}>
          <DropdownSubmenu id={g.label} label={g.label} width={width}>
            {items(g.fields)}
          </DropdownSubmenu>
        </React.Fragment>
      ))}
    </DropdownMenu>
  );
};

export default FieldPicker;
