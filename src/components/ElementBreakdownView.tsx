import React, { useMemo } from 'react';
import { useProject } from '../store';
import { Scene, ScheduleRow, ShootDayMeta, CustomCategoryDef } from '../types';
import { formatPageCount } from '../lib/utils';
import { DEFAULT_CATEGORY_LABELS } from '../lib/categories';

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin = DEFAULT_CATEGORY_LABELS[key];
  if (builtin) return builtin;
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

function getElementValues(scene: any, category: string): string[] {
  if (category === 'cast') {
    if (!scene.cast) return [];
    return scene.cast.split(',').map((x: string) => x.trim()).filter(Boolean);
  }
  if (category === 'set') {
    if (!scene.set) return [];
    return [scene.set.trim()];
  }
  const raw = String(scene[category] ?? '');
  return raw.split(',').map((x: string) => x.trim()).filter(Boolean);
}

interface ElementBreakdownViewProps {
  selectedCategory: string;
}

export default function ElementBreakdownView({ selectedCategory }: ElementBreakdownViewProps) {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const rows = activeVersion?.rows || [];
  const dayMeta = (activeVersion?.dayMeta || {}) as Record<number, ShootDayMeta>;
  const castMembers = project.castMembers || [];

  const sceneToDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.type === 'SCENE' && r.sceneId) m.set(r.sceneId, r.shootDay);
    }
    return m;
  }, [rows]);

  const dayToDate = useMemo(() => {
    const m = new Map<number, string>();
    for (const [k, v] of Object.entries(dayMeta)) {
      const dayNum = parseInt(k);
      if (v.date) m.set(dayNum, v.date);
    }
    return m;
  }, [dayMeta]);

  const formatDayDate = (dayNum: number): string => {
    const d = dayToDate.get(dayNum);
    if (!d) return `Day ${dayNum}`;
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return `Day ${dayNum}`;
    return `Day ${dayNum} (${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
  };

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

        const shootDays = new Set<number>();
        for (const s of scenes) {
          const d = sceneToDay.get(s.id);
          if (d != null) shootDays.add(d);
        }
        const sortedDays = [...shootDays].sort((a, b) => a - b);
        const shootDaysStr = sortedDays.map(d => formatDayDate(d)).join(', ');

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
          shootDays: shootDaysStr,
        };
      });
  }, [selectedCategory, project.scenes, sceneToDay, castMembers]);

  const selectedLabel = getCategoryLabel(selectedCategory, project.customCategories || []);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
        <span className="text-sm font-bold text-white">Element Breakdown — {selectedLabel}</span>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead>
            <tr className="sticky top-0 bg-zinc-900 z-10">
              <th className="text-left px-4 py-2 border-b border-zinc-800 font-semibold text-zinc-400 whitespace-nowrap">{selectedLabel}</th>
              <th className="text-left px-4 py-2 border-b border-zinc-800 font-semibold text-zinc-400 max-w-[240px]">Scenes</th>
              <th className="text-right px-4 py-2 border-b border-zinc-800 font-semibold text-zinc-400 whitespace-nowrap">Total Pages</th>
              <th className="text-left px-4 py-2 border-b border-zinc-800 font-semibold text-zinc-400 max-w-[300px]">Shoot Days</th>
            </tr>
          </thead>
          <tbody>
            {elements.map(el => (
              <tr key={el.key} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                <td className="px-4 py-2 text-zinc-200 font-medium whitespace-nowrap">{el.name}</td>
                <td className="px-4 py-2 text-zinc-500 max-w-[240px] align-top break-words">{el.scenes || '—'}</td>
                <td className="px-4 py-2 text-zinc-500 text-right whitespace-nowrap align-top">{el.totalPages} pgs</td>
                <td className="px-4 py-2 text-zinc-500 max-w-[300px] align-top break-words">{el.shootDays || '—'}</td>
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
