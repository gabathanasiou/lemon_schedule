import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import Button from '../Button';

export interface BudgetEditAction {
  label: string;
  onClick: () => void;
}

/**
 * Item 356 — ONE "Edit" menu for the Budget and Cost Report toolbars. Print
 * designs, export and import live here instead of three separate buttons; the
 * menus stay one surface as the toolbars gain features.
 */
export function BudgetEditMenu({
  printActions = [],
  saveActions = [],
  exportActions = [],
  onImport,
  importDisabled,
}: {
  printActions?: BudgetEditAction[];
  saveActions?: BudgetEditAction[];
  exportActions?: BudgetEditAction[];
  onImport?: () => void;
  importDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      width="w-56"
      theme="light"
      trigger={<Button theme="light"><Pencil className="w-3.5 h-3.5" /> Edit</Button>}
    >
      {printActions.map(action => (
        <DropdownItem key={action.label} onClick={() => { setOpen(false); action.onClick(); }}>
          {action.label}
        </DropdownItem>
      ))}
      {saveActions.length > 0 && (
        <>
          {printActions.length > 0 && <DropdownDivider />}
          {saveActions.map(action => (
            <DropdownItem key={action.label} onClick={() => { setOpen(false); action.onClick(); }}>
              {action.label}
            </DropdownItem>
          ))}
        </>
      )}
      {exportActions.length > 0 && (
        <>
          <DropdownDivider />
          {exportActions.map(action => (
            <DropdownItem key={action.label} onClick={() => { setOpen(false); action.onClick(); }}>
              {action.label}
            </DropdownItem>
          ))}
        </>
      )}
      {onImport && (
        <>
          <DropdownDivider />
          <DropdownItem disabled={importDisabled} onClick={() => { setOpen(false); onImport(); }}>
            Import budget…
          </DropdownItem>
        </>
      )}
    </DropdownMenu>
  );
}
