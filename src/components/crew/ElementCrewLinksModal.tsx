import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { generateUUID } from '../../lib/utils';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { crewRoleGroup } from '../../lib/crewCatalog';
import { getCrewLinksForElement } from '../../lib/crewLinks';
import { CrewRole } from '../../types';
import { CardSection } from '@gabriel/ui-kit';
import Checklist from '../Checklist';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { Users } from 'lucide-react';

/**
 * Element Manager → Linked crew (roadmap 11, layer 2 reverse view): the crew
 * members linked to ONE element, grouped by department. Toggling writes the
 * same flat `project.crewLinks` records the Crew Links manager edits — one
 * source of truth (`lib/crewLinks.ts`).
 */
export function ElementCrewLinksModal({ category, elementKey, elementName, onClose }: {
  category: string;
  elementKey: string;
  elementName: string;
  onClose: () => void;
}) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const categoryLabel = getLabel(category, ELEMENT_CATEGORIES.find(c => c.key === category)?.label || category, project.categoryLabels);
  const linkedIds = useMemo(
    () => new Set(getCrewLinksForElement(project.crewLinks, category, elementKey).map(l => l.personId)),
    [project.crewLinks, category, elementKey],
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
    if (readOnly) return;
    const current = project.crewLinks || [];
    const next = linkedIds.has(personId)
      ? current.filter(l => !(l.personId === personId && l.category === category && l.elementKey.toLowerCase() === elementKey.toLowerCase()))
      : [...current, { id: generateUUID(), personId, category, elementKey }];
    dispatch({ type: 'UPDATE_PROJECT', payload: { crewLinks: next } });
  };

  const toggleCollapse = (name: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  return (
    <Modal open onClose={onClose} title={`Linked crew — ${elementName || elementKey}`} width="max-w-lg"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Crew members linked to this {categoryLabel.toLowerCase()} element. The same links appear on the person's card in
          Crew Manager → Links.
        </p>
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
                disabled={readOnly}
              />
            </CardSection>
          );
        })}
      </div>
    </Modal>
  );
}
