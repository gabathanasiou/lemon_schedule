/**
 * HelpModal — displays all keyboard shortcuts and controls for the schedule stripboard.
 *
 * IMPORTANT: When adding new controls, shortcuts, or interactions to the stripboard,
 * update this modal to reflect them. Each section is a category; add new rows as needed.
 * Use Unicode symbols in `<Kbd>` elements for keyboard keys.
 */

import React from 'react';
import { IS_COARSE } from '../lib/device';

const HM_KBD = IS_COARSE ? 'inline-flex items-center justify-center min-w-[2rem] h-6 px-1.5 rounded bg-zinc-800 border border-zinc-600 text-xs font-medium text-zinc-200 font-sans' : 'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 rounded bg-zinc-800 border border-zinc-600 text-[10px] font-medium text-zinc-200 font-sans';
const HM_SECTION_TITLE = IS_COARSE ? 'text-xs' : 'text-[10px]';
const HM_TABLE_CELL = IS_COARSE ? 'text-sm py-2' : 'text-xs py-1.5';
const HM_CONTENT = IS_COARSE ? 'px-7 py-5 space-y-6' : 'px-6 py-4 space-y-5';
const HM_FOOTER_BTN = IS_COARSE ? 'px-7 py-2.5 text-sm' : 'px-6 py-2 text-xs';

