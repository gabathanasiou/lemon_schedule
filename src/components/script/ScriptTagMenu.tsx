import React from 'react';
import { Check, Sparkles, Trash2 } from 'lucide-react';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import { CAT_ICONS, getCustomIcon } from '../../lib/categories';
import { tagCategories, type ScriptTagTarget } from '../../lib/scriptTagging';
import type { Project, ScriptAnnotation } from '../../types';

/**
 * Selection → category menu (roadmap 136). The industry-standard "highlight →
 * click a category" tagging flow, rendered as the kit **searchable**
 * `DropdownMenu` (DESIGN-LANGUAGE §primitive matrix: the category list can be
 * long with custom categories, so a search box filters it). The highlighted
 * text BECOMES the element — no existing-element picker. Opening from an
 * existing tag checks the current category and adds a Remove item.
 *
 * Anchoring: the kit menu is trigger-anchored, so a zero-size fixed trigger
 * stands in at the selection / click point.
 */
export interface ScriptTagMenuState {
  x: number;
  y: number;
  target: ScriptTagTarget;
  existing?: ScriptAnnotation;
  /** For an ephemeral auto-suggestion: the category to highlight (and mark with
   *  a symbol). Enter commits it — the selection is already there. */
  suggested?: string;
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
  const current = menu?.existing?.category;
  const suggested = menu?.suggested;
  const highlightKey = suggested || current;
  const highlightIndex = highlightKey ? categories.findIndex(c => c.key === highlightKey) : undefined;
  return (
    <DropdownMenu
      open={!!menu}
      onClose={onClose}
      onOpenChange={open => { if (!open) onClose(); }}
      theme="light"
      searchable
      searchPlaceholder="Search categories…"
      contentClassName="z-[10001]"
      initialHighlightIndex={highlightIndex != null && highlightIndex >= 0 ? highlightIndex : undefined}
      trigger={
        <span
          aria-hidden
          className="pointer-events-none"
          style={{ position: 'fixed', left: menu?.x ?? 0, top: menu?.y ?? 0, width: 1, height: 1 }}
        />
      }
    >
      {categories.map(category => {
        const Icon = category.isCustom
          ? getCustomIcon(category.icon || 'Tag')
          : (CAT_ICONS[category.key] || null);
        const selected = category.key === current;
        const isSuggested = category.key === suggested;
        return (
          <DropdownItem
            key={category.key}
            selected={selected}
            icon={Icon ? <Icon className="w-3.5 h-3.5 shrink-0" /> : undefined}
            trailing={(selected || isSuggested) ? (
              <span className="flex items-center gap-1">
                {isSuggested && (
                  <span title="Suggested" aria-label="Suggested">
                    <Sparkles className="w-3 h-3 shrink-0 text-amber-500" />
                  </span>
                )}
                {selected && <Check className="w-3 h-3 shrink-0" />}
              </span>
            ) : undefined}
            onClick={() => onCommit(category.key)}
          >
            {category.label}
          </DropdownItem>
        );
      })}
      {menu?.existing && <DropdownDivider />}
      {menu?.existing && (
        <DropdownItem variant="danger" icon={<Trash2 className="w-3.5 h-3.5 shrink-0" />} onClick={onRemove}>
          Remove
        </DropdownItem>
      )}
    </DropdownMenu>
  );
}
