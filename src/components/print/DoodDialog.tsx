import React, { useState, useMemo, useEffect } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject } from '../../store';
import { getElementsFromScenes } from '../../store';
import { Printer, ChevronDown, Check } from 'lucide-react';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../../lib/categories';

export interface DoodOptions {
  castIds: string[];
  elementIds?: string[];
  selectedCategory?: string;
  dayInts: number[];
  includeNonShooting: boolean;
  showTotals: boolean;
}

interface DoodDialogProps {
  selectedCategory?: string;
  onPrint: (opts: DoodOptions) => void;
  onClose: () => void;
}

function formatDayDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function useDoodDialogData() {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const dayEntries = useMemo(() =>
    (Object.entries(activeVersion?.dayMeta || {}) as [string, { date?: string; unitCall?: string }][])
      .map(([k, v]) => ({ dayInt: Number(k), date: v.date ?? '', unitCall: v.unitCall ?? '08:00' }))
      .sort((a, b) => (a.date).localeCompare(b.date))
      .map((d, i) => ({ ...d, chrono: i + 1 })),
  [activeVersion]);

  const allCastIds = useMemo(() => {
    const ids = new Set<string>();
    for (const scene of project.scenes) {
      for (const id of scene.cast.split(',').map(c => c.trim()).filter(Boolean)) {
        ids.add(id);
      }
    }
    for (const m of project.castMembers || []) ids.add(m.id);
    return [...ids].sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
  }, [project.scenes, project.castMembers]);

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    for (const c of ELEMENT_CATEGORIES) keys.push({ key: c.key, isCustom: false });
    for (const c of project.customCategories || []) keys.push({ key: c.key, isCustom: true });
    return keys;
  }, [project.customCategories]);

  return { project, dayEntries, allCastIds, categoryLabelLookup, allCategoryKeys };
}

