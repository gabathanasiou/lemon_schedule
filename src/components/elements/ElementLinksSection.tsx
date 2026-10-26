import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { ELEMENT_CATEGORIES, getLabel, isMultiValue } from '../../lib/categories';
import { elementMatchId, getCategoryElements } from '../../lib/elements';
import { applyLinkToScenes, isLinkableCategory } from '../../lib/elementLinks';
import { dedupeLinks, getElementIncomingLinks, getElementOutgoingLinks, isPropagationLink } from '../../lib/links';
import { CREW_TARGET, LOCATION_TARGET, draftRowsFromLinks, flattenLinkRows, type LinkDraftRow } from '../../lib/linkDrafts';
import type { Link, ProjectElement } from '../../types';
import { CardSection } from '@gabriel/ui-kit';
import { Check, Link2, Plus, X } from 'lucide-react';
import { LinkRow } from './LinkRow';
import { useQueueCastNaming, addNewElement } from '../../lib/newCastNaming';

/**
 * Element View → Links (roadmap 308). SAME row UI as the Link Manager anchor
 * card (CategoryDropdown + EntityDropdown chip) — the only difference is that
 * the anchor is fixed to the selected element and there is no "Add Anchor".
 * Rows can target element categories, **Crew** and **Locations**; only
 * element→element rows propagate into scenes.
 */

const BTN = 'px-2 py-1.5 text-xs';
const ICON_BTN = 'p-1.5 rounded-md transition-colors shrink-0';
const REMOVE_BTN = `${ICON_BTN} text-zinc-600 hover:text-red-400 hover:bg-zinc-800`;
const ACTION_BTN = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 border border-zinc-700 rounded-md hover:bg-zinc-800 hover:text-white transition-colors shrink-0';
const SECTION_LABEL = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1.5 block';

