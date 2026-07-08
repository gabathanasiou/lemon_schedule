import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../store';
import { SceneColorEntry, SceneColorPalette } from '../types';
import { INT_EXT_OPTIONS, DAY_NIGHT_OPTIONS, DEFAULT_COLOR_PALETTE, getFallbackStripColors, getIntExtOptions, getDayNightOptions } from '../lib/ribbonUtils';
import { RotateCcw, Download, Upload, Palette, Sun, Plus, X } from 'lucide-react';
import { IS_COARSE } from '../lib/device';
import Modal from './Modal';
import { ModalFooter } from './Modal';

function findEntry(entries: SceneColorEntry[], intExt: string, dayNight: string): number {
  const ie = intExt.toUpperCase();
  const dn = dayNight.toUpperCase();
  return entries.findIndex(e => e.intExt.toUpperCase() === ie && e.dayNight.toUpperCase() === dn);
}

function clonePalette(p: SceneColorPalette): SceneColorPalette {
  return {
    ...p,
    intExtOptions: [...p.intExtOptions],
    dayNightOptions: [...p.dayNightOptions],
    sceneColors: p.sceneColors.map(c => ({ ...c })),
  };
}

function updateSceneColor(p: SceneColorPalette, intExt: string, dayNight: string, bg: string, text: string): SceneColorPalette {
  const next = clonePalette(p);
  const idx = findEntry(next.sceneColors, intExt, dayNight);
  if (idx >= 0) {
    next.sceneColors[idx] = { ...next.sceneColors[idx], background: bg, text };
  } else {
    next.sceneColors.push({ intExt, dayNight, background: bg, text });
  }
  return next;
}

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
  const XSZ = IS_COARSE ? 'w-4 h-4 p-1' : 'w-3 h-3';
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
      return found || { intExt, dayNight, background: '#ffffff', text: '#18181b' };
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
            entries.push(fb ? { ...fb } : { intExt: ie, dayNight: dn, background: '#ffffff', text: '#18181b' });
          } else if (existing) {
            entries.push({ ...existing });
          } else {
            entries.push({ intExt: ie, dayNight: dn, background: '#ffffff', text: '#18181b' });
          }
        }
      }
      return entries;
    })();
    dispatch({ type: 'SET_COLOR_PALETTE', payload: {
      intExtOptions: mergedIE,
      dayNightOptions: mergedDN,
      sceneColors: defaultSceneColors,
      selectedStripBg: DEFAULT_COLOR_PALETTE.selectedStripBg,
      selectedStripText: DEFAULT_COLOR_PALETTE.selectedStripText,
      dayHeaderBg: DEFAULT_COLOR_PALETTE.dayHeaderBg,
      dayHeaderText: DEFAULT_COLOR_PALETTE.dayHeaderText,
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
  };

  const handleImport = () => {
    importRef.current?.click();
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
          selectedStripBg: data.selectedStripBg || DEFAULT_COLOR_PALETTE.selectedStripBg,
          selectedStripText: data.selectedStripText || DEFAULT_COLOR_PALETTE.selectedStripText,
          dayHeaderBg: data.dayHeaderBg || DEFAULT_COLOR_PALETTE.dayHeaderBg,
          dayHeaderText: data.dayHeaderText || DEFAULT_COLOR_PALETTE.dayHeaderText,
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
          next.sceneColors.push({ intExt: newVal, dayNight: dn, background: '#ffffff', text: '#18181b' });
        }
      }
    } else {
      next.dayNightOptions = [...dnOptions, newVal];
      for (const ie of ieOptions) {
        if (findEntry(next.sceneColors, ie, newVal) < 0) {
          next.sceneColors.push({ intExt: ie, dayNight: newVal, background: '#ffffff', text: '#18181b' });
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

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-300 overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif' }}>
      <input ref={importRef} type="file" accept=".json" onChange={handleFileChosen} className="hidden" />

      {headerTarget && createPortal(
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 flex items-center gap-1.5 transition-colors">
            <Download className="w-3 h-3" /> Export
          </button>
          <button onClick={handleImport} className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 flex items-center gap-1.5 transition-colors">
            <Upload className="w-3 h-3" /> Import
          </button>
          <button onClick={handleReset} className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 flex items-center gap-1.5 transition-colors">
            <RotateCcw className="w-3 h-3" /> Reset All
          </button>
        </div>,
        headerTarget
      )}

      {/* Color Editor Modal */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Edit: ${editing.label}`} width="max-w-sm"
          onReset={() => { const d = editing.resetDefaults(); setEditBg(d.bg); setEditText(d.text); }}
          footer={
            <ModalFooter>
              <button onClick={() => setEditing(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={applyEdit} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Apply</button>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Background</span>
              <div className="flex items-center gap-2.5">
                <input type="color" value={editBg} onChange={e => setEditBg(e.target.value)} className="w-14 h-14 rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0.5" />
                <input type="text" readOnly value={editBg} className="w-[5.5rem] text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none select-all" />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Text Color</span>
              <div className="flex items-center gap-2.5">
                <input type="color" value={editText} onChange={e => setEditText(e.target.value)} className="w-14 h-14 rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0.5" />
                <input type="text" readOnly value={editText} className="w-[5.5rem] text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none select-all" />
              </div>
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
        <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Palette className={`${SEC_ICO} text-zinc-500`} />
            <span className={`${SEC_TXT} font-bold text-zinc-500 uppercase tracking-wider`}>Scene Strip Colors</span>
          </div>
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
                        <button onClick={() => removeOption('ie', i)} className={`text-zinc-600 hover:text-red-400 transition-colors ${XSZ}`}>
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
                        <button onClick={() => removeOption('dn', di)} className={`text-zinc-600 hover:text-red-400 transition-colors ${XSZ}`}>
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
                                return d >= 0 ? { bg: DEFAULT_COLOR_PALETTE.sceneColors[d].background, text: DEFAULT_COLOR_PALETTE.sceneColors[d].text } : { bg: '#ffffff', text: '#18181b' };
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
          <div className="grid grid-cols-4 gap-3">
            {([
              ['Selected Strip', palette.selectedStripBg, palette.selectedStripText, (bg: string, text: string) => handleMetaChange({ selectedStripBg: bg, selectedStripText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.selectedStripBg, text: DEFAULT_COLOR_PALETTE.selectedStripText })],
              ['Day Header', palette.dayHeaderBg, palette.dayHeaderText, (bg: string, text: string) => handleMetaChange({ dayHeaderBg: bg, dayHeaderText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.dayHeaderBg, text: DEFAULT_COLOR_PALETTE.dayHeaderText })],
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
    </div>
  );
};
