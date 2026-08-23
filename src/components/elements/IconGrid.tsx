import React from 'react';
import { CUSTOM_ICON_OPTIONS } from '../../lib/categories';

/** 4-col icon picker grid — shared by custom categories and day types. */
export const IconGrid: React.FC<{ value: string; onChange: (name: string) => void }> = ({ value, onChange }) => (
  <div className="mt-1 grid grid-cols-4 gap-1.5">
    {CUSTOM_ICON_OPTIONS.map(opt => {
      const Icon = opt.Icon;
      const selected = value === opt.name;
      return (
        <button
          key={opt.name}
          type="button"
          onClick={() => onChange(opt.name)}
          className={`p-2 rounded-md transition-colors flex items-center justify-center ${
            selected ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      );
    })}
  </div>
);