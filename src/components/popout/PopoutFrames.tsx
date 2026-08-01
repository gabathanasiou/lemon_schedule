import React from 'react';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import PopoutWindow from '../PopoutWindow';
import VersionToolbar from '../VersionToolbar';
import PageToolbar from '../PageToolbar';
import { getLabel, ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../../lib/categories';
import { Project } from '../../types';

interface PopoutFrameProps {
  win: Window;
  onClose: () => void;
  title: string;
  tabName: string;
  projectTitle: string;
  onProjectTitleChange: (v: string) => void;
  bg?: string;
  children: React.ReactNode;
}

/** Shell for top-level tab popout windows: window + version toolbar + content. */
export function PopoutFrame({ win, onClose, title, tabName, projectTitle, onProjectTitleChange, bg = 'bg-white', children }: PopoutFrameProps) {
  return (
    <PopoutWindow title={title} win={win} onClose={onClose}>
      <div className={`h-screen ${bg} flex flex-col text-[13px] overflow-hidden`}>
        <VersionToolbar projectTitle={projectTitle} onProjectTitleChange={onProjectTitleChange} tabName={tabName} onClose={onClose} />
        <div className="flex-1 min-h-0 flex flex-col">
          {children}
        </div>
      </div>
    </PopoutWindow>
  );
}

interface SubTabPopoutFrameProps {
  win: Window;
  onClose: () => void;
  title: string;
  tabName: string;
  subTabId: string;
  tabLabel: string;
  projectTitle: string;
  onProjectTitleChange: (v: string) => void;
  headerTarget: HTMLElement | null | undefined;
  setHeaderTarget: (el: HTMLElement | null) => void;
  theme?: 'light' | 'dark';
  bg?: string;
  rightContent?: React.ReactNode;
  children: React.ReactNode;
}

/** Shell for sub-tab popout windows: window + version toolbar + decorative PageToolbar with header portal. */
export function SubTabPopoutFrame({
  win, onClose, title, tabName, subTabId, tabLabel, projectTitle, onProjectTitleChange,
  headerTarget, setHeaderTarget, theme = 'light', bg = 'bg-white', rightContent, children,
}: SubTabPopoutFrameProps) {
  return (
    <PopoutWindow title={title} win={win} onClose={onClose}>
      <div className={`h-screen ${bg} flex flex-col text-[13px] overflow-hidden`}>
        <VersionToolbar projectTitle={projectTitle} onProjectTitleChange={onProjectTitleChange} tabName={tabName} onClose={onClose} />
        <PageToolbar
          theme={theme}
          tabs={[{ id: subTabId, label: tabLabel }]}
          activeTab={subTabId}
          onChange={() => {}}
          rightContent={
            <div className="flex items-center gap-2">
              {rightContent}
              <div ref={el => { if (el && headerTarget !== el) setHeaderTarget(el); }} className="flex items-center gap-2" />
            </div>
          }
        />
        <div className="flex-1 min-h-0 flex flex-col">
          {children}
        </div>
      </div>
    </PopoutWindow>
  );
}

interface ReportCategorySidebarProps {
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  keys: { key: string; isCustom: boolean }[];
  selected: string;
  onSelect: (key: string) => void;
  project: Project;
}

/** Collapsible category sidebar used by the DOOD and Element Breakdown popouts. */
export function ReportCategorySidebar({ collapsed, onToggleCollapsed, keys, selected, onSelect, project }: ReportCategorySidebarProps) {
  if (collapsed) {
    return (
      <div className="w-9 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center pt-3">
        <button onClick={() => onToggleCollapsed(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Expand sidebar">
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </div>
    );
  }
  const builtinLabels: Record<string, string> = {};
  for (const c of ELEMENT_CATEGORIES) builtinLabels[c.key] = c.label;
  return (
    <div className="w-[188px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">Categories</span>
          <button onClick={() => onToggleCollapsed(true)} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Collapse sidebar">
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-0.5">
          {keys.map(({ key, isCustom }) => {
            const Icon = isCustom
              ? getCustomIcon((project.customCategories || []).find(c => c.key === key)?.icon || 'Tag')
              : CAT_ICONS[key] || null;
            const isActive = key === selected;
            const label = isCustom
              ? (project.customCategories || []).find(c => c.key === key)?.label || key
              : getLabel(key, builtinLabels[key] || key, project.categoryLabels);
            return (
              <button
                key={key}
                onClick={() => onSelect(key)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate flex-1">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
