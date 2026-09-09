import React, { useCallback, useMemo, useState } from 'react';
import { useProject } from '../../store';
import { CrewLink, CrewRole } from '../../types';
import { generateUUID } from '../../lib/utils';
import { ELEMENT_CATEGORIES, getLabel, getFieldItems, isMultiValue } from '../../lib/categories';
import { getCategoryElements } from '../../lib/elements';
import { isLinkableCategory } from '../../lib/elementLinks';
import { CREW_LINK_TARGET } from '../../lib/crewLinks';
import { crewRoleGroup, resolveRoleCategories } from '../../lib/crewCatalog';
import { CardSection } from '@gabriel/ui-kit';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { ElementPickerRow } from '../rules/ElementPicker';
import { GroupedSelect } from '../production/day/GroupedSelect';
import { useQueueCastNaming, addNewElement } from '../../lib/newCastNaming';
import { Plus, X, UserRound } from 'lucide-react';

interface LinkDraft {
  id: string;
  category: string;
  elementKey: string;
}

interface PersonGroup {
  id: string;
  personId: string;
  links: LinkDraft[];
}

const BTN = 'px-2 py-1.5 text-xs';
const ICON_BTN = 'p-1.5 rounded-md transition-colors shrink-0';
const REMOVE_BTN = `${ICON_BTN} text-zinc-600 hover:text-red-400 hover:bg-zinc-800`;

/**
 * Crew Links manager (roadmap 11, layer 2): one card per crew person links a
 * specific person to specific elements (driver → the director, HMU artist → a
 * cast member). Mirrors the Element Links manager (`LinkManagerModal`) —
 * grouped anchor cards, the shared `ElementPickerRow`, immediate
 * `UPDATE_PROJECT` dispatch, exact-duplicate dedupe — but the anchor is a
 * person id, so it uses the parallel `project.crewLinks` model
 * (`lib/crewLinks.ts`). Both sides manage the same records (the Element
 * Manager's "Linked crew" is the mirror view).
 */
