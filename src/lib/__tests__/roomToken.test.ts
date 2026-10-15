import { describe, expect, it } from 'vitest';
import { mintRoomToken, parseDevToken, verifyRoomToken } from '../rooms/roomToken';

const SECRET = 'test-secret';
const CLAIMS = { projectId: 'p-1', userId: 'u-1', role: 'editor' as const };

describe('room tokens', () => {
  it('round-trips a minted token', async () => {
    const token = await mintRoomToken(SECRET, CLAIMS);
    await expect(verifyRoomToken(SECRET, token, 'p-1')).resolves.toEqual({ userId: 'u-1', role: 'editor' });
  });

  it('rejects a wrong secret, wrong room, expiry and tampering', async () => {
    const token = await mintRoomToken(SECRET, CLAIMS);
    await expect(verifyRoomToken('other-secret', token, 'p-1')).resolves.toBeNull();
    await expect(verifyRoomToken(SECRET, token, 'p-2')).resolves.toBeNull();

    const expired = await mintRoomToken(SECRET, CLAIMS, -10);
    await expect(verifyRoomToken(SECRET, expired, 'p-1')).resolves.toBeNull();

    const parts = token.split('.');
    const tamperedPayload = `${parts[0]}.${parts[1]}x.${parts[2]}`;
    await expect(verifyRoomToken(SECRET, tamperedPayload, 'p-1')).resolves.toBeNull();
    const tamperedSig = `${parts[0]}.${parts[1]}.${parts[2]}x`;
    await expect(verifyRoomToken(SECRET, tamperedSig, 'p-1')).resolves.toBeNull();
  });

  it('rejects malformed tokens', async () => {
    for (const bad of ['', 'v1', 'v1.a', 'v1.a.b', 'v2.a.b', 'v1.@@@.@@@', 'v1..']) {
      await expect(verifyRoomToken(SECRET, bad, 'p-1')).resolves.toBeNull();
    }
  });

  it('parses dev tokens only in the dev shape', () => {
    expect(parseDevToken('dev:u-9:owner')).toEqual({ userId: 'u-9', role: 'owner' });
    expect(parseDevToken('dev:u-9:viewer')).toEqual({ userId: 'u-9', role: 'viewer' });
    expect(parseDevToken('dev::owner')).toBeNull();
    expect(parseDevToken('dev:u-9:admin')).toBeNull();
    expect(parseDevToken('u-9:owner')).toBeNull();
    expect(parseDevToken('dev:u-9')).toBeNull();
  });
});
