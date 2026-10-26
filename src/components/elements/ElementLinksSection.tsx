import React, { useMemo, useState } from 'react';
import { useProject } from '../../store';
import { ELEMENT_CATEGORIES, getFieldItems, getLabel, isMultiValue } from '../../lib/categories';
import { elementMatchId, getCategoryElements } from '../../lib/elements';
import { applyLinkToScenes, isLinkableCategory } from '../../lib/elementLinks';
import { dedupeLinks, getElementIncomingLinks, getElementOutgoingLinks, isPropagationLink, makeLink } from '../../lib/links';
import type { Link } from '../../types';
import { CardSection } from '@gabriel/ui-kit';
import { Check, Link2, MapPin, Plus, Users, X } from 'lucide-react';
import { ElementPickerRow } from '../rules/ElementPicker';
import { useQueueCastNaming, addNewElement } from '../../lib/newCastNaming';
import GroupedSelect from '../production/day/GroupedSelect';
import { resolvedLocationName, typeLabelOf } from '../../lib/locations';
import { ElementCrewLinksSection } from '../crew/ElementCrewLinksSection';

/**
 * Element View → Links (roadmap 308). ONE place for everything linked to the
 * selected element: element rules (editable + Apply to scenes), crew attached
 * (editable), locations (editable) and "Pulled in by" (read-only). Only
 * element→element rows propagate into scenes; the rest are associations.
 */

const BTN = 'px-2 py-1.5 text-xs';
const ICON_BTN = 'p-1.5 rounded-md transition-colors shrink-0';
const REMOVE_BTN = `${ICON_BTN} text-zinc-600 hover:text-red-400 hover:bg-zinc-800`;
const ACTION_BTN = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 border border-zinc-700 rounded-md hover:bg-zinc-800 hover:text-white transition-colors shrink-0';

const SECTION_LABEL = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1.5 block';

interface LinkRowDraft {
  id: string;
  category: string;
  value: string;
}

