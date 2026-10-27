import React, { useCallback, useMemo, useState } from 'react';
import { useProject } from '../../store';
import { Link } from '../../types';
import { generateUUID } from '../../lib/utils';
import { ELEMENT_CATEGORIES, getLabel, getFieldItems, isMultiValue } from '../../lib/categories';
import { getCategoryElements } from '../../lib/elements';
import { applyLinkToScenes, isLinkableCategory, anchoredKeysFor } from '../../lib/elementLinks';
import { isPropagationLink } from '../../lib/links';
import { CREW_TARGET, LOCATION_TARGET, draftValueForLink, targetFromDraftValue } from '../../lib/linkDrafts';
import { CardSection } from '@gabriel/ui-kit';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { ElementPickerRow } from '../rules/ElementPicker';
import { LinkRow } from './LinkRow';
import { useQueueCastNaming, addNewElement } from '../../lib/newCastNaming';
import { Plus, X, Link2, Check } from 'lucide-react';

interface LinkDraft {
  id: string;
  linkedCategory: string;
  linkedValue: string;
}

interface AnchorGroup {
  id: string;
  category: string;
  anchorValue: string;
  links: LinkDraft[];
}

const BTN = 'px-2 py-1.5 text-xs';
const ANCHOR_BTN = 'px-2 py-1.5 text-xs font-semibold';
const ICON_BTN = 'p-1.5 rounded-md transition-colors shrink-0';
const REMOVE_BTN = `${ICON_BTN} text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-danger-text)] hover:bg-[var(--ui-item-hover-bg)]`;
/** Labeled action button — reads as an action even without hovering (NN/g:
 *  icon-only buttons need text labels for the information scent). */
const ACTION_BTN = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ui-text)] border border-[color:var(--ui-input-border)] rounded-md hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text-strong)] transition-colors shrink-0';

/**
 * Link Manager (roadmap 44): one-way anchor-based element links, opened from
 * the Element Manager. One card per anchor: the anchor picker on top with a
 * list of its linked elements below — "+ Add Linked Element" keeps the same
 * anchor, so multiple links per anchor are natural. Links dispatch
 * immediately (UPDATE_PROJECT, exact-duplicate dedupe). Each card has a
 * compact icon Apply (retroactive: adds the linked elements to every scene
 * that already contains the anchor, batch = one undo entry); the footer
 * applies every card at once.
 */
