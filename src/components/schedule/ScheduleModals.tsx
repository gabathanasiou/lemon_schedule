import React from 'react';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import ColorField from '../ColorField';
import { FieldBox, SuffixField } from '../FieldBox';
import { CellInput } from '../CellInput';
import { parseDuration, parsePageCount } from '../../lib/utils';
import { getNoteBannerColors } from '../../lib/ribbonUtils';
import { SceneColorPalette } from '../../types';

export interface ColorPickerState {
  rowId: string;
  bg: string;
  text: string;
  noteText: string;
}

export interface AutoDaybreakPromptState {
  mode: 'duration' | 'pages';
}

export interface AutoDaybreakCleanupState {
  mode: 'duration' | 'pages';
  threshold: number;
}

export interface BannerDeleteState {
  type: 'NOTE' | 'BREAK';
}

export interface BannerDeleteEntry {
  key: string;
  label: string;
  bg: string;
  fg: string;
  count: number;
}

interface ScheduleModalsProps {
  colorPicker: ColorPickerState | null;
  setColorPicker: (v: ColorPickerState | null | ((p: ColorPickerState | null) => ColorPickerState | null)) => void;
  palette: SceneColorPalette;
  applyNoteColor: () => void;
  autoDaybreakPrompt: AutoDaybreakPromptState | null;
  setAutoDaybreakPrompt: (v: AutoDaybreakPromptState | null | ((p: AutoDaybreakPromptState | null) => AutoDaybreakPromptState | null)) => void;
  autoDaybreakRaw: string;
  setAutoDaybreakRaw: (v: string | ((prev: string) => string)) => void;
  normalizeAutoDaybreakRaw: (v: string) => string;
  confirmAutoDaybreak: () => void;
  autoDaybreakCleanup: AutoDaybreakCleanupState | null;
  setAutoDaybreakCleanup: (v: AutoDaybreakCleanupState | null | ((p: AutoDaybreakCleanupState | null) => AutoDaybreakCleanupState | null)) => void;
  autoDaybreakNotesAction: 'boneyard' | 'delete';
  setAutoDaybreakNotesAction: (v: 'boneyard' | 'delete') => void;
  autoDaybreakBreaksAction: 'boneyard' | 'delete';
  setAutoDaybreakBreaksAction: (v: 'boneyard' | 'delete') => void;
  executeAutoDaybreak: (mode: 'duration' | 'pages', threshold: number, notesAction: 'boneyard' | 'delete', breaksAction: 'boneyard' | 'delete') => void;
  daybreakCount: number;
  noteCount: number;
  breakCount: number;
  bannerDelete: BannerDeleteState | null;
  setBannerDelete: (v: BannerDeleteState | null | ((p: BannerDeleteState | null) => BannerDeleteState | null)) => void;
  bannerDeleteEntries: BannerDeleteEntry[];
  bannerDeleteChecked: Set<string>;
  setBannerDeleteChecked: (v: Set<string> | ((p: Set<string>) => Set<string>)) => void;
  deleteBanners: (type: 'NOTE' | 'BREAK', keys: Set<string>) => void;
}

