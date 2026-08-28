/**
 * HelpModal - displays all keyboard shortcuts and controls for the schedule stripboard.
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

import Modal from './Modal';
import { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';

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
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={`${HM_CONTENT} overflow-y-auto max-h-[65vh]`}>
        <Section title="Cell Editing (Edit mode)">
          <Row keys={<>Click a field</>} action="Make that strip editable and open/focus the field (one tap — hover shows which fields are editable)" />
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
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>A</Kbd></>} action="Select all ribbons in current context (stripboard or boneyard)" />
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
          <Row keys={<><Kbd>0</Kbd> - <Kbd>9</Kbd></>} action="Quick-schedule: type section number for selected boneyard ribbons" />
          <Row keys={<><Kbd>⏎</Kbd> Enter</>} action="Commit digit buffer immediately (during quick-schedule)" />
          <Row keys={<>Drag & drop</>} action="Move ribbons between days or reorder within a day" />
        </Section>

        <Section title="Cut, Paste & Delete">
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>X</Kbd></>} action="Cut selected ribbons to clipboard (send to boneyard with marker)" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>V</Kbd></>} action="Paste clipboard items below selected ribbon (1 ribbon selected)" />
          <Row keys={<><Kbd>⌫</Kbd> Del / <Kbd>⌫</Kbd></>} action="Send to Boneyard (move selected ribbons to boneyard)" />
        </Section>

        <Section title="Breakdown Grid (Glide)">
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>C</Kbd></>} action="Copy selected cells / row / column" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>X</Kbd></>} action="Cut selected cells (copies + clears)" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>V</Kbd></>} action="Paste clipboard contents at the selected cell" />
          <Row keys={<>Right-click / Tap row number</>} action="Context menu: Copy / Cut / Paste / Clear / Insert / Duplicate / Delete" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>⏎</Kbd></>} action="Add a scene at the end of the grid" />
        </Section>

        <Section title="Reports Designer (text blocks)">
          <Row keys={<>Type <Kbd>@</Kbd></>} action="Insert an attribute at the caret — opens the attribute picker (type to filter, ↑/↓ to move, ⏎ to insert)" />
          <Row keys={<>Click a tag</>} action="Select it — ⌫ deletes it, typing replaces it, Bold/Italic apply to it" />
          <Row keys={<>Tag colors</>} action="Each attribute group has its own color (Scene Info, Shooting, Document, …)" />
          <Row keys={<>Named styles</>} action="A style (Heading 1, Body, …) formats the whole block. Bold/Italic then show dimmed — they come from the style, so the rest of the toolbar (Underline, Strikethrough, Color, Link) does the per-word work. Edit or restyle via Style → Edit styles…" />
          <Row keys={<>Color “Default”</>} action="First color swatch clears the color — text shows light in the editor and prints black on paper" />
        </Section>

        <Section title="Touch / iPad">
          <Row keys={<>Swipe</>} action="Scroll - swipe on ribbons, gaps, margins, or day headers" />
          <Row keys={<>Press & hold</>} action="Drag a ribbon - hold still (~200ms) then drag. Drags full multi-selection if tapped item is selected" />
          <Row keys={<>Tap</>} action="Select a single ribbon (deselects any others)" />
          <Row keys={<><Kbd>⊞</Kbd> Select Mode</>} action="Top float bottom-right: tap to enable. Tap ribbons to toggle selection. Drag empty space to marquee. Long-press for context menu" />
          <Row keys={<><Kbd>⌨</Kbd> Keyboard</>} action="Bottom float bottom-right: tap to toggle keyboard input on entity dropdowns and grid cells. Off = picker-only (no soft keyboard popup). Amber = hardware keyboard detected (toggle has no effect)" />
          <Row keys={<>Exit Select Mode</>} action="Long-press any selected ribbon to drag the whole set to a new day" />
          <Row keys={<>Drag edge</>} action="Resize sidebar by dragging the right edge" />
          <Row keys={<>Drag ▸◂</>} action="Resize columns by dragging the divider between any two column headers" />
        </Section>

        <Section title="Calendar">
          <Row keys={<>Scroll</>} action="Vertical scroll shows the whole production; each month is its own block" />
          <Row keys={<>« › ‹ »</>} action="Jump to first / last day, or previous / next month block" />
          <Row keys={<>Today</>} action="Jump to today's week (clamped to the production range)" />
          <Row keys={<>Drag day header</>} action="Swap two days' content and call times: drop on the center of another day. Drop on a day's left or right edge to insert your day before/after it, pushing the other days (call times travel with each day)" />
          <Row keys={<>Drag to bottom bar</>} action="Drop a dragged day on the 'insert at end' bar to append it as the last day" />
          <Row keys={<>Right-click day header</>} action="Mark day as Hold / Travel / Day Off (non-shoot date)" />
          <Row keys={<>Right-click ribbon</>} action="Cut / Paste / Duplicate / Delete / Send to Boneyard (mirrors Schedule tab, no Day Break)" />
        </Section>

        <Section title="Boneyard Sidebar">
          <Row keys={<>+ NOTE / + BREAK</>} action="Create new note or break ribbons in Boneyard" />
          <Row keys={<>Sort dropdown</>} action="Sort by Scene #, Script Day, Page Count, Duration, INT/EXT, Day/Night, or any category" />
          <Row keys={<>Collapse</>} action="Collapse sidebar to save space (persisted)" />
          <Row keys={<>Resize edge</>} action="Drag right edge to resize sidebar (200px - 600px)" />
          <Row keys={<><Kbd>↑</Kbd> <Kbd>↓</Kbd></>} action="Move selection up / down through boneyard ribbons (Schedule + Calendar)" />
          <Row keys={<><Kbd>⇧</Kbd> + <Kbd>↑</Kbd>/<Kbd>↓</Kbd></>} action="Extend / contract boneyard selection range (Schedule + Calendar)" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>A</Kbd></>} action="Select all boneyard ribbons (Schedule + Calendar)" />
        </Section>

        <Section title="Mouse">
          <Row keys={<>Double-click note</>} action="Open banner color editor (Edit Banner)" />
          <Row keys={<>Double-click scene</>} action="Open scene in Breakdown tab" />
          <Row keys={<><Kbd>⇧</Kbd> + Double-click scene</>} action="Open scene sheet in a new window" />
          <Row keys={<>Click day header</>} action="Select the entire day" />
          <Row keys={<>Click empty space</>} action="Deselect all rows" />
          <Row keys={<>Trash on day header</>} action="Send all ribbons from that day to boneyard" />
        </Section>

        <Section title="Toolbar">
          <Row keys={<>Day Breaks</>} action="Add day break separators across all days (by duration or pages), or delete all" />
          <Row keys={<>Banners</>} action="Add a NOTE/BREAK banner (custom label + duration) to every day at the top, middle, or bottom; middle can split by ribbons, duration, or pages. Also delete all notes or breaks" />
        </Section>

        <Section title="Context Menu (Right-click)">
          <Row keys={<>Right-click</>} action="Open context menu on a ribbon" />
          <Row keys={<>Add Note / Break / Day Break</>} action="Insert a note, break, or day break ribbon below the target" />
          <Row keys={<>Duplicate</>} action="Clone scene (lettered suffix), note, or break" />
          <Row keys={<>Cut to Buffer</>} action="Cut selected ribbons to clipboard" />
          <Row keys={<>Paste Below</>} action="Paste clipboard ribbons below" />
          <Row keys={<>Change Color</>} action="Edit banner background & text color (notes only)" />
          <Row keys={<>Open Sheet</>} action="Open scene in Breakdown tab (scenes only)" />
          <Row keys={<><Kbd>⇧</Kbd> + Right-click → Open in New Window</>} action="Open scene sheet in a new window (scenes only)" />
          <Row keys={<>Send to Boneyard</>} action="Move the ribbon back to the boneyard" />
          <Row keys={<>Delete</>} action="Permanently delete the ribbon" />
        </Section>

        <Section title="Element Manager">
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>S</Kbd></>} action="Save changes (or the Save button). Merges are confirmed before saving" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>⇧</Kbd> + <Kbd>N</Kbd></>} action="Add a new row" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>Z</Kbd> / <Kbd>⌘</Kbd> + <Kbd>⇧</Kbd> + <Kbd>Z</Kbd></>} action="Undo / redo unsaved edits (one step per operation: rename, add, delete, sort, Auto-ID) — same as the top Undo/Redo buttons" />
          <Row keys={<>Revert</>} action="Discard all unsaved edits back to the last save" />
          <Row keys={<>Save then <Kbd>⌘</Kbd> + <Kbd>Z</Kbd></>} action="Undoes the whole save as one step" />
          <Row keys={<>Day columns</>} action="Start Date, Finish Date and Total Days from the schedule, plus a column per day type — built-ins (Work, Hold, Travel, Day Off) and every custom type from the Calendar's Day Types tab; scroll the table horizontally to see them all" />
        </Section>

        <Section title="Crew Manager">
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>S</Kbd></>} action="Save crew changes (or the Save button). Same-name merges are confirmed before saving" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>⇧</Kbd> + <Kbd>N</Kbd></>} action="Add a new member row" />
          <Row keys={<><Kbd>⌘</Kbd> + <Kbd>Z</Kbd> / <Kbd>⌘</Kbd> + <Kbd>⇧</Kbd> + <Kbd>Z</Kbd></>} action="Undo / redo unsaved crew edits (one step per operation) — same as the top Undo/Redo buttons" />
          <Row keys={<>Revert</>} action="Discard all unsaved edits back to the last save" />
          <Row keys={<>Deleted members go to Trash</>} action="Restore from the File menu's Trash; a role is recreated automatically if it was deleted" />
        </Section>

        <Section title="Locations Manager & Glide">
          <Row keys={<>Locations Manager</>} action="Type sidebar groups addresses. Each entry has a name, map pin (search + drag the pin), contact details and nearest hospital/police links" />
          <Row keys={<>Locations Glide</>} action="Spreadsheet view — right-click a column header to sort, right-click a row for Go to Locations Manager" />
          <Row keys={<>Type cell</>} action="Autocomplete creates a new type as you type; types are managed in the Locations Manager sidebar" />
          <Row keys={<>CSV</>} action="Import / Export Locations CSV from the Edit menu (headers: Name, Type, Address, Contact, Phone, Email)" />
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