import React, { useState, useEffect } from 'react';

export const CellInput: React.FC<{ 
  value?: string | number, 
  onChange: (val: string) => void, 
  className?: string, 
  placeholder?: string,
  clearOnType?: boolean,
  col?: string
}> = ({ value, onChange, className = '', placeholder, clearOnType, col }) => {
  const [localVal, setLocalVal] = useState(value?.toString() || '');
  const [isPristine, setIsPristine] = useState(false);

  useEffect(() => {
    setLocalVal(value?.toString() || '');
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
    if (clearOnType) {
      setIsPristine(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(e.target.value);
    setIsPristine(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        const allInputs = Array.from(document.querySelectorAll(query)) as HTMLInputElement[];
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

  const spanClassName = className.replace(/w-full|w-\[\d+px\]|text-(left|center|right|justify)/g, '').trim();

  return (
    <div className={`relative inline-grid items-center min-w-0 ${className.includes('w-full') ? 'w-full max-w-full' : ''} ${className.includes('w-[') ? 'w-full' : ''}`} style={{ gridTemplateColumns: 'minmax(20px, 1fr)' }}>
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
        placeholder={placeholder}
        className={`col-start-1 row-start-1 bg-transparent border-transparent outline-none focus:ring-1 focus:ring-blue-500/50 rounded px-[2px] min-w-0 cell-input focus:bg-blue-50 focus:text-black ${className}`}
      />
    </div>
  );
};
