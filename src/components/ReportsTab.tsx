import React, { useState, useMemo } from 'react';
import { useProject, getElementsFromScenes } from '../store';
import { CustomCategoryDef, ReportDesign } from '../types';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../lib/categories';
import DoodsTab from './DoodsTab';
import ElementBreakdownView from './ElementBreakdownView';
import ReportDesigner from './reports/ReportDesigner';
import { PanelLeftOpen, PanelLeftClose, Printer } from 'lucide-react';
import PageToolbar from './PageToolbar';
import { PopoutPlaceholder } from './PopoutWindow';

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin: Record<string, string> = {};
  for (const c of ELEMENT_CATEGORIES) builtin[c.key] = c.label;
  if (builtin[key]) return builtin[key];
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

interface ReportsTabProps {
  subTab: 'doods' | 'elementBreakdown' | 'designer';
  onSubTabChange: (t: 'doods' | 'elementBreakdown' | 'designer') => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onPrint?: () => void;
  onReportPrint?: (design: ReportDesign) => void;
  poppedOutSubTabs: Set<string>;
  onToggleSubPopout: (id: string) => void;
  onCloseSubPopout: (id: string) => void;
  shiftHeld?: boolean;
}

export default function ReportsTab({ subTab, onSubTabChange, selectedCategory, onCategoryChange, onPrint, onReportPrint, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout, shiftHeld }: ReportsTabProps) {
  const { state } = useProject();
  const project = state.present;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

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

  const subTabLabels: Record<string, string> = {
    doods: 'Day Out of Days', elementBreakdown: 'Element Breakdown', designer: 'Reports Designer',
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageToolbar
        theme="dark"
        tabs={[
          { id: 'doods', label: 'Day Out of Days' },
          { id: 'elementBreakdown', label: 'Element Breakdown' },
          { id: 'designer', label: 'Reports Designer' },
        ]}
        activeTab={subTab}
        onChange={onSubTabChange}
        onPopout={onToggleSubPopout}
        shiftHeld={shiftHeld}
        rightContent={
          <div className="flex items-center gap-2">
            <div ref={setPortalTarget} className="flex items-center gap-2" />
            {onPrint && subTab !== 'designer' ? (
              <button
                onClick={onPrint}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            ) : undefined}
          </div>
        }
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
      ) : subTab === 'designer' ? (
        <div className="flex-1 flex overflow-hidden bg-zinc-950 min-h-0">
          <ReportDesigner headerTarget={portalTarget} onPrint={onReportPrint} />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
        {sidebarCollapsed ? (
          <div className="w-9 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center pt-3">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <aside className="w-[188px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
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
                  const sceneElems = getElementsFromScenes(project.scenes, key);
                  const merged = new Map<string, boolean>();
                  for (const e of stored) merged.set((e.id || e.name).toLowerCase(), true);
                  for (const e of sceneElems) merged.set((e.id || e.name).toLowerCase(), true);
                  count = merged.size;
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
          {subTab === 'doods' ? (
            <DoodsTab selectedCategory={selectedCategory} />
          ) : (
            <ElementBreakdownView selectedCategory={selectedCategory} />
          )}
        </div>
        </div>
      )}
    </div>
  );
}
