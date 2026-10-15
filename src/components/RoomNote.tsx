import React from 'react';
import { useProject } from '../store';
import { roomNoteText } from '../lib/rooms/roomNotes';

/**
 * The ONE transient room note (roadmap 242) — a blocked undo ("Can't undo —
 * someone edited this after you"), an empty stack, a refusal. It sits NEXT TO
 * the header undo/redo buttons (and in the popout toolbar) because that is
 * where the affordance lives that produced it; it is advisory only, never a
 * dialog, and auto-hides (the provider owns the timer, `ROOM_NOTE_MS`).
 *
 * Repeats re-arm the timer instead of stacking (the provider bumps `id`), so a
 * double ⌘Z cannot pile up two chips.
 */
export function RoomNote() {
  const { roomNote } = useProject();
  if (!roomNote) return null;
  const text = roomNoteText(roomNote.message);
  return (
    <div
      key={roomNote.id}
      data-testid="room-note"
      role="status"
      aria-live="polite"
      title={text}
      className="max-w-[320px] truncate rounded-full border border-white/20 bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold text-white/95"
    >
      {text}
    </div>
  );
}
