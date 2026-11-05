import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useKitTheme } from '@gabriel/ui-kit';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import Button from '../Button';

/**
 * Item 356 — the Budget settings' single-select control. A compact dropdown
 * (the kit's one menu) instead of a `Seg` that fights the settings grid for
 * width. Commit on pick; the trigger shows the current label.
 */
export interface SettingSelectOption<T extends string = string> {
  v: T;
  l: string;
}

export function SettingSelect<T extends string>({
  value, options, onChange, disabled, ariaLabel, title,
}: {
  value: T;
  options: SettingSelectOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const theme = useKitTheme()?.mode ?? 'light';
  const current = options.find(o => o.v === value);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      width="w-48"
      theme={theme}
      trigger={
        <Button
          variant="outline"
          theme={theme}
          className="w-full justify-between"
          disabled={disabled}
          aria-label={ariaLabel}
          title={title}
        >
          <span className="truncate">{current?.l ?? value}</span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </Button>
      }
    >
      {options.map(option => (
        <DropdownItem
          key={option.v}
          onClick={() => { setOpen(false); onChange(option.v); }}
          icon={option.v === value ? <Check className="w-3.5 h-3.5" /> : undefined}
        >
          {option.l}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
}
