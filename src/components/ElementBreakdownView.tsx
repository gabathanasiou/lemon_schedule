import React, { useMemo } from 'react';
import { useProject } from '../store';
import { Scene, ScheduleRow, CustomCategoryDef } from '../types';
import { formatPageCount } from '../lib/utils';
import { DEFAULT_CATEGORY_LABELS, getFieldItems } from '../lib/categories';
import { useColumnResize } from '../lib/useColumnResize';
import { useDaybreakSections } from '../lib/useDaybreakSections';

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin = DEFAULT_CATEGORY_LABELS[key];
  if (builtin) return builtin;
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

function getElementValues(scene: any, category: string): string[] {
  const raw = String(scene[category] ?? '');
  return getFieldItems(category, raw);
}

interface ElementBreakdownViewProps {
  selectedCategory: string;
}

export default function ElementBreakdownView({ selectedCategory }: ElementBreakdownViewProps) {
  const { state } = useProject();
  const project = state.present;
  const { sections, sectionDateMap, sceneToSection, formatSectionDate } = useDaybreakSections();
  const castMembers = project.castMembers || [];

  const { widths, startResize, resetWidths, hasCustomWidths } = useColumnResize(
    'lemon_schedule_col_widths_eb',
    { name: 200, scenes: 250, pages: 90, days: 250 },
  );

  const elements = useMemo(() => {
    const cat = selectedCategory;
    const elMap = new Map<string, { name: string; sceneIds: string[] }>();

    for (const scene of project.scenes) {
      const vals = getElementValues(scene, cat);
      for (const v of vals) {
        const upper = v.toUpperCase();
        if (!elMap.has(upper)) elMap.set(upper, { name: v, sceneIds: [] });
        elMap.get(upper)!.sceneIds.push(scene.id);
      }
    }

    const sceneMap = new Map(project.scenes.map(s => [s.id, s]));

    return Array.from(elMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, el]) => {
        const scenes = (el.sceneIds
          .map(id => sceneMap.get(id))
          .filter((s): s is Scene => s != null))
          .sort((a, b) => {
            const na = parseInt(a.sceneNumber, 10);
            const nb = parseInt(b.sceneNumber, 10);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true });
          });

        const sceneNumbers = scenes.map(s => s.sceneNumber).join(', ');
        const totalPagesDecimal = scenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0);
        const totalPages = formatPageCount(totalPagesDecimal);

        const secIndices = new Set<number>();
        for (const s of scenes) {
          const d = sceneToSection.get(s.id);
          if (d != null) secIndices.add(d);
        }
        const sortedSections = [...secIndices].sort((a, b) => a - b);
        const daysStr = sortedSections.map(d => formatSectionDate(d)).join(', ');

        let displayName = el.name;
        if (cat === 'cast') {
          const cm = castMembers.find(c => c.id === el.name);
          displayName = cm ? `${el.name}. ${cm.name}` : el.name;
        }

        return {
          key,
          name: displayName,
          scenes: sceneNumbers,
          totalPages,
          days: daysStr,
        };
      });
  }, [selectedCategory, project.scenes, sceneToSection, castMembers, formatSectionDate]);

  const selectedLabel = getCategoryLabel(selectedCategory, project.customCategories || []);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950 text-zinc-300">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
        <span className="text-sm font-bold text-white">Element Breakdown — {selectedLabel}</span>
        {hasCustomWidths && (
          <button onClick={resetWidths} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Reset Columns</button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-[11px] table-fixed">
          <colgroup>
            <col style={{ width: widths.name }} />
            <col style={{ width: widths.scenes }} />
            <col style={{ width: widths.pages }} />
            <col style={{ width: widths.days }} />
          </colgroup>
          <thead>
            <tr className="sticky top-0 z-20">
              <th className="sticky left-0 bg-zinc-900 px-2 py-1.5 text-left text-zinc-400 font-medium border-b border-r border-zinc-800 whitespace-nowrap z-30 overflow-hidden text-ellipsis cursor-default" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>
                {selectedLabel}
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('name', e)} />
              </th>
              <th className="relative text-left px-2 py-1.5 border-b border-r border-zinc-800 font-medium text-zinc-400 cursor-default">
                Scenes
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('scenes', e)} />
              </th>
              <th className="relative text-left px-2 py-1.5 border-b border-r border-zinc-800 font-medium text-zinc-400 whitespace-nowrap cursor-default">
                Total Pages
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('pages', e)} />
              </th>
              <th className="relative text-left px-2 py-1.5 border-b border-zinc-800 font-medium text-zinc-400 cursor-default">
                Shoot Days
                <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('days', e)} />
              </th>
            </tr>
          </thead>
          <tbody>
            {elements.map(el => (
              <tr key={el.key} className="group hover:bg-zinc-800/40">
                <td className="sticky left-0 bg-zinc-950 group-hover:bg-zinc-800 px-2 py-1.5 text-white font-medium border-b border-r border-zinc-800 whitespace-nowrap z-10 overflow-hidden text-ellipsis cursor-default" style={{ boxShadow: '4px 0 6px -2px rgba(0,0,0,0.5)' }}>
                  {el.name}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('name', e)} />
                </td>
                <td className="relative px-2 py-1.5 text-zinc-400 border-b border-r border-zinc-800 cursor-default">
                  {el.scenes || '—'}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('scenes', e)} />
                </td>
                <td className="relative px-2 py-1.5 text-zinc-400 border-b border-r border-zinc-800 whitespace-nowrap cursor-default">
                  {el.totalPages} pgs
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('pages', e)} />
                </td>
                <td className="relative px-2 py-1.5 text-zinc-400 border-b border-zinc-800 cursor-default">
                  {el.days || '—'}
                  <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600/40" onPointerDown={(e) => startResize('days', e)} />
                </td>
              </tr>
            ))}
            {elements.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-zinc-600 text-sm">No elements found for {selectedLabel}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
