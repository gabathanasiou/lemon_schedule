import React, { useState, useMemo, useEffect, useCallback } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject } from '../../store';
import { Printer, ChevronDown, Check } from 'lucide-react';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../../lib/categories';
import EngineOptionsGrid, { EngineOptions } from '../print/pdf/EngineOptionsGrid';

export interface ElementBreakdownOptions {
  category: string;
}

interface ElementBreakdownDialogProps {
  selectedCategory?: string;
  onPrint: (options: ElementBreakdownOptions) => void;
  onClose: () => void;
}

export default function ElementBreakdownDialog({ selectedCategory: initialCategory, onPrint, onClose }: ElementBreakdownDialogProps) {
  const { state } = useProject();
  const project = state.present;

  const storageKey = `lemon_schedule_element_breakdown_${project.id}`;
  const defaultSettings = { selectedCategory: initialCategory || 'cast' };

  const [settings, setSettings] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return { ...defaultSettings, ...stored, selectedCategory: initialCategory || stored.selectedCategory || 'cast' };
    } catch { return defaultSettings; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
  }, [storageKey, settings]);

  const update = (patch: Partial<typeof defaultSettings>) => setSettings(s => ({ ...s, ...patch }));
  const resetSettings = useCallback(() => {
    setSettings({ selectedCategory: initialCategory || 'cast' });
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey, initialCategory]);

  const defaultEngine: EngineOptions = { engine: 'browser', pdfOrientation: 'landscape', pdfPaperSize: 'a4' };
  const engineStorageKey = `${storageKey}_engine`;
  const [engineOpts, setEngineOpts] = useState<EngineOptions>(() => {
    try {
      const stored = localStorage.getItem(engineStorageKey);
      return stored ? { ...defaultEngine, ...JSON.parse(stored) } : defaultEngine;
    } catch { return defaultEngine; }
  });
  useEffect(() => {
    try { localStorage.setItem(engineStorageKey, JSON.stringify(engineOpts)); } catch {}
  }, [engineStorageKey, engineOpts]);
  const updateEngine = useCallback((patch: Partial<EngineOptions>) => {
    setEngineOpts(prev => ({ ...prev, ...patch }));
  }, []);

  const selectedCategory = settings.selectedCategory;
  const setSelectedCategory = (c: string) => update({ selectedCategory: c });
  const [showCategories, setShowCategories] = useState(false);

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

  const categoryLabel = categoryLabelLookup[selectedCategory] || selectedCategory;

  return (
    <Modal open onClose={onClose} onReset={resetSettings} title="Element Breakdown" icon={<Printer className="w-4 h-4" />} width="max-w-xl"
      footer={
        <ModalFooter>
          <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onPrint({ category: selectedCategory, ...(engineOpts as any) })}
            className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2"
          >
            <Printer className="w-3.5 h-3.5" />
            {engineOpts.engine === 'pdf' ? 'Generate PDF' : 'Print'}
          </button>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5">
        <EngineOptionsGrid options={engineOpts} onChange={updateEngine} />
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
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  const content = e.currentTarget as HTMLElement;
                  requestAnimationFrame(() => {
                    const active = content.querySelector(`[data-cat="${selectedCategory}"]`) as HTMLElement | null;
                    if (active) {
                      active.focus();
                      active.scrollIntoView({ block: 'nearest' });
                    }
                  });
                }}
                className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 max-h-64 overflow-y-auto min-w-[180px] scrollbar-custom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
              >
                {allCategoryKeys.map(({ key, isCustom }) => {
                  const Icon = isCustom
                    ? getCustomIcon(project.customCategories?.find(c => c.key === key)?.icon || 'Tag')
                    : CAT_ICONS[key] || null;
                  const active = key === selectedCategory;
                  return (
                    <RadixDropdownMenu.Item
                      key={key}
                      data-cat={key}
                      onSelect={() => setSelectedCategory(key)}
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
      </div>
    </Modal>
  );
}
