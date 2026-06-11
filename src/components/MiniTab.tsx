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
      <div className="flex self-start items-start gap-1 -mt-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-3 pt-2 pb-1 mb-0.5 text-xs font-semibold rounded-b-md transition-colors ${
              activeTab === tab.id ? 'bg-zinc-950 text-white' : t.inactive
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
    </div>
  );
}
