import { DurableObject } from 'cloudflare:workers';
import { reducer } from '../../../src/store/reducer';

interface Env {
  ROOMS: DurableObjectNamespace;
}

/**
 * S4 room scaffolding (docs/COLLABORATION.md §6 S4).
 *
 * The end state: this object owns one shared project — it receives actions, validates
 * and applies them through the app's own pure reducer, persists an action log +
 * periodic snapshots, and broadcasts `(action, revision)` to every connected client.
 * Importing the real reducer here (not a copy) is the point: one ordering/validation
 * authority, byte-identical semantics with the client.
 */
export class Room extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    return Response.json({ room: 'ok', reducer: typeof reducer === 'function' });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.ROOMS.idFromName('health');
    return env.ROOMS.get(id).fetch(request);
  },
};