export function ElementLinksSection({ category, elementKey: selectedKey, onSelectElement }: {
  category: string;
  elementKey: string;
  onSelectElement?: (key: string) => void;
}) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const { queue } = useQueueCastNaming();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  const links = project.links || [];
  const outgoing = useMemo(
    () => getElementOutgoingLinks(links, category, selectedKey),
    [links, category, selectedKey],
  );
  const incoming = useMemo(
    () => getElementIncomingLinks(links, category, selectedKey),
    [links, category, selectedKey],
  );
  const elementOut = outgoing.filter(isPropagationLink);

  // Draft rows stay local so an EMPTY new row survives until it has a value
  // (the old derived-from-store version dropped it instantly — the add button
  // looked dead). The panel remounts this section per element (`key`).
  const [rows, setRows] = useState<LinkDraftRow[]>(() => draftRowsFromLinks(links, category, selectedKey));

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    for (const c of ELEMENT_CATEGORIES) {
      if (c.key !== 'set' && isLinkableCategory(c.key, project.customCategories)) keys.push({ key: c.key, isCustom: false });
    }
    for (const c of project.customCategories || []) {
      if (c.key !== 'set' && isLinkableCategory(c.key, project.customCategories)) keys.push({ key: c.key, isCustom: true });
    }
    keys.push({ key: CREW_TARGET, isCustom: false }, { key: LOCATION_TARGET, isCustom: false });
    return keys;
  }, [project.customCategories]);

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = { crew: 'Crew', location: 'Locations' };
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const people = useMemo<ProjectElement[]>(() => {
    const out: ProjectElement[] = [];
    for (const role of project.crewRoles || []) {
      for (const p of project.crew?.[role.key] || []) out.push({ id: p.id, name: p.name });
    }
    return out;
  }, [project.crewRoles, project.crew]);

  const locations = useMemo<ProjectElement[]>(
    () => (project.locations || []).map(l => ({ id: l.id, name: l.name })),
    [project.locations],
  );

  const itemsFor = (linkedCategory: string): ProjectElement[] => {
    if (linkedCategory === CREW_TARGET) return people;
    if (linkedCategory === LOCATION_TARGET) return locations;
    return getCategoryElements(project, linkedCategory);
  };

  /** Persist the draft rows, keeping every link not owned by this element. */
  const commit = (next: LinkDraftRow[]) => {
    setRows(next);
    const kept = links.filter(l => !(l.anchorKind === 'element' && l.anchorCategory === category &&
      (category === 'cast' ? l.anchorValue === selectedKey : l.anchorValue.toLowerCase() === selectedKey.toLowerCase())));
    dispatch({
      type: 'UPDATE_PROJECT',
      payload: { links: dedupeLinks([...kept, ...flattenLinkRows(category, selectedKey, next)]) },
    });
    setApplied(null);
  };

  const patchRow = (id: string, patch: Partial<LinkDraftRow>) =>
    commit(rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRow = () => {
    const used = new Set(rows.map(r => r.linkedCategory));
    const next = allCategoryKeys.find(k => !used.has(k.key));
    if (!next) return;
    setRows([...rows, { id: `row-${Date.now()}`, linkedCategory: next.key, linkedValue: '' }]);
  };

  const ensureElement = (linkedCategory: string, item: string) => {
    if (!item || isSyntheticCategory(linkedCategory)) return;
    addNewElement(dispatch, queue, linkedCategory, item);
  };

  const applyToScenes = () => {
    if (elementOut.length === 0) return;
    const working = new Map(project.scenes.map(s => [s.id, { ...s } as any]));
    const targets: { id: string; updates: Record<string, string> }[] = [];
    for (const link of elementOut) {
      for (const t of applyLinkToScenes(project.customCategories, [...working.values()], link)) {
        working.get(t.id)![link.linkedCategory as string] = t.updates[link.linkedCategory as string];
        targets.push(t);
      }
    }
    if (targets.length === 0) { setApplied(0); return; }
    dispatch({ type: 'BATCH_START' });
    for (const t of targets) dispatch({ type: 'UPDATE_SCENE', payload: { id: t.id, ...t.updates } });
    dispatch({ type: 'BATCH_COMMIT' });
    setApplied(targets.length);
  };

  const anchorLabel = (link: Link): string => {
    if (link.anchorKind === 'crew') {
      for (const role of project.crewRoles || []) {
        const p = (project.crew?.[role.key] || []).find(x => x.id === link.anchorValue);
        if (p) return `${role.label} — ${p.name || p.id}`;
      }
      return link.anchorValue;
    }
    if (link.anchorKind === 'element' && link.anchorCategory) {
      const el = getCategoryElements(project, link.anchorCategory).find(e =>
        elementMatchId(e, link.anchorCategory!).toLowerCase() === link.anchorValue.toLowerCase());
      if (!el) return link.anchorValue;
      return link.anchorCategory === 'cast' ? `${el.id}. ${el.name}` : (el.name || el.id);
    }
    return link.anchorValue;
  };

  const thisElement = getCategoryElements(project, category).find(e =>
    elementMatchId(e, category).toLowerCase() === selectedKey.toLowerCase());
  const thisLabel = thisElement
    ? (category === 'cast' ? `${thisElement.id}. ${thisElement.name}` : (thisElement.name || thisElement.id))
    : selectedKey;
  const linkCount = rows.filter(r => r.linkedValue.trim()).length;

  return (
    <div className="p-6 space-y-5">
      <CardSection
        icon={<Link2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
        title={<span className="truncate">{thisLabel}</span>}
        count={`${linkCount} link${linkCount === 1 ? '' : 's'}`}
        collapsed={collapsed}
        onToggle={() => setCollapsed(v => !v)}
        trailing={
          <button
            onClick={applyToScenes}
            disabled={elementOut.length === 0}
            title="Apply to existing scenes: add this card's linked elements to every scene that already contains the anchor"
            className={`${ACTION_BTN} disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Check className="w-3.5 h-3.5" /> Apply
          </button>
        }
      >
        <div className="space-y-2 pt-1">
          {rows.map((row, i) => (
            <LinkRow
              key={row.id}
              project={project}
              category={row.linkedCategory}
              value={row.linkedValue}
              onCategoryChange={cat => patchRow(row.id, { linkedCategory: cat, linkedValue: '' })}
              onChange={v => patchRow(row.id, { linkedValue: v })}
              onCreateItem={item => ensureElement(row.linkedCategory, item)}
              allCategoryKeys={allCategoryKeys}
              categoryLabelLookup={categoryLabelLookup}
              customCategories={project.customCategories}
              items={itemsFor(row.linkedCategory)}
              mode={isMultiValue(row.linkedCategory, project.customCategories) ? 'multi' : 'single'}
              disabledCategoryKeys={new Set(rows.filter(r => r.id !== row.id).map(r => r.linkedCategory))}
              openDropdown={openDropdown}
              setOpenDropdown={setOpenDropdown}
              idPrefix={`ev-${i}`}
              btnClass={BTN}
              wrapValue
              placeholder={isSyntheticCategory(row.linkedCategory) ? 'Select…' : 'Select element…'}
              onRemove={() => commit(rows.filter(r => r.id !== row.id))}
              removeIcon={<X className="w-3.5 h-3.5" />}
              removeBtnClass={REMOVE_BTN}
            />
          ))}

          <div className="flex items-center gap-3 mt-2">
            {allCategoryKeys.some(k => !rows.some(r => r.linkedCategory === k.key)) && (
              <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add linked element
              </button>
            )}
            {applied !== null && (
              <span className="text-[10px] text-emerald-400">
                {applied === 0 ? 'No scenes contain this element yet' : `Linked elements added to ${applied} scene${applied === 1 ? '' : 's'}`}
              </span>
            )}
          </div>
        </div>
      </CardSection>

      <div>
        <span className={SECTION_LABEL}>Pulled in by</span>
        {incoming.length === 0 ? (
          <p className="text-xs text-zinc-500 italic">No element links point at {thisLabel}.</p>
        ) : (
          <div className="space-y-1">
            {incoming.map(l => {
              const label = anchorLabel(l);
              const canJump = l.anchorKind === 'element' && l.anchorCategory === category && onSelectElement;
              return (
                <div key={l.id} className="flex items-center gap-2 text-xs text-zinc-300">
                  <Link2 className="w-3 h-3 text-zinc-500 shrink-0" />
                  {canJump ? (
                    <button type="button" className="truncate hover:text-white underline-offset-2 hover:underline" onClick={() => onSelectElement!(l.anchorValue)}>
                      {label}
                    </button>
                  ) : (
                    <span className="truncate">{label}</span>
                  )}
                  <span className="text-zinc-500">({categoryLabelLookup[l.anchorCategory || ''] || l.anchorCategory})</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function isSyntheticCategory(category: string): boolean {
  return category === CREW_TARGET || category === LOCATION_TARGET;
}
