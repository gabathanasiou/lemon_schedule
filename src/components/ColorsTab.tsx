import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../store';
import { SceneColorEntry, SceneColorPalette } from '../types';
import { INT_EXT_OPTIONS, DAY_NIGHT_OPTIONS, DEFAULT_COLOR_PALETTE } from '../lib/ribbonUtils';
import { RotateCcw, Download, Upload, Palette, Sun } from 'lucide-react';
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
  const importRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editBg, setEditBg] = useState('');
  const [editText, setEditText] = useState('');

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
    dispatch({ type: 'SET_COLOR_PALETTE', payload: DEFAULT_COLOR_PALETTE });
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
        dispatch({ type: 'SET_COLOR_PALETTE', payload: data as SceneColorPalette });
      } catch {
        alert('Failed to parse palette file.');
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
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
              <button onClick={applyEdit} className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors">Apply</button>
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
      <div className="flex-1 overflow-y-auto p-6 pr-12 bg-zinc-950 space-y-5">

        {/* Scene Color Matrix Section */}
        <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Scene Strip Colors</span>
          </div>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="w-20" />
                  {INT_EXT_OPTIONS.map(ie => (
                    <th key={ie} className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider px-1 pb-2 text-center min-w-[120px]">{ie}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_NIGHT_OPTIONS.map(dn => (
                  <tr key={dn}>
                    <td className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider pr-3 py-1 align-middle text-right">{dn}</td>
                    {INT_EXT_OPTIONS.map(ie => {
                      const c = sceneColor(ie, dn);
                      return (
                        <td key={`${ie}-${dn}`} className="px-1 py-1">
                          <button
                            onClick={() => openEditor(
                              `${ie} ${dn}`, c.background, c.text,
                              (bg, text) => handleCellEdit(ie, dn, bg, text),
                              () => {
                                const d = findEntry(DEFAULT_COLOR_PALETTE.sceneColors, ie, dn);
                                return d >= 0 ? { bg: DEFAULT_COLOR_PALETTE.sceneColors[d].background, text: DEFAULT_COLOR_PALETTE.sceneColors[d].text } : { bg: '#ffffff', text: '#18181b' };
                              },
                            )}
                            className="w-full h-14 rounded border border-zinc-700 hover:border-zinc-500 transition-colors flex items-center justify-center text-[9px] font-semibold cursor-pointer"
                            style={{ background: c.background, color: c.text }}
                          >
                            <span className="text-center leading-tight px-1">
                              {ie}<br />{dn}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Interface Colors Section */}
        <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sun className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Interface Colors</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {([
              ['Selected Strip', palette.selectedStripBg, palette.selectedStripText, (bg: string, text: string) => handleMetaChange({ selectedStripBg: bg, selectedStripText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.selectedStripBg, text: DEFAULT_COLOR_PALETTE.selectedStripText })],
              ['Day Header', palette.dayHeaderBg, palette.dayHeaderText, (bg: string, text: string) => handleMetaChange({ dayHeaderBg: bg, dayHeaderText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.dayHeaderBg, text: DEFAULT_COLOR_PALETTE.dayHeaderText })],
              ['Note Banner', palette.noteBg, palette.noteText, (bg: string, text: string) => handleMetaChange({ noteBg: bg, noteText: text }), () => ({ bg: DEFAULT_COLOR_PALETTE.noteBg, text: DEFAULT_COLOR_PALETTE.noteText })],
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