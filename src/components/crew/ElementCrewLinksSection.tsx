import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { generateUUID } from '../../lib/utils';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { crewRoleGroup } from '../../lib/crewCatalog';
import { getCrewLinksForElement, crewLinkToUnified } from '../../lib/crewLinks';
import { CrewRole } from '../../types';
import { CardSection } from '@gabriel/ui-kit';
import Checklist from '../Checklist';
import { Users } from 'lucide-react';

/**
 * Element View → Crew tab (roadmap 11/306): the crew members linked to ONE
 * element, grouped by department. Toggling writes the same flat
 * `project.crewLinks` records the Crew Links manager edits — one source of
 * truth (`lib/crewLinks.ts`). Body only: the Element View panel owns the
 * header, tabs and footer.
 */
export function ElementCrewLinksSection({ category, elementKey, elementName, bare = false }: {
  category: string;
  elementKey: string;
  elementName: string;
  /** Render inside another card (no page padding). */
  bare?: boolean;
}) {
  const { state, dispatch, locked } = useProject();
  const project = state.present;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const categoryLabel = getLabel(category, ELEMENT_CATEGORIES.find(c => c.key === category)?.label || category, project.categoryLabels);
  const linkedIds = useMemo(
    () => new Set(getCrewLinksForElement(project.links, category, elementKey).map(l => l.personId)),
    [project.links, category, elementKey],
  );

  const groups = useMemo(() => {
    const out: { name: string; people: { role: CrewRole; id: string; name: string }[] }[] = [];
    for (const role of project.crewRoles || []) {
      const name = crewRoleGroup(role);
      let g = out.find(x => x.name === name);
      if (!g) { g = { name, people: [] }; out.push(g); }
      for (const p of project.crew?.[role.key] || []) g.people.push({ role, id: p.id, name: p.name });
    }
    return out;
  }, [project.crewRoles, project.crew]);

  const toggle = (personId: string) => {
    if (locked) return;
    const current = project.links || [];
    const isThis = (l: any) => l.anchorKind === 'element' && l.anchorCategory === category &&
      l.linkedKind === 'crew' && l.linkedValue === personId &&
      (category === 'cast' ? l.anchorValue === elementKey : l.anchorValue.toLowerCase() === elementKey.toLowerCase());
    const next = linkedIds.has(personId)
      ? current.filter(l => !isThis(l))
      : [...current, crewLinkToUnified({ id: generateUUID(), personId, category, elementKey })];
    dispatch({ type: 'UPDATE_PROJECT', payload: { links: next } });
  };

  const toggleCollapse = (name: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  return (
    <div className={bare ? 'space-y-4' : 'p-6 space-y-4'}>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Crew members linked to this {categoryLabel.toLowerCase()} element. The same links appear on the person's card in
        Crew Manager → Links.
      </p>
      {groups.length === 0 && (
        <p className="text-xs text-zinc-500 italic">No crew roster yet — add people in the Crew Manager.</p>
      )}
      {groups.map(g => {
        const count = g.people.filter(p => linkedIds.has(p.id)).length;
        return (
          <CardSection
            key={g.name}
            icon={<Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
            title={g.name}
            count={`${count}/${g.people.length}`}
            collapsed={collapsed.has(g.name)}
            onToggle={() => toggleCollapse(g.name)}
            dataProps={{ 'data-crew-link-group': g.name }}
          >
            <Checklist
              checkPosition="trailing"
              items={g.people.map(p => ({
                id: p.id,
                label: p.name || '(unnamed)',
                leading: <span className="w-44 shrink-0 text-left text-[11px] font-medium text-zinc-300">{p.role.label}</span>,
                dataProps: { 'data-crew-person': p.id },
              }))}
              selected={linkedIds}
              onToggle={id => toggle(String(id))}
              disabled={locked}
            />
          </CardSection>
        );
      })}
    </div>
  );
}
