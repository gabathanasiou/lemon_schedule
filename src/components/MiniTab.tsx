import React from 'react';

interface MiniTabItem {
  id: string;
  label: string;
}

interface MiniTabProps {
  tabs: MiniTabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  rightContent?: React.ReactNode;
  theme?: 'light' | 'dark';
}

const THEME = {
  light: {
    bar: 'bg-white border-zinc-200',
    inactive: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200',
  },
  dark: {
    bar: 'bg-zinc-900 border-zinc-800',
    inactive: 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700',
  },
} as const;

export default function MiniTab({ tabs, activeTab, onChange, rightContent, theme = 'light' }: MiniTabProps) {
  const t = THEME[theme];

  return (
    <div className={`flex items-center justify-between px-3 pt-2 pb-2 border-b shrink-0 ${t.bar}`}>
      <div className="flex items-center gap-1">
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative px-3 py-1.5 text-xs font-semibold rounded-b-md transition-colors ${
                active ? 'text-white' : t.inactive
              }`}
            >
              <span className={`absolute -top-2 left-0 right-0 bottom-0 bg-zinc-950 rounded-b-md pointer-events-none transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>
      {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
    </div>
  );
}
