import React, { useState, useEffect } from 'react';

export const CellInput: React.FC<{ 
  value?: string | number, 
  onChange: (val: string) => void, 
  className?: string, 
  placeholder?: string,
  clearOnType?: boolean,
  col?: string,
  readOnly?: boolean
}> = ({ value, onChange, className = '', placeholder, clearOnType, col, readOnly }) => {
  const [localVal, setLocalVal] = useState(value?.toString() || '');
  const [isPristine, setIsPristine] = useState(false);

  useEffect(() => {
    setLocalVal(value?.toString() || '');
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (readOnly) return;
    e.target.select();
    if (clearOnType) {
      setIsPristine(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    setLocalVal(e.target.value);
    setIsPristine(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    e.stopPropagation(); // prevent dnd-kit intercepting Space/Enter
    
    if (isPristine && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setLocalVal(e.key);
      setIsPristine(false);
      e.preventDefault();
      return;
    }
    setIsPristine(false);

    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentTarget = e.currentTarget;
      currentTarget.blur();
      setTimeout(() => {
        const query = col ? `input[data-col="${col}"]` : 'input.cell-input';
        const allInputs = Array.from(document.querySelectorAll(query)).filter(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement[];
        const currentIndex = allInputs.indexOf(currentTarget);
        if (currentIndex > -1) {
          let nextIndex = currentIndex;
          if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) nextIndex--;
          else nextIndex++;
          if (nextIndex >= 0 && nextIndex < allInputs.length) {
            allInputs[nextIndex]?.focus();
            allInputs[nextIndex]?.select();
          }
        }
      }, 0);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!readOnly) {
      e.stopPropagation(); // allow focus, prevent dragging the row when clicking input
    }
  };

  const spanClassName = className.replace(/flex-1|w-full|w-\[\d+px\]|text-(left|center|right|justify)/g, '').trim();
  const gridCol = className.includes('w-full') || className.includes('flex-1') ? 'minmax(20px, 1fr)' : 'minmax(20px, max-content)';
  
  const activeClass = readOnly 
    ? 'cursor-default pointer-events-none' 
    : 'focus:ring-1 focus:ring-blue-500/50 focus:bg-blue-50 focus:text-black hover:bg-black/5 cursor-text';

  return (
    <div className={`relative inline-grid items-center min-w-0 ${className.includes('w-full') ? 'w-full' : ''} ${className.includes('flex-1') ? 'flex-1' : ''}`} style={{ gridTemplateColumns: gridCol }}>
      <span className={`invisible col-start-1 row-start-1 whitespace-pre px-[2px] truncate ${spanClassName}`}>
         {localVal || placeholder || ' '}
      </span>
      <input
        data-col={col}
        value={localVal}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={() => {
          setIsPristine(false);
          if (localVal !== value?.toString()) {
             onChange(localVal);
          }
        }}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`col-start-1 row-start-1 bg-transparent border-transparent outline-none rounded px-[2px] min-w-0 cell-input text-ellipsis overflow-hidden whitespace-nowrap ${activeClass} ${className.replace('w-full', '').replace('flex-1', '')}`}
      />
    </div>
  );
};
