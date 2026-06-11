import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../../store';
import { Printer, ChevronDown } from 'lucide-react';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../../lib/categories';

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

  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'cast');
  const [showCategories, setShowCategories] = useState(false);
  const catBtnRef = useRef<HTMLButtonElement>(null);
  const [catPos, setCatPos] = useState({ top: 0, left: 0, width: 0 });

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
    <Modal open onClose={onClose} title="Element Breakdown" icon={<Printer className="w-4 h-4" />} width="max-w-xl"
      footer={
        <ModalFooter>
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
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5">
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 space-y-3">
          <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider block">
            Category
          </label>
          <div className="relative">
            <button
              ref={catBtnRef}
              onClick={() => {
                if (!showCategories && catBtnRef.current) {
                  const r = catBtnRef.current.getBoundingClientRect();
                  setCatPos({ top: r.bottom + 4, left: r.left, width: r.width });
                }
                setShowCategories(p => !p);
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <span>{categoryLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>
            {showCategories && createPortal(
              <div className="fixed bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl z-[10001] py-1 max-h-64 overflow-y-auto" style={{ top: catPos.top, left: catPos.left, width: catPos.width }}>
                <div className="fixed inset-0 z-[-1]" onClick={() => setShowCategories(false)} />
                {allCategoryKeys.map(({ key, isCustom }) => {
                  const Icon = isCustom
                    ? getCustomIcon(project.customCategories?.find(c => c.key === key)?.icon || 'Tag')
                    : CAT_ICONS[key] || null;
                  const active = key === selectedCategory;
                  return (
                    <button
                      key={key}
                      onClick={() => { setSelectedCategory(key); setShowCategories(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'}`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                      <span>{categoryLabelLookup[key] || key}</span>
                    </button>
                  );
                })}
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
