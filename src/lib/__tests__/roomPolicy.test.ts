import { describe, expect, it } from 'vitest';
import { isRoomActionAllowed, roleCanWrite, ROOM_REJECTED_ACTION_TYPES } from '../rooms/policy';

describe('room policy', () => {
  it('allows real actions, including batch wrappers', () => {
    expect(isRoomActionAllowed('UPDATE_SCENE')).toBe(true);
    expect(isRoomActionAllowed('UPDATE_ROW')).toBe(true);
    expect(isRoomActionAllowed('BATCH_START')).toBe(true);
    expect(isRoomActionAllowed('BATCH_COMMIT')).toBe(true);
  });

  it('rejects unknown types and the never-transported set', () => {
    expect(isRoomActionAllowed('NOT_REAL')).toBe(false);
    for (const type of ROOM_REJECTED_ACTION_TYPES) {
      expect(isRoomActionAllowed(type)).toBe(false);
    }
  });

  it('maps roles to write access', () => {
    expect(roleCanWrite('owner')).toBe(true);
    expect(roleCanWrite('editor')).toBe(true);
    expect(roleCanWrite('viewer')).toBe(false);
  });
});