export function LinkManagerModal({ initialAnchorCategory, onClose }: { initialAnchorCategory?: string; onClose: () => void }) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const { queue } = useQueueCastNaming();

  /** Creating a link (anchor or linked element) that has no element yet makes
   *  the element — same shared flow as the stripboard/Glide/SceneSheet. */
  const ensureElement = useCallback((category: string, item: string) => {
    if (!category || !item || category === CREW_TARGET || category === LOCATION_TARGET) return;
    addNewElement(dispatch, queue, category, item);
  }, [dispatch, queue]);

  // Storage is FLAT (one ElementLink per value) — regroup into the draft's
  // one-row-per-category shape: values of the same (anchor, category) join
  // back into a single comma list, so 4 props links reload as ONE Props row.
  const groupInit = useCallback((): AnchorGroup[] => {
    const byAnchor = new Map<string, AnchorGroup>();
    const appendValue = (cat: string, current: string, value: string): string => {
      const items = getFieldItems(cat, current || '');
      if (items.some(v => v.toLowerCase() === value.toLowerCase())) return current;
      return [...items, value].join(', ');
    };
    for (const l of (project.links || []).filter(x => x.anchorKind === 'element' && !!x.anchorCategory)) {
      const key = `${l.anchorCategory}|${l.anchorValue}`;
      let g = byAnchor.get(key);
      if (!g) {
        g = { id: generateUUID(), category: l.anchorCategory as string, anchorValue: l.anchorValue, links: [] };
        byAnchor.set(key, g);
      }
      const mapped = draftValueForLink(l);
      if (!mapped) continue;
      const row = g.links.find(r => r.linkedCategory === mapped.category);
      if (row) row.linkedValue = appendValue(mapped.category, row.linkedValue, mapped.value);
      else g.links.push({ id: l.id, linkedCategory: mapped.category, linkedValue: mapped.value });
    }
    const list = [...byAnchor.values()];
    if (list.length === 0 && initialAnchorCategory) {
      list.push({
        id: generateUUID(),
        category: initialAnchorCategory,
        anchorValue: '',
        links: [{ id: generateUUID(), linkedCategory: 'props', linkedValue: '' }],
      });
    }
    return list;
  }, [project.links, initialAnchorCategory]);

  const [groups, setGroups] = useState<AnchorGroup[]>(groupInit);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, number>>({});
  const [appliedAll, setAppliedAll] = useState(false);

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

  // Sets can be ANCHORS but never linked targets (adding a set to a scene
  // replaces the field — a link would silently never apply as designed).
  const linkedCategoryKeys = useMemo(
    () => [
      ...allCategoryKeys.filter(k => k.key !== 'set'),
      { key: CREW_TARGET, isCustom: false },
      { key: LOCATION_TARGET, isCustom: false },
    ],
    [allCategoryKeys],
  );

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = { crew: 'Crew', location: 'Locations' };
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const people = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    for (const role of project.crewRoles || []) {
      for (const p of project.crew?.[role.key] || []) out.push({ id: p.id, name: p.name });
    }
    return out;
  }, [project.crewRoles, project.crew]);

  const locations = useMemo(
    () => (project.locations || []).map(l => ({ id: l.id, name: l.name })),
    [project.locations],
  );

  const elementsFor = useCallback((cat: string) => {
    if (cat === CREW_TARGET) return people;
    if (cat === LOCATION_TARGET) return locations;
    return getCategoryElements(project, cat);
  }, [project, people, locations]);

  /** Human label for the anchor in the card header ("1. FISHERMAN" for cast,
   *  the element name otherwise; falls back to the raw value). */
  const anchorDisplay = (g: AnchorGroup): string => {
    if (!g.anchorValue) return '';
    const elems = elementsFor(g.category);
    return getFieldItems(g.category, g.anchorValue).map(v => {
      const e = elems.find(x => g.category === 'cast' ? String(x.id) === v : (x.name || '').toLowerCase() === v.toLowerCase());
      return e ? (g.category === 'cast' ? `${e.id}. ${e.name}` : e.name) : v;
    }).join(', ');
  };

  // Per-category sets of item keys that are anchors of a link — Anchor icons
  // in the pickers (incl. elements that are a linked target here but anchor
  // another card).
  const anchoredByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const cat of new Set((project.links || []).map(l => l.anchorCategory))) {
      map.set(cat, anchoredKeysFor(project.links, cat));
    }
    return map;
  }, [project.links]);

  /** Flattens a draft into flat links. Multi-value picks (comma lists) expand
   *  to one link per value; incomplete rows and exact duplicates are dropped. */
  const flatten = useCallback((g: AnchorGroup): Link[] => {
    if (!g.category || !g.anchorValue) return [];
    const anchors = getFieldItems(g.category, g.anchorValue);
    if (anchors.length === 0) return [];
    const out: Link[] = [];
    const seen = new Set<string>();
    for (const l of g.links) {
      if (!l.linkedCategory || !l.linkedValue) continue;
      for (const rawValue of getFieldItems(l.linkedCategory, l.linkedValue)) {
        const target = targetFromDraftValue(l.linkedCategory, rawValue);
        for (const anchorValue of anchors) {
          const k = `${g.category}|${anchorValue}|${target.linkedKind}|${target.linkedValue}`.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({
            id: l.id,
            anchorKind: 'element',
            anchorCategory: g.category,
            anchorValue,
            linkedKind: target.linkedKind,
            linkedCategory: target.linkedCategory,
            linkedValue: target.linkedValue,
          });
        }
      }
    }
    return out;
  }, []);

  /** Flattens cards into the storage shape, then persists immediately. */
  const commitGroups = (next: AnchorGroup[]) => {
    setGroups(next);
    dispatch({
      type: 'UPDATE_PROJECT',
      payload: { links: [...(project.links || []).filter(l => l.anchorKind !== 'element'), ...next.flatMap(flatten)] },
    });
    setApplied({});
    setAppliedAll(false);
  };

  const patchGroup = (gid: string, patch: Partial<AnchorGroup>) =>
    commitGroups(groups.map(g => g.id === gid ? { ...g, ...patch } : g));

  const patchLink = (gid: string, lid: string, patch: Partial<LinkDraft>) =>
    commitGroups(groups.map(g => g.id === gid
      ? { ...g, links: g.links.map(l => l.id === lid ? { ...l, ...patch } : l) }
      : g));

  const removeLink = (gid: string, lid: string) =>
    commitGroups(groups.map(g => g.id === gid ? { ...g, links: g.links.filter(l => l.id !== lid) } : g));

  const removeGroup = (gid: string) => commitGroups(groups.filter(g => g.id !== gid));

  /** First linkable category NOT yet used by the card's linked rows. Cast and
 *  Sets are skipped — cast → cast links and set targets are never prefills. */
  const unusedCategory = (g: AnchorGroup): string | null => {
    const used = new Set(g.links.map(l => l.linkedCategory));
    const fallback = linkedCategoryKeys.find(k => !used.has(k.key) && k.key !== 'cast' && k.key !== 'set');
    return fallback?.key || null;
  };

  const addLink = (gid: string) => {
    const g = groups.find(x => x.id === gid);
    if (!g) return;
    const nextCat = unusedCategory(g) || g.links[g.links.length - 1]?.linkedCategory || 'props';
    commitGroups(groups.map(x => x.id === gid
      ? { ...x, links: [...x.links, { id: generateUUID(), linkedCategory: nextCat, linkedValue: '' }] }
      : x));
  };

  /** One linked row per category: the category dropdown disables categories
   *  already used by OTHER rows of this card, so duplicates can't be created. */
  const usedCategories = (g: AnchorGroup, exceptRowId?: string): Set<string> =>
    new Set(g.links.filter(l => l.id !== exceptRowId).map(l => l.linkedCategory));

  const addGroup = () => {
    const last = groups[groups.length - 1];
    commitGroups([...groups, {
      id: generateUUID(),
      category: last?.category || initialAnchorCategory || 'cast',
      anchorValue: '',
      links: [{ id: generateUUID(), linkedCategory: 'props', linkedValue: '' }],
    }]);
  };

  const filledLinks = (g: AnchorGroup): Link[] => flatten(g);

  const applyGroup = (gid: string) => {
    const g = groups.find(x => x.id === gid);
    if (!g) return;
    const links = filledLinks(g);
    if (links.length === 0) return;
    const working = new Map(project.scenes.map(s => [s.id, { ...s } as any]));
    const targets: { id: string; updates: Record<string, string> }[] = [];
    for (const link of links) {
      for (const t of applyLinkToScenes(project.customCategories, [...working.values()], link)) {
        working.get(t.id)![link.linkedCategory] = t.updates[link.linkedCategory];
        targets.push(t);
      }
    }
    if (targets.length === 0) { setApplied(prev => ({ ...prev, [gid]: 0 })); return; }
    dispatch({ type: 'BATCH_START' });
    for (const t of targets) dispatch({ type: 'UPDATE_SCENE', payload: { id: t.id, ...t.updates } });
    dispatch({ type: 'BATCH_COMMIT' });
    setApplied(prev => ({ ...prev, [gid]: targets.length }));
  };

  const applyAll = () => {
    if (validLinkCount === 0) return;
    const links: Link[] = groups.flatMap(filledLinks);
    const working = new Map(project.scenes.map(s => [s.id, { ...s } as any]));
    const targets: { id: string; updates: Record<string, string> }[] = [];
    for (const link of links) {
      for (const t of applyLinkToScenes(project.customCategories, [...working.values()], link)) {
        working.get(t.id)![link.linkedCategory] = t.updates[link.linkedCategory];
        targets.push(t);
      }
    }
    if (targets.length === 0) return;
    dispatch({ type: 'BATCH_START' });
    for (const t of targets) dispatch({ type: 'UPDATE_SCENE', payload: { id: t.id, ...t.updates } });
    dispatch({ type: 'BATCH_COMMIT' });
    setAppliedAll(true);
  };

  const validLinkCount = groups.reduce((n, g) => n + filledLinks(g).length, 0);

  return (
    <Modal open onClose={onClose} title="Element Links" width="max-w-3xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Close</ModalFooterButton>
          <ModalFooterButton onClick={applyAll} disabled={validLinkCount === 0}>
            Apply All Links
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <p className="text-xs text-[color:var(--ui-text-muted)] leading-relaxed">
          Each card links one anchor to elements, crew people or locations. Only element→element links add values to scenes (crew and locations are associations).
          Removing a linked row never touches the anchor; removing the anchor removes its links as well.
        </p>

        {groups.map((g, gi) => {
          const anchorElements = elementsFor(g.category);
          const gComplete = !!g.anchorValue && g.links.some(l => l.linkedCategory && l.linkedValue);
          const appliedCount = applied[g.id];
          const linkCount = filledLinks(g).length;
          const anchorLabel = anchorDisplay(g);
          return (
            <CardSection
              key={g.id}
              dataProps={{ 'data-anchor-card': g.id }}
              icon={<Link2 className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)] shrink-0" />}
              title={anchorLabel ? <span className="truncate">{anchorLabel}</span> : <span className="text-[color:var(--ui-text-faint)] italic">Unset anchor</span>}
              count={`${linkCount} link${linkCount === 1 ? '' : 's'}`}
              collapsed={collapsedGroups.has(g.id)}
              onToggle={() => toggleCollapse(g.id)}
              trailing={
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => applyGroup(g.id)}
                    disabled={!gComplete}
                    title="Apply to existing scenes: add this card's linked elements to every scene that already contains the anchor"
                    aria-label="Apply linked elements to existing scenes"
                    className={`${ACTION_BTN} disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Apply
                  </button>
                  <button
                    onClick={() => removeGroup(g.id)}
                    title="Remove this anchor and all its links"
                    aria-label="Remove anchor card"
                    className={REMOVE_BTN}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            >
              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider px-1 mb-1.5 block">Anchor</span>
                  <ElementPickerRow
                    category={g.category}
                    elementValue={g.anchorValue}
                    onCategoryChange={(cat) => patchGroup(g.id, { category: cat, anchorValue: '' })}
                    onElementChange={(v) => patchGroup(g.id, { anchorValue: v })}
                    onCreateItem={(item) => ensureElement(g.category, item)}
                    allCategoryKeys={allCategoryKeys}
                    categoryLabelLookup={categoryLabelLookup}
                    customCategories={project.customCategories}
                    items={anchorElements}
                    mode="single"
                    openDropdown={openDropdown}
                    setOpenDropdown={setOpenDropdown}
                    idPrefix={`a${gi}`}
                    btnClass={ANCHOR_BTN}
                    anchoredKeys={anchoredByCategory.get(g.category)}
                  />
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider px-1 mb-1.5 block">Linked elements</span>
                  {g.links.map((l, li) => {
                    const linkedElements = elementsFor(l.linkedCategory);
                    return (
                      <LinkRow
                        key={l.id}
                        project={project}
                        category={l.linkedCategory}
                        value={l.linkedValue}
                        onCategoryChange={(cat) => patchLink(g.id, l.id, { linkedCategory: cat, linkedValue: '' })}
                        onChange={(v) => patchLink(g.id, l.id, { linkedValue: v })}
                        onCreateItem={(item) => ensureElement(l.linkedCategory, item)}
                        allCategoryKeys={linkedCategoryKeys}
                        categoryLabelLookup={categoryLabelLookup}
                        customCategories={project.customCategories}
                        items={linkedElements}
                        mode={isMultiValue(l.linkedCategory, project.customCategories) ? 'multi' : 'single'}
                        disabledCategoryKeys={usedCategories(g, l.id)}
                        openDropdown={openDropdown}
                        setOpenDropdown={setOpenDropdown}
                        idPrefix={`l${gi}-${li}`}
                        btnClass={BTN}
                        anchoredKeys={anchoredByCategory.get(l.linkedCategory)}
                        wrapValue
                        onRemove={() => removeLink(g.id, l.id)}
                        removeIcon={<X className="w-3.5 h-3.5" />}
                        removeBtnClass={REMOVE_BTN}
                      />
                    );
                  })}

                  <div className="flex items-center gap-3 mt-2">
                    {unusedCategory(g) !== null && (
                      <button onClick={() => addLink(g.id)} className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text)] transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Add Linked Element
                      </button>
                    )}
                    {appliedCount !== undefined && (
                      <span className="text-[10px] text-emerald-400">
                        {appliedCount === 0 ? 'No scenes contain this anchor yet' : `Applied: linked elements added to ${appliedCount} scene${appliedCount === 1 ? '' : 's'}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardSection>
          );
        })}

        <button onClick={addGroup} className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text)] transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Anchor
        </button>

        {appliedAll && (
          <p className="text-[10px] text-emerald-400">Applied all links to existing scenes.</p>
        )}
      </div>
    </Modal>
  );
}