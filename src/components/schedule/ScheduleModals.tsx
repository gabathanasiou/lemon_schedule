import React from 'react';
import BannerColorModal, { type BannerColorState } from './BannerColorModal';
import AutoDaybreakModal, { type AutoDaybreakPromptState } from './AutoDaybreakModal';
import StripboardPrepareModal, { type AutoDaybreakCleanupState } from './StripboardPrepareModal';
import BannerDeleteModal, { type BannerDeleteState, type BannerDeleteEntry } from './BannerDeleteModal';
import type { SceneColorPalette } from '../../types';

export type { AutoDaybreakPromptState, AutoDaybreakCleanupState, BannerDeleteState, BannerDeleteEntry };

export interface ColorPickerState extends BannerColorState {
  rowId: string;
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
  /** Day breaks carrying day details (locations/crew/call times/notes) —
   *  the cleanup copy warns that auto-placing discards them. */
  daybreakDetailCount: number;
  noteCount: number;
  breakCount: number;
  bannerDelete: BannerDeleteState | null;
  setBannerDelete: (v: BannerDeleteState | null | ((p: BannerDeleteState | null) => BannerDeleteState | null)) => void;
  bannerDeleteEntries: BannerDeleteEntry[];
  bannerDeleteChecked: Set<string>;
  setBannerDeleteChecked: (v: Set<string> | ((p: Set<string>) => Set<string>)) => void;
  deleteBanners: (type: 'NOTE' | 'BREAK', keys: Set<string>) => void;
}

/** Composition root for the Schedule tab's banner + auto-daybreak modals.
 *  Each modal is its own component so the Modals Studio can preview it in
 *  isolation; state stays with the ScheduleTab host. */
export default function ScheduleModals(props: ScheduleModalsProps) {
  const {
    colorPicker, setColorPicker, palette, applyNoteColor,
    autoDaybreakPrompt, setAutoDaybreakPrompt, autoDaybreakRaw, setAutoDaybreakRaw,
    normalizeAutoDaybreakRaw, confirmAutoDaybreak,
    autoDaybreakCleanup, setAutoDaybreakCleanup,
    autoDaybreakNotesAction, setAutoDaybreakNotesAction,
    autoDaybreakBreaksAction, setAutoDaybreakBreaksAction, executeAutoDaybreak,
    daybreakCount, daybreakDetailCount, noteCount, breakCount,
    bannerDelete, setBannerDelete, bannerDeleteEntries, bannerDeleteChecked, setBannerDeleteChecked, deleteBanners,
  } = props;

  return (
    <>
      <BannerColorModal
        state={colorPicker}
        onChange={setColorPicker}
        onClose={() => setColorPicker(null)}
        onApply={applyNoteColor}
        palette={palette}
      />
      <AutoDaybreakModal
        state={autoDaybreakPrompt}
        onClose={() => setAutoDaybreakPrompt(null)}
        raw={autoDaybreakRaw}
        onRawChange={setAutoDaybreakRaw}
        normalizeRaw={normalizeAutoDaybreakRaw}
        onConfirm={confirmAutoDaybreak}
      />
      <StripboardPrepareModal
        state={autoDaybreakCleanup}
        onClose={() => setAutoDaybreakCleanup(null)}
        onPlace={c => {
          setAutoDaybreakCleanup(null);
          executeAutoDaybreak(c.mode, c.threshold, autoDaybreakNotesAction, autoDaybreakBreaksAction);
        }}
        notesAction={autoDaybreakNotesAction}
        onNotesAction={setAutoDaybreakNotesAction}
        breaksAction={autoDaybreakBreaksAction}
        onBreaksAction={setAutoDaybreakBreaksAction}
        daybreakCount={daybreakCount}
        daybreakDetailCount={daybreakDetailCount}
        noteCount={noteCount}
        breakCount={breakCount}
      />
      <BannerDeleteModal
        state={bannerDelete}
        onClose={() => setBannerDelete(null)}
        entries={bannerDeleteEntries}
        checked={bannerDeleteChecked}
        onCheckedChange={setBannerDeleteChecked}
        onDelete={deleteBanners}
      />
    </>
  );
}
