import { Check, Trash2, Tag } from 'lucide-react';
import { RibbonCell } from '../../types';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../ContextMenu';
import { FIELD_ICONS, getCustomIcon } from './ribbonPaletteMeta';

export interface SelCellRef {
  row: { id: string; cells: RibbonCell[] };
  ci: number;
  cell: RibbonCell;
}

interface RibbonContextMenuProps {
  contextPos: { x: number; y: number } | null;
  setContextPos: (p: { x: number; y: number } | null) => void;
  selCell: SelCellRef | null;
  allFields: { key: string; label: string }[];
  customCategories: { key: string; icon?: string }[] | undefined;
  assign: (cellId: string, key: string) => void;
  setAffix: (cellId: string, which: 'prefix' | 'suffix', value: string) => void;
  setTextContent: (cellId: string, text: string) => void;
  clearCell: (cellId: string) => void;
  removeColumn: (ci: number) => void;
}

const AFFIX_INPUT_CLS = 'flex-1 min-w-0 px-1.5 py-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500';

/** Ribbon designer cell menu — the kit ContextMenu (shared morph / positioning /
 *  keyboard / close-on-outside) with the field list as items, Clear/Delete in the
 *  footer. Dark theme (the designer is a dark surface). The prefix/suffix/text
 *  inputs sit in a custom strip INSIDE the menu content: the kit's Radix menu
 *  dismisses on focus-outside, so a sibling strip would close the menu the moment
 *  it was focused, and the menu's key handler routes printable keys to a focused
 *  field (letters type; the field stays put). */
export default function RibbonContextMenu({
  contextPos, setContextPos, selCell, allFields, customCategories,
  assign, setAffix, setTextContent, clearCell, removeColumn,
}: RibbonContextMenuProps) {
  if (!contextPos || !selCell) return null;
  const field = selCell.cell.field;
  const showAffix = Boolean(field && field !== 'text');
  const showText = field === 'text';

  return (
    <ContextMenu open x={contextPos.x} y={contextPos.y} theme="dark" onClose={() => setContextPos(null)}>
      <div
        ref={el => { if (el) el.querySelector('.ui-item-selected')?.scrollIntoView({ block: 'nearest' }); }}
        className="w-52 max-h-72 overflow-y-auto scrollbar-custom flex flex-col"
      >
        {allFields.map(f => {
          const catDef = (customCategories || []).find(c => c.key === f.key);
          const Icon = FIELD_ICONS[f.key] || (catDef ? getCustomIcon(catDef.icon) : Tag);
          const isActive = f.key === field;
          return (
            <ContextMenuItem
              key={f.key}
              icon={<Icon className="w-3.5 h-3.5 shrink-0" />}
              selected={isActive}
              trailing={isActive ? <Check className="w-3 h-3.5 shrink-0" /> : undefined}
              onClick={() => { assign(selCell.cell.id, f.key); setContextPos(null); }}
            >
              {f.label}
            </ContextMenuItem>
          );
        })}
      </div>

      {(showAffix || showText) && (
        <div className="w-52 shrink-0 mt-1 pt-1.5 border-t border-zinc-800 px-0.5">
          {showAffix ? (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-zinc-500 shrink-0">Pfx</span>
              <input
                value={selCell.cell.prefix || ''}
                onChange={e => setAffix(selCell.cell.id, 'prefix', e.target.value)}
                placeholder=""
                className={AFFIX_INPUT_CLS}
              />
              <span className="text-[9px] text-zinc-500 shrink-0">Sfx</span>
              <input
                value={selCell.cell.suffix || ''}
                onChange={e => setAffix(selCell.cell.id, 'suffix', e.target.value)}
                placeholder=""
                className={AFFIX_INPUT_CLS}
              />
            </div>
          ) : (
            <input
              value={selCell.cell.textContent || ''}
              onChange={e => setTextContent(selCell.cell.id, e.target.value)}
              placeholder="Text content..."
              className={`w-full ${AFFIX_INPUT_CLS}`}
            />
          )}
        </div>
      )}

      <ContextMenuDivider />
      <ContextMenuItem
        icon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}
        onClick={() => { clearCell(selCell.cell.id); setContextPos(null); }}
      >
        Clear field
      </ContextMenuItem>
      <ContextMenuItem
        variant="danger"
        icon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}
        onClick={() => { removeColumn(selCell.ci); setContextPos(null); }}
      >
        Delete Column
      </ContextMenuItem>
    </ContextMenu>
  );
}
