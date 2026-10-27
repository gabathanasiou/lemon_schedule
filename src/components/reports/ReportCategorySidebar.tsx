import React, { useMemo } from 'react';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { getLabel, ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../../lib/categories';
import { getElementsFromScenes } from '../../store';
import type { Project } from '../../types';

export interface ReportCategorySidebarProps {
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  /** Visible categories, in registry order (`ELEMENT_CATEGORIES` + customs). */
  keys: { key: string; isCustom: boolean }[];
  selected: string;
  onSelect: (key: string) => void;
  project: Project;
}

/**
 * The ONE Reports category navigator — Day Out of Days and Element Breakdown,
 * in the main window AND in their popouts. A category picker, not a record
 * search: the list is short and fully visible, so it stays a plain list
 * (roadmap 318 audit — no SearchMenu here).
 *
 * Roadmap 318 also removed the duplicate copy that lived in `PopoutFrames`
 * (the two had drifted: the active row was invisible against the main
 * sidebar's own background).
 */
export function ReportCategorySidebar({ collapsed, onToggleCollapsed, keys, selected, onSelect, project }: ReportCategorySidebarProps) {
  const builtinLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) labels[c.key] = c.label;
    return labels;
  }, []);

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const { key } of keys) {
      if (key === 'cast') {
        out.set(key, project.castMembers?.length || 0);
        continue;
      }
      // Stored elements + elements only present on scenes (same union the
      // manager sidebar uses).
      const merged = new Set<string>();
      for (const e of (project.breakdownElements || {})[key] || []) merged.add((e.id || e.name).toLowerCase());
      for (const e of getElementsFromScenes(project.scenes, key)) merged.add((e.id || e.name).toLowerCase());
      out.set(key, merged.size);
    }
    return out;
  }, [keys, project]);

  if (collapsed) {
    return (
      <div className="w-9 shrink-0 bg-[var(--ui-panel-bg)] border-r border-[color:var(--ui-border)] flex flex-col items-center pt-3">
        <button onClick={() => onToggleCollapsed(false)} className="text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text)] transition-colors" title="Expand sidebar">
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-[188px] shrink-0 bg-[var(--ui-panel-bg)] border-r border-[color:var(--ui-border)] overflow-y-auto island-inset-l">
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider px-1">Categories</span>
          <button onClick={() => onToggleCollapsed(true)} className="text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text)] transition-colors" title="Collapse sidebar">
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
            const count = counts.get(key) || 0;
            return (
              <button
                key={key}
                onClick={() => onSelect(key)}
                data-report-category={key}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${isActive ? 'bg-[var(--ui-item-active-bg)] text-[color:var(--ui-text-strong)]' : 'text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text)] hover:bg-[var(--ui-card-hover)]'}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate flex-1">{label}</span>
                <span className="text-[10px] text-[color:var(--ui-text-faint)]">{count || ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export default ReportCategorySidebar;
