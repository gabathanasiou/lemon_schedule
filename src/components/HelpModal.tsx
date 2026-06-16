/**
 * HelpModal — displays all keyboard shortcuts and controls for the schedule stripboard.
 *
 * IMPORTANT: When adding new controls, shortcuts, or interactions to the stripboard,
 * update this modal to reflect them. Each section is a category; add new rows as needed.
 * Use Unicode symbols in `<kbd>` elements for keyboard keys.
 */

import React from 'react';
import Modal from './Modal';
import { ModalFooter } from './Modal';

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 rounded bg-zinc-800 border border-zinc-600 text-[10px] font-medium text-zinc-200 font-sans">
    {children}
  </kbd>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-1.5 mb-2">{title}</h3>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const Row: React.FC<{ keys: React.ReactNode; action: string }> = ({ keys, action }) => (
  <div className="flex items-start gap-3 text-xs">
    <div className="flex items-center gap-1 shrink-0 min-w-[100px]">{keys}</div>
    <span className="text-zinc-400">{action}</span>
  </div>
);

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Stripboard Controls" width="max-w-lg"
      footer={
        <ModalFooter>
          <button onClick={onClose} className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors">
            Close
          </button>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5 overflow-y-auto max-h-[65vh]">
        <Section title="Cell Editing (Edit mode)">
          <Row keys={<><Kbd>⏎</Kbd> Enter</>} action="Commit edit, stay on cell" />
          <Row keys={<><Kbd>⇧</Kbd> + <Kbd>⏎</Kbd></>} action="Commit & jump to same field in next row (selects row)" />
          <Row keys={<><Kbd>⎋</Kbd> Esc</>} action="Cancel edit, revert to original value" />
          <Row keys={<><Kbd>↑</Kbd> <Kbd>↓</Kbd></>} action="Commit & navigate same field up/down (selects row)" />
          <Row keys={<>First keystroke</>} action="Auto-clears duration/call time field on type (clear-on-type)" />
          <Row keys={<>Double-click</>} action="Enter edit mode on note/break text cells" />
        </Section>

        <Section title="Selection">
          <Row keys={<>Click</>} action="Select a single row" />
          <Row keys={<><Kbd>⌘</Kbd> + Click</>} action="Toggle row in/out of multi-selection" />
          <Row keys={<><Kbd>⇧</Kbd> + Click</>} action="Select contiguous range from last clicked row" />
          <Row keys={<>Click + drag</>} action="Marquee select multiple rows (empty space)" />
          <Row keys={<><Kbd>⌥</Kbd> + Click</>} action="Start marquee selection from on top of a row" />
          <Row keys={<><Kbd>⌘</Kbd> hold</>} action="Add Mode: disable drag, enable marquee from rows, click toggles" />
          <Row keys={<><Kbd>⎋</Kbd> Esc</>} action="Clear all row selections" />
        </Section>

        <Section title="Navigation">
          <Row keys={<><Kbd>←</Kbd> <Kbd>→</Kbd></>} action="Select previous / next day header" />
          <Row keys={<><Kbd>↑</Kbd> <Kbd>↓</Kbd></>} action="Move selection up / down through all rows" />
          <Row keys={<><Kbd>⇧</Kbd> + <Kbd>↑</Kbd>/<Kbd>↓</Kbd></>} action="Extend / contract selection range" />
          <Row keys={<><Kbd>↹</Kbd> Tab</>} action="Toggle focus between unscheduled sidebar ↔ stripboard" />
          <Row keys={<><Kbd>⏎</Kbd> Enter</>} action="With 1 row selected: focus inline cell editor" />
        </Section>

        <Section title="Scheduling">
          <Row keys={<><Kbd>0</Kbd> – <Kbd>9</Kbd></>} action="Quick-schedule: type day number for selected unscheduled rows" />
          <Row keys={<><Kbd>⏎</Kbd> Enter</>} action="Commit digit buffer immediately (during quick-schedule)" />
          <Row keys={<>Drag & drop</>} action="Move rows between days or reorder within a day" />
          <Row keys={<>Drag day header</>} action="Reorder entire days (swaps rows and metadata)" />
          <Row keys={<><Kbd>⇧</Kbd> + Drag</>} action="Not yet implemented (range select only)" />
        </Section>

        <Section title="Cut, Paste & Delete">
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>X</Kbd></>} action="Cut selected rows to clipboard (unschedule with marker)" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>V</Kbd></>} action="Paste clipboard items below selected row (1 row selected)" />
          <Row keys={<><Kbd>⌫</Kbd> Del / <Kbd>⌫</Kbd></>} action="Unschedule selected rows (move back to Unscheduled)" />
        </Section>

        <Section title="Context Menu (Right-click)">
          <Row keys={<>Right-click</>} action="Open context menu on a row" />
          <Row keys={<>Add Note / Break</>} action="Insert a note or break row below the target" />
          <Row keys={<>Duplicate</>} action="Clone scene (lettered suffix), note, or break" />
          <Row keys={<>Cut to Buffer</>} action="Cut selected rows to clipboard" />
          <Row keys={<>Paste Below</>} action="Paste clipboard items below" />
          <Row keys={<>Change Color</>} action="Edit banner background & text color (notes only)" />
          <Row keys={<>Open Sheet</>} action="Open scene in Breakdown tab (scenes only)" />
          <Row keys={<>Remove Ribbon</>} action="Unschedule the row" />
          <Row keys={<>Delete</>} action="Permanently delete the row" />
        </Section>

        <Section title="Unscheduled Sidebar">
          <Row keys={<>+ NOTE / + BREAK</>} action="Create new note or break rows in Unscheduled" />
          <Row keys={<>Sort dropdown</>} action="Sort by Scene #, Script Day, Page Count, or Set" />
          <Row keys={<>Collapse</>} action="Collapse sidebar to save space (persisted)" />
          <Row keys={<>Resize edge</>} action="Drag right edge to resize sidebar (200px – 600px)" />
        </Section>

        <Section title="Mouse">
          <Row keys={<>Double-click note</>} action="Open banner color editor (Edit Banner)" />
          <Row keys={<>Double-click scene</>} action="Open scene in Breakdown tab" />
          <Row keys={<>Click day header</>} action="Select the entire day" />
          <Row keys={<>Click empty space</>} action="Deselect all rows" />
          <Row keys={<>Trash on day header</>} action="Unschedule all rows from that day" />
        </Section>

        <div className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800">
          <Kbd>⌘</Kbd> = Command (Mac) / Ctrl (Win) · <Kbd>⌥</Kbd> = Option (Mac) / Alt (Win) · <Kbd>⇧</Kbd> = Shift
        </div>
      </div>
    </Modal>
  );
}