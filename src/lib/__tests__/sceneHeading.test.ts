import { describe, it, expect } from 'vitest';
import { parseSceneHeading } from '../import/shared';

describe('parseSceneHeading', () => {
  it('splits INT/EXT, set and day/night', () => {
    expect(parseSceneHeading('INT. KITCHEN - DAY')).toMatchObject({ intExt: 'INT', set: 'KITCHEN', dayNight: 'DAY' });
    expect(parseSceneHeading('EXT. STREET - NIGHT')).toMatchObject({ intExt: 'EXT', set: 'STREET', dayNight: 'NIGHT' });
  });

  it('strips a leading scene number so the set never absorbs INT/EXT', () => {
    // FDX/MSD headings often embed the number in the text.
    expect(parseSceneHeading('1. INT. Corridor - night')).toMatchObject({ intExt: 'INT', set: 'CORRIDOR', dayNight: 'NIGHT' });
    expect(parseSceneHeading('12A. EXT. Field - DAY')).toMatchObject({ intExt: 'EXT', set: 'FIELD', dayNight: 'DAY' });
    expect(parseSceneHeading('3 - INT. Forest')).toMatchObject({ intExt: 'INT', set: 'FOREST' });
  });

  it('keeps a set that starts with a digit', () => {
    expect(parseSceneHeading('INT. 42ND STREET - DAY')).toMatchObject({ intExt: 'INT', set: '42ND STREET' });
  });

  it('keeps a custom day/night word (DREAM) instead of folding it into the set', () => {
    expect(parseSceneHeading('INT. Corridor - DREAM')).toMatchObject({ intExt: 'INT', set: 'CORRIDOR', dayNight: 'DREAM' });
    expect(parseSceneHeading('INT. Corridor - WING B')).toMatchObject({ set: 'CORRIDOR - WING B' });
  });

  it('recognizes multi-word custom day/night values without eating set qualifiers', () => {
    expect(parseSceneHeading('INT. KITCHEN - MAGIC HOUR')).toMatchObject({ set: 'KITCHEN', dayNight: 'MAGIC HOUR' });
    expect(parseSceneHeading('EXT. BEACH - LATER THAT NIGHT')).toMatchObject({ dayNight: 'LATER THAT NIGHT' });
    expect(parseSceneHeading('INT. ROOM - DINNER TIME')).toMatchObject({ dayNight: 'DINNER TIME' });
    // A set qualifier with no time token stays in the set.
    expect(parseSceneHeading('INT. HOUSE - LIVING ROOM')).toMatchObject({ set: 'HOUSE - LIVING ROOM' });
    expect(parseSceneHeading('INT. HOSPITAL - DAY ROOM')).toMatchObject({ set: 'HOSPITAL - DAY ROOM' });
  });

  it('recognizes multi-word values already known to the project', () => {
    const known = new Set(['GHOST LIGHT']);
    expect(parseSceneHeading('INT. ATTIC - GHOST LIGHT', undefined, known)).toMatchObject({ set: 'ATTIC', dayNight: 'GHOST LIGHT' });
    // Without the project knowing it, the phrase stays part of the set.
    expect(parseSceneHeading('INT. ATTIC - GHOST LIGHT')).toMatchObject({ set: 'ATTIC - GHOST LIGHT' });
  });

  it('recognizes localized (Greek) INT/EXT and day/night', () => {
    expect(parseSceneHeading('ΕΣΩΤ. ΚΟΥΖΙΝΑ - ΝΥΧΤΑ')).toMatchObject({ intExt: 'INT', set: 'ΚΟΥΖΙΝΑ', dayNight: 'ΝΥΧΤΑ' });
    expect(parseSceneHeading('ΕΞΩΤ. ΔΡΟΜΟΣ - ΜΕΡΑ')).toMatchObject({ intExt: 'EXT' });
  });

  it('resolves CONTINUOUS/LATER to the previous day/night', () => {
    expect(parseSceneHeading('INT. HALL - CONTINUOUS', 'NIGHT')?.dayNight).toBe('NIGHT');
  });
});