import Modal from './Modal';
import { ModalFooter } from './Modal';

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className={HM_KBD}>
    {children}
  </kbd>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className={`${HM_SECTION_TITLE} font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-2`}>{title}</h3>
    <table className={`w-full ${IS_COARSE ? 'text-sm' : 'text-xs'}`}>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const Row: React.FC<{ keys: React.ReactNode; action: string }> = ({ keys, action }) => (
  <tr className="border-b border-zinc-800/50 last:border-b-0">
    <td className={`${HM_TABLE_CELL} pr-3 text-zinc-300 whitespace-nowrap align-top w-[130px]`}>{keys}</td>
    <td className={`${HM_TABLE_CELL} text-zinc-400`}>{action}</td>
  </tr>
);

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Stripboard Controls" width="max-w-xl"
      footer={
        <ModalFooter>
          <button onClick={onClose} className={`${HM_FOOTER_BTN} bg-zinc-800 text-white font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors`}>
            Close
          </button>
        </ModalFooter>
      }
    >
      <div className={`${HM_CONTENT} overflow-y-auto max-h-[65vh]`}>
        <Section title="Cell Editing (Edit mode)">
          <Row keys={<><Kbd>⏎</Kbd> Enter</>} action="Commit edit, stay on cell" />
          <Row keys={<><Kbd>⇧</Kbd> + <Kbd>⏎</Kbd></>} action="Commit & jump to same field in next ribbon (selects ribbon)" />
          <Row keys={<><Kbd>⎋</Kbd> Esc</>} action="Cancel edit, revert to original value" />
          <Row keys={<><Kbd>↑</Kbd> <Kbd>↓</Kbd></>} action="Commit & navigate same field up/down (selects ribbon)" />
          <Row keys={<>First keystroke</>} action="Auto-clears duration/call time field on type (clear-on-type)" />
          <Row keys={<>Double-click</>} action="Enter edit mode on note/break text cells" />
        </Section>

        <Section title="Selection">
          <Row keys={<>Click</>} action="Select a single ribbon" />
          <Row keys={<><Kbd>⌘</Kbd> + Click</>} action="Toggle ribbon in/out of multi-selection" />
          <Row keys={<><Kbd>⇧</Kbd> + Click</>} action="Select contiguous range from last clicked ribbon" />
          <Row keys={<>Click + drag</>} action="Marquee select multiple ribbons (empty space)" />
          <Row keys={<><Kbd>⌥</Kbd> + Click</>} action="Start marquee selection from on top of a ribbon" />
          <Row keys={<><Kbd>⌘</Kbd> hold</>} action="Add Mode: disable drag, enable marquee from ribbons, click toggles" />
          <Row keys={<><Kbd>⎋</Kbd> Esc</>} action="Clear all ribbon selections" />
        </Section>

        <Section title="Navigation">
          <Row keys={<><Kbd>←</Kbd> <Kbd>→</Kbd></>} action="Select previous / next day header" />
          <Row keys={<><Kbd>↑</Kbd> <Kbd>↓</Kbd></>} action="Move selection up / down through all ribbons" />
          <Row keys={<><Kbd>⇧</Kbd> + <Kbd>↑</Kbd>/<Kbd>↓</Kbd></>} action="Extend / contract selection range" />
          <Row keys={<><Kbd>↹</Kbd> Tab</>} action="Toggle focus between boneyard sidebar ↔ stripboard" />
          <Row keys={<><Kbd>⏎</Kbd> Enter</>} action="With 1 ribbon selected: focus duration / call time cell" />
          <Row keys={<><Kbd>⇧</Kbd> + <Kbd>⏎</Kbd></>} action="With 1 note/break selected: focus inline text cell editor" />
        </Section>

        <Section title="Scheduling">
          <Row keys={<><Kbd>0</Kbd> – <Kbd>9</Kbd></>} action="Quick-schedule: type section number for selected boneyard ribbons" />
          <Row keys={<><Kbd>⏎</Kbd> Enter</>} action="Commit digit buffer immediately (during quick-schedule)" />
          <Row keys={<>Drag & drop</>} action="Move ribbons between days or reorder within a day" />
        </Section>

        <Section title="Cut, Paste & Delete">
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>X</Kbd></>} action="Cut selected ribbons to clipboard (send to boneyard with marker)" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>V</Kbd></>} action="Paste clipboard items below selected ribbon (1 ribbon selected)" />
          <Row keys={<><Kbd>⌫</Kbd> Del / <Kbd>⌫</Kbd></>} action="Send to Boneyard (move selected ribbons to boneyard)" />
        </Section>

        <Section title="Touch / iPad">
          <Row keys={<>Swipe</>} action="Scroll — swipe on ribbons, gaps, margins, or day headers" />
          <Row keys={<>Press & hold</>} action="Drag a ribbon — hold still (~200ms) then drag. Drags full multi-selection if tapped item is selected" />
          <Row keys={<>Tap</>} action="Select a single ribbon (deselects any others)" />
          <Row keys={<><Kbd>⊞</Kbd> Select Mode</>} action="Top float bottom-right: tap to enable. Tap ribbons to toggle selection. Drag empty space to marquee. Long-press for context menu" />
          <Row keys={<><Kbd>⌨</Kbd> Keyboard</>} action="Bottom float bottom-right: tap to toggle keyboard input on entity dropdowns. Off = picker-only (no iOS keyboard popup)" />
          <Row keys={<>Exit Select Mode</>} action="Long-press any selected ribbon to drag the whole set to a new day" />
          <Row keys={<>Drag edge</>} action="Resize sidebar by dragging the right edge" />
          <Row keys={<>Drag ▸◂</>} action="Resize columns by dragging the divider between any two column headers" />
        </Section>

        <Section title="Calendar">
          <Row keys={<>Drag day header</>} action="Swap two days' content and call times in the stripboard" />
        </Section>

        <Section title="Boneyard Sidebar">
          <Row keys={<>+ NOTE / + BREAK</>} action="Create new note or break ribbons in Boneyard" />
          <Row keys={<>Sort dropdown</>} action="Sort by Scene #, Script Day, Page Count, or Set" />
          <Row keys={<>Collapse</>} action="Collapse sidebar to save space (persisted)" />
          <Row keys={<>Resize edge</>} action="Drag right edge to resize sidebar (200px – 600px)" />
        </Section>

        <Section title="Mouse">
          <Row keys={<>Double-click note</>} action="Open banner color editor (Edit Banner)" />
          <Row keys={<>Double-click scene</>} action="Open scene in Breakdown tab" />
          <Row keys={<><Kbd>⇧</Kbd> + Double-click scene</>} action="Open scene sheet in a new window" />
          <Row keys={<>Click day header</>} action="Select the entire day" />
          <Row keys={<>Click empty space</>} action="Deselect all rows" />
          <Row keys={<>Trash on day header</>} action="Send all ribbons from that day to boneyard" />
        </Section>

        <Section title="Context Menu (Right-click)">
          <Row keys={<>Right-click</>} action="Open context menu on a ribbon" />
          <Row keys={<>Add Note / Break / Daybreak</>} action="Insert a note, break, or daybreak ribbon below the target" />
          <Row keys={<>Duplicate</>} action="Clone scene (lettered suffix), note, or break" />
          <Row keys={<>Cut to Buffer</>} action="Cut selected ribbons to clipboard" />
          <Row keys={<>Paste Below</>} action="Paste clipboard ribbons below" />
          <Row keys={<>Change Color</>} action="Edit banner background & text color (notes only)" />
          <Row keys={<>Open Sheet</>} action="Open scene in Breakdown tab (scenes only)" />
          <Row keys={<><Kbd>⇧</Kbd> + Right-click → Open in New Window</>} action="Open scene sheet in a new window (scenes only)" />
          <Row keys={<>Send to Boneyard</>} action="Move the ribbon back to the boneyard" />
          <Row keys={<>Delete</>} action="Permanently delete the ribbon" />
        </Section>

        <Section title="Pop-out Windows">
          <Row keys={<><Kbd>⇧</Kbd> + Double-click</>} action="Open scene sheet in a new window (from stripboard, calendar, or Glide grid)" />
          <Row keys={<><Kbd>⇧</Kbd> + Right-click</>} action={'Context menu shows "Open in New Window" instead of "Open Sheet"'} />
          <Row keys={<><Kbd>⇧</Kbd> + Click</>} action="Click sheet header banner to open Schedule in a new window" />
          <Row keys={<>Tab pop-out icon</>} action="Hover tab name and click <Kbd>⇗</Kbd> to open tab in a separate window. Click again to bring back." />
        </Section>

        <div className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800">
          <Kbd>⌘</Kbd> = Command (Mac) / Ctrl (Win) · <Kbd>⌥</Kbd> = Option (Mac) / Alt (Win) · <Kbd>⇧</Kbd> = Shift
        </div>
      </div>
    </Modal>
  );
}