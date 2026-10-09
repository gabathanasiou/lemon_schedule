import { useCallback } from 'react';
import type { ReportBlock } from '../../../types';
import { isDayGridBlock } from '../../../lib/reportBlocks';
import { useDialog } from '../../Dialog';
import type { PaletteDropPayload } from '../../reports/ReportPalette';

/**
 * Guard for the Call Sheet → Edit hosts (the page palette inserts into the
 * per-day edit zone; the zone canvas owns drop zones / edge wraps / column
 * drops). The day-scoped grid blocks (Call Times · Crew Table · Precalls) only
 * render LIVE as template-level children of the design's Days repeat — inside
 * the edit zone they would render read-only, so the insert is refused with a
 * pointer at the right place. ONE guard for both hosts (never fork the check).
 */
export function useCallSheetGridGuard(): (payload: PaletteDropPayload) => boolean {
  const dialog = useDialog();
  return useCallback((payload: PaletteDropPayload): boolean => {
    // Field picks insert text; existing-block moves aren't new placements.
    if (payload.field || payload.moveId) return true;
    const type = (payload.type || 'text') as ReportBlock['type'];
    if (!isDayGridBlock(type)) return true;
    dialog.alert({
      title: 'Can’t drop that here',
      message:
        'This block only works inside a Repeat over Days. Add it to the call-sheet TEMPLATE — Design → Reports Designer, inside the Days repeat — where it renders live; the per-day edit zone stays read-only.',
    });
    return false;
  }, [dialog]);
}
