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
            selected ? 'bg-[var(--ui-item-active-bg)] text-[color:var(--ui-text-strong)]' : 'bg-[var(--ui-panel-bg)] text-[color:var(--ui-text-faint)] hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text)]'
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      );
    })}
  </div>
);