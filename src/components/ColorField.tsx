import React, { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

interface ColorFieldProps {
  value: string;
  onChange: (v: string) => void;
  size?: 'sm' | 'lg';
  hexVariant?: 'sm' | 'lg';
  swatchClass?: string;
  className?: string;
  defaultValue?: string;
}

function normalizeHex(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#/, '');
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleaned)) return null;
  const hex = cleaned.length === 3
    ? cleaned.split('').map(c => c + c).join('')
    : cleaned;
  return `#${hex.toUpperCase()}`;
}

export default function ColorField({
  value,
  onChange,
  size = 'sm',
  hexVariant = 'lg',
  swatchClass = '',
  className = '',
  defaultValue,
}: ColorFieldProps) {
  const [hexText, setHexText] = useState(value);
  useEffect(() => { setHexText(value); }, [value]);

  const handleHexChange = (raw: string) => {
    setHexText(raw);
  };

  const handleHexBlur = () => {
    const normalized = normalizeHex(hexText);
    if (normalized) {
      setHexText(normalized);
      onChange(normalized);
    } else {
      setHexText(value);
    }
  };

  const swatchBase = 'rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0 appearance-none [&::-webkit-color-swatch-wrapper]:p-[3px] [&::-webkit-color-swatch]:border-none';
  const swatchSizeClass = size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
  const hexClass = hexVariant === 'sm'
    ? 'w-[4.5rem] text-[10px] px-1.5 py-1'
    : 'w-[5.5rem] text-xs px-2 py-1.5';
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${swatchBase} ${swatchSizeClass} ${swatchClass}`}
      />
      <input
        type="text"
        value={hexText}
        onChange={e => handleHexChange(e.target.value)}
        onBlur={handleHexBlur}
        onFocus={e => e.target.select()}
        onMouseUp={e => e.preventDefault()}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="#000000"
        spellCheck={false}
        className={`${hexClass} text-zinc-200 bg-zinc-950 border border-zinc-700 rounded-md outline-none focus:border-zinc-500 placeholder:text-zinc-600 transition-colors`}
      />
      {defaultValue && (
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          title="Reset to Colors tab default"
          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
