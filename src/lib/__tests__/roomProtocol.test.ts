import { describe, expect, it } from 'vitest';
import {
  encodeRoomMessage,
  parseRoomClientMessage,
  parseRoomServerMessage,
  type RoomClientMessage,
  type RoomServerMessage,
} from '../rooms/protocol';

const CLIENT_MESSAGES: RoomClientMessage[] = [
  { t: 'hello', token: 'tok-1', projectId: 'p-1' },
  { t: 'init', project: 'H4sIAAAAAAAA' },
  { t: 'act', actionId: 'a-1', action: { type: 'BATCH_START' } },
  { t: 'sync' },
  { t: 'undo' },
  { t: 'redo' },
];

const SERVER_MESSAGES: RoomServerMessage[] = [
  {
    t: 'welcome',
    userId: 'u-1',
    role: 'editor',
    rev: 12,
    project: 'H4sIAAAAAAAA',
    replay: [
      { rev: 13, userId: 'u-2', action: { type: 'BATCH_START' } },
      { rev: 14, userId: 'u-1', action: { type: 'BATCH_COMMIT' } },
    ],
  },
  { t: 'needInit' },
  { t: 'remote', rev: 15, userId: 'u-2', actionId: 'a-9', action: { type: 'BATCH_START' } },
  { t: 'rejected', actionId: 'a-9', reason: 'not permitted' },
  { t: 'error', message: 'unauthenticated' },
];

describe('room protocol — client messages', () => {
  it('round-trips every client message', () => {
    for (const msg of CLIENT_MESSAGES) {
      expect(parseRoomClientMessage(encodeRoomMessage(msg))).toEqual(msg);
    }
  });

  it('rejects junk, unknown types and missing fields', () => {
    expect(parseRoomClientMessage('not json')).toBeNull();
    expect(parseRoomClientMessage('42')).toBeNull();
    expect(parseRoomClientMessage('[]')).toBeNull();
    expect(parseRoomClientMessage('{}')).toBeNull();
    expect(parseRoomClientMessage('{"t":"nope"}')).toBeNull();
    expect(parseRoomClientMessage('{"t":"hello","projectId":"p"}')).toBeNull();
    expect(parseRoomClientMessage('{"t":"hello","token":7,"projectId":"p"}')).toBeNull();
    expect(parseRoomClientMessage('{"t":"init"}')).toBeNull();
    expect(parseRoomClientMessage('{"t":"init","project":""}')).toBeNull();
    expect(parseRoomClientMessage('{"t":"act","actionId":"a"}')).toBeNull();
    expect(parseRoomClientMessage('{"t":"act","actionId":"a","action":[1]}')).toBeNull();
    expect(parseRoomClientMessage('{"t":"act","actionId":"a","action":{"type":""}}')).toBeNull();
  });

  it('strips extra fields and does not reject unknown action TYPES (semantics are the room\'s job)', () => {
    expect(parseRoomClientMessage('{"t":"sync","extra":true}')).toEqual({ t: 'sync' });
    expect(parseRoomClientMessage('{"t":"undo","extra":true}')).toEqual({ t: 'undo' });
    expect(parseRoomClientMessage('{"t":"redo","extra":true}')).toEqual({ t: 'redo' });
    expect(parseRoomClientMessage('{"t":"act","actionId":"a","action":{"type":"NOT_REAL"}}')).toEqual({
      t: 'act',
      actionId: 'a',
      action: { type: 'NOT_REAL' },
    });
  });

  it('does not accept server messages', () => {
    for (const msg of SERVER_MESSAGES) {
      expect(parseRoomClientMessage(encodeRoomMessage(msg))).toBeNull();
    }
  });
});

describe('room protocol — server messages', () => {
  it('round-trips every server message', () => {
    for (const msg of SERVER_MESSAGES) {
      expect(parseRoomServerMessage(encodeRoomMessage(msg))).toEqual(msg);
    }
  });

  it('rejects malformed welcomes, roles and revisions', () => {
    expect(parseRoomServerMessage('{"t":"welcome"}')).toBeNull();
    expect(
      parseRoomServerMessage('{"t":"welcome","userId":"u","role":"admin","rev":1,"project":"p","replay":[]}')
    ).toBeNull();
    expect(
      parseRoomServerMessage('{"t":"welcome","userId":"u","role":"owner","rev":-1,"project":"p","replay":[]}')
    ).toBeNull();
    expect(
      parseRoomServerMessage('{"t":"welcome","userId":"u","role":"owner","rev":1.5,"project":"p","replay":[]}')
    ).toBeNull();
    expect(
      parseRoomServerMessage('{"t":"welcome","userId":"u","role":"owner","rev":1,"project":"","replay":[]}')
    ).toBeNull();
    expect(
      parseRoomServerMessage(
        '{"t":"welcome","userId":"u","role":"owner","rev":1,"project":"p","replay":[{"rev":2,"userId":"u"}]}'
      )
    ).toBeNull();
    expect(parseRoomServerMessage('{"t":"remote","rev":1,"userId":"u","actionId":"a"}')).toBeNull();
    expect(parseRoomServerMessage('{"t":"rejected","actionId":"a"}')).toBeNull();
    expect(parseRoomServerMessage('{"t":"error","message":""}')).toBeNull();
  });

  it('does not accept client messages', () => {
    for (const msg of CLIENT_MESSAGES) {
      expect(parseRoomServerMessage(encodeRoomMessage(msg))).toBeNull();
    }
  });
});