export default function DoodDialog({ selectedCategory: initialCategory, onPrint, onClose }: DoodDialogProps) {
  const { project, dayEntries, allCastIds, categoryLabelLookup, allCategoryKeys } = useDoodDialogData();
  const castMembers = project.castMembers || [];

  const [category, setCategory] = useState(initialCategory || 'cast');
  const [showCategories, setShowCategories] = useState(false);

  const isCast = category === 'cast';

  const elementItems: { id: string; name: string }[] = useMemo(() => {
    if (isCast) {
      return allCastIds.map(id => ({
        id,
        name: castMembers.find(m => m.id === id)?.name || '—',
      }));
    }
    const stored: { id: string; name: string }[] = (project.breakdownElements || {})[category] || [];
    const sceneElems = getElementsFromScenes(project.scenes, category);
    const merged = new Map<string, string>();
    for (const e of stored) {
      const key = (e.id || e.name).toLowerCase();
      if (!merged.has(key)) merged.set(key, e.name);
    }
    for (const e of sceneElems) {
      const key = (e.id || e.name).toLowerCase();
      if (!merged.has(key)) merged.set(key, e.name);
    }
    return Array.from(merged.entries()).map(([id, name]) => ({ id, name }));
  }, [isCast, allCastIds, castMembers, project.breakdownElements, project.scenes, category]);

  const allElementIds: string[] = useMemo(() => {
    if (isCast) return allCastIds;
    return elementItems.map(e => e.id);
  }, [isCast, allCastIds, elementItems]);

  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set(allElementIds));
  const [selectedDayInts, setSelectedDayInts] = useState<Set<number>>(new Set(dayEntries.map(d => d.dayInt)));
  const [includeNonShooting, setIncludeNonShooting] = useState(true);
  const [showTotals, setShowTotals] = useState(true);

  useEffect(() => {
    setSelectedElementIds(new Set(allElementIds));
  }, [category]);

  const categoryLabel = categoryLabelLookup[category] || category;

  const toggleElement = (id: string) => {
    setSelectedElementIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllElements = () => {
    if (selectedElementIds.size === elementItems.length) {
      setSelectedElementIds(new Set());
    } else {
      setSelectedElementIds(new Set(elementItems.map(e => e.id)));
    }
  };

  const toggleDayInt = (d: number) => {
    setSelectedDayInts(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const toggleAllDays = () => {
    if (selectedDayInts.size === dayEntries.length) {
      setSelectedDayInts(new Set());
    } else {
      setSelectedDayInts(new Set(dayEntries.map(d => d.dayInt)));
    }
  };

  const handlePrint = () => {
    const opts: DoodOptions = {
      castIds: isCast ? [...selectedElementIds] : [],
      elementIds: !isCast ? [...selectedElementIds] : undefined,
      selectedCategory: isCast ? undefined : category,
      dayInts: [...selectedDayInts].sort((a, b) => a - b),
      includeNonShooting,
      showTotals,
    };
    onPrint(opts);
  };

  const canPrint = selectedElementIds.size > 0 && selectedDayInts.size > 0;

  return (
    <Modal open onClose={onClose} title={`Day Out of Days — ${categoryLabel}`} icon={<Printer className="w-4 h-4" />} width="max-w-5xl"
      footer={
        <ModalFooter>
          <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handlePrint}
            disabled={!canPrint}
            className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider border-b border-zinc-800 pb-1.5 mb-3 block">
            Category
          </label>
          <RadixDropdownMenu.Root open={showCategories} onOpenChange={(o) => setShowCategories(o)} modal={true}>
            <RadixDropdownMenu.Trigger asChild>
              <button
                className="w-full flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors"
              >
                <span>{categoryLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            </RadixDropdownMenu.Trigger>
            <RadixDropdownMenu.Portal>
              <RadixDropdownMenu.Content
                className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 max-h-64 overflow-y-auto min-w-0 scrollbar-custom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
              >
                {allCategoryKeys.map(({ key, isCustom }) => {
                  const Icon = isCustom
                    ? getCustomIcon(project.customCategories?.find(c => c.key === key)?.icon || 'Tag')
                    : CAT_ICONS[key] || null;
                  const active = key === category;
                  return (
                    <RadixDropdownMenu.Item
                      key={key}
                      onSelect={() => setCategory(key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors outline-none cursor-pointer select-none ${
                        active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:bg-zinc-800 focus-visible:text-white'
                      }`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                      <span className="flex-1">{categoryLabelLookup[key] || key}</span>
                      {active && <Check className="w-3 h-3 shrink-0" />}
                    </RadixDropdownMenu.Item>
                  );
                })}
              </RadixDropdownMenu.Content>
            </RadixDropdownMenu.Portal>
          </RadixDropdownMenu.Root>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
              <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider">
                {isCast ? 'Cast Members' : 'Elements'}
              </label>
              <button onClick={toggleAllElements} className="text-[10px] text-zinc-400 hover:text-zinc-200 font-medium">
                {selectedElementIds.size === elementItems.length && elementItems.length > 0 ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="bg-zinc-950 border border-zinc-700 rounded-md overflow-y-auto max-h-80 scrollbar-custom">
              {elementItems.map(item => {
                const selected = selectedElementIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleElement(item.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${selected ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'}`}
                  >
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${selected ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-600'}`}>
                      {selected && <Check className="w-3 h-3 text-zinc-200" />}
                    </span>
                    {isCast ? (
                      <>
                        <span className="text-zinc-500 shrink-0">{item.id}.</span>
                        <span className="truncate">{item.name !== '—' ? item.name : '—'}</span>
                      </>
                    ) : (
                      <span className="truncate">{item.name}</span>
                    )}
                  </button>
                );
              })}
              {elementItems.length === 0 && (
                <div className="px-3 py-4 text-xs text-zinc-600 text-center">No elements</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
              <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider">
                Days to Include
              </label>
              <button onClick={toggleAllDays} className="text-[10px] text-zinc-400 hover:text-zinc-200 font-medium">
                {selectedDayInts.size === dayEntries.length && dayEntries.length > 0 ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="bg-zinc-950 border border-zinc-700 rounded-md overflow-y-auto max-h-80 scrollbar-custom">
              {dayEntries.map(d => {
                const checked = selectedDayInts.has(d.dayInt);
                return (
                  <button
                    key={d.dayInt}
                    onClick={() => toggleDayInt(d.dayInt)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${checked ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'}`}
                  >
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${checked ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-600'}`}>
                      {checked && <Check className="w-3 h-3 text-zinc-200" />}
                    </span>
                    <span className="font-medium">Day {d.chrono}</span>
                    {d.date && <span className="text-zinc-500 ml-auto">{formatDayDateLong(d.date)}</span>}
                  </button>
                );
              })}
              {dayEntries.length === 0 && (
                <div className="px-3 py-4 text-xs text-zinc-600 text-center">No days scheduled</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5">Options</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeNonShooting}
              onChange={e => setIncludeNonShooting(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-white focus:ring-0 focus:outline-none"
            />
            <span className="text-xs text-zinc-300">Include non-shooting days (grey columns)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showTotals}
              onChange={e => setShowTotals(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-white focus:ring-0 focus:outline-none"
            />
            <span className="text-xs text-zinc-300">Show totals columns</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}
