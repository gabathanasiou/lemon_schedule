import { describe, expect, it } from 'vitest';
import { onlineProjectListForDisplay } from '../supabase/onlineProjectList';
import type { ProjectMeta } from '../../store/storage';

const meta = (id: string, title = id, lastModified = 1): ProjectMeta => ({
  id, title, lastModified, createdAt: 0, onlineId: id,
});

describe('onlineProjectListForDisplay (roadmap 249)', () => {
  it('signed out: no list, no count — a stale session never shows shared projects', () => {
    expect(onlineProjectListForDisplay({
      signedIn: false, serverMetas: [meta('a'), meta('b')], fetchFailed: false,
    })).toBeNull();
  });

  it('fetch failed: a stale answer is never presented as truth (even a real prior list)', () => {
    expect(onlineProjectListForDisplay({
      signedIn: true, serverMetas: [meta('a'), meta('b')], fetchFailed: true,
    })).toBeNull();
  });

  it('signed in + a server answer: the list IS the server list, order kept', () => {
    const server = [meta('b', 'B'), meta('a', 'A')];
    const out = onlineProjectListForDisplay({ signedIn: true, serverMetas: server, fetchFailed: false });
    expect(out).toEqual(server);
    expect(out).not.toBe(server); // never hand out the fetched array itself
  });

  it('external removal: a project missing from the latest answer is gone, not resurrected', () => {
    const before = onlineProjectListForDisplay({
      signedIn: true, serverMetas: [meta('a'), meta('revoked')], fetchFailed: false,
    })!;
    const after = onlineProjectListForDisplay({
      signedIn: true, serverMetas: before.filter(m => m.id !== 'revoked'), fetchFailed: false,
    })!;
    expect(after.map(m => m.id)).toEqual(['a']);
  });

  it('an empty successful answer is a real answer (0, not "unknown")', () => {
    expect(onlineProjectListForDisplay({ signedIn: true, serverMetas: [], fetchFailed: false })).toEqual([]);
  });
});
