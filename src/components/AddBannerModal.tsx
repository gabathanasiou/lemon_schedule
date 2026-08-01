import React, { useState } from 'react';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import { CellInput } from './CellInput';
import DurationKeypad from './DurationKeypad';
import { formatDuration, parseDuration, parsePageCount, formatPageCount } from '../lib/utils';
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

const SEG_BASE = 'px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer';
const SEG_SEL = 'bg-white text-zinc-900';
const SEG_DEF = 'text-zinc-500 hover:text-zinc-300';
const SEG_ROW = 'flex border border-zinc-700 rounded p-0.5';

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

const FIELD_BOX = 'flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 focus-within:border-zinc-500 transition-colors w-36';

const FieldBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={FIELD_BOX}>{children}</div>
);

const SuffixField: React.FC<{ suffix: string; children: React.ReactNode }> = ({ suffix, children }) => (
  <div className={FIELD_BOX}>
    {children}
    <span className="text-[10px] font-medium text-zinc-500 uppercase shrink-0">{suffix}</span>
  </div>
);

export default function AddBannerModal({ open, dayCount, onClose, onAdd }: AddBannerModalProps) {
  const lastPointerType = useLastPointerType();
  const isTouchMode = lastPointerType === 'touch' || lastPointerType === 'pen';

  const [type, setType] = useState<BannerType>('BREAK');
  const [label, setLabel] = useState('LUNCH');
  const [durationStr, setDurationStr] = useState('30m');
  const [noteColor, setNoteColor] = useState('#591b1b');
  const [noteTextColor, setNoteTextColor] = useState('#ffffff');
  const [position, setPosition] = useState<BannerPosition>('middle');
  const [splitMethod, setSplitMethod] = useState<BannerSplitMethod>('ribbons');
  const [splitDurationStr, setSplitDurationStr] = useState('');
  const [splitPagesStr, setSplitPagesStr] = useState('');

  const reset = () => {
    setType('BREAK');
    setLabel('LUNCH');
    setDurationStr('30m');
    setNoteColor('#591b1b');
    setNoteTextColor('#ffffff');
    setPosition('middle');
    setSplitMethod('ribbons');
    setSplitDurationStr('');
    setSplitPagesStr('');
  };

  const handleTypeChange = (t: BannerType) => {
    setType(t);
    setLabel(t === 'BREAK' ? 'LUNCH' : '');
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
              <button className={segBtn(type === 'NOTE')} onClick={() => handleTypeChange('NOTE')}>NOTE</button>
              <button className={segBtn(type === 'BREAK')} onClick={() => handleTypeChange('BREAK')}>BREAK</button>
            </div>
          </Row>
          <Row label="Label">
            <FieldBox>
              <input
                value={label}
                onChange={e => setLabel(e.target.value.toUpperCase())}
                onFocus={e => e.target.select()}
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
                  className="flex-1 text-right text-xs text-zinc-200"
                />
              ) : (
                <CellInput
                  value={durationStr}
                  onChange={setDurationStr}
                  onBlur={() => setDurationStr(prev => normalizeDurationStr(prev))}
                  clearOnType
                  col="duration"
                  className="flex-1 text-right text-xs"
                />
              )}
            </FieldBox>
          </Row>
          {type === 'NOTE' && (
            <>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-xs text-zinc-300">Background</span>
                <div className="flex items-center gap-2.5">
                  <input type="color" value={noteColor} onChange={e => setNoteColor(e.target.value)} className="w-9 h-9 rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0" />
                  <input type="text" readOnly value={noteColor} className="w-[5.5rem] text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none select-all" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-xs text-zinc-300">Text Color</span>
                <div className="flex items-center gap-2.5">
                  <input type="color" value={noteTextColor} onChange={e => setNoteTextColor(e.target.value)} className="w-9 h-9 rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0" />
                  <input type="text" readOnly value={noteTextColor} className="w-[5.5rem] text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none select-all" />
                </div>
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
                        className="flex-1 text-right text-xs text-zinc-200"
                      />
                    ) : (
                      <CellInput
                        value={splitDurationStr}
                        onChange={setSplitDurationStr}
                        onBlur={() => setSplitDurationStr(prev => normalizeDurationStr(prev))}
                        clearOnType
                        col="duration"
                        className="flex-1 text-right text-xs"
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
                      col="pageCount"
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
