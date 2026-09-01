import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useProject } from '../../store';
import { getElementsFromScenes } from '../../store';
import { useDaybreakSections } from '../../lib/useDaybreakSections';
import { DD_CHIP_TRIGGER_CLASS } from '../../lib/dropdown';
import { Printer, ChevronDown, Check } from 'lucide-react';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Checkbox from '../Checkbox';
import Checklist from '../Checklist';
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
  const { sections, sectionDateMap } = useDaybreakSections();

  const dayEntries = useMemo(() => {
    return sections
      .filter(s => !s.daybreakRow?.pinned)
      .map((s, i) => ({
        dayInt: s.index,
        date: sectionDateMap.get(s.index) || '',
        unitCall: '08:00',
        chrono: i + 1,
      }));
  }, [sections, sectionDateMap]);

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

  const storageKey = `lemon_schedule_dood_${project.id}`;
  const defaultSettings = { category: initialCategory || 'cast', includeNonShooting: true, showTotals: true };

  const [settings, setSettings] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return { ...defaultSettings, ...stored, category: initialCategory || stored.category || 'cast' };
    } catch { return defaultSettings; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
  }, [storageKey, settings]);

  const update = (patch: Partial<typeof defaultSettings>) => setSettings(s => ({ ...s, ...patch }));
  const resetSettings = useCallback(() => {
    setSettings({ category: initialCategory || 'cast', includeNonShooting: true, showTotals: true });
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey, initialCategory]);

  const category = settings.category;
  const setCategory = (c: string) => update({ category: c });
  const includeNonShooting = settings.includeNonShooting;
  const showTotals = settings.showTotals;
  const [showCategories, setShowCategories] = useState(false);
  const catContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCategories) return;
    const raf = requestAnimationFrame(() => {
      catContentRef.current?.querySelector(`[data-cat="${category}"]`)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [showCategories, category]);

  const isCast = category === 'cast';

  const elementItems: { id: string; name: string }[] = useMemo(() => {
    if (isCast) {
      return allCastIds.map(id => ({
        id,
        name: castMembers.find(m => m.id === id)?.name || '?',
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

  useEffect(() => {
    setSelectedElementIds(new Set(allElementIds));
  }, [category]);

  const categoryLabel = categoryLabelLookup[category] || category;
  const activeIndex = allCategoryKeys.findIndex(k => k.key === category);

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
    <Modal open onClose={onClose} onReset={resetSettings} title={`Day Out of Days - ${categoryLabel}`} icon={<Printer className="w-4 h-4" />} width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={handlePrint} disabled={!canPrint}>
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider border-b border-zinc-800 pb-1.5 mb-3 block">
            Category
          </label>
          <DropdownMenu
            open={showCategories}
            onOpenChange={setShowCategories}
            theme="dark"
            align="left"
            width="min-w-[180px]!"
            initialHighlightIndex={activeIndex >= 0 ? activeIndex : undefined}
            contentClassName="z-[10001] max-h-64! scrollbar-custom"
            trigger={
              <button
                type="button"
                className={`${DD_CHIP_TRIGGER_CLASS} text-xs w-full justify-between cursor-pointer px-3 py-2`}
              >
                <span>{categoryLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            }
          >
            <div ref={catContentRef} className="flex flex-col">
              {allCategoryKeys.map(({ key, isCustom }) => {
                const Icon = isCustom
                  ? getCustomIcon(project.customCategories?.find(c => c.key === key)?.icon || 'Tag')
                  : CAT_ICONS[key] || null;
                const active = key === category;
                return (
                  <div key={key} data-cat={key}>
                    <DropdownItem
                      onClick={() => setCategory(key)}
                      className={active ? 'bg-zinc-800 text-white' : ''}
                      icon={Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                      trailing={active ? <Check className="w-3 h-3 shrink-0" /> : undefined}
                    >
                      {categoryLabelLookup[key] || key}
                    </DropdownItem>
                  </div>
                );
              })}
            </div>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Checklist
              title={isCast ? 'Cast Members' : 'Elements'}
              items={elementItems.map(item => ({
                id: item.id,
                label: item.name !== '?' ? item.name : '?',
                leading: isCast ? `${item.id}.` : undefined,
              }))}
              selected={selectedElementIds}
              onToggle={toggleElement}
              onToggleAll={toggleAllElements}
              allSelected={selectedElementIds.size === elementItems.length && elementItems.length > 0}
              emptyHint="No elements"
              maxHeight={320}
            />
          </div>

          <div>
            <Checklist
              title="Days to Include"
              items={dayEntries.map(d => ({
                id: d.dayInt,
                label: `Day ${d.chrono}`,
                secondary: d.date ? formatDayDateLong(d.date) : undefined,
              }))}
              selected={selectedDayInts}
              onToggle={toggleDayInt}
              onToggleAll={toggleAllDays}
              allSelected={selectedDayInts.size === dayEntries.length && dayEntries.length > 0}
              emptyHint="No days scheduled"
              maxHeight={320}
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5">Options</h3>
          <Checkbox block checked={includeNonShooting} onChange={on => update({ includeNonShooting: on })} label="Include non-shooting days (grey columns)" labelClassName="text-zinc-300" />
          <Checkbox block checked={showTotals} onChange={on => update({ showTotals: on })} label="Show totals columns" labelClassName="text-zinc-300" />
        </div>
      </div>
    </Modal>
  );
}
