import React from 'react';
import { CellInput } from './CellInput';
import DurationKeypad from './DurationKeypad';
import { formatDuration, parseDuration } from '../lib/utils';
import { useTouchMode } from '../lib/useMarquee';

/**
 * Shared duration input (D19): inline `CellInput` on desktop, portal
 * `DurationKeypad` on touch. Extracted from the four hand-rolled
 * `isTouchMode ? DurationKeypad : CellInput` copies (SortableRibbon,
 * SortableRowBreak, SortableRowNote, AddBannerModal) so every duration field
 * in the app uses one recipe.
 */
export interface DurationFieldProps {
  value: number;
  onChange: (minutes: number) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  /** Override the displayed text (e.g. the raw draft). */
  display?: string;
  onExit?: () => void;
  autoFocus?: boolean;
  'data-row-id'?: string;
  'data-col'?: string;
}

export const DurationField: React.FC<DurationFieldProps> = ({
  value,
  onChange,
  readOnly,
  className = '',
  placeholder,
  display,
  onExit,
  autoFocus,
  ...rest
}) => {
  const isTouch = useTouchMode();
  const text = display ?? formatDuration(value || 0);

  if (readOnly) {
    return <span className={className}>{text || '\u00A0'}</span>;
  }

  if (isTouch) {
    return (
      <DurationKeypad
        value={value}
        onChange={onChange}
        display={display}
        onExit={onExit}
        className={className}
        autoFocus={autoFocus}
        {...rest}
      />
    );
  }

  return (
    <CellInput
      value={text}
      onChange={v => onChange(parseDuration(v))}
      className={className}
      placeholder={placeholder}
      autoFocus={autoFocus}
      noFill
      {...rest}
    />
  );
};

export default DurationField;
