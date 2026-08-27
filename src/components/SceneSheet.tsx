import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProject, DEFAULT_CATEGORY_LABELS, useIsCloudProject } from '../store';
import { Scene } from '../types';
import { ChevronLeft, ChevronRight, Plus, Copy, Trash2 } from 'lucide-react';
import { EntityDropdown } from './EntityDropdown';
import Button from './Button';
import SceneSheetFields from './SceneSheetFields';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { CellInput } from './CellInput';
import { parsePageCount, formatPageCount, generateUUID, formatDateLong } from '../lib/utils';
import { sceneStyle, getIntExtOptions, getDayNightOptions, getFallbackStripColors } from '../lib/ribbonUtils';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import { useLinkedEditGuard } from '../lib/useLinkedEditGuard';
import { anchoredKeysFor } from '../lib/elementLinks';

const BREAKDOWN_CATS = [
  'set', 'cast', 'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept', 'notes',
];
const BREAKDOWN_LABEL: Record<string, string> = {
  set: 'Set', cast: 'Cast', backgroundActors: 'Background Actors', stunts: 'Stunts', vehicles: 'Vehicles',
  props: 'Props', wardrobe: 'Wardrobe', makeup: 'Makeup & Hair',
  sfx: 'SFX', vfx: 'VFX', sound: 'Sound', music: 'Music',
  animalsAndWranglers: 'Animals & Wranglers', weapons: 'Weapons', greenery: 'Greenery', artDept: 'Art Dept', notes: 'Notes',
};

let persistedIndex = 0;

