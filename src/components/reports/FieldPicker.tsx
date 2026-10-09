import React, { useState } from 'react';
import { TB_PICKER } from '@gabriel/ui-kit';
import { ReportFieldDef, isGlobalField, smartFieldLabel } from '../../lib/reportFields';
import DropdownMenu from '../DropdownMenu';
import DropdownSubmenu from '../DropdownSubmenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import { ChevronDown, Check } from 'lucide-react';

// Attribute picker shared by the reports chrome (`FieldPicker`) AND the block
// context menu (`FieldPickerItems` inside the kit ContextMenu). Groups become
// submenus (Scene Info, Shooting, Cast & Talent, ...). Display vocabulary:
//  - `separator` fields render a divider before them inside their submenu
//  - cast identity fields merge into the Elements submenu (unique values on top)
//  - smart fields resolve by context — their labels carry a clue ("of this scene")
//  - report-wide groups (Production / Project / Document) sit under a GLOBAL
//    divider, separated from the item attributes.

interface FieldPickerProps {
  value: string;
  fields: ReportFieldDef[];
  onChange: (key: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  width?: string;
  scope?: string | null; // effective parent collection — smart-field context clues
}

export interface FieldPickerItemsProps {
  fields: ReportFieldDef[];
  value: string;
  scope?: string | null;
  onPick: (key: string) => void;
  /** Group submenu width (the host menu owns its own width). */
  submenuWidth?: string;
}

type FieldRow = ReportFieldDef | { sep: true };

/** The item body — one implementation for the dropdown trigger and the
 *  context menu. Renders DropdownItems + DropdownSubmenus (the kit
 *  ContextMenuSub IS a DropdownSubmenu, so the same tree nests in both). */
export const FieldPickerItems: React.FC<FieldPickerItemsProps> = ({ fields, value, scope, onPick, submenuWidth = 'w-56' }) => {
  const labelOf = (f: ReportFieldDef) => f.scope === 'smart' ? smartFieldLabel(f.label, scope) : f.label;

  // Counter is the most-used document field — rendered flat at the top of the
  // menu instead of buried inside the Document submenu.
  const counterField = fields.find(f => f.key === 'counter');
  const groupedFields = counterField ? fields.filter(f => f !== counterField) : fields;

  const itemGroups: { label: string; fields: ReportFieldDef[] }[] = [];
  const globalGroups: { label: string; fields: ReportFieldDef[] }[] = [];
  for (const f of groupedFields) {
    const bucket = isGlobalField(f) ? globalGroups : itemGroups;
    let g = bucket.find(x => x.label === f.group);
    if (!g) { g = { label: f.group, fields: [] }; bucket.push(g); }
    g.fields.push(f);
  }

  // Cast identity merges into the Elements submenu, unique values on top.
  const elementsGroup = itemGroups.find(g => g.label === 'Elements');
  const castGroup = itemGroups.find(g => g.label === 'Cast & Talent' && g.fields.every(f => f.scope === 'cast'));

  const rowsOf = (group: { label: string; fields: ReportFieldDef[] }): FieldRow[] => {
    const rows: FieldRow[] = [];
    for (const f of group.fields) {
      if (f.separator) rows.push({ sep: true });
      rows.push(f);
    }
    return rows;
  };

  const mergedElementsRows: FieldRow[] | null = (elementsGroup && castGroup)
    ? [
        ...castGroup.fields.map(f => f as FieldRow),
        { sep: true },
        // skip the elements group's own leading separator — our merge divider covers it
        ...rowsOf(elementsGroup).filter((r, i) => !(i === 0 && 'sep' in r)),
      ]
    : null;

  const itemRows: { label: string; rows: FieldRow[] }[] = itemGroups
    .filter(g => !(mergedElementsRows && g === castGroup))
    .map(g => g === elementsGroup && mergedElementsRows
      ? { label: g.label, rows: mergedElementsRows }
      : { label: g.label, rows: rowsOf(g) });

  const item = (f: ReportFieldDef) => (
    <DropdownItem key={f.key} onClick={() => onPick(f.key)} icon={f.key === value ? <Check className="w-3.5 h-3.5" /> : undefined}>
      <span className="truncate">{labelOf(f)}</span>
    </DropdownItem>
  );

  const renderRows = (rows: FieldRow[]) => rows.map((r, i) => (
    <React.Fragment key={i}>
      {'sep' in r ? <DropdownDivider /> : item(r as ReportFieldDef)}
    </React.Fragment>
  ));

  const flat = itemRows.length + globalGroups.length <= 1;
  const hasBoth = itemRows.length > 0 && globalGroups.length > 0;

  return (
    <>
      {value !== '' && (
        <DropdownItem onClick={() => onPick('')}>— none —</DropdownItem>
      )}
      {counterField && (
        <>
          {item(counterField)}
          <DropdownDivider />
        </>
      )}
      {flat ? (
        renderRows([...(itemRows[0]?.rows || []), ...(globalGroups[0] ? rowsOf(globalGroups[0]) : [])])
      ) : (
        <>
          {itemRows.map(g => (
            <React.Fragment key={g.label}>
              <DropdownSubmenu id={g.label} label={g.label} width={submenuWidth}>
                {renderRows(g.rows)}
              </DropdownSubmenu>
            </React.Fragment>
          ))}
          {hasBoth && (
            <>
              <DropdownDivider />
              <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Global</div>
            </>
          )}
          {globalGroups.map(g => (
            <React.Fragment key={g.label}>
              <DropdownSubmenu id={g.label} label={g.label} width={submenuWidth}>
                {renderRows(rowsOf(g))}
              </DropdownSubmenu>
            </React.Fragment>
          ))}
        </>
      )}
    </>
  );
};

export const FieldPicker: React.FC<FieldPickerProps> = ({ value, fields, onChange, disabled, placeholder = '—', className, width = 'w-56', scope }) => {
  const [open, setOpen] = useState(false);
  const current = fields.find(f => f.key === value);
  const labelOf = (f: ReportFieldDef) => f.scope === 'smart' ? smartFieldLabel(f.label, scope) : f.label;
  const triggerCls = className || TB_PICKER;

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
          title={current ? labelOf(current) : placeholder}
          className={`flex items-center justify-between gap-1 ${triggerCls}`}
        >
          <span className="truncate">{current ? labelOf(current) : placeholder}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
        </button>
      }
    >
      <FieldPickerItems fields={fields} value={value} scope={scope} submenuWidth={width} onPick={key => { onChange(key); setOpen(false); }} />
    </DropdownMenu>
  );
};

export default FieldPicker;
