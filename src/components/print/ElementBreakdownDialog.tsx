import React, { useState } from 'react';
import { useProject, DEFAULT_CATEGORY_LABELS } from '../../store';
import { CustomCategoryDef } from '../../types';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { X, ChevronDown, Printer } from 'lucide-react';

export interface ElementBreakdownOptions {
  category: string;
}

interface ElementBreakdownDialogProps {
  onPrint: (options: ElementBreakdownOptions) => void;
  onClose: () => void;
}

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin = DEFAULT_CATEGORY_LABELS[key];
  if (builtin) return builtin;
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

export default function ElementBreakdownDialog({ onPrint, onClose }: ElementBreakdownDialogProps) {
  const { state } = useProject();
  const project = state.present;

  const allCategories = (() => {
    const cats: { key: string; label: string }[] = [];
    const builtin = ['cast', 'set', 'props', 'backgroundActors', 'stunts', 'vehicles', 'wardrobe', 'makeup', 'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept', 'location', 'notes'];
    for (const key of builtin) {
      cats.push({ key, label: getCategoryLabel(key, project.customCategories || []) });
    }
    for (const c of project.customCategories || []) {
      cats.push({ key: c.key, label: c.label });
    }
    return cats;
  })();

  const [selectedCategory, setSelectedCategory] = useState(allCategories[0]?.key || 'cast');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-[500px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white">Print Element Breakdown</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 space-y-3">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Category</h3>
            <DropdownMenu
              open={categoryMenuOpen}
              onClose={() => setCategoryMenuOpen(false)}
              width="w-56"
              trigger={
                <button
                  onClick={() => setCategoryMenuOpen(p => !p)}
                  className="flex items-center justify-between w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-left hover:border-zinc-600 transition-colors"
                >
                  <span className="text-zinc-200">{getCategoryLabel(selectedCategory, project.customCategories || [])}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              }
            >
              {allCategories.map(cat => (
                <DropdownItem
                  key={cat.key}
                  onClick={() => { setSelectedCategory(cat.key); setCategoryMenuOpen(false); }}
                >
                  {cat.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-900">
          <button
            onClick={() => onClose()}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onPrint({ category: selectedCategory })}
            className="px-6 py-2 bg-white text-zinc-900 text-sm font-bold rounded-lg hover:bg-zinc-200 transition-colors shadow-lg flex items-center gap-2"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