export default function ScheduleModals(props: ScheduleModalsProps) {
  const {
    colorPicker, setColorPicker, palette, applyNoteColor,
    autoDaybreakPrompt, setAutoDaybreakPrompt, autoDaybreakRaw, setAutoDaybreakRaw,
    normalizeAutoDaybreakRaw, confirmAutoDaybreak,
    autoDaybreakCleanup, setAutoDaybreakCleanup,
    autoDaybreakNotesAction, setAutoDaybreakNotesAction,
    autoDaybreakBreaksAction, setAutoDaybreakBreaksAction, executeAutoDaybreak,
    daybreakCount, noteCount, breakCount,
    bannerDelete, setBannerDelete, bannerDeleteEntries, bannerDeleteChecked, setBannerDeleteChecked, deleteBanners,
  } = props;

  return (
    <>
      {/* Color Picker Modal */}
      {colorPicker && (
        <Modal open onClose={() => setColorPicker(null)} title="Edit Banner" width="max-w-md"
          footer={
            <ModalFooter>
              <button onClick={() => setColorPicker(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={applyNoteColor} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Apply</button>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Background</span>
              <ColorField value={colorPicker.bg} onChange={v => setColorPicker(p => p ? { ...p, bg: v } : null)} defaultValue={getNoteBannerColors(palette).background} />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Text Color</span>
              <ColorField value={colorPicker.text} onChange={v => setColorPicker(p => p ? { ...p, text: v } : null)} defaultValue={getNoteBannerColors(palette).color} />
            </div>
            <div>
              <textarea
                value={colorPicker.noteText}
                onChange={e => setColorPicker(p => p ? { ...p, noteText: e.target.value.toUpperCase() } : null)}
                rows={3}
                className="w-full text-xs px-3 py-2 rounded border border-zinc-800 outline-none focus:border-zinc-600 resize-none"
                style={{ background: colorPicker.bg, color: colorPicker.text }}
                placeholder="Banner text..."
              />
            </div>
          </div>
        </Modal>
      )}
      {autoDaybreakPrompt && (() => {
        const threshold = autoDaybreakPrompt.mode === 'duration'
          ? parseDuration(autoDaybreakRaw)
          : parsePageCount(autoDaybreakRaw);
        const valid = autoDaybreakRaw.trim() !== '' && !isNaN(threshold) && threshold > 0;
        return (
          <Modal open onClose={() => setAutoDaybreakPrompt(null)} title={autoDaybreakPrompt.mode === 'duration' ? 'Add Day Break by Duration' : 'Add Day Break by Pages'} width="max-w-sm"
            footer={
              <ModalFooter>
                <button onClick={() => setAutoDaybreakPrompt(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
                <button onClick={confirmAutoDaybreak} disabled={!valid} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Place Day Breaks</button>
              </ModalFooter>
            }
          >
            <div className="p-6 space-y-5" onKeyDown={e => { if (e.key === 'Enter' && valid) confirmAutoDaybreak(); }}>
              <div className="flex items-center gap-3 py-1">
                {autoDaybreakPrompt.mode === 'duration' && (
                  <span className="text-xs text-zinc-300 shrink-0">Duration</span>
                )}
                {autoDaybreakPrompt.mode === 'duration' ? (
                  <FieldBox className="flex-1 min-w-0">
                    <CellInput
                      value={autoDaybreakRaw}
                      onChange={setAutoDaybreakRaw}
                      onBlur={() => setAutoDaybreakRaw(prev => normalizeAutoDaybreakRaw(prev))}
                      clearOnType
                      autoFocus
                      col="duration"
                      placeholder="e.g. 8h or 1h 30m"
                      className="flex-1 text-left text-xs"
                    />
                  </FieldBox>
                ) : (
                  <SuffixField suffix="pgs" className="flex-1 min-w-0">
                    <CellInput
                      value={autoDaybreakRaw}
                      onChange={setAutoDaybreakRaw}
                      onBlur={() => setAutoDaybreakRaw(prev => normalizeAutoDaybreakRaw(prev))}
                      clearOnType
                      autoFocus
                      col="pageCount"
                      placeholder="e.g. 2 4/8 or 3.5"
                      className="flex-1 text-right text-xs"
                    />
                  </SuffixField>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}
      {autoDaybreakCleanup && (() => {
        const segBase = `flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer`;
        const segSel = `bg-zinc-800 text-white`;
        const segDef = `text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50`;
        const parts: string[] = [];
        if (daybreakCount > 0) parts.push(`${daybreakCount} day break${daybreakCount !== 1 ? 's' : ''}`);
        if (noteCount > 0) parts.push(`${noteCount} note${noteCount !== 1 ? 's' : ''}`);
        if (breakCount > 0) parts.push(`${breakCount} break${breakCount !== 1 ? 's' : ''}`);
        const summary = parts.join(', ').replace(/, ([^,]+)$/, ' and $1');
        return (
          <Modal open onClose={() => setAutoDaybreakCleanup(null)} title="Prepare Stripboard" width="max-w-sm"
            footer={
              <ModalFooter>
                <button onClick={() => setAutoDaybreakCleanup(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
                <button onClick={() => {
                  const c = autoDaybreakCleanup;
                  setAutoDaybreakCleanup(null);
                  executeAutoDaybreak(c.mode, c.threshold, autoDaybreakNotesAction, autoDaybreakBreaksAction);
                }} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Place Day Breaks</button>
              </ModalFooter>
            }
          >
            <div className="p-6 space-y-5">
              <p className="text-xs text-zinc-400 leading-relaxed">
                {daybreakCount > 0 && (noteCount > 0 || breakCount > 0)
                  ? <>Existing day breaks will be removed. {summary} found - choose how to handle notes and breaks.</>
                  : daybreakCount > 0
                  ? <>Existing day breaks will be removed before auto-placing new ones.</>
                  : <>{summary} found in the stripboard - choose how to handle them.</>
                }
              </p>
              {daybreakCount > 0 && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-zinc-300">Day Breaks <span className="text-zinc-500">({daybreakCount})</span></span>
                  <span className="text-xs text-zinc-500">Will be removed</span>
                </div>
              )}
              {noteCount > 0 && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-zinc-300">Notes <span className="text-zinc-500">({noteCount})</span></span>
                  <div className="flex gap-1.5">
                    <button className={`${segBase} ${autoDaybreakNotesAction === 'boneyard' ? segSel : segDef}`} onClick={() => setAutoDaybreakNotesAction('boneyard')}>Boneyard</button>
                    <button className={`${segBase} ${autoDaybreakNotesAction === 'delete' ? segSel : segDef}`} onClick={() => setAutoDaybreakNotesAction('delete')}>Delete</button>
                  </div>
                </div>
              )}
              {breakCount > 0 && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-zinc-300">Breaks <span className="text-zinc-500">({breakCount})</span></span>
                  <div className="flex gap-1.5">
                    <button className={`${segBase} ${autoDaybreakBreaksAction === 'boneyard' ? segSel : segDef}`} onClick={() => setAutoDaybreakBreaksAction('boneyard')}>Boneyard</button>
                    <button className={`${segBase} ${autoDaybreakBreaksAction === 'delete' ? segSel : segDef}`} onClick={() => setAutoDaybreakBreaksAction('delete')}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}
      {bannerDelete && (() => {
        const allChecked = bannerDeleteEntries.length > 0 && bannerDeleteEntries.every(e => bannerDeleteChecked.has(e.key));
        const checkedKeys = new Set(bannerDeleteEntries.filter(e => bannerDeleteChecked.has(e.key)).map(e => e.key));
        const checkedCount = bannerDeleteEntries.filter(e => bannerDeleteChecked.has(e.key)).reduce((s, e) => s + e.count, 0);
        const totalCount = bannerDeleteEntries.reduce((s, e) => s + e.count, 0);
        return (
          <Modal open onClose={() => setBannerDelete(null)} title={bannerDelete.type === 'NOTE' ? 'Delete Notes' : 'Delete Breaks'} width="max-w-md"
            footer={
              <ModalFooter>
                <button onClick={() => setBannerDelete(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
                <button
                  onClick={() => deleteBanners(bannerDelete.type, checkedKeys)}
                  disabled={checkedCount === 0}
                  className="px-6 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Delete Selected{checkedCount > 0 ? ` (${checkedCount})` : ''}
                </button>
              </ModalFooter>
            }
          >
            <div className="p-6 space-y-5">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Choose which {bannerDelete.type === 'NOTE' ? 'note' : 'break'} banners to remove.
              </p>
              <div>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2">
                  <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    {totalCount} {bannerDelete.type === 'NOTE' ? 'note' : 'break'} banner{totalCount !== 1 ? 's' : ''}
                  </h3>
                  <button
                    onClick={() => setBannerDeleteChecked(prev => {
                      const next = new Set(prev);
                      if (allChecked) bannerDeleteEntries.forEach(e => next.delete(e.key));
                      else bannerDeleteEntries.forEach(e => next.add(e.key));
                      return next;
                    })}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200 font-medium"
                  >
                    {allChecked ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="bg-zinc-950 border border-zinc-700 rounded-md overflow-y-auto max-h-72">
                  {bannerDeleteEntries.map(e => {
                    const checked = bannerDeleteChecked.has(e.key);
                    return (
                      <button
                        key={e.key}
                        onClick={() => setBannerDeleteChecked(prev => {
                          const next = new Set(prev);
                          if (next.has(e.key)) next.delete(e.key); else next.add(e.key);
                          return next;
                        })}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${checked ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'}`}
                      >
                        <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${checked ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-600'}`}>
                          {checked && <svg className="w-3 h-3 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        <span className="px-2 py-0.5 rounded font-semibold truncate max-w-[16rem] shrink-0" style={{ background: e.bg, color: e.fg }}>
                          {e.label}
                        </span>
                        <span className="text-zinc-500 ml-auto">{e.count}</span>
                      </button>
                    );
                  })}
                  {bannerDeleteEntries.length === 0 && (
                    <div className="px-3 py-4 text-xs text-zinc-600 text-center">No banners found.</div>
                  )}
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}
    </>
  );
}
