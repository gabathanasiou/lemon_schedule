import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { SearchMenu } from '@gabriel/ui-kit';
import type { SearchMenuGroup, SearchMenuItem } from '@gabriel/ui-kit';
import type { DayView } from '../../../lib/dayView';
import type { Project } from '../../../types';
import { ELEMENT_CATEGORIES, getLabel } from '../../../lib/categories';
import { boardIdOf, elementMatchId, getCategoryElements } from '../../../lib/elements';

/**
 * Item 164 — the Day Manager's "add an element to this day" picker. One
 * catalogue across every element category (cast, props, wardrobe, custom …),
 * grouped by category and deep-searchable by Board ID / name / performer.
 * Elements already on the day are hidden, so a pick always ADDS a row.
 *
 * The caller owns the write (`patchMeta`); this component only reports the
 * category + element key, using the same key space as `scene.cast` and
 * `daybreakMeta.extraElements` (cast = Board IDs, other categories = names).
 */
export interface DayElementAddMenuProps {
  day: DayView;
  project: Project;
  onAdd: (category: string, key: string) => void;
}

const DayElementAddMenu: React.FC<DayElementAddMenuProps> = ({ day, project, onAdd }) => {
  const { items, groups, targets } = useMemo(() => {
    const onDay = new Set<string>();
    const mark = (category: string, key: string) =>
      onDay.add(`${category}\u0000${category === 'cast' ? key : key.toLowerCase()}`);
    for (const entry of day.cast) mark('cast', entry.key);
    for (const [category, entries] of Object.entries(day.elements)) {
      for (const entry of entries) mark(category, entry.key);
    }

    const categoryKeys = [
      'cast',
      ...ELEMENT_CATEGORIES.map(c => c.key).filter(k => k !== 'cast'),
      ...(project.customCategories || []).map(c => c.key).filter(k => k !== 'cast'),
    ];
    const seenCategories = new Set<string>();
    const targets = new Map<string, { category: string; key: string }>();
    const items: SearchMenuItem[] = [];
    const groups: SearchMenuGroup[] = [];

    for (const category of categoryKeys) {
      if (seenCategories.has(category)) continue;
      seenCategories.add(category);
      const fresh = getCategoryElements(project, category).filter(el => {
        const key = elementMatchId(el, category);
        return !onDay.has(`${category}\u0000${category === 'cast' ? key : key.toLowerCase()}`);
      });
      if (fresh.length === 0) continue;
      groups.push({
        key: category,
        label: getLabel(category, category, project.categoryLabels),
        count: fresh.length,
      });
      for (const el of fresh) {
        const key = elementMatchId(el, category);
        const boardId = boardIdOf(el, category);
        const performer = (el as any).performer as string | undefined;
        const id = `${category}:${items.length}`;
        targets.set(id, { category, key });
        items.push({
          id,
          label: boardId ? `${boardId}. ${el.name}` : el.name,
          group: category,
          fields: [
            ...(boardId ? [{ label: 'ID', value: boardId }] : []),
            ...(el.name ? [{ label: 'Name', value: el.name }] : []),
            ...(performer ? [{ label: 'Performer', value: performer }] : []),
          ],
        });
      }
    }
    return { items, groups, targets };
  }, [day, project]);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center justify-end" data-day-element-add>
      <SearchMenu
        mode="expandable"
        items={items}
        groups={groups}
        triggerLabel="Add element…"
        triggerIcon={<Plus className="w-3.5 h-3.5" />}
        triggerVariant="subtle"
        placeholder="Search cast, props, wardrobe…"
        onSelect={item => {
          const target = targets.get(item.id);
          if (target) onAdd(target.category, target.key);
        }}
        collapsedWidth={132}
        expandedWidth={220}
        panelWidth={300}
        emptyHint="Search every element category — cast by Board ID or name, any other category by name."
      />
    </div>
  );
};

export default DayElementAddMenu;
