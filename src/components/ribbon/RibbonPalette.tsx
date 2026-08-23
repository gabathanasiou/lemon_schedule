import React from 'react';
import { Eye, GripHorizontal, Tag } from 'lucide-react';
import { RibbonRow } from '../../types';
import { FIELD_ICONS, getCustomIcon } from './ribbonPaletteMeta';
import { TEST_IDS } from '../../lib/testIds';

export interface RibbonFieldDef {
  key: string;
  label: string;
  category: string;
}

interface RibbonPaletteProps {
  allCategories: string[];
  allFields: RibbonFieldDef[];
  used: Set<string>;
  placed: number;
  total: number;
  customCategories: { key: string; label: string; icon?: string }[];
  readOnly: boolean;
  selId: string | null;
  assign: (cellId: string, key: string) => void;
}

export default function RibbonPalette({
  allCategories, allFields, used, placed, total, customCategories, readOnly, selId, assign,
}: RibbonPaletteProps) {
  return (
    <aside className="w-[188px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
      <div className="p-3 pb-20">
        <div className="flex items-center gap-1.5 mb-3">
          <Eye className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Fields</span>
          <span className="ml-auto text-[10px] tabular-nums text-zinc-600">{placed}/{total}</span>
        </div>

        {allCategories.map(cat => {
          const items = allFields.filter(f => f.category === cat);
          const catUsed = items.filter(f => used.has(f.key)).length;
          const catColors: Record<string, string> = {
            'Scene Info': 'text-blue-400', 'Shooting': 'text-emerald-400',
            'Cast & Talent': 'text-amber-400', 'Production': 'text-violet-400',
            'Breakdown': 'text-rose-400', 'VFX & Audio': 'text-cyan-400',
            'Misc': 'text-zinc-400', 'Special': 'text-pink-400', 'Custom': 'text-fuchsia-400',
          };
          const cc = catColors[cat] || 'text-zinc-400';
          return (
            <div key={cat} className="mb-3">
              <div className="flex items-center gap-1 mb-1 text-left">
                <span className={`text-[9px] font-bold uppercase tracking-wide truncate ${cc}`}>{cat}</span>
                <span className="ml-auto text-[9px] text-zinc-600">{catUsed}/{items.length}</span>
              </div>
              <div className="space-y-0.5">
                {items.map(f => {
                  const inUse = used.has(f.key);
                  const customCat = (customCategories || []).find(c => c.key === f.key);
                  const Icon = FIELD_ICONS[f.key] || (customCat ? getCustomIcon(customCat.icon) : Tag);
                  return (
                    <button
                      key={f.key}
                      data-testid={TEST_IDS.paletteItem}
                      data-field={f.key}
                      onClick={() => { if (!readOnly && selId) assign(selId, f.key); }}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/field', f.key)}
                      className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center gap-1.5 group ${
                        inUse
                          ? 'bg-zinc-800 ring-1 ring-inset ring-zinc-700 text-zinc-200 hover:bg-zinc-700'
                          : 'bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                      }`}
                    >
                      {Icon && <Icon className={`w-3 h-3 shrink-0 ${inUse ? 'text-blue-400' : 'text-zinc-600'}`} />}
                      <span className="text-[10px] truncate">{f.label}</span>
                      {inUse ? (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      ) : (
                        <GripHorizontal className="w-2.5 h-2.5 text-zinc-700 ml-auto hover-reveal shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
