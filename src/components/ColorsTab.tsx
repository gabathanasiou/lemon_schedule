import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../store';
import { SceneColorEntry, SceneColorPalette, ColorRule } from '../types';
import { INT_EXT_OPTIONS, DAY_NIGHT_OPTIONS, DEFAULT_COLOR_PALETTE, getFallbackStripColors, getIntExtOptions, getDayNightOptions } from '../lib/ribbonUtils';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../lib/categories';
import { IS_COARSE } from '../lib/device';
import { RotateCcw, Download, Upload, Palette, Sun, Plus, X, GripVertical, Wand2, Check, ChevronDown, Copy } from 'lucide-react';
import Modal from './Modal';
import ColorField from './ColorField';
import { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import DropdownMenu from './DropdownMenu';
import Button from './Button';
import DropdownItem from './DropdownItem';
import { ColorRuleEditModal } from './ColorRuleEditModal';
import { findEntry, clonePalette, updateSceneColor } from '../lib/paletteOps';
import ColorRuleCard from './ColorRuleCard';

interface EditState {
  label: string;
  bg: string;
  text: string;
  commit: (bg: string, text: string) => void;
  resetDefaults: () => { bg: string; text: string };
}

export const ColorsTab: React.FC<{ headerTarget?: HTMLElement | null }> = ({ headerTarget }) => {
  const { state, dispatch } = useProject();
  const palette = state.present.colorPalette || DEFAULT_COLOR_PALETTE;
  const ieOptions = getIntExtOptions(palette);
  const dnOptions = getDayNightOptions(palette);
  const importRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editBg, setEditBg] = useState('');
  const [editText, setEditText] = useState('');
  const [editingHeader, setEditingHeader] = useState<{ type: 'ie' | 'dn'; idx: number } | null>(null);
  const [headerText, setHeaderText] = useState('');
  const needsScroll = useRef(false);

  const [editRule, setEditRule] = useState<ColorRule | null | undefined>(undefined);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const colorRules = palette.colorRules || [];

  useEffect(() => {
    if (!editingHeader || !needsScroll.current) return;
    needsScroll.current = false;
    const raf = requestAnimationFrame(() => {
      const input = document.querySelector('input[autoFocus]') as HTMLElement;
      if (input) input.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [editingHeader]);

  const LBL = IS_COARSE ? 'text-xs font-bold py-1' : 'text-[9px] font-bold';
  const INP = IS_COARSE ? 'text-xs px-2 py-1 w-24' : 'text-[9px] px-2 py-0.5 w-20';
  const XSZ = IS_COARSE ? 'w-5 h-5' : 'w-4 h-4';
  const ADD = IS_COARSE ? 'text-xs gap-1.5 py-1' : 'text-[9px] gap-1';
  const CELL = IS_COARSE ? 'text-[10px]' : 'text-[9px]';
  const SEC_ICO = IS_COARSE ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const SEC_TXT = IS_COARSE ? 'text-xs' : 'text-[10px]';
  const GAP = IS_COARSE ? 'gap-2' : 'gap-1';

  const openEditor = (label: string, bg: string, text: string, commit: (bg: string, text: string) => void, resetDefaults: () => { bg: string; text: string }) => {
    setEditBg(bg);
    setEditText(text);
    setEditing({ label, bg, text, commit, resetDefaults });
  };

  const applyEdit = () => {
    if (!editing) return;
    editing.commit(editBg, editText);
    setEditing(null);
  };

  const sceneColor = useMemo(() => {
    const map = new Map<string, SceneColorEntry>();
    for (const e of palette.sceneColors) {
      map.set(`${e.intExt.toUpperCase()}|${e.dayNight.toUpperCase()}`, e);
    }
    return (intExt: string, dayNight: string): SceneColorEntry => {
      const key = `${intExt.toUpperCase()}|${dayNight.toUpperCase()}`;
      const found = map.get(key);
      return found || { intExt, dayNight, background: '#ffffff', text: '#000000' };
    };
  }, [palette.sceneColors]);

  const handleCellEdit = (intExt: string, dayNight: string, bg: string, text: string) => {
    dispatch({ type: 'SET_COLOR_PALETTE', payload: updateSceneColor(palette, intExt, dayNight, bg, text) });
  };

  const handleMetaChange = (patch: Partial<SceneColorPalette>) => {
    dispatch({ type: 'SET_COLOR_PALETTE', payload: { ...palette, ...patch } });
  };

  const handleReset = () => {
    const mergedIE = [...new Set([...INT_EXT_OPTIONS, ...ieOptions])];
    const mergedDN = [...new Set([...DAY_NIGHT_OPTIONS, ...dnOptions])];
    const defaultSceneColors = (() => {
      const entries: SceneColorEntry[] = [];
      for (const ie of mergedIE) {
        for (const dn of mergedDN) {
          const key = `${ie}|${dn}`;
          const existing = palette.sceneColors.find(e => e.intExt === ie && e.dayNight === dn);
          const isDefaultIE = INT_EXT_OPTIONS.includes(ie);
          const isDefaultDN = DAY_NIGHT_OPTIONS.includes(dn);
          if (isDefaultIE && isDefaultDN) {
            const fb = DEFAULT_COLOR_PALETTE.sceneColors.find(e => e.intExt === ie && e.dayNight === dn);
            entries.push(fb ? { ...fb } : { intExt: ie, dayNight: dn, background: '#ffffff', text: '#000000' });
          } else if (existing) {
            entries.push({ ...existing });
          } else {
            entries.push({ intExt: ie, dayNight: dn, background: '#ffffff', text: '#000000' });
          }
        }
      }
      return entries;
    })();
    dispatch({ type: 'SET_COLOR_PALETTE', payload: {
      intExtOptions: mergedIE,
      dayNightOptions: mergedDN,
      sceneColors: defaultSceneColors,
      colorRules: palette.colorRules,
      selectedStripBg: DEFAULT_COLOR_PALETTE.selectedStripBg,
      selectedStripText: DEFAULT_COLOR_PALETTE.selectedStripText,
      dayHeaderBg: DEFAULT_COLOR_PALETTE.dayHeaderBg,
      dayHeaderText: DEFAULT_COLOR_PALETTE.dayHeaderText,
      dayFooterBg: DEFAULT_COLOR_PALETTE.dayFooterBg,
      dayFooterText: DEFAULT_COLOR_PALETTE.dayFooterText,
      noteBg: DEFAULT_COLOR_PALETTE.noteBg,
      noteText: DEFAULT_COLOR_PALETTE.noteText,
      fallbackStripBg: DEFAULT_COLOR_PALETTE.fallbackStripBg,
      fallbackStripText: DEFAULT_COLOR_PALETTE.fallbackStripText,
    }});
  };

  const handleExport = () => {
    const data = JSON.stringify(palette, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.present.title || 'SceneColors'}_palette.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDropdownOpen(false);
  };


  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.sceneColors || !Array.isArray(data.sceneColors)) {
          alert('Invalid palette file: missing sceneColors array.');
          return;
        }
        const imported: SceneColorPalette = {
          intExtOptions: (data.intExtOptions || INT_EXT_OPTIONS).map((s: string) => s.toUpperCase()),
          dayNightOptions: (data.dayNightOptions || DAY_NIGHT_OPTIONS).map((s: string) => s.toUpperCase()),
          sceneColors: data.sceneColors.map((c: SceneColorEntry) => ({
            ...c,
            intExt: c.intExt.toUpperCase(),
            dayNight: c.dayNight.toUpperCase(),
          })),
          colorRules: data.colorRules,
          selectedStripBg: data.selectedStripBg || DEFAULT_COLOR_PALETTE.selectedStripBg,
          selectedStripText: data.selectedStripText || DEFAULT_COLOR_PALETTE.selectedStripText,
          dayHeaderBg: data.dayHeaderBg || DEFAULT_COLOR_PALETTE.dayHeaderBg,
          dayHeaderText: data.dayHeaderText || DEFAULT_COLOR_PALETTE.dayHeaderText,
          dayFooterBg: data.dayFooterBg || DEFAULT_COLOR_PALETTE.dayFooterBg,
          dayFooterText: data.dayFooterText || DEFAULT_COLOR_PALETTE.dayFooterText,
          noteBg: data.noteBg || DEFAULT_COLOR_PALETTE.noteBg,
          noteText: data.noteText || DEFAULT_COLOR_PALETTE.noteText,
          fallbackStripBg: data.fallbackStripBg,
          fallbackStripText: data.fallbackStripText,
        };
        dispatch({ type: 'SET_COLOR_PALETTE', payload: imported });
      } catch {
        alert('Failed to parse palette file.');
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  };

  const startRenameHeader = (type: 'ie' | 'dn', idx: number) => {
    setEditingHeader({ type, idx });
    const options = type === 'ie' ? ieOptions : dnOptions;
    setHeaderText(options[idx]);
  };

  const commitHeaderRename = () => {
    if (!editingHeader) return;
    const { type, idx } = editingHeader;
    const trimmed = headerText.trim().toUpperCase();
    if (!trimmed) {
      setEditingHeader(null);
      return;
    }
    if (type === 'ie') {
      const next = [...ieOptions];
      const oldVal = next[idx];
      if (trimmed === oldVal) { setEditingHeader(null); return; }
      next[idx] = trimmed;
      const sceneColors = palette.sceneColors.map(c =>
        c.intExt === oldVal ? { ...c, intExt: trimmed } : c
      );
      const oldUpper = oldVal.toUpperCase();
      dispatch({ type: 'BATCH_START' });
      dispatch({ type: 'SET_COLOR_PALETTE', payload: { ...palette, intExtOptions: next, sceneColors } });
      for (const scene of state.present.scenes) {
        if (scene.intExt && scene.intExt.toUpperCase() === oldUpper && scene.intExt !== trimmed) {
          dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, intExt: trimmed } });
        }
      }
      dispatch({ type: 'BATCH_COMMIT' });
    } else {
      const next = [...dnOptions];
      const oldVal = next[idx];
      if (trimmed === oldVal) { setEditingHeader(null); return; }
      next[idx] = trimmed;
      const sceneColors = palette.sceneColors.map(c =>
        c.dayNight === oldVal ? { ...c, dayNight: trimmed } : c
      );
      const oldUpper = oldVal.toUpperCase();
      dispatch({ type: 'BATCH_START' });
      dispatch({ type: 'SET_COLOR_PALETTE', payload: { ...palette, dayNightOptions: next, sceneColors } });
      for (const scene of state.present.scenes) {
        if (scene.dayNight && scene.dayNight.toUpperCase() === oldUpper && scene.dayNight !== trimmed) {
          dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, dayNight: trimmed } });
        }
      }
      dispatch({ type: 'BATCH_COMMIT' });
    }
    setEditingHeader(null);
  };

  const addOption = (type: 'ie' | 'dn') => {
    const next = clonePalette(palette);
    const newIdx = type === 'ie' ? ieOptions.length : dnOptions.length;
    const newVal = 'NEW';
    if (type === 'ie') {
      next.intExtOptions = [...ieOptions, newVal];
      for (const dn of dnOptions) {
        if (findEntry(next.sceneColors, newVal, dn) < 0) {
          next.sceneColors.push({ intExt: newVal, dayNight: dn, background: '#ffffff', text: '#000000' });
        }
      }
    } else {
      next.dayNightOptions = [...dnOptions, newVal];
      for (const ie of ieOptions) {
        if (findEntry(next.sceneColors, ie, newVal) < 0) {
          next.sceneColors.push({ intExt: ie, dayNight: newVal, background: '#ffffff', text: '#000000' });
        }
      }
    }
    dispatch({ type: 'SET_COLOR_PALETTE', payload: next });
    needsScroll.current = true;
    setHeaderText(newVal);
    setEditingHeader({ type, idx: newIdx });
  };

  const removeOption = (type: 'ie' | 'dn', idx: number) => {
    const next = clonePalette(palette);
    if (type === 'ie') {
      const removed = ieOptions[idx];
      next.intExtOptions = ieOptions.filter((_, i) => i !== idx);
      next.sceneColors = next.sceneColors.filter(c => c.intExt !== removed);
    } else {
      const removed = dnOptions[idx];
      next.dayNightOptions = dnOptions.filter((_, i) => i !== idx);
      next.sceneColors = next.sceneColors.filter(c => c.dayNight !== removed);
    }
    dispatch({ type: 'SET_COLOR_PALETTE', payload: next });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = colorRules.findIndex(r => r.id === active.id);
    const newIndex = colorRules.findIndex(r => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    dispatch({ type: 'REORDER_COLOR_RULES', payload: arrayMove(colorRules, oldIndex, newIndex) });
  };

  const handleSaveRule = (rule: ColorRule) => {
    const existing = colorRules.find(r => r.id === rule.id);
    if (existing) {
      dispatch({ type: 'UPDATE_COLOR_RULE', payload: rule });
    } else {
      dispatch({ type: 'ADD_COLOR_RULE', payload: rule });
    }
  };

  const handleDeleteRule = (id: string) => {
    dispatch({ type: 'DELETE_COLOR_RULE', payload: id });
  };

  const handleDuplicateRule = (rule: ColorRule) => {
    const newRule: ColorRule = {
      ...rule,
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `${rule.name} - Copy`,
    };
    dispatch({ type: 'ADD_COLOR_RULE', payload: newRule });
  };

  const handleToggleRule = (id: string) => {
    const rule = colorRules.find(r => r.id === id);
    if (!rule) return;
    dispatch({ type: 'UPDATE_COLOR_RULE', payload: { ...rule, enabled: !rule.enabled } });
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-300 overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif' }}>
      <input ref={importRef} type="file" accept=".json" onChange={handleFileChosen} className="hidden" />

      {headerTarget && createPortal(
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen} width="w-44" trigger={
          <Button theme="dark">
            <span className="text-xs font-semibold text-zinc-400">Edit</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </Button>
        }>
          <DropdownItem onClick={handleExport} icon={<Download className="w-3.5 h-3.5" />}>
            Export Palette & Rules
          </DropdownItem>
          <DropdownItem onClick={() => { importRef.current?.click(); setDropdownOpen(false); }} icon={<Upload className="w-3.5 h-3.5" />}>
            Import Palette & Rules
          </DropdownItem>
        </DropdownMenu>,
        headerTarget
      )}

      {/* Color Editor Modal */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Edit: ${editing.label}`} width="max-w-sm"
          onReset={() => { const d = editing.resetDefaults(); setEditBg(d.bg); setEditText(d.text); }}
          footer={
            <ModalFooter>
              <ModalFooterButton variant="ghost" onClick={() => setEditing(null)}>Cancel</ModalFooterButton>
              <ModalFooterButton onClick={applyEdit}>Apply</ModalFooterButton>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Background</span>
              <ColorField value={editBg} onChange={setEditBg} size="lg" />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Text Color</span>
              <ColorField value={editText} onChange={setEditText} size="lg" />
            </div>
            <div className="w-full h-10 rounded border border-zinc-700 flex items-center justify-center text-sm font-bold" style={{ background: editBg, color: editText }}>
              Aa
            </div>
          </div>
        </Modal>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 pr-12 pb-20 bg-zinc-950 space-y-5">

        {/* Scene Color Matrix Section */}
        {/* Color Rules Section */}
        <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wand2 className={`${SEC_ICO} text-zinc-500`} />
            <span className={`${SEC_TXT} font-bold text-zinc-500 uppercase tracking-wider`}>Color Rules</span>
            <div className="flex-1" />
            <button onClick={() => setEditRule(null)} className="h-6 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 flex items-center gap-1 transition-colors">
              <Plus className="w-3 h-3" /> New Rule
            </button>
          </div>
          {colorRules.length === 0 ? (
            <p className="text-[10px] text-zinc-500 italic py-3 leading-relaxed">Override strip colors based on scene conditions. For example, make all Stills Unit scenes blue, or flag Hero Costume scenes with a custom color.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={colorRules.map(r => r.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {colorRules.map(rule => (
                    <React.Fragment key={rule.id}>
                    <ColorRuleCard rule={rule} project={state.present} onToggle={handleToggleRule} onEdit={setEditRule} onDuplicate={handleDuplicateRule} onDelete={handleDeleteRule} />
                    </React.Fragment>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </section>

        <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Palette className={`${SEC_ICO} text-zinc-500`} />
            <span className={`${SEC_TXT} font-bold text-zinc-500 uppercase tracking-wider`}>Scene Strip Colors</span>
            <div className="flex-1" />
            <button onClick={handleReset} className="h-6 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 flex items-center gap-1 transition-colors">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed mb-4 max-w-md">Click any cell to change its color. Rename row/column labels inline. Add or delete rows and columns using the buttons below.</p>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="w-20" />
                  {ieOptions.map((ie, i) => (
                    <th key={i} className="px-1 pb-2 text-center min-w-[120px]">
                      <div className={`flex items-center justify-center ${GAP}`}>
                        {editingHeader?.type === 'ie' && editingHeader.idx === i ? (
                          <input
                            autoFocus
                            value={headerText}
                            onChange={e => setHeaderText(e.target.value)}
                            onFocus={e => e.target.select()}
                            onBlur={commitHeaderRename}
                            onKeyDown={e => { if (e.key === 'Enter') commitHeaderRename(); if (e.key === 'Escape') setEditingHeader(null); }}
                            className={`${INP} font-bold text-zinc-400 uppercase tracking-wider bg-zinc-800 border border-zinc-600 rounded text-center outline-none`}
                          />
                        ) : (
                          <button
                            onClick={() => startRenameHeader('ie', i)}
                            className={`${LBL} text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors`}
                          >{ie}</button>
                        )}
                        <button onClick={() => removeOption('ie', i)} className="text-zinc-600 hover:text-red-400 transition-colors p-1.5">
                          <X className={XSZ} />
                        </button>
                      </div>
                    </th>
                  ))}
                    <th className="px-1 pb-2 text-center">
                    <button
                      onClick={() => addOption('ie')}
                      className={`${ADD} text-zinc-600 hover:text-zinc-400 uppercase tracking-wider transition-colors inline-flex items-center font-bold`}
                    >
                      <Plus className={XSZ} /> Add
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {dnOptions.map((dn, di) => (
                  <tr key={di}>
                    <td className="pr-3 py-1 align-middle text-right">
                      <div className={`flex items-center justify-end ${GAP}`}>
                        <button onClick={() => removeOption('dn', di)} className="text-zinc-600 hover:text-red-400 transition-colors p-1.5">
                          <X className={XSZ} />
                        </button>
                        {editingHeader?.type === 'dn' && editingHeader.idx === di ? (
                          <input
                            autoFocus
                            value={headerText}
                            onChange={e => setHeaderText(e.target.value)}
                            onFocus={e => e.target.select()}
                            onBlur={commitHeaderRename}
                            onKeyDown={e => { if (e.key === 'Enter') commitHeaderRename(); if (e.key === 'Escape') setEditingHeader(null); }}
                            className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 w-20 text-right outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => startRenameHeader('dn', di)}
                            className={`${LBL} text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors`}
                          >{dn}</button>
                        )}
                      </div>
                    </td>
                    {ieOptions.map((ie, ii) => {
                      const c = sceneColor(ie, dn);
                      return (
                        <td key={ii} className="px-1 py-1">
                          <button
                            onClick={() => openEditor(
                              `${ie} ${dn}`, c.background, c.text,
                              (bg, text) => handleCellEdit(ie, dn, bg, text),
                              () => {
                                const d = findEntry(DEFAULT_COLOR_PALETTE.sceneColors, ie, dn);
                                return d >= 0 ? { bg: DEFAULT_COLOR_PALETTE.sceneColors[d].background, text: DEFAULT_COLOR_PALETTE.sceneColors[d].text } : { bg: '#ffffff', text: '#000000' };
                              },
                            )}
                            className={`w-full h-14 rounded border border-zinc-700 hover:border-zinc-500 transition-colors flex items-center justify-center ${CELL} font-semibold cursor-pointer`}
                            style={{ background: c.background, color: c.text }}
                          >
                            <span className="text-center leading-tight px-1">
                              {ie}<br />{dn}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-1 py-1" />
                  </tr>
                ))}
                <tr>
                  <td className="pr-3 py-1 text-right">
                    <button
                      onClick={() => addOption('dn')}
                      className={`${ADD} text-zinc-600 hover:text-zinc-400 uppercase tracking-wider transition-colors inline-flex items-center font-bold`}
                    >
                      <Plus className={XSZ} /> Add
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Interface Colors Section */}
        <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sun className={`${SEC_ICO} text-zinc-500`} />
            <span className={`${SEC_TXT} font-bold text-zinc-500 uppercase tracking-wider`}>Interface Colors</span>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {([
              ['Selected Strip', palette.selectedStripBg, palette.selectedStripText, (bg: string, text: string) => handleMetaChange({ selectedStripBg: bg, selectedStripText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.selectedStripBg, text: DEFAULT_COLOR_PALETTE.selectedStripText })],
              ['Day Header', palette.dayHeaderBg, palette.dayHeaderText, (bg: string, text: string) => handleMetaChange({ dayHeaderBg: bg, dayHeaderText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.dayHeaderBg, text: DEFAULT_COLOR_PALETTE.dayHeaderText })],
              ['Day Footer', palette.dayFooterBg, palette.dayFooterText, (bg: string, text: string) => handleMetaChange({ dayFooterBg: bg, dayFooterText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.dayFooterBg, text: DEFAULT_COLOR_PALETTE.dayFooterText })],
              ['Note Banner', palette.noteBg, palette.noteText, (bg: string, text: string) => handleMetaChange({ noteBg: bg, noteText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.noteBg, text: DEFAULT_COLOR_PALETTE.noteText })],
              ['Fallback', getFallbackStripColors(palette).background, getFallbackStripColors(palette).color, (bg: string, text: string) => handleMetaChange({ fallbackStripBg: bg, fallbackStripText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.fallbackStripBg!, text: DEFAULT_COLOR_PALETTE.fallbackStripText! })],
            ] as const).map(([label, bg, text, commit, resetDefaults]) => (
              <button
                key={label}
                onClick={() => openEditor(label, bg, text, commit, resetDefaults)}
                className="w-full h-14 rounded border border-zinc-700 hover:border-zinc-500 transition-colors flex items-center justify-center text-[9px] font-semibold cursor-pointer"
                style={{ background: bg, color: text }}
              >
                <span className="text-center leading-tight px-1">{label}</span>
              </button>
            ))}
          </div>
        </section>

      </div>

      {editRule !== undefined && (
        <ColorRuleEditModal
          rule={editRule}
          onSave={handleSaveRule}
          onDelete={editRule ? handleDeleteRule : undefined}
          onClose={() => setEditRule(undefined)}
        />
      )}
    </div>
  );
};
