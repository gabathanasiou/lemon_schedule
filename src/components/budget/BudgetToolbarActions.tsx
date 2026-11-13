import React, { useState } from 'react';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import Button from '../Button';

export interface BudgetAction {
  label: string;
  onClick: () => void;
}

/**
 * The Budget/Cost Report toolbars' ONE labelled action face (roadmap 363):
 * each action is its own button instead of a dumping-ground "Edit" menu.
 * Icon-first (roadmap 324): the action glyph alone at rest, the label revealed
 * on hover / keyboard focus / while its menu is open. Glyphs follow the action
 * icon canon (`Printer`, `Save`, `Download`, `FileUp`).
 */
export function BudgetActionButton({
  icon, label, onClick, disabled, title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      theme="light"
      icon={icon}
      collapse
      revealOnHover
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
    >
      {label}
    </Button>
  );
}

/**
 * A labelled action that opens its OWN menu (Print / Save as / Export) — the
 * same icon-first face as a direct action; its menu only holds its own
 * variants.
 */
export function BudgetMenuButton({
  icon, label, actions, width = 'w-56', disabled, title,
}: {
  icon: React.ReactNode;
  label: string;
  actions: BudgetAction[];
  width?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      width={width}
      theme="light"
      trigger={
        <Button
          theme="light"
          icon={icon}
          collapse
          revealOnHover
          aria-label={label}
          disabled={disabled}
          title={title ?? label}
        >
          {label}
        </Button>
      }
    >
      {actions.map(action => (
        <DropdownItem key={action.label} onClick={() => { setOpen(false); action.onClick(); }}>
          {action.label}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
}
