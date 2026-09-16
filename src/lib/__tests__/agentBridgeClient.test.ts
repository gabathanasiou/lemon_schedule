import { describe, it, expect, vi } from 'vitest';
import type { LemonAgentBridge } from '../debugBridge';
import {
  AGENT_BRIDGE_MAX_ACTIONS,
  createAgentBridgeProtocol,
  createAgentBridgeRequestHandler,
  applyActionsToBridge,
} from '../agentBridgeClient';
import type { Action } from '../../store/reducer';

function fakeBridge(overrides: Partial<LemonAgentBridge> = {}) {
  const dispatch = vi.fn();
  const undo = vi.fn();
  const redo = vi.fn();
  const bridge = {
    version: '1.0.0',
    help: () => [],
    isInstalled: () => true,
    getState: () => ({}) as never,
    getProject: () => ({ title: 'Test' }) as never,
    getProjectList: () => [],
    getCurrentProjectId: () => 'p1',
    getVersion: () => null,
    getCalendarVersion: () => null,
    getRows: () => ({ rows: [], sections: [] }) as never,
    getSceneValues: () => ({ columns: [], rows: [] }),
    diagnostics: () => ({ readOnly: false }) as never,
    decodeProject: () => ({}) as never,
    auditScript: () => ({}) as never,
    repairScript: () => ({}) as never,
    dispatch,
    undo,
    redo,
    pastCount: () => 0,
    futureCount: () => 0,
    batch: (fn: () => void) => fn(),
    onAction: () => () => {},
    makeBlankScene: () => ({ id: 'scene-1' }) as never,
    makeBlankProject: () => ({}) as never,
    newId: () => 'x',
    ...overrides,
  } as unknown as LemonAgentBridge;
  return { bridge, dispatch, undo, redo };
}

describe('applyActionsToBridge', () => {
  it('wraps an atomic batch in one undo entry', () => {
    const { bridge, dispatch } = fakeBridge();
    const result = applyActionsToBridge(bridge, [
      { type: 'UPDATE_ROW', payload: {} },
      { type: 'UNDO' },
    ] as Action[]);
    expect(result).toEqual({ applied: 2 });
    expect(dispatch.mock.calls.map((c) => c[0].type)).toEqual(['BATCH_START', 'UPDATE_ROW', 'UNDO', 'BATCH_COMMIT']);
  });

  it('can skip the batch wrapper', () => {
    const { bridge, dispatch } = fakeBridge();
    applyActionsToBridge(bridge, [{ type: 'UNDO' }] as Action[], false);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('refuses LOAD / EMPTY_TRASH and unknown types before mutating', () => {
    const { bridge, dispatch } = fakeBridge();
    expect(() => applyActionsToBridge(bridge, [{ type: 'LOAD', payload: {} }] as Action[])).toThrow(/blocked/);
    expect(() => applyActionsToBridge(bridge, [{ type: 'EMPTY_TRASH' }] as Action[])).toThrow(/blocked/);
    expect(() => applyActionsToBridge(bridge, [{ type: 'NOT_REAL' }] as unknown as Action[])).toThrow(/Unknown action type/);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('refuses read-only projects', () => {
    const { bridge, dispatch } = fakeBridge({ diagnostics: () => ({ readOnly: true }) as never });
    expect(() => applyActionsToBridge(bridge, [{ type: 'UNDO' }] as Action[])).toThrow(/read-only/);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('caps batch size', () => {
    const { bridge } = fakeBridge();
    const actions = Array.from({ length: AGENT_BRIDGE_MAX_ACTIONS + 1 }, () => ({ type: 'UNDO' })) as Action[];
    expect(() => applyActionsToBridge(bridge, actions)).toThrow(/Too many actions/);
  });
});

describe('createAgentBridgeRequestHandler', () => {
  it('routes whitelisted reads and writes', async () => {
    const { bridge, undo } = fakeBridge();
    const handle = createAgentBridgeRequestHandler(bridge);
    expect(await handle('getCurrentProjectId')).toBe('p1');
    expect(await handle('undo')).toEqual({ ok: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(await handle('applyActions', { actions: [{ type: 'UNDO' }], atomic: false })).toEqual({ applied: 1 });
  });

  it('rejects unknown methods', async () => {
    const { bridge } = fakeBridge();
    const handle = createAgentBridgeRequestHandler(bridge);
    await expect(handle('eval')).rejects.toThrow(/Unknown bridge method/);
  });
});

describe('createAgentBridgeProtocol', () => {
  it('answers requests, ignores junk, reports handler errors', async () => {
    const sent: unknown[] = [];
    const protocol = createAgentBridgeProtocol(
      async (method) => {
        if (method === 'boom') throw new Error('nope');
        return { method };
      },
      (message) => sent.push(message),
    );
    await protocol(JSON.stringify({ v: 1, id: 1, method: 'getProject' }));
    await protocol('{ not json');
    await protocol(JSON.stringify({ v: 2, id: 9, method: 'getProject' }));
    await protocol(JSON.stringify({ v: 1, id: 2, method: 'boom' }));
    expect(sent).toEqual([
      { v: 1, id: 1, ok: true, result: { method: 'getProject' } },
      { v: 1, id: 2, ok: false, error: 'nope' },
    ]);
  });
});
