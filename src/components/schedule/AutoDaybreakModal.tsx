import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { isImeConfirm } from '../../lib/keys';
import { FieldBox, SuffixField } from '../FieldBox';
import { CellInput } from '../CellInput';
import { parseDuration, parsePageCount } from '../../lib/utils';

export interface AutoDaybreakPromptState {
  mode: 'duration' | 'pages';
}

interface AutoDaybreakModalProps {
  /** Which threshold prompt is open — null keeps the modal closed. */
  state: AutoDaybreakPromptState | null;
  onClose: () => void;
  raw: string;
  onRawChange: (v: string | ((prev: string) => string)) => void;
  normalizeRaw: (v: string) => string;
  onConfirm: () => void;
}

/** "Add Day Break by Duration / by Pages" threshold prompt. Part of the
 *  auto-daybreak flow composed by ScheduleModals. */
export default function AutoDaybreakModal({
  state,
  onClose,
  raw,
  onRawChange,
  normalizeRaw,
  onConfirm,
}: AutoDaybreakModalProps) {
  if (!state) return null;

  const threshold = state.mode === 'duration' ? parseDuration(raw) : parsePageCount(raw);
  const valid = raw.trim() !== '' && !isNaN(threshold) && threshold > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={state.mode === 'duration' ? 'Add Day Break by Duration' : 'Add Day Break by Pages'}
      width="max-w-sm"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={onConfirm} disabled={!valid}>Place Day Breaks</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5" onKeyDown={e => { if (e.key === 'Enter' && valid && !isImeConfirm(e)) onConfirm(); }}>
        <div className="flex items-center gap-3 py-1">
          {state.mode === 'duration' && (
            <span className="text-xs text-[color:var(--ui-text)] shrink-0">Duration</span>
          )}
          {state.mode === 'duration' ? (
            <FieldBox className="flex-1 min-w-0">
              <CellInput
                value={raw}
                onChange={onRawChange}
                onBlur={() => onRawChange(prev => normalizeRaw(prev))}
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
                value={raw}
                onChange={onRawChange}
                onBlur={() => onRawChange(prev => normalizeRaw(prev))}
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
}
