import React, { useState } from 'react';
import { useProject, DEFAULT_CATEGORY_LABELS } from '../../store';
import { CustomCategoryDef } from '../../types';
import { Printer, Check } from 'lucide-react';
import Modal from '../Modal';

export interface ElementBreakdownOptions {
  category: string;
}

interface ElementBreakdownDialogProps {
  selectedCategory?: string;
  onPrint: (options: ElementBreakdownOptions) => void;
  onClose: () => void;
}

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin = DEFAULT_CATEGORY_LABELS[key];
  if (builtin) return builtin;
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

export default function ElementBreakdownDialog({ selectedCategory: initialCategory, onPrint, onClose }: ElementBreakdownDialogProps) {
  const { state } = useProject();
  const project = state.present;

  const [selectedCategory, setSelectedCategory] = useState(initialCategory || (() => {
    const cats = allCategoryKeys(project);
    return cats[0]?.key || 'cast';
  }));

  const cats = allCategoryKeys(project);

  return (
    <Modal open onClose={onClose} title="Element Breakdown" icon={<Printer className="w-4 h-4" />} width="max-w-xl">
      <div className="px-6 py-4 space-y-5">
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 space-y-3">
          <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider block">
            Category
          </label>
          <div className="bg-zinc-950 border border-zinc-700 rounded-md overflow-y-auto max-h-64">
            {cats.map(cat => {
              const active = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'}`}
                >
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {active && <Check className="w-3.5 h-3.5 text-zinc-200" />}
                  </span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
        <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => onPrint({ category: selectedCategory })}
          className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </button>
      </div>
    </Modal>
  );
}

function allCategoryKeys(project: { customCategories?: CustomCategoryDef[] }) {
  const cats: { key: string; label: string }[] = [];
  const builtin = ['cast', 'set', 'props', 'backgroundActors', 'stunts', 'vehicles', 'wardrobe', 'makeup', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept', 'location', 'notes'];
  for (const key of builtin) {
    cats.push({ key, label: getCategoryLabel(key, project.customCategories || []) });
  }
  for (const c of project.customCategories || []) {
    cats.push({ key: c.key, label: c.label });
  }
  return cats;
}