export function CrewLinkManagerModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const { queue } = useQueueCastNaming();

  const ensureElement = useCallback((category: string, item: string) => {
    if (!category || !item) return;
    addNewElement(dispatch, queue, category, item);
  }, [dispatch, queue]);

  const personItems = useMemo(() => {
    const out: { id: string; name: string; group?: string; hint?: string }[] = [];
    for (const role of project.crewRoles || []) {
      for (const p of project.crew?.[role.key] || []) {
        out.push({ id: p.id, name: p.name || '(unnamed)', group: crewRoleGroup(role), hint: role.label });
      }
    }
    return out;
  }, [project.crewRoles, project.crew]);

  const personLabel = useCallback((personId: string): string => {
    for (const role of project.crewRoles || []) {
      const p = (project.crew?.[role.key] || []).find(x => x.id === personId);
      if (p) return `${role.label} — ${p.name || '(unnamed)'}`;
    }
    return '';
  }, [project.crewRoles, project.crew]);

  /** Positions tab — positions grouped by department, each with its element
   *  categories (the same `CrewRole.categories` the Element Manager's Positions
   *  modal edits). */
  const positionGroups = useMemo(() => {
    const out: { name: string; roles: CrewRole[] }[] = [];
    for (const role of project.crewRoles || []) {
      const name = crewRoleGroup(role);
      let g = out.find(x => x.name === name);
      if (!g) { g = { name, roles: [] }; out.push(g); }
      g.roles.push(role);
    }
    return out;
  }, [project.crewRoles]);

  const categoryOptions = useMemo(() => {
    const hidden = new Set(project.hiddenCategories || []);
    return [
      ...ELEMENT_CATEGORIES.map(c => ({ key: c.key, label: getLabel(c.key, c.label, project.categoryLabels) })),
      ...(project.customCategories || []).map(c => ({ key: c.key, label: c.label })),
    ].filter(c => !hidden.has(c.key));
  }, [project.hiddenCategories, project.categoryLabels, project.customCategories]);

  // Storage is FLAT (one CrewLink per value) — regroup into one row per
  // (person, category); values of the same category join into a comma list.
  const groupInit = useCallback((): PersonGroup[] => {
    const byPerson = new Map<string, PersonGroup>();
    const appendValue = (cat: string, current: string, value: string): string => {
      const items = getFieldItems(cat, current || '');
      const dup = cat === 'cast'
        ? items.some(v => v === value)
        : items.some(v => v.toLowerCase() === value.toLowerCase());
      if (dup) return current;
      return [...items, value].join(', ');
    };
    for (const l of project.crewLinks || []) {
      let g = byPerson.get(l.personId);
      if (!g) {
        g = { id: generateUUID(), personId: l.personId, links: [] };
        byPerson.set(l.personId, g);
      }
      const row = g.links.find(r => r.category === l.category);
      if (row) row.elementKey = appendValue(l.category, row.elementKey, l.elementKey);
      else g.links.push({ id: l.id, category: l.category, elementKey: l.elementKey });
    }
    return [...byPerson.values()];
  }, [project.crewLinks]);

  const [tab, setTab] = useState<'people' | 'positions'>('people');
  const [groups, setGroups] = useState<PersonGroup[]>(groupInit);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleCollapse = (gid: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    for (const c of ELEMENT_CATEGORIES) {
      if (isLinkableCategory(c.key, project.customCategories)) keys.push({ key: c.key, isCustom: false });
    }
    for (const c of project.customCategories || []) {
      if (isLinkableCategory(c.key, project.customCategories)) keys.push({ key: c.key, isCustom: true });
    }
    return keys;
  }, [project.customCategories]);

  // Sets are anchor-only in element links; here a set target makes no sense
  // either (adding a set replaces the field), so it is not offered.
  const linkedCategoryKeys = useMemo(
    () => allCategoryKeys.filter(k => k.key !== 'set'),
    [allCategoryKeys],
  );

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const elementsFor = useCallback((cat: string) => getCategoryElements(project, cat), [project]);

  /** Flattens a card into flat CrewLinks; comma lists expand to one link per
   *  value, incomplete rows and exact duplicates are dropped. */
  const flatten = useCallback((g: PersonGroup): CrewLink[] => {
    if (!g.personId) return [];
    const out: CrewLink[] = [];
    const seen = new Set<string>();
    for (const l of g.links) {
      if (!l.category || !l.elementKey) continue;
      for (const elementKey of getFieldItems(l.category, l.elementKey)) {
        const k = `${g.personId}|${l.category}|${l.category === 'cast' ? elementKey : elementKey.toLowerCase()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ id: l.id, personId: g.personId, category: l.category, elementKey });
      }
    }
    return out;
  }, []);

  const commitGroups = (next: PersonGroup[]) => {
    setGroups(next);
    dispatch({ type: 'UPDATE_PROJECT', payload: { crewLinks: next.flatMap(flatten) } });
  };

  const patchGroup = (gid: string, patch: Partial<PersonGroup>) =>
    commitGroups(groups.map(g => g.id === gid ? { ...g, ...patch } : g));

  const patchLink = (gid: string, lid: string, patch: Partial<LinkDraft>) =>
    commitGroups(groups.map(g => g.id === gid
      ? { ...g, links: g.links.map(l => l.id === lid ? { ...l, ...patch } : l) }
      : g));

  const removeLink = (gid: string, lid: string) =>
    commitGroups(groups.map(g => g.id === gid ? { ...g, links: g.links.filter(l => l.id !== lid) } : g));

  const removeGroup = (gid: string) => commitGroups(groups.filter(g => g.id !== gid));

  const unusedCategory = (g: PersonGroup): string | null => {
    const used = new Set(g.links.map(l => l.category));
    const fallback = allCategoryKeys.find(k => !used.has(k.key) && k.key !== 'set');
    return fallback?.key || null;
  };

  const usedCategories = (g: PersonGroup, exceptRowId?: string): Set<string> =>
    new Set(g.links.filter(l => l.id !== exceptRowId).map(l => l.category));

  const addLink = (gid: string) => {
    const g = groups.find(x => x.id === gid);
    if (!g) return;
    const last = g.links[g.links.length - 1]?.category;
    const nextCat = unusedCategory(g) || (last && last !== CREW_LINK_TARGET ? last : 'props');
    commitGroups(groups.map(x => x.id === gid
      ? { ...x, links: [...x.links, { id: generateUUID(), category: nextCat, elementKey: '' }] }
      : x));
  };

  /** One crew-target row per card (multi-select of people). */
  const hasCrewRow = (g: PersonGroup) => g.links.some(l => l.category === CREW_LINK_TARGET);

  const addCrewRow = (gid: string) => {
    const g = groups.find(x => x.id === gid);
    if (!g || hasCrewRow(g)) return;
    commitGroups(groups.map(x => x.id === gid
      ? { ...x, links: [...x.links, { id: generateUUID(), category: CREW_LINK_TARGET, elementKey: '' }] }
      : x));
  };

  const addGroup = () =>
    commitGroups([...groups, { id: generateUUID(), personId: '', links: [{ id: generateUUID(), category: 'props', elementKey: '' }] }]);

  const linkCount = (g: PersonGroup) => flatten(g).length;

  return (
    <Modal open onClose={onClose} title="Crew Links" width="max-w-3xl"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <div className="flex border border-zinc-700 rounded p-0.5 w-fit" role="tablist" aria-label="Crew links view">
          <button
            role="tab"
            aria-selected={tab === 'people'}
            onClick={() => setTab('people')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${tab === 'people' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            People
          </button>
          <button
            role="tab"
            aria-selected={tab === 'positions'}
            onClick={() => setTab('positions')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${tab === 'positions' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Positions
          </button>
        </div>

        {tab === 'positions' ? (
          <PositionsTab dispatch={dispatch} readOnly={readOnly} groups={positionGroups} options={categoryOptions} />
        ) : (
          <>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Link a crew member to the people they look after — a driver to the director, a chaperone to a young cast member —
          or to elements (an HMU artist to a cast member). Call sheets and crew tables can print the assignment, and
          you're warned when the linked person isn't working that day.
        </p>

        {groups.map((g, gi) => {
          const label = personLabel(g.personId);
          return (
            <CardSection
              key={g.id}
              dataProps={{ 'data-crew-link-card': g.id }}
              icon={<UserRound className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
              title={label ? <span className="truncate">{label}</span> : <span className="text-zinc-500 italic">Unset person</span>}
              count={`${linkCount(g)} link${linkCount(g) === 1 ? '' : 's'}`}
              collapsed={collapsedGroups.has(g.id)}
              onToggle={() => toggleCollapse(g.id)}
              trailing={
                <button
                  onClick={() => removeGroup(g.id)}
                  title="Remove this person and all their links"
                  aria-label="Remove person card"
                  className={REMOVE_BTN}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              }
            >
              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1.5 block">Crew member</span>
                  <GroupedSelect
                    theme="dark"
                    mode="single"
                    items={personItems}
                    selectedIds={g.personId ? [g.personId] : []}
                    onChange={(ids) => patchGroup(g.id, { personId: ids[0] || '' })}
                    placeholder="Select crew member…"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1.5 block">Linked to</span>
                  {g.links.map((l, li) => (
                    l.category === CREW_LINK_TARGET ? (
                      <div key={l.id} className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1.5 text-xs rounded bg-zinc-950 border border-zinc-700 text-zinc-300 shrink-0">Crew</span>
                        <span className="text-xs text-zinc-500 font-medium shrink-0">=</span>
                        <GroupedSelect
                          className="flex-1 min-w-0"
                          theme="dark"
                          mode="multi"
                          items={personItems}
                          selectedIds={getFieldItems(CREW_LINK_TARGET, l.elementKey)}
                          onChange={(ids) => patchLink(g.id, l.id, { elementKey: ids.join(', ') })}
                          placeholder="Select crew…"
                        />
                        <button onClick={() => removeLink(g.id, l.id)} aria-label="Remove crew link" className={REMOVE_BTN}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <ElementPickerRow
                        key={l.id}
                        category={l.category}
                        elementValue={l.elementKey}
                        onCategoryChange={(cat) => patchLink(g.id, l.id, { category: cat, elementKey: '' })}
                        onElementChange={(v) => patchLink(g.id, l.id, { elementKey: v })}
                        onCreateItem={(item) => ensureElement(l.category, item)}
                        allCategoryKeys={linkedCategoryKeys}
                        categoryLabelLookup={categoryLabelLookup}
                        customCategories={project.customCategories}
                        items={elementsFor(l.category)}
                        mode={isMultiValue(l.category, project.customCategories) ? 'multi' : 'single'}
                        disabledCategoryKeys={usedCategories(g, l.id)}
                        openDropdown={openDropdown}
                        setOpenDropdown={setOpenDropdown}
                        idPrefix={`cl${gi}-${li}`}
                        btnClass={BTN}
                        onRemove={() => removeLink(g.id, l.id)}
                        removeIcon={<X className="w-3.5 h-3.5" />}
                        removeBtnClass={REMOVE_BTN}
                      />
                    )
                  ))}
                  <div className="flex items-center gap-3 mt-2">
                    {unusedCategory(g) !== null && (
                      <button onClick={() => addLink(g.id)} className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Add Linked Element
                      </button>
                    )}
                    {!hasCrewRow(g) && (
                      <button onClick={() => addCrewRow(g.id)} className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Add Linked Crew Member
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CardSection>
          );
        })}

        <button onClick={addGroup} className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Crew Member
        </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Positions → element categories (roadmap 11, layer 1) — the same mapping the
 *  Element Manager's Positions modal edits; positions grouped by department. */
const PositionsTab: React.FC<{
  dispatch: (action: any) => void;
  readOnly: boolean;
  groups: { name: string; roles: CrewRole[] }[];
  options: { key: string; label: string }[];
}> = ({ dispatch, readOnly, groups, options }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (name: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400 leading-relaxed">
        A position maps to the element categories it looks after. If a day's scenes have an element in that category, the
        position is needed that day — reports and rules scope by this ("only crew in this day").
      </p>
      {groups.map(g => (
        <CardSection
          key={g.name}
          icon={<UserRound className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
          title={g.name}
          count={`${g.roles.length}`}
          collapsed={collapsed.has(g.name)}
          onToggle={() => toggleCollapse(g.name)}
          dataProps={{ 'data-position-group': g.name }}
        >
          {g.roles.map(role => (
            <div key={role.key} className="flex items-center gap-3 px-3 py-2" data-position={role.key}>
              <span className="w-40 shrink-0 text-[11px] font-medium text-zinc-300">{role.label}</span>
              <GroupedSelect
                className="flex-1 min-w-0"
                theme="dark"
                mode="multi"
                items={options.map(o => ({ id: o.key, name: o.label }))}
                selectedIds={resolveRoleCategories(role)}
                disabled={readOnly}
                placeholder="No categories"
                onChange={(ids) => dispatch({ type: 'SET_CREW_ROLE_CATEGORIES', payload: { key: role.key, categories: ids } })}
              />
            </div>
          ))}
        </CardSection>
      ))}
    </div>
  );
};
