import React from 'react';
import { Trash2 } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../ContextMenu';
import { CAT_ICONS, getCustomIcon } from '../../lib/categories';
import { tagCategories, type ScriptTagTarget } from '../../lib/scriptTagging';
import type { Project, ScriptAnnotation } from '../../types';

/**
 * Selection → category menu (roadmap 136). The industry-standard "highlight →
 * click a category" tagging flow: the kit `ContextMenu` anchored at the
 * selection (or the clicked tag), one item per element category (built-ins +
 * custom). The highlighted text BECOMES the element — no existing-element
 * picker. Opening from an existing tag adds a Remove item and checks the
 * current category.
 */
export interface ScriptTagMenuState {
  x: number;
  y: number;
  target: ScriptTagTarget;
  existing?: ScriptAnnotation;
  /** Distinguishes a menu opened by a click on a tag from one opened by a text
   *  selection, so the deferred selection handler never clobbers it. */
  source: 'selection' | 'annotation';
}

export default function ScriptTagMenu({ menu, project, onCommit, onRemove, onClose }: {
  menu: ScriptTagMenuState | null;
  project: Project;
  onCommit: (category: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const categories = tagCategories(project);
  return (
    <ContextMenu open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={onClose}>
      {menu && (
        <>
          {categories.map(category => {
            const Icon = category.isCustom
              ? getCustomIcon(category.icon || 'Tag')
              : (CAT_ICONS[category.key] || null);
            return (
              <ContextMenuItem
                key={category.key}
                selected={category.key === menu.existing?.category}
                icon={Icon ? <Icon className="w-3.5 h-3.5 shrink-0" /> : undefined}
                onClick={() => onCommit(category.key)}
              >
                {category.label}
              </ContextMenuItem>
            );
          })}
          {menu.existing && <ContextMenuDivider />}
          {menu.existing && (
            <ContextMenuItem variant="danger" icon={<Trash2 className="w-3.5 h-3.5 shrink-0" />} onClick={onRemove}>
              Remove
            </ContextMenuItem>
          )}
        </>
      )}
    </ContextMenu>
  );
}
