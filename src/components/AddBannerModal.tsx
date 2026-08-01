import React, { useState, useRef } from 'react';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import ColorField from './ColorField';
import { CellInput } from './CellInput';
import DurationKeypad from './DurationKeypad';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
import { getNoteBannerColors } from '../lib/ribbonUtils';
import { useProject } from '../store';
import { useLastPointerType } from '../lib/useMarquee';

export type BannerType = 'NOTE' | 'BREAK';
export type BannerPosition = 'top' | 'middle' | 'bottom';
export type BannerSplitMethod = 'ribbons' | 'duration' | 'pages';

export interface AddBannerConfig {
  type: BannerType;
  label?: string;
  minutes: number;
  position: BannerPosition;
  splitMethod: BannerSplitMethod;
  splitTarget?: number;
  noteColor?: string;
  noteTextColor?: string;
}

interface AddBannerModalProps {
  open: boolean;
  dayCount: number;
  onClose: () => void;
  onAdd: (config: AddBannerConfig) => void;
}

const SEG_BASE = 'flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer';
const SEG_SEL = 'bg-zinc-800 text-white';
const SEG_DEF = 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50';
const SEG_ROW = 'flex gap-1.5';

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
    <div className="flex-1 h-px bg-zinc-800" />
  </div>
);

const Row: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-4 py-1.5">
    <span className="text-xs text-zinc-300">{label}</span>
    {children}
  </div>
);

import { FieldBox, SuffixField } from './FieldBox';

