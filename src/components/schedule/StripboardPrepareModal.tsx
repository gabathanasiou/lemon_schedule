import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';

export interface AutoDaybreakCleanupState {
  mode: 'duration' | 'pages';
  threshold: number;
}

interface StripboardPrepareModalProps {
  /** Pending auto-daybreak placement — null keeps the modal closed. */
  state: AutoDaybreakCleanupState | null;
  onClose: () => void;
  /** Place the day breaks with the chosen actions for notes/breaks. */
  onPlace: (state: AutoDaybreakCleanupState) => void;
  notesAction: 'boneyard' | 'delete';
  onNotesAction: (v: 'boneyard' | 'delete') => void;
  breaksAction: 'boneyard' | 'delete';
  onBreaksAction: (v: 'boneyard' | 'delete') => void;
  daybreakCount: number;
  /** Day breaks carrying day details (locations/crew/call times/notes) —
   *  the cleanup copy warns that auto-placing discards them. */
  daybreakDetailCount: number;
  noteCount: number;
  breakCount: number;
}

const SEG_BASE = 'flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer';
const SEG_SEL = 'bg-[var(--ui-item-active-bg)] text-[color:var(--ui-text-strong)]';
const SEG_DEF = 'text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-item-hover-bg)]';

/** Destructive-confirm step of the auto-daybreak flow: existing separators are
 *  removed and notes/breaks either move to the Boneyard or are deleted. */
export default function StripboardPrepareModal({
  state,
  onClose,
  onPlace,
  notesAction,
  onNotesAction,
  breaksAction,
  onBreaksAction,
  daybreakCount,
  daybreakDetailCount,
  noteCount,
  breakCount,
}: StripboardPrepareModalProps) {
  if (!state) return null;

  const parts: string[] = [];
  if (daybreakCount > 0) parts.push(`${daybreakCount} day break${daybreakCount !== 1 ? 's' : ''}`);
  if (noteCount > 0) parts.push(`${noteCount} note${noteCount !== 1 ? 's' : ''}`);
  if (breakCount > 0) parts.push(`${breakCount} break${breakCount !== 1 ? 's' : ''}`);
  const summary = parts.join(', ').replace(/, ([^,]+)$/, ' and $1');

  return (
    <Modal
      open
      onClose={onClose}
      title="Prepare Stripboard"
      width="max-w-sm"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={() => onPlace(state)}>Place Day Breaks</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <p className="text-xs text-[color:var(--ui-text-muted)] leading-relaxed">
          {daybreakCount > 0 && (noteCount > 0 || breakCount > 0)
            ? <>Existing day breaks will be removed. {summary} found - choose how to handle notes and breaks.</>
            : daybreakCount > 0
            ? <>Existing day breaks will be removed before auto-placing new ones.</>
            : <>{summary} found in the stripboard - choose how to handle them.</>
          }
        </p>
        {daybreakDetailCount > 0 && (
          <p className="text-xs text-amber-400 leading-relaxed">
            {daybreakDetailCount === 1 ? 'One day has details' : `${daybreakDetailCount} days have details`} (locations, crew, call times or notes) that will be discarded. You can undo this.
          </p>
        )}
        {daybreakCount > 0 && (
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-[color:var(--ui-text)]">Day Breaks <span className="text-[color:var(--ui-text-faint)]">({daybreakCount})</span></span>
            <span className="text-xs text-[color:var(--ui-text-faint)]">Will be removed</span>
          </div>
        )}
        {noteCount > 0 && (
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-[color:var(--ui-text)]">Notes <span className="text-[color:var(--ui-text-faint)]">({noteCount})</span></span>
            <div className="flex gap-1.5">
              <button className={`${SEG_BASE} ${notesAction === 'boneyard' ? SEG_SEL : SEG_DEF}`} onClick={() => onNotesAction('boneyard')}>Boneyard</button>
              <button className={`${SEG_BASE} ${notesAction === 'delete' ? SEG_SEL : SEG_DEF}`} onClick={() => onNotesAction('delete')}>Delete</button>
            </div>
          </div>
        )}
        {breakCount > 0 && (
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-[color:var(--ui-text)]">Breaks <span className="text-[color:var(--ui-text-faint)]">({breakCount})</span></span>
            <div className="flex gap-1.5">
              <button className={`${SEG_BASE} ${breaksAction === 'boneyard' ? SEG_SEL : SEG_DEF}`} onClick={() => onBreaksAction('boneyard')}>Boneyard</button>
              <button className={`${SEG_BASE} ${breaksAction === 'delete' ? SEG_SEL : SEG_DEF}`} onClick={() => onBreaksAction('delete')}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
