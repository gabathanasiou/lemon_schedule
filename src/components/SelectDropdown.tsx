import React, { useMemo } from 'react';
import { PickerField, type PickerItem } from '@gabriel/ui-kit';

/**
 * Strict single-choice picker for ribbon cells and a few form fields
 * (INT/EXT, Day/Night, a location type) — a thin adapter over the kit's
 * `PickerField` (roadmap 322), the same primitive as EntityDropdown and
 * AutocompleteDropdown.
 *
 * Clicking the cell opens the list; the arrow keys move the ONE lit row;
 * typing filters it and Enter/Tab complete the typed prefix to the first
 * match ("i" → INT). A click-away commits the typed value, Escape cancels.
 */
export interface SelectDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  standalone?: boolean;
  autoFocus?: boolean;
  onTabExit?: (el: HTMLElement) => void;
  style?: React.CSSProperties;
  /** Dark modal surface (the Location picker's type select). */
  theme?: 'light' | 'dark';
  /** Commit typed text that is not in `options`. Default true (the Location
   *  picker creates new location types); INT/EXT and D/N pass false. */
  allowFreeText?: boolean;
}

export const SelectDropdown: React.FC<SelectDropdownProps> = ({
  value,
  onChange,
  options,
  className,
  readOnly,
  placeholder,
  standalone = false,
  autoFocus = false,
  onTabExit,
  style,
  theme = 'light',
  allowFreeText = true,
}) => {
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
      allowFreeText={allowFreeText}
      uppercase
      keepAllRows
      placeholder={placeholder}
      readOnly={readOnly}
      defaultOpen={autoFocus}
      theme={theme}
      className={className}
      style={style}
      panelMinWidth={120}
      onTabExit={onTabExit}
    />
  );
};