export default function AddBannerModal({ open, dayCount, onClose, onAdd }: AddBannerModalProps) {
  const lastPointerType = useLastPointerType();
  const isTouchMode = lastPointerType === 'touch' || lastPointerType === 'pen';
  const { state } = useProject();
  const nb = getNoteBannerColors(state.present.colorPalette);

  const [type, setType] = useState<BannerType>('BREAK');
  const [label, setLabel] = useState('LUNCH');
  const [durationStr, setDurationStr] = useState('30m');
  const [noteColor, setNoteColor] = useState(nb.background);
  const [noteTextColor, setNoteTextColor] = useState(nb.color);
  const [position, setPosition] = useState<BannerPosition>('middle');
  const [splitMethod, setSplitMethod] = useState<BannerSplitMethod>('ribbons');
  const [splitDurationStr, setSplitDurationStr] = useState('');
  const [splitPagesStr, setSplitPagesStr] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setType('BREAK');
    setLabel('LUNCH');
    setDurationStr('30m');
    setNoteColor(nb.background);
    setNoteTextColor(nb.color);
    setPosition('middle');
    setSplitMethod('ribbons');
    setSplitDurationStr('');
    setSplitPagesStr('');
  };

  const handleTypeChange = (t: BannerType) => {
    setType(t);
    setLabel(t === 'BREAK' ? 'LUNCH' : '');
    requestAnimationFrame(() => labelInputRef.current?.focus());
  };

  const normalizeDurationStr = (s: string) => {
    const m = parseDuration(s);
    return m > 0 ? formatDuration(m) : '';
  };

  const normalizePagesStr = (s: string) => {
    const p = parsePageCount(s);
    return p > 0 ? formatPageCount(p) : '';
  };

  const handleAdd = () => {
    const splitTarget = position === 'middle'
      ? splitMethod === 'duration'
        ? parseDuration(splitDurationStr)
        : splitMethod === 'pages'
          ? parsePageCount(splitPagesStr)
          : undefined
      : undefined;
    onAdd({
      type,
      label: label.trim() || undefined,
      minutes: parseDuration(durationStr),
      position,
      splitMethod,
      splitTarget,
      ...(type === 'NOTE' ? { noteColor, noteTextColor } : {}),
    });
    reset();
    onClose();
  };

  const segBtn = (active: boolean) => `${SEG_BASE} ${active ? SEG_SEL : SEG_DEF}`;

  const bannerDur = parseDuration(durationStr);
  const splitDur = parseDuration(splitDurationStr);
  const splitPgs = parsePageCount(splitPagesStr);

  const hasInvalidText =
    (durationStr.trim() !== '' && !(bannerDur > 0)) ||
    (splitDurationStr.trim() !== '' && !(splitDur > 0)) ||
    (splitPagesStr.trim() !== '' && !(splitPgs > 0));

  const bannerMissing = durationStr.trim() === '' || !(bannerDur > 0);

  const splitMissing = position === 'middle' && (
    (splitMethod === 'duration' && (splitDurationStr.trim() === '' || !(splitDur > 0))) ||
    (splitMethod === 'pages' && (splitPagesStr.trim() === '' || !(splitPgs > 0)))
  );

  const canAdd = !hasInvalidText && !bannerMissing && !splitMissing;

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Add Banners"
      width="max-w-md"
      footer={
        <ModalFooter>
          <button onClick={() => { reset(); onClose(); }} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
          <button onClick={handleAdd} disabled={!canAdd} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-800">Add Banners</button>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Inserts one {type === 'BREAK' ? 'break' : 'note'} banner into each of {dayCount} production day{dayCount !== 1 ? 's' : ''}.
        </p>

        <SectionHeader title="Banner" />
        <div className="space-y-1">
          <Row label="Type">
            <div className={SEG_ROW}>
              <button className={segBtn(type === 'BREAK')} onClick={() => handleTypeChange('BREAK')}>BREAK</button>
              <button className={segBtn(type === 'NOTE')} onClick={() => handleTypeChange('NOTE')}>NOTE</button>
            </div>
          </Row>
          <Row label="Label">
            <FieldBox>
              <input
                ref={labelInputRef}
                value={label}
                onChange={e => setLabel(e.target.value.toUpperCase())}
                onFocus={e => e.target.select()}
                onPointerDown={(e) => {
                  if (document.activeElement !== e.currentTarget) {
                    e.preventDefault();
                    e.currentTarget.focus();
                  }
                }}
                className="flex-1 min-w-0 bg-transparent outline-none text-xs text-zinc-200 placeholder:text-zinc-600"
                placeholder={type === 'BREAK' ? 'LUNCH' : 'Note text…'}
              />
            </FieldBox>
          </Row>
          <Row label="Duration">
            <FieldBox>
              {isTouchMode ? (
                <DurationKeypad
                  value={parseDuration(durationStr) || 0}
                  onChange={val => setDurationStr(val > 0 ? formatDuration(val) : '')}
                  className="flex-1 text-left text-xs text-zinc-200"
                />
              ) : (
                <CellInput
                  value={durationStr}
                  onChange={setDurationStr}
                  onBlur={() => setDurationStr(prev => normalizeDurationStr(prev))}
                  clearOnType
                  autoFocus
                  col="duration"
                  placeholder="1h 20m"
                  className="flex-1 text-left text-xs"
                />
              )}
            </FieldBox>
          </Row>
          {type === 'NOTE' && (
            <>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-xs text-zinc-300">Background</span>
                <ColorField value={noteColor} onChange={setNoteColor} defaultValue={nb.background} />
              </div>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-xs text-zinc-300">Text Color</span>
                <ColorField value={noteTextColor} onChange={setNoteTextColor} defaultValue={nb.color} />
              </div>
            </>
          )}
        </div>

        <SectionHeader title="Placement" />
        <div className="space-y-1">
          <Row label="Position">
            <div className={SEG_ROW}>
              <button className={segBtn(position === 'top')} onClick={() => setPosition('top')}>Top</button>
              <button className={segBtn(position === 'middle')} onClick={() => setPosition('middle')}>Middle</button>
              <button className={segBtn(position === 'bottom')} onClick={() => setPosition('bottom')}>Bottom</button>
            </div>
          </Row>
          {position === 'middle' && (
            <>
              <Row label="Split by">
                <div className={SEG_ROW}>
                  <button className={segBtn(splitMethod === 'ribbons')} onClick={() => setSplitMethod('ribbons')}>Ribbons</button>
                  <button className={segBtn(splitMethod === 'duration')} onClick={() => setSplitMethod('duration')}>Duration</button>
                  <button className={segBtn(splitMethod === 'pages')} onClick={() => setSplitMethod('pages')}>Pages</button>
                </div>
              </Row>
              {splitMethod === 'ribbons' && (
                <p className="text-[11px] text-zinc-500 leading-relaxed">Equal number of ribbons above and below the banner.</p>
              )}
              {splitMethod === 'duration' && (
                <Row label="Split after">
                  <FieldBox>
                    {isTouchMode ? (
                      <DurationKeypad
                        value={splitDurationStr ? parseDuration(splitDurationStr) : 0}
                        display={splitDurationStr}
                        onChange={val => setSplitDurationStr(val > 0 ? formatDuration(val) : '')}
                        className="flex-1 text-left text-xs text-zinc-200"
                      />
                    ) : (
                      <CellInput
                        value={splitDurationStr}
                        onChange={setSplitDurationStr}
                        onBlur={() => setSplitDurationStr(prev => normalizeDurationStr(prev))}
                        clearOnType
                        autoFocus
                        col="duration"
                        placeholder="1h 20m"
                        className="flex-1 text-left text-xs"
                      />
                    )}
                  </FieldBox>
                </Row>
              )}
              {splitMethod === 'pages' && (
                <Row label="Split after">
                  <SuffixField suffix="pgs">
                    <CellInput
                      value={splitPagesStr}
                      onChange={setSplitPagesStr}
                      onBlur={() => setSplitPagesStr(prev => normalizePagesStr(prev))}
                      clearOnType
                      autoFocus
                      col="pageCount"
                      placeholder="1 2/8"
                      className="flex-1 text-right text-xs"
                    />
                  </SuffixField>
                </Row>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
