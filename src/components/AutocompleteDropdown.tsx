import React, { useMemo } from 'react';
import { PickerField, type PickerItem } from '@gabriel/ui-kit';
import { IS_COARSE, useHardwareKeyboard } from '../lib/device';
import { useKeyboardMode } from '../lib/persist';

/**
 * Single-value picker for a STRICT option list (INT/EXT, Day/Night, an enum
 * column) — a thin adapter over the kit's `PickerField` (roadmap 322).
 *
 * The field edits as a search box over the list: picking commits, Enter picks
 * the arrow-lit option, click-away commits the typed text, Escape cancels.
 * Free text is allowed (the app stores the typed value, e.g. a custom INT/EXT
 * label), but picking an option is the normal path.
 *
 * `fuzzy`, `normalize` and `showAll` are accepted for source compatibility
 * with the old implementation: the shared panel always lists the full
 * catalogue and filters as you type, and the app's options are stored
 * uppercase (the field uppercases typed text).
 */
export interface AutocompleteDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  standalone?: boolean;
  /** Legacy: the shared panel matches labels directly. */
  normalize?: (val: string) => string;
  /** Start with the dropdown open (editors that should show suggestions immediately) */
  defaultOpen?: boolean;
  /** Auto-focus the input on mount */
  autoFocus?: boolean;
  /** Legacy: the shared panel always shows the whole catalogue. */
  showAll?: boolean;
  /** Legacy: no fuzzy scoring (callers were long timezones; none remain). */
  fuzzy?: boolean;
  /** Called when the dropdown is dismissed by clicking outside or committing. Not called on Escape. */
  onExit?: () => void;
  /** Called when Escape dismisses the dropdown — hosts may exit the enclosing
   *  editor too (Glide cancels the cell edit). */
  onEscape?: () => void;
  /** Called when Tab is pressed - allows passing movement to Glide's onFinishedEditing */
  onTabExit?: () => void;
  portalTarget?: HTMLElement | null;
  /** Grow the inline editor's width with its content (`field-sizing: content`)
   *  instead of filling the cell — for spreadsheet overlay editors so long
   *  values stay visible while typing. */
  autoGrow?: boolean;
}

export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  value,
  onChange,
  options,
  className,
  readOnly,
  placeholder,
  standalone = false,
  defaultOpen = false,
  autoFocus: autoFocusProp = false,
  onExit,
  onEscape,
  onTabExit,
  portalTarget,
  autoGrow = false,
}) => {
  const [keyboardMode] = useKeyboardMode();
  const hwKeyboard = useHardwareKeyboard();
  /* Keyboard OFF on a touch device: the picker still opens, the text is not
     editable (no soft keyboard over the grid). */
  const typingBlocked = IS_COARSE && !hwKeyboard && keyboardMode === 'off';

  const items = useMemo<PickerItem[]>(
    () => options.map(option => ({ id: option, label: option })),
    [options],
  );
  const values = useMemo(() => (value.trim() ? [value.trim()] : []), [value]);

  return (
    <PickerField
      values={values}
      onChange={next => onChange(next[0] ?? '')}
      items={items}
      resolveBy="label"
      mode="single"
      appearance={standalone ? 'chip' : 'inline'}
      display="names"
      allowFreeText
      uppercase
      keepAllRows
      placeholder={placeholder}
      readOnly={readOnly}
      inputReadOnly={typingBlocked}
      defaultOpen={defaultOpen || autoFocusProp}
      className={className}
      portalTarget={portalTarget}
      autoGrow={autoGrow}
      panelMinWidth={160}
      onExit={onExit}
      onEscape={onEscape}
      onTabExit={onTabExit}
    />
  );
};
