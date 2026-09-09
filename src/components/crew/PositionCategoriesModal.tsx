import React, { useMemo } from 'react';
import { useProject } from '../../store';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { crewRoleGroup, resolveRoleCategories } from '../../lib/crewCatalog';
import { CrewRole } from '../../types';
import { Checklist } from '@gabriel/ui-kit';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';

/**
 * Element Manager → Positions (roadmap 11): the per-category view of the
 * position↔category mapping. One checkbox per crew position (grouped by
 * department); toggling adds/removes the active category from that position.
 * The SAME mapping the Crew Manager's Crew Links → Positions tab edits — one
 * source of truth (`CrewRole.categories`, resolved by `resolveRoleCategories`).
 */
export function PositionCategoriesModal({ category, onClose }: { category: string; onClose: () => void }) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;

  const categoryLabel = getLabel(category, ELEMENT_CATEGORIES.find(c => c.key === category)?.label || category, project.categoryLabels);

  const roleByKey = useMemo(
    () => new Map((project.crewRoles || []).map(r => [r.key, r])),
    [project.crewRoles],
  );

  const groups = useMemo(() => {
    const out: { name: string; roles: CrewRole[] }[] = [];
    for (const role of project.crewRoles || []) {
      const name = crewRoleGroup(role);
      let g = out.find(x => x.name === name);
      if (!g) { g = { name, roles: [] }; out.push(g); }
      g.roles.push(role);
    }
    return out;
  }, [project.crewRoles]);

  const toggle = (role: CrewRole) => {
    if (readOnly) return;
    const current = resolveRoleCategories(role);
    const next = current.includes(category) ? current.filter(k => k !== category) : [...current, category];
    dispatch({ type: 'SET_CREW_ROLE_CATEGORIES', payload: { key: role.key, categories: next } });
  };

  return (
    <Modal open onClose={onClose} title={`Positions — ${categoryLabel}`} width="max-w-lg"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Crew positions that look after this category. Used to scope crew in reports and rules
          (e.g. "only crew in this day").
        </p>
        {groups.map(g => (
          <Checklist
            key={g.name}
            theme="dark"
            title={g.name}
            items={g.roles.map(r => ({ id: r.key, label: r.label }))}
            selected={g.roles.filter(r => resolveRoleCategories(r).includes(category)).map(r => r.key)}
            onToggle={(id) => { const role = roleByKey.get(String(id)); if (role) toggle(role); }}
            disabled={readOnly}
            maxHeight={220}
          />
        ))}
      </div>
    </Modal>
  );
}
