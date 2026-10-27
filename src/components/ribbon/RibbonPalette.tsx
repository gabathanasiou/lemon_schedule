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
    <aside className="w-[188px] shrink-0 bg-[var(--ui-panel-bg)] border-r border-[color:var(--ui-border)] overflow-y-auto island-inset-l">
      <div className="p-3 pb-20">
        <div className="flex items-center gap-1.5 mb-3">
          <Eye className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)]" />
          <span className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Fields</span>
          <span className="ml-auto text-[10px] tabular-nums text-[color:var(--ui-text-faint)]">{placed}/{total}</span>
        </div>

        {allCategories.map(cat => {
          const items = allFields.filter(f => f.category === cat);
          const catUsed = items.filter(f => used.has(f.key)).length;
          const catColors: Record<string, string> = {
            'Scene Info': 'text-[color:var(--ui-accent-soft-text)]', 'Shooting': 'text-emerald-400',
            'Cast & Talent': 'text-amber-400', 'Production': 'text-violet-400',
            'Breakdown': 'text-rose-400', 'VFX & Audio': 'text-cyan-400',
            'Misc': 'text-[color:var(--ui-text-muted)]', 'Special': 'text-pink-400', 'Custom': 'text-fuchsia-400',
          };
          const cc = catColors[cat] || 'text-[color:var(--ui-text-muted)]';
          return (
            <div key={cat} className="mb-3">
              <div className="flex items-center gap-1 mb-1 text-left">
                <span className={`text-[9px] font-bold uppercase tracking-wide truncate ${cc}`}>{cat}</span>
                <span className="ml-auto text-[9px] text-[color:var(--ui-text-faint)]">{catUsed}/{items.length}</span>
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
                      data-presence-anchor={`palette:ribbon:${f.key}`}
                      onClick={() => { if (!readOnly && selId) assign(selId, f.key); }}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/field', f.key)}
                      className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center gap-1.5 group ${
                        inUse
                          ? 'bg-[var(--ui-input-bg)] ring-1 ring-inset ring-[color:var(--ui-card-border)] text-[color:var(--ui-input-text)] hover:bg-[var(--ui-item-active-bg)]'
                          : 'bg-[var(--ui-card-bg)] text-[color:var(--ui-text-faint)] hover:bg-[var(--ui-input-bg)] hover:text-[color:var(--ui-text)]'
                      }`}
                    >
                      {Icon && <Icon className={`w-3 h-3 shrink-0 ${inUse ? 'text-[color:var(--ui-accent-soft-text)]' : 'text-[color:var(--ui-text-faint)]'}`} />}
                      <span className="text-[10px] truncate">{f.label}</span>
                      {inUse ? (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      ) : (
                        <GripHorizontal className="w-2.5 h-2.5 text-[color:var(--ui-text-disabled)] ml-auto hover-reveal shrink-0" />
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
