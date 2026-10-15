import { Room, type Env } from './room';

export { Room };

/**
 * lemon-rooms — the S4 realtime room worker (docs/COLLABORATION.md §6 S4).
 * One Durable Object per shared project; clients connect over WebSocket at
 * `/room/<projectId>` and speak the shared wire protocol (`src/lib/rooms/protocol.ts`).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    // Liveness probe for the local dev launcher (tools/rooms-dev.mjs, roadmap
    // 246): no auth, no data, never touches a Durable Object.
    if (pathname === '/health') return Response.json({ ok: true, service: 'lemon-rooms' });
    const match = pathname.match(/^\/room\/([^/]+)$/);
    if (!match) return Response.json({ ok: true, service: 'lemon-rooms' });
    const projectId = decodeURIComponent(match[1]);
    return env.ROOMS.get(env.ROOMS.idFromName(projectId)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
