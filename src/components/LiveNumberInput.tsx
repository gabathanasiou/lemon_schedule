import React, { useEffect, useRef, useState } from 'react';

/**
 * Free-typed numeric input — the ONE recipe for number boxes (ribbon toolbar
 * + reports designer). The value is a draft while focused: you can clear the
 * box and type a fresh number; a clamped value commits on change, Enter/blur
 * finalizes, Escape reverts. Without this, `Number('') || fallback` snaps the
 * field back to its fallback on every keystroke, so the value can never be
 * deleted.
 */
export function LiveNumberInput({
  value,
  min,
  max,
  fallback,
  onCommit,
  readOnly,
  disabled,
  ariaLabel,
  className,
  title,
}: {
  value: number | undefined;
  min: number;
  max: number;
  fallback: number;
  onCommit: (v: number) => void;
  readOnly?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setDraft(null); }, [value]);
  const display = draft !== null ? draft : String(value ?? fallback);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      title={title}
      value={display}
      onFocus={() => { focusedRef.current = true; }}
      onChange={e => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseInt(raw, 10);
        if (raw !== '' && !Number.isNaN(n)) onCommit(clamp(n));
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (draft === null) return;
        const n = parseInt(draft, 10);
        if (Number.isNaN(n)) {
          setDraft(null);
        } else {
          onCommit(clamp(n));
          setDraft(null);
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
      }}
      readOnly={readOnly}
      disabled={disabled}
      className={className}
    />
  );
}
