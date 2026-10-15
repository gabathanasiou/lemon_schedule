/**
 * Room error copy (roadmap 242) — the blocked-undo messages the room sends ride
 * these constants (worker and test harnesses share ONE source), and
 * `roomNoteText` polishes the room's terse wire strings into the note the
 * header shows.
 *
 * The note itself is advisory only: room errors never block editing (no
 * dialog), they are the room being honest about what it refused.
 */

/** A peer edited over the caller's unit, so the undo reverted nothing. */
export const ROOM_UNDO_BLOCKED = "Can't undo — someone edited this after you";
/** A peer edited after the caller's undo, so re-applying the unit would clobber them. */
export const ROOM_REDO_BLOCKED = "Can't redo — someone edited this after you";
/** How long the header note stays up (repeats re-arm it). */
export const ROOM_NOTE_MS = 6_000;

/** Wire string → header note. Anything unmapped shows as the room sent it. */
const ROOM_NOTE_COPY: Record<string, string> = {
  [ROOM_UNDO_BLOCKED]: ROOM_UNDO_BLOCKED,
  [ROOM_REDO_BLOCKED]: ROOM_REDO_BLOCKED,
  'nothing to undo': 'Nothing to undo',
  'nothing to redo': 'Nothing to redo',
  'action too old to undo': 'That change is too old to undo',
  'view-only': "View only — you can't make changes here",
  'rate limited': 'Slow down — the room throttled this connection and will reconnect',
  'undo failed': 'Undo failed — the room could not rebuild the state',
  'redo failed': 'Redo failed — the change no longer applies',
};

export function roomNoteText(message: string): string {
  return ROOM_NOTE_COPY[message] ?? message;
}
