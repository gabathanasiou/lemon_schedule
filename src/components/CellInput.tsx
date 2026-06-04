import React, { useState, useEffect, useRef } from 'react';

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
  multiline?: boolean
}> = ({ value, onChange, className = '', placeholder, clearOnType, col, readOnly, onBlur, autoFocus, multiline }) => {
  const inputRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [localVal, setLocalVal] = useState(value?.toString() || '');
  const [isPristine, setIsPristine] = useState(false);

  useEffect(() => {
    setLocalVal(value?.toString() || '');
  }, [value]);

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

    if (e.key === 'Enter') {
      if (multiline && e.shiftKey) return;
      e.preventDefault();
      const currentTarget = e.currentTarget;
      currentTarget.blur();
      if (multiline) return;
      setTimeout(() => {
        const query = col ? `input[data-col="${col}"], textarea[data-col="${col}"]` : 'input.cell-input, textarea.cell-input';
        const allInputs = Array.from(document.querySelectorAll(query)).filter(el => !(el as HTMLInputElement).readOnly) as (HTMLInputElement | HTMLTextAreaElement)[];
        const currentIndex = allInputs.indexOf(currentTarget);
        if (currentIndex > -1) {
          let nextIndex = currentIndex;
          if (e.key === 'Enter' && e.shiftKey) nextIndex--;
          else nextIndex++;
          if (nextIndex >= 0 && nextIndex < allInputs.length) {
            allInputs[nextIndex]?.focus();
            allInputs[nextIndex]?.select();
          }
        }
      }, 0);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
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
          }
        }
      }, 0);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!readOnly) {
      e.stopPropagation();
    }
  };

  const spanClassName = className.replace(/flex-1|w-full|w-\[\d+px\]|text-(left|center|right|justify)|truncate/g, '').trim();
  const gridCol = className.includes('w-full') || className.includes('flex-1') ? 'minmax(20px, 1fr)' : 'minmax(20px, max-content)';
  
  const activeClass = readOnly 
    ? 'cursor-default pointer-events-none' 
    : 'focus:ring-1 focus:ring-blue-500/50 cursor-text';

  const inputClass = `col-start-1 row-start-1 bg-transparent border-transparent outline-none rounded px-[2px] min-w-0 cell-input ${activeClass} ${className.replace('w-full', '').replace('flex-1', '')}`;

  return (
    <div className={`relative inline-grid items-center min-w-0 ${className.includes('w-full') ? 'w-full' : ''} ${className.includes('flex-1') ? 'flex-1' : ''}`} style={{ gridTemplateColumns: gridCol }}>
      <span className={`invisible col-start-1 row-start-1 whitespace-${multiline ? 'pre-wrap' : 'pre'} px-[2px] ${multiline ? '' : 'truncate'} pointer-events-none ${spanClassName}`}>
         {localVal || placeholder || ' '}
      </span>
      {multiline ? (
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
            onBlur?.();
          }}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          readOnly={readOnly}
          placeholder={placeholder}
          rows={1}
          className={`${inputClass} resize-none overflow-hidden whitespace-pre-wrap`}
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
            onBlur?.();
          }}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          readOnly={readOnly}
          placeholder={placeholder}
          className={`${inputClass} text-ellipsis overflow-hidden whitespace-nowrap`}
        />
      )}
    </div>
  );
};
