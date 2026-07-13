import React, { useState, useMemo, useRef } from 'react';
import { useProject, getElementsFromScenes } from '../store';
import { CustomCategoryDef } from '../types';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../lib/categories';
import DoodsTab from './DoodsTab';
import ElementBreakdownView from './ElementBreakdownView';
import { PanelLeftOpen, PanelLeftClose, Printer } from 'lucide-react';
import MiniTab from './MiniTab';
import PopoutWindow, { PopoutPlaceholder } from './PopoutWindow';
import VersionToolbar from './VersionToolbar';

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin: Record<string, string> = {};
  for (const c of ELEMENT_CATEGORIES) builtin[c.key] = c.label;
  if (builtin[key]) return builtin[key];
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

const SUB_TABS = [
  { id: 'doods', label: 'Day Out of Days' },
  { id: 'elementBreakdown', label: 'Element Breakdown' },
] as const;

interface ReportsTabProps {
  subTab: 'doods' | 'elementBreakdown';
  onSubTabChange: (t: 'doods' | 'elementBreakdown') => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onPrint?: () => void;
}

export default function ReportsTab({ subTab, onSubTabChange, selectedCategory, onCategoryChange, onPrint }: ReportsTabProps) {
  const { state, renameProject, currentProjectId, projectList } = useProject();
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

  const [poppedOutSubTabs, setPoppedOutSubTabs] = useState<Set<string>>(new Set());
  const popoutSubWindowsRef = useRef<Map<string, Window>>(new Map());

  const toggleSubPopout = (subTabId: string) => {
    setPoppedOutSubTabs(prev => {
      const next = new Set(prev);
      if (next.has(subTabId)) {
        next.delete(subTabId);
        const w = popoutSubWindowsRef.current.get(subTabId);
        if (w && !w.closed) w.close();
        popoutSubWindowsRef.current.delete(subTabId);
      } else {
        const left = Math.round((screen.width - 1200) / 2);
        const top = Math.round((screen.height - 800) / 2);
        const w = window.open('', `popout_sub_${subTabId}`, `width=1200,height=800,left=${left},top=${top}`);
        if (!w) return prev;
        popoutSubWindowsRef.current.set(subTabId, w);
        next.add(subTabId);
        if (subTabId === subTab) {
          const nextTab = SUB_TABS.find(t => t.id !== subTabId && !next.has(t.id));
          if (nextTab) onSubTabChange(nextTab.id as 'doods' | 'elementBreakdown');
        }
      }
      return next;
    });
  };

  const closeSubPopout = (subTabId: string) => {
    setPoppedOutSubTabs(prev => {
      const next = new Set(prev);
      next.delete(subTabId);
      return next;
    });
    popoutSubWindowsRef.current.delete(subTabId);
  };

  const subTabLabels: Record<string, string> = {
    doods: 'Day Out of Days', elementBreakdown: 'Element Breakdown',
  };

  const renameHandler = (v: string) => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {poppedOutSubTabs.has('doods') && popoutSubWindowsRef.current.get('doods') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Day Out of Days`} win={popoutSubWindowsRef.current.get('doods')!} onClose={() => closeSubPopout('doods')}>
          <div className="h-screen bg-zinc-900 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={renameHandler} tabName="Day Out of Days" onClose={() => closeSubPopout('doods')} />
            <div className="flex-1 min-h-0 flex">
              <DoodsTab selectedCategory={selectedCategory} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.has('elementBreakdown') && popoutSubWindowsRef.current.get('elementBreakdown') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Element Breakdown`} win={popoutSubWindowsRef.current.get('elementBreakdown')!} onClose={() => closeSubPopout('elementBreakdown')}>
          <div className="h-screen bg-zinc-900 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={renameHandler} tabName="Element Breakdown" onClose={() => closeSubPopout('elementBreakdown')} />
            <div className="flex-1 min-h-0 flex">
              <ElementBreakdownView selectedCategory={selectedCategory} />
            </div>
          </div>
        </PopoutWindow>
      )}

      <MiniTab
        theme="dark"
        tabs={SUB_TABS.map(t => ({ id: t.id, label: t.label }))}
        activeTab={subTab}
        onChange={onSubTabChange}
        onPopout={toggleSubPopout}
        rightContent={
          onPrint ? (
            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          ) : undefined
        }
      />

      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => closeSubPopout(subTab)} />
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
