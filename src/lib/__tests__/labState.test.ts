import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLabState, setLabState, subscribeLabState, type LabStateSnapshot } from '../labState';

const SNAPSHOT: LabStateSnapshot = {
  surfaceId: 'element-view',
  title: 'Element view',
  group: 'Elements & Links',
  kind: 'modal',
  index: 1,
  total: 2,
  project: { id: 'p1', title: 'IT’S A WONDERFUL LIFE' },
  theme: 'dark',
  width: 'auto',
  scale: 100,
  selection: { kind: 'cast', id: '1', label: '1. GEORGE' },
  hash: '#/lab/modals/element-view',
};

describe('lab state (Modals Studio → debug bridge)', () => {
  beforeEach(() => setLabState(null));

  it('is null outside the studio', () => {
    expect(getLabState()).toBeNull();
  });

  it('round-trips a snapshot for the MCP reader', () => {
    setLabState(SNAPSHOT);
    expect(getLabState()).toEqual(SNAPSHOT);
    setLabState(null);
    expect(getLabState()).toBeNull();
  });

  it('notifies subscribers on every change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLabState(listener);
    setLabState(SNAPSHOT);
    setLabState(null);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setLabState(SNAPSHOT);
    expect(listener).toHaveBeenCalledTimes(2);
    setLabState(null);
  });
});
