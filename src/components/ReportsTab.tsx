import React, { useState, useMemo } from 'react';
import { useProject } from '../store';
import { CustomCategoryDef } from '../types';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../lib/categories';
import DoodsTab from './DoodsTab';
import ElementBreakdownView from './ElementBreakdownView';
import { PanelLeftOpen, PanelLeftClose, Printer } from 'lucide-react';

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin: Record<string, string> = {};
  for (const c of ELEMENT_CATEGORIES) builtin[c.key] = c.label;
  if (builtin[key]) return builtin[key];
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

interface ReportsTabProps {
  subTab: 'doods' | 'elementBreakdown';
  onSubTabChange: (t: 'doods' | 'elementBreakdown') => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onPrint?: () => void;
}

export default function ReportsTab({ subTab, onSubTabChange, selectedCategory, onCategoryChange, onPrint }: ReportsTabProps) {
  const { state } = useProject();
  const project = state.present;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const hiddenSet = useMemo(() => new Set(project.hiddenCategories || []), [project.hiddenCategories]);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    for (const c of ELEMENT_CATEGORIES) {
      if (!hiddenSet.has(c.key)) keys.push({ key: c.key, isCustom: false });
    }
    for (const c of project.customCategories || []) {
      if (!hiddenSet.has(c.key)) keys.push({ key: c.key, isCustom: true });
    }
    return keys;
  }, [project.customCategories, hiddenSet]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {sidebarCollapsed ? (
        <div className="w-9 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center pt-3">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <aside className="w-[188px] shrink-0 bg-zinc-950 border-r border-zinc-800 overflow-y-auto">
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">Categories</span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
            {allCategoryKeys.map(({ key, isCustom }) => {
              const Icon = isCustom
                ? getCustomIcon((project.customCategories || []).find(c => c.key === key)?.icon || 'Tag')
                : CAT_ICONS[key] || null;
              const isActive = key === selectedCategory;
              const label = isCustom
                ? (project.customCategories || []).find(c => c.key === key)?.label || key
                : getLabel(key, getCategoryLabel(key, project.customCategories || []), project.categoryLabels);

              let count = 0;
              if (key === 'cast') {
                count = project.castMembers?.length || 0;
              } else {
                const stored = (project.breakdownElements || {})[key] || [];
                count = stored.length;
              }

              return (
                <button
                  key={key}
                  onClick={() => onCategoryChange(key)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${isActive ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'}`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate flex-1">{label}</span>
                  <span className="text-[10px] text-zinc-600">{count || ''}</span>
                </button>
              );
            })}
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 shrink-0 bg-zinc-950">
          <button
            onClick={() => onSubTabChange('doods')}
            className={`px-3 py-1 rounded-sm text-xs font-semibold ${subTab === 'doods' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
          >
            Day Out of Days
          </button>
          <button
            onClick={() => onSubTabChange('elementBreakdown')}
            className={`px-3 py-1 rounded-sm text-xs font-semibold ${subTab === 'elementBreakdown' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
          >
            Element Breakdown
          </button>
          <div className="flex-1" />
          {onPrint && (
            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          )}
        </div>

        {subTab === 'doods' ? (
          <DoodsTab selectedCategory={selectedCategory} />
        ) : (
          <ElementBreakdownView selectedCategory={selectedCategory} />
        )}
      </div>
    </div>
  );
}
