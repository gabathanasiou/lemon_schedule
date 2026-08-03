import React, { useState, useEffect, useRef } from 'react';
import { advanceRibbonFocus } from '../lib/ribbonEditNav';

export const CellInput: React.FC<{ 
  value?: string | number, 
  onChange: (val: string) => void, 
  className?: string, 
  placeholder?: string,
  clearOnType?: boolean,
  col?: string,
  readOnly?: boolean,
  onBlur?: () => void,
  autoFocus?: boolean,
  multiline?: boolean,
  navigateOnEnter?: boolean,
  onRowNavigate?: (rowId: string) => void,
  suffix?: string,
  prefix?: string,
  noTruncate?: boolean,
}> = ({ value, onChange, className = '', placeholder, clearOnType, col, readOnly, onBlur, autoFocus, multiline, navigateOnEnter = true, onRowNavigate, suffix, prefix, noTruncate }) => {
  const inputRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const rawValue = value?.toString() || '';
  const [localVal, setLocalVal] = useState(rawValue);
  const [isPristine, setIsPristine] = useState(false);
  const [syncKey, setSyncKey] = useState(0);

  useEffect(() => {
    setLocalVal(rawValue);
  }, [value, syncKey]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (multiline && inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [localVal, multiline]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (readOnly) return;
    e.target.select();
    if (clearOnType) {
      setIsPristine(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (readOnly) return;
    setLocalVal(e.target.value);
    setIsPristine(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (readOnly) return;
    e.stopPropagation();
    
    if (!multiline && isPristine && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setLocalVal(e.key);
      setIsPristine(false);
      e.preventDefault();
      return;
    }
    setIsPristine(false);

    if (e.key === 'Tab' && !e.shiftKey && onRowNavigate && e.currentTarget.closest('[data-edit-mode="1"]')) {
      e.preventDefault();
      advanceRibbonFocus(e.currentTarget, onRowNavigate);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }

    if (e.key === 'Enter') {
      if (multiline && e.shiftKey) return;
      e.preventDefault();
      const currentTarget = e.currentTarget;
      currentTarget.blur();
      if (!e.shiftKey) return;
      setTimeout(() => {
        const query = col ? `input[data-col="${col}"], textarea[data-col="${col}"]` : 'input.cell-input, textarea.cell-input';
        const allInputs = Array.from(document.querySelectorAll(query)).filter(el => !(el as HTMLInputElement).readOnly) as (HTMLInputElement | HTMLTextAreaElement)[];
        const currentIndex = allInputs.indexOf(currentTarget);
        if (currentIndex > -1) {
          const nextIndex = currentIndex + 1;
          if (nextIndex < allInputs.length) {
            allInputs[nextIndex]?.focus();
            allInputs[nextIndex]?.select();
            const rowEl = allInputs[nextIndex]?.closest('[data-row-id]');
            if (rowEl) onRowNavigate?.(rowEl.getAttribute('data-row-id')!);
          }
        }
      }, 0);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const currentTarget = e.currentTarget;
      currentTarget.blur();
      setTimeout(() => {
        const query = col ? `input[data-col="${col}"], textarea[data-col="${col}"]` : 'input.cell-input, textarea.cell-input';
        const allInputs = Array.from(document.querySelectorAll(query)).filter(el => !(el as HTMLInputElement).readOnly) as (HTMLInputElement | HTMLTextAreaElement)[];
        const currentIndex = allInputs.indexOf(currentTarget);
        if (currentIndex > -1) {
          let nextIndex = currentIndex;
          if (e.key === 'ArrowUp') nextIndex--;
          else nextIndex++;
          if (nextIndex >= 0 && nextIndex < allInputs.length) {
            allInputs[nextIndex]?.focus();
            allInputs[nextIndex]?.select();
            const rowEl = allInputs[nextIndex]?.closest('[data-row-id]');
            if (rowEl) {
              onRowNavigate?.(rowEl.getAttribute('data-row-id')!);
            }
          }
        }
      }, 0);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!readOnly) {
      e.stopPropagation();
      if (clearOnType && inputRef.current && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current.focus();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!readOnly && clearOnType && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.select();
    }
  };

  const spanClassName = className.replace(/flex-1|w-full|w-\[\d+px\]|text-(left|center|right|justify)|truncate/g, '').trim();
  const gridCol = className.includes('w-full') || className.includes('flex-1') ? 'minmax(20px, 1fr)' : 'minmax(20px, max-content)';
  
  const activeClass = readOnly 
    ? 'cursor-default pointer-events-none' 
    : 'cursor-text hover:bg-black/[0.09] focus:bg-black/[0.09]';

  const inputClass = `col-start-1 row-start-1 bg-transparent border-transparent outline-none rounded min-w-0 cell-input ${activeClass} ${className.replace('w-full', '').replace('flex-1', '')}`;

  const affixClass = `shrink-0 whitespace-nowrap ${spanClassName}`;

  return (
    <div className="flex items-center min-w-0 w-full">
      {prefix && <span className={affixClass}>{prefix}{localVal ? '\u00A0' : ''}</span>}
      <div className="relative grid items-center min-w-0 flex-1" style={{ gridTemplateColumns: gridCol }}>
        {readOnly ? (
          <span className={`col-start-1 row-start-1 ${multiline ? '' : 'truncate'} ${className}`}>
            {rawValue ? `${rawValue}${suffix ? `\u00A0${suffix}` : ''}` : placeholder}
          </span>
        ) : multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            data-col={col}
            value={localVal}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={() => {
              setIsPristine(false);
              if (localVal !== value?.toString()) {
                 onChange(localVal);
              }
              setSyncKey(k => k + 1);
              onBlur?.();
            }}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            readOnly={readOnly}
            rows={1}
            className={`${inputClass} resize-none overflow-hidden whitespace-pre-wrap selection:bg-black/15`}
            style={{ color: 'transparent', caretColor: '#2563eb' }}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            data-col={col}
            value={localVal}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={() => {
              setIsPristine(false);
              if (localVal !== value?.toString()) {
                 onChange(localVal);
              }
              setSyncKey(k => k + 1);
              onBlur?.();
            }}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            readOnly={readOnly}
            className={`${inputClass} ${noTruncate ? 'overflow-visible' : 'text-ellipsis overflow-hidden whitespace-nowrap'} col-start-1 row-start-1 h-[1lh] selection:bg-black/15`}
            style={{ color: 'transparent', caretColor: '#2563eb' }}
          />
        )}
        {!readOnly && (
          <span className={`col-start-1 row-start-1 whitespace-${multiline ? 'pre-wrap' : 'pre'} ${multiline ? '' : 'truncate'} pointer-events-none ${localVal ? '' : 'italic opacity-50'} ${spanClassName}`}>
            {localVal ? `${localVal}${suffix ? `\u00A0${suffix}` : ''}` : (placeholder || ' ')}
          </span>
        )}
      </div>
    </div>
  );
};