export function ElementLinksSection({ category, elementKey: selectedKey, onSelectElement }: {
  category: string;
  elementKey: string;
  onSelectElement?: (key: string) => void;
}) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const { queue } = useQueueCastNaming();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [crewCollapsed, setCrewCollapsed] = useState(false);

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
  const crewOut = outgoing.filter(l => l.linkedKind === 'crew');
  const locationOut = outgoing.filter(l => l.linkedKind === 'location');

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

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const anchoredByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of links) {
      if (!isPropagationLink(l) || !l.anchorCategory) continue;
      let set = map.get(l.anchorCategory);
      if (!set) { set = new Set(); map.set(l.anchorCategory, set); }
      set.add(l.anchorValue);
    }
    return map;
  }, [links]);

  const elementsFor = (cat: string) => getCategoryElements(project, cat);

  /** One editable row per linked category (comma list, like the Link Manager). */
  const rows = useMemo<LinkRowDraft[]>(() => {
    const byCat = new Map<string, LinkRowDraft>();
    for (const l of elementOut) {
      const cat = l.linkedCategory as string;
      const row = byCat.get(cat);
      if (!row) {
        byCat.set(cat, { id: l.id, category: cat, value: l.linkedValue });
      } else {
        const items = getFieldItems(cat, row.value);
        if (!items.some(v => cat === 'cast' ? v === l.linkedValue : v.toLowerCase() === l.linkedValue.toLowerCase())) {
          row.value = [...items, l.linkedValue].join(', ');
        }
      }
    }
    return [...byCat.values()];
  }, [elementOut]);

  /** Persist the element rows, keeping this element's crew/location rows. */
  const commitRows = (next: LinkRowDraft[]) => {
    const kept = links.filter(l => !(l.anchorKind === 'element' && l.anchorCategory === category &&
      (category === 'cast' ? l.anchorValue === selectedKey : l.anchorValue.toLowerCase() === selectedKey.toLowerCase()) &&
      isPropagationLink(l)));
    const built: Link[] = [];
    for (const row of next) {
      if (!row.category || !row.value) continue;
      for (const value of getFieldItems(row.category, row.value)) {
        built.push(makeLink('element', category, selectedKey, 'element', row.category, value));
      }
    }
    dispatch({ type: 'UPDATE_PROJECT', payload: { links: dedupeLinks([...kept, ...built]) } });
    setApplied(null);
  };

  const patchRow = (id: string, patch: Partial<LinkRowDraft>) =>
    commitRows(rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRow = () => {
    const used = new Set(rows.map(r => r.category));
    const next = allCategoryKeys.find(k => !used.has(k.key) && k.key !== 'set');
    if (!next) return;
    commitRows([...rows, { id: `${Date.now()}`, category: next.key, value: '' }]);
  };

  const unusedCategory = (): string | null => {
    const used = new Set(rows.map(r => r.category));
    return allCategoryKeys.find(k => !used.has(k.key) && k.key !== 'set')?.key || null;
  };

  const ensureElement = (cat: string, item: string) => {
    if (!cat || !item) return;
    addNewElement(dispatch, queue, cat, item);
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

  // ---- locations -----------------------------------------------------------
  const locationItems = useMemo(() => (project.locations || []).map(l => ({
    id: l.id,
    name: resolvedLocationName(l.name, l.address, l.place, l.lat, l.lng),
    group: typeLabelOf(l, project.locationTypes || []),
  })), [project.locations, project.locationTypes]);
  const selectedLocationIds = locationOut.map(l => l.linkedValue);

  const setLocations = (ids: string[]) => {
    const kept = links.filter(l => !(l.anchorKind === 'element' && l.anchorCategory === category &&
      (category === 'cast' ? l.anchorValue === selectedKey : l.anchorValue.toLowerCase() === selectedKey.toLowerCase()) &&
      l.linkedKind === 'location'));
    const built = ids.map(id => makeLink('element', category, selectedKey, 'location', undefined, id));
    dispatch({ type: 'UPDATE_PROJECT', payload: { links: dedupeLinks([...kept, ...built]) } });
  };

  // ---- incoming labels -----------------------------------------------------
  const anchorLabel = (link: Link): string => {
    if (link.anchorKind === 'crew') {
      for (const role of project.crewRoles || []) {
        const p = (project.crew?.[role.key] || []).find(x => x.id === link.anchorValue);
        if (p) return `${role.label} — ${p.name || p.id}`;
      }
      return link.anchorValue;
    }
    if (link.anchorKind === 'element' && link.anchorCategory) {
      const el = elementsFor(link.anchorCategory).find(e =>
        elementMatchId(e, link.anchorCategory!).toLowerCase() === link.anchorValue.toLowerCase());
      if (!el) return link.anchorValue;
      return link.anchorCategory === 'cast' ? `${el.id}. ${el.name}` : (el.name || el.id);
    }
    return link.anchorValue;
  };

  const thisElement = elementsFor(category).find(e => elementMatchId(e, category).toLowerCase() === selectedKey.toLowerCase());
  const thisLabel = thisElement
    ? (category === 'cast' ? `${thisElement.id}. ${thisElement.name}` : (thisElement.name || thisElement.id))
    : selectedKey;

  return (
    <div className="p-6 space-y-5">
      {/* Element rules */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={SECTION_LABEL}>Linked elements</span>
          <button
            onClick={applyToScenes}
            disabled={elementOut.length === 0}
            title="Add these linked elements to every scene that already contains the anchor"
            className={`${ACTION_BTN} disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Check className="w-3.5 h-3.5" /> Apply to scenes
          </button>
        </div>
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <ElementPickerRow
              key={row.id}
              category={row.category}
              elementValue={row.value}
              onCategoryChange={cat => patchRow(row.id, { category: cat, value: '' })}
              onElementChange={v => patchRow(row.id, { value: v })}
              onCreateItem={item => ensureElement(row.category, item)}
              allCategoryKeys={allCategoryKeys.filter(k => k.key !== 'set')}
              categoryLabelLookup={categoryLabelLookup}
              customCategories={project.customCategories}
              items={elementsFor(row.category)}
              mode={isMultiValue(row.category, project.customCategories) ? 'multi' : 'single'}
              openDropdown={openDropdown}
              setOpenDropdown={setOpenDropdown}
              idPrefix={`ev${i}`}
              btnClass={BTN}
              anchoredKeys={anchoredByCategory.get(row.category)}
              wrapValue
              onRemove={() => commitRows(rows.filter(r => r.id !== row.id))}
              removeIcon={<X className="w-3.5 h-3.5" />}
              removeBtnClass={REMOVE_BTN}
            />
          ))}
        </div>
        {unusedCategory() !== null && (
          <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors mt-2">
            <Plus className="w-3.5 h-3.5" /> Add linked element
          </button>
        )}
        {applied !== null && (
          <p className="text-[10px] text-emerald-400 mt-2">
            {applied === 0 ? 'No scenes contain this element yet' : `Linked elements added to ${applied} scene${applied === 1 ? '' : 's'}`}
          </p>
        )}
      </div>

      {/* Crew */}
      <CardSection
        icon={<Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
        title="Crew attached"
        count={`${crewOut.length}`}
        collapsed={crewCollapsed}
        onToggle={() => setCrewCollapsed(v => !v)}
      >
        <ElementCrewLinksSection category={category} elementKey={selectedKey} elementName={thisLabel} bare />
      </CardSection>

      {/* Locations */}
      <div>
        <span className={SECTION_LABEL}>
          <MapPin className="w-3 h-3 inline mr-1 -mt-0.5" />
          Locations
        </span>
        <GroupedSelect
          items={locationItems}
          mode="multi"
          selectedIds={selectedLocationIds}
          placeholder="Link this element to locations…"
          onChange={setLocations}
        />
        <p className="text-[10px] text-zinc-500 mt-1">
          A set's linked locations appear as suggestions in the day's location pickers.
        </p>
      </div>

      {/* Incoming */}
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