export function SceneSheet({ initialIndex, onIndexChange, headerTarget, onOpenSchedule, onOpenScheduleInPopout }: { initialIndex?: number; onIndexChange?: (idx: number) => void; headerTarget?: HTMLElement | null; onOpenSchedule?: (sceneId: string) => void; onOpenScheduleInPopout?: (sceneId: string) => void }) {
  const { state, dispatch, readOnly } = useProject();
  const isCloud = useIsCloudProject();
  const project = state.present;
  const scenes = project.scenes;
  const breakdownElements = project.breakdownElements || {};
  const castMembers = project.castMembers || [];

  const hiddenSet = useMemo(() => new Set(project.hiddenCategories || []), [project.hiddenCategories]);

  const allBreakdownCats = useMemo(() => [
    ...BREAKDOWN_CATS.filter(k => !hiddenSet.has(k)),
    ...(project.customCategories || []).map(c => c.key),
  ], [project.customCategories, hiddenSet]);

  const allBreakdownLabel = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const k of BREAKDOWN_CATS) labels[k] = project.categoryLabels?.[k] || DEFAULT_CATEGORY_LABELS[k] || BREAKDOWN_LABEL[k] || k;
    for (const c of project.customCategories || []) labels[c.key] = c.label;
    return labels;
  }, [project.customCategories, project.categoryLabels]);

  const [index, setIndex] = useState(() => Math.min(initialIndex ?? persistedIndex, Math.max(scenes.length - 1, 0)));
  useEffect(() => { persistedIndex = index; }, [index]);
  const [sheetInput, setSheetInput] = useState(String(index + 1));

  useEffect(() => {
    if (initialIndex !== undefined) {
      const idx = Math.min(initialIndex, Math.max(scenes.length - 1, 0));
      setIndex(idx);
      setSheetInput(String(idx + 1));
    }
  }, [initialIndex, scenes.length]);

  const [edits, setEdits] = useState<Record<string, Partial<Scene>>>({});
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const containerRef = useRef<HTMLDivElement>(null);

  const scene = scenes[index];
  const currentEdits = scene ? (edits[scene.id] || {}) : {};

  const linkGuard = useLinkedEditGuard(project.elementLinks, project.customCategories, dispatch);

  // Per-category anchor item keys — Anchor icons in the sheet's entity
  // dropdowns next to elements that anchor element links.
  const anchoredByCategory = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const cat of new Set((project.elementLinks || []).map(l => l.anchorCategory))) {
      map[cat] = anchoredKeysFor(project.elementLinks, cat);
    }
    return map;
  }, [project.elementLinks]);

  const { sceneToSection, sectionLabelMap, sectionDateMap } = useDaybreakSections();

  const sectionIdx = scene ? (sceneToSection.get(scene.id) ?? null) : null;
  const hasScheduleInfo = sectionIdx != null;

  const commitField = useCallback((sceneId: string, field: string, value: string) => {
    if (field === 'cast' || allBreakdownCats.includes(field)) {
      const isCast = field === 'cast';
      const existing = isCast ? castMembers : (breakdownElements[field] || []);
      const existingSet = new Set(existing.map((e: any) => (isCast ? e.id : e.name.toLowerCase())));
      const newItems = getFieldItems(field, value).filter(
        v => isCast ? !existingSet.has(v) : !existingSet.has(v.toLowerCase()),
      );
      for (const item of newItems) {
        const name = isCast ? (castMembers.find(m => m.id === item)?.name ?? '') : item;
        dispatch({ type: 'ADD_ELEMENT', payload: { category: field, element: { id: item, name } } });
      }
      const scene = scenes.find(s => s.id === sceneId);
      if (scene) void linkGuard.tryCommitSceneEdit(scene, { [field]: value });
      return;
    }
    if (field === 'pageCount') {
      if (value === '') {
        dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, pageCount: '', pageCountDecimal: 0 } });
        return;
      }
      const decimal = parsePageCount(value);
      dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, pageCount: formatPageCount(decimal), pageCountDecimal: decimal } });
      return;
    }
    let processed = value;
    if (field === 'scriptDay') processed = value.replace(/[^0-9]/g, '');
    if (field === 'set') processed = value.toUpperCase();
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, [field]: processed } });
  }, [dispatch, breakdownElements, castMembers, allBreakdownCats, scenes, linkGuard]);

  const commitFieldRef = useRef(commitField);
  commitFieldRef.current = commitField;

  const commitTextEdits = useCallback(() => {
    const e = editsRef.current;
    if (Object.keys(e).length === 0) return;
    for (const [id, edit] of Object.entries(e)) {
      if (!edit) continue;
      const rec = edit as Record<string, any>;
      for (const [field, val] of Object.entries(rec)) {
        if (val !== undefined && val !== '') {
          commitFieldRef.current(id, field, val);
        }
      }
    }
    setEdits({});
  }, []);

  const goTo = useCallback((n: number) => {
    commitTextEdits();
    const idx = Math.max(0, Math.min(scenes.length - 1, n));
    setIndex(idx); setSheetInput(String(idx + 1));
    onIndexChange?.(idx);
  }, [scenes.length, onIndexChange, commitTextEdits]);

  const update = useCallback((field: string, value: any) => {
    if (!scene || readOnly) return;
    setEdits(prev => {
      const existing = prev[scene.id] || {} as Partial<Scene>;
      return { ...prev, [scene.id]: { ...existing, [field]: value } };
    });
  }, [scene, readOnly]);

  const val = useCallback((field: string): any => {
    if (!scene) return '';
    const cur = (currentEdits as any)[field];
    return cur !== undefined ? cur : (scene as any)[field] || '';
  }, [scene, currentEdits]);

  const createNewScene = useCallback(() => {
    commitTextEdits();
    const newId = generateUUID();
    dispatch({
      type: 'ADD_SCENE',
      payload: {
        id: newId,
        sceneNumber: '',
        pageCount: '',
        pageCountDecimal: 0,
        scriptDay: '',
        intExt: '' as any,
        set: '',
        dayNight: '' as any,
        description: '',
        cast: '',
        notes: '',
        backgroundActors: '',
        stunts: '',
        vehicles: '',
        props: '',
        wardrobe: '',
        makeup: '',
        sfx: '',
        vfx: '',
        sound: '',
        music: '',
        animalsAndWranglers: '',
        weapons: '',
        greenery: '',
        artDept: '',
      }
    });
    const newIdx = scenes.length;
    setIndex(newIdx);
    setSheetInput(String(newIdx + 1));
    onIndexChange?.(newIdx);
  }, [dispatch, scenes.length, onIndexChange, commitTextEdits]);

  const duplicateScene = useCallback(() => {
    if (!scene) return;
    commitTextEdits();
    const dup: Scene = { ...scene, id: generateUUID() };
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index: index + 1, scene: dup } });
    const newIdx = index + 1;
    setIndex(newIdx);
    setSheetInput(String(newIdx + 1));
    onIndexChange?.(newIdx);
  }, [scene, index, dispatch, onIndexChange, commitTextEdits]);

  const deleteCurrentScene = useCallback(() => {
    if (!scene) return;
    setEdits({});
    dispatch({ type: 'DELETE_SCENE', payload: scene.id });
    const newLen = scenes.length - 1;
    const newIdx = Math.min(index, Math.max(0, newLen - 1));
    setIndex(newIdx);
    setSheetInput(String(newIdx + 1));
    onIndexChange?.(newIdx);
  }, [scene, index, dispatch, scenes.length, onIndexChange]);

  const breakdownItems = useMemo(() => {
    const result: Record<string, { id: string; name: string }[]> = {};
    for (const cat of allBreakdownCats) {
      if (cat === 'notes') continue;
      const isCast = cat === 'cast';
      const stored: { id: string; name: string }[] = isCast ? castMembers : (breakdownElements[cat] || []);
      const nameMap = new Map(stored.map(e => [isCast ? (e.id || e.name).toLowerCase() : e.name.toLowerCase(), e]));
      const items: { id: string; name: string }[] = [];
      const addItem = (iid: string, iname: string) => {
        const k = (iid || iname).toLowerCase();
        if (items.some(i => (i.id || i.name).toLowerCase() === k)) return;
        if (isCast) {
          const nameIdx = items.findIndex(i => i.name.toLowerCase() === iname.toLowerCase());
          if (nameIdx >= 0) {
            if (!items[nameIdx].id && iid) items[nameIdx] = { id: iid, name: iname };
            return;
          }
        }
        items.push({ id: iid, name: iname });
      };
      for (const e of stored) addItem(e.id || e.name, e.name);
      for (const s of scenes) {
        const raw = isCast ? s.cast : (s as any)[cat] || '';
        for (const v of getFieldItems(cat, raw)) {
          const matched = nameMap.get(v.toLowerCase()); addItem(matched?.id || v, matched?.name || v);
        }
      }
      if (scene) {
        const ev = (edits[scene.id] as Record<string, any>)?.[cat];
        if (ev) for (const v of getFieldItems(cat, ev)) { const matched = nameMap.get(v.toLowerCase()); addItem(matched?.id || v, matched?.name || v); }
      }
      result[cat] = items;
    }
    return result;
  }, [scenes, breakdownElements, castMembers, edits, scene]);

  const setItems = useMemo(() => {
    const sets = new Map<string, string>();
    for (const s of scenes) { const v = s.set.trim().toUpperCase(); if (v) sets.set(v, v); }
    (breakdownElements['set'] || []).forEach(e => { const v = e.name.toUpperCase(); if (v) sets.set(v, v); });
    return [...sets.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
  }, [scenes, breakdownElements]);

  const blurOnEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } };

  useEffect(() => {
    return () => commitTextEdits();
  }, []);

  const inputCls = "w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent";

  if (scenes.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50 gap-4">
      <p className="text-sm text-zinc-500">No scenes defined yet.</p>
      <button
        onClick={createNewScene}
        disabled={readOnly}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-4 h-4" />
        Create First Scene
      </button>
    </div>
  );

  const navBar = scenes.length > 0 ? (
    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm">
      <div className="flex items-center gap-2.5">
        <button onClick={() => goTo(index - 1)} disabled={index === 0} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronLeft className="w-4 h-4 text-zinc-600" /></button>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-zinc-400">Sheet</span>
          <input type="text" value={sheetInput} onChange={e => setSheetInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(sheetInput, 10); if (n >= 1 && n <= scenes.length) goTo(n - 1); } }} className="w-12 text-center border border-zinc-200 rounded-md px-1 py-0.5 text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900" />
          <span className="text-zinc-400">of {scenes.length}</span>
        </div>
        <button onClick={() => goTo(index + 1)} disabled={index >= scenes.length - 1} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4 text-zinc-600" /></button>
        <div className="w-px h-5 bg-zinc-200 mx-1" />
        <Button onClick={createNewScene} disabled={readOnly} title="New Scene Sheet">
          <Plus className="w-3.5 h-3.5" />
          New
        </Button>
        <Button onClick={duplicateScene} disabled={readOnly} title="Duplicate Scene Sheet">
          <Copy className="w-3.5 h-3.5" />
          Duplicate
        </Button>
      </div>
      <Button variant="danger-ghost" onClick={deleteCurrentScene} disabled={readOnly} title="Delete Scene Sheet">
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </Button>
    </div>
  ) : null;

  const headerContent = scenes.length > 0 ? (
    <>
      <button onClick={() => goTo(index - 1)} disabled={index === 0} className="p-1 rounded hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronLeft className="w-4 h-4 text-zinc-500" /></button>
      <span className="text-[11px] text-zinc-500">Sheet</span>
      <input type="text" value={sheetInput} onChange={e => setSheetInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(sheetInput, 10); if (n >= 1 && n <= scenes.length) goTo(n - 1); } }} className="w-10 text-center border border-zinc-200 rounded px-1 py-0.5 text-[11px] font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900" />
      <span className="text-[11px] text-zinc-500">of {scenes.length}</span>
      <button onClick={() => goTo(index + 1)} disabled={index >= scenes.length - 1} className="p-1 rounded hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4 text-zinc-500" /></button>
      <div className="w-px h-4 bg-zinc-300 mx-1.5" />
      <Button variant="primary" cloud={isCloud} onClick={createNewScene} disabled={readOnly}>
        <Plus className="w-3 h-3" /> New
      </Button>
      <Button onClick={duplicateScene} disabled={readOnly}>
        <Copy className="w-3 h-3" /> Duplicate
      </Button>
      <Button variant="danger-ghost" onClick={deleteCurrentScene} disabled={readOnly}>
        <Trash2 className="w-3 h-3" /> Delete
      </Button>
    </>
  ) : null;

  return (
    <div ref={containerRef} className="flex-1 flex flex-col h-full bg-zinc-100 overflow-y-auto" style={{ paddingBottom: 'calc(160px + env(safe-area-inset-bottom, 0px))' }}>
      {headerTarget && headerContent ? createPortal(headerContent, headerTarget) : null}

      {scene && (() => {
        const colors = sceneStyle(scene, project.colorPalette?.sceneColors, getFallbackStripColors(project.colorPalette), project.colorPalette?.colorRules);
        return (
          <div
            className="sticky top-0 z-10 shrink-0 w-full flex items-center gap-3 px-4 py-1.5 cursor-pointer select-none"
            style={{ background: colors.background, color: colors.color }}
            onClick={(e) => { if (e.shiftKey && onOpenScheduleInPopout) { onOpenScheduleInPopout(scene.id); } else { onOpenSchedule?.(scene.id); } }}
            title={onOpenScheduleInPopout ? 'Click to open in Schedule · Shift+Click to open in new window' : 'Click to open in Schedule'}
          >
            {hasScheduleInfo ? (
              <>
                <span className="font-bold text-sm whitespace-nowrap">{sectionLabelMap.get(sectionIdx!) ?? `Day ${sectionIdx! + 1}`}</span>
                <span className="flex-1 text-center text-xs font-semibold opacity-80">
                  Date: {sectionDateMap.get(sectionIdx!) ? formatDateLong(sectionDateMap.get(sectionIdx!)!) : ''}
                </span>
              </>
            ) : (
              <span className="text-center text-xs font-semibold opacity-80 w-full">Unscheduled</span>
            )}
          </div>
        );
      })()}

      <div className="max-w-4xl mx-auto w-full flex flex-col px-4 py-3 gap-3">
        {!headerTarget && navBar}

        <SceneSheetFields
          scene={scene}
          val={val}
          update={update}
          commitField={commitField}
          commitTextEdits={commitTextEdits}
          readOnly={readOnly}
          inputCls={inputCls}
          blurOnEnter={blurOnEnter}
          setItems={setItems}
          breakdownItems={breakdownItems}
          allBreakdownCats={allBreakdownCats}
          allBreakdownLabel={allBreakdownLabel}
          palette={project.colorPalette}
          customCategories={project.customCategories}
          anchoredByCategory={anchoredByCategory}
          sheetNumber={index + 1}
        />

        {/* Notes */}
      </div>
    </div>
  );
}
