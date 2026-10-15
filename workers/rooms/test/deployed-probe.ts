/**
 * Deployed-stack probe (roadmap 229 go-live) — runs the REAL client transport
 * (`src/lib/rooms/roomClient.ts`, the exact class the provider mounts) against
 * the REAL deployed services: the Supabase `room-token` Edge Function and the
 * Cloudflare room worker. Nothing here touches the local dev stack.
 *
 *   ROOMS_URL="https://lemon-rooms.<subdomain>.workers.dev" \
 *     npx tsx workers/rooms/test/deployed-probe.ts
 *
 * What it proves, in order:
 *   1. robot A signs in and a throwaway `projects` row is created (RLS
 *      insert-own) — its owner membership comes from the `handle_new_project`
 *      trigger, so the function's role read is the REAL one;
 *   2. the deployed function answers `{ token }` for A through the app's exact
 *      request shape (Authorization only, NO apikey header) with owner claims;
 *   3. the deployed worker ACCEPTS that token over a real WebSocket `hello`;
 *   4. a real `RoomClient` connects with REAL tokens: robot A seeds the room,
 *      robot B (invited editor) joins at that state, an action flows A → B and
 *      a per-user undo converges both clients;
 *   5. a REAL failed token request (the function's own 401) does NOT kill the
 *      transport — it retries on its reconnect backoff and reaches `open` with
 *      ONE note (the 2026-10-15 deployed-pass fix; this is its regression test);
 *   6. negatives: garbage + cross-project tokens refused (1008), non-member
 *      403, no-session 401, CORS preflight 204;
 *   7. both throwaway rows are deleted (owner cleanup).
 *
 * Reads the gitignored `.env` (robot credentials) like the other harnesses —
 * see ensure-test-accounts.mjs. Exits 0/1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket as NodeWebSocket } from 'ws';
import { RoomClient, type WebSocketLike } from '../../../src/lib/rooms/roomClient';
import { makeBlankProject, reducer, type Action, type State } from '../../../src/store/reducer';
import { serializeProject } from '../../../src/lib/projectCodec';
import type { RevisionedAction } from '../../../src/lib/rooms/protocol';
import type { Project } from '../../../src/types';

const REPO = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');

function envFile(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(`${REPO}/.env`, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = envFile();
const SB_URL = env.VITE_SUPABASE_URL;
const SB_KEY = env.VITE_SUPABASE_ANON_KEY;
const ROOMS_URL = (process.env.ROOMS_URL || env.VITE_ROOMS_URL || '').replace(/\/+$/, '');
if (!SB_URL || !SB_KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env');
if (!ROOMS_URL) throw new Error('no deployed worker URL — pass ROOMS_URL=https://lemon-rooms.<subdomain>.workers.dev');
if (/127\.0\.0\.1|localhost/.test(ROOMS_URL)) throw new Error(`ROOMS_URL is loopback (${ROOMS_URL}) — this probe is for the DEPLOYED worker`);

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
}

async function waitFor(cond: () => boolean, label: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout waiting for: ${label}`);
}

async function auth(path: string, body: unknown) {
  const res = await fetch(`${SB_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

interface Robot {
  email: string;
  access_token: string;
  user: { id: string };
}

async function account(tag: string): Promise<Robot> {
  const suffix = tag.toUpperCase();
  const email = env[`LEMON_TEST_SB_USER_${suffix}`] ?? `lemon-agent-${tag}@example.com`;
  const password = env[`LEMON_TEST_SB_PASS_${suffix}`];
  if (!password) throw new Error(`LEMON_TEST_SB_PASS_${suffix} missing from .env — run ensure-test-accounts.mjs once`);
  const r = await auth('token?grant_type=password', { email, password });
  if (!r.json.access_token) throw new Error(`auth failed for ${tag}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return { email, ...(r.json as unknown as Omit<Robot, 'email'>) };
}

async function rpc(token: string, fn: string, body: unknown) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json().catch(() => null) };
}

/** Insert a throwaway online project row (RLS insert-own; owner membership via trigger). */
async function createProject(token: string, userId: string, title: string): Promise<string> {
  const id = crypto.randomUUID();
  const res = await fetch(`${SB_URL}/rest/v1/projects`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    // `data` is opaque to the server; the room seeds via the client's `init`.
    body: JSON.stringify({ id, owner_id: userId, title, data: '{}' }),
  });
  if (!res.ok) throw new Error(`project insert failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return id;
}

async function deleteProject(token: string, id: string): Promise<boolean> {
  const res = await fetch(`${SB_URL}/rest/v1/projects?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' },
  });
  return res.ok;
}

/** The app's exact request shape — Authorization only, NO apikey header. */
function roomTokenRequest(accessToken: string, projectId: string): Promise<Response> {
  return fetch(`${SB_URL}/functions/v1/room-token?project=${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Mirror of `tokenClient.fetchRoomToken` (src/lib/rooms/tokenClient.ts). */
async function fetchToken(accessToken: string, projectId: string): Promise<string> {
  const res = await roomTokenRequest(accessToken, projectId);
  if (!res.ok) throw new Error(`room token request failed (${res.status})`);
  const body = (await res.json().catch(() => ({}))) as { token?: unknown };
  const token = body.token;
  if (typeof token !== 'string' || token.length === 0) throw new Error('malformed room token response');
  return token;
}

function decodeClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1] ?? '';
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch {
    return null;
  }
}

/** Raw WS `hello` — collect frames until a decisive one arrives or the socket closes. */
function hello(projectId: string, token: string, ms = 8000): Promise<{ frames: Array<Record<string, unknown>>; closeCode?: number }> {
  const url = `${ROOMS_URL.replace(/^http/, 'ws')}/room/${encodeURIComponent(projectId)}`;
  return new Promise((resolve) => {
    const frames: Array<Record<string, unknown>> = [];
    const ws = new NodeWebSocket(url);
    const done = (extra: { closeCode?: number } = {}) => {
      try { ws.close(); } catch { /* already closed */ }
      resolve({ frames, ...extra });
    };
    const timer = setTimeout(() => done(), ms);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token, projectId })));
    ws.on('message', (d) => {
      const frame = JSON.parse(String(d)) as Record<string, unknown>;
      frames.push(frame);
      if (frame.t === 'needInit' || frame.t === 'welcome') { clearTimeout(timer); done(); }
    });
    ws.on('close', (code) => { clearTimeout(timer); resolve({ frames, closeCode: code }); });
    ws.on('error', () => { /* close follows */ });
  });
}

// ---- the real client transport ------------------------------------------------

function wsAdapter(url: string): WebSocketLike {
  const socket = new NodeWebSocket(url);
  const like: WebSocketLike = {
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  socket.on('open', () => like.onopen?.());
  socket.on('message', (data) => like.onmessage?.({ data: String(data) }));
  socket.on('close', () => like.onclose?.());
  socket.on('error', () => like.onerror?.());
  return like;
}

function applyAction(project: Project, action: Action): Project {
  return reducer({ past: [], present: project, future: [], _batchDepth: 0 } as State, action).present;
}

interface Harness {
  client: RoomClient;
  welcomes: number;
  role: string | null;
  state: Project | null;
  remotes: string[];
  errors: string[];
  statuses: string[];
}

function makeHarness(projectId: string, getToken: () => Promise<string>, seedBlob: string | null): Harness {
  const h: Harness = {
    client: null as unknown as RoomClient,
    welcomes: 0,
    role: null,
    state: null,
    remotes: [],
    errors: [],
    statuses: [],
  };
  h.client = new RoomClient({
    url: `${ROOMS_URL.replace(/^http/, 'ws')}/room/${encodeURIComponent(projectId)}`,
    projectId,
    getToken,
    getInitProject: () => seedBlob,
    createSocket: wsAdapter,
    backoffMs: [500],
    onWelcome: (w) => {
      h.welcomes += 1;
      h.role = w.role;
      let p = w.project;
      for (const entry of w.replay as RevisionedAction[]) p = applyAction(p, entry.action);
      h.state = p;
    },
    onRemote: (r) => {
      h.remotes.push(r.actionId);
      if (h.state) h.state = applyAction(h.state, r.action);
    },
    onError: (m) => h.errors.push(m),
    onStatus: (s) => h.statuses.push(s),
  });
  return h;
}

console.log(`deployed-stack probe — worker ${ROOMS_URL}`);
const sessionA = await account('a');
const sessionB = await account('b');
console.log(`  A=${sessionA.user.id.slice(0, 8)}  B=${sessionB.user.id.slice(0, 8)}`);

let projectA: string | null = null;
let projectB: string | null = null;
const harnesses: Harness[] = [];
try {
  // 1. Real project rows (owner memberships come from the DB trigger).
  projectA = await createProject(sessionA.access_token, sessionA.user.id, 'S4 deployed probe A');
  projectB = await createProject(sessionB.access_token, sessionB.user.id, 'S4 deployed probe B');
  check('A: created the throwaway project (owner membership via trigger)', true, projectA.slice(0, 8));

  // 2. CORS preflight the browser will send (Authorization ⇒ not a simple request).
  const preflight = await fetch(`${SB_URL}/functions/v1/room-token?project=${projectA}`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://gabathanasiou.github.io', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
  });
  check('preflight: 204 + wildcard origin', preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === '*',
    { status: preflight.status, acao: preflight.headers.get('access-control-allow-origin') });

  // 3. Mint with the app's exact request shape.
  const mintRes = await roomTokenRequest(sessionA.access_token, projectA);
  check('function: GET room-token → 200', mintRes.status === 200, mintRes.status);
  check('function: CORS header on the response too', mintRes.headers.get('access-control-allow-origin') === '*',
    mintRes.headers.get('access-control-allow-origin'));
  const minted = (await mintRes.json().catch(() => ({}))) as { token?: string };
  const tokenA = typeof minted.token === 'string' ? minted.token : '';
  // Never echo a live credential — shape only.
  check('function: answered { token }', tokenA.startsWith('v1.'), { token: tokenA ? `${tokenA.slice(0, 6)}…` : minted });
  const claims = decodeClaims(tokenA);
  const now = Math.floor(Date.now() / 1000);
  check('token claims: project + user + owner role + future expiry',
    !!claims && claims.p === projectA && claims.u === sessionA.user.id && claims.r === 'owner' && typeof claims.exp === 'number' && (claims.exp as number) > now,
    claims && { p: String(claims.p).slice(0, 8), u: String(claims.u).slice(0, 8), r: claims.r, exp: (claims.exp as number) - now });

  // 4. The deployed worker accepts the minted token (one secret on both sides).
  const accepted = await hello(projectA, tokenA);
  check('worker: hello with the minted token is ACCEPTED', accepted.frames[0]?.t === 'needInit' || accepted.frames[0]?.t === 'welcome',
    accepted.frames[0]);

  // 5. Negatives: garbage token, a token minted for ANOTHER project, and the
  //    function's own gates (all BEFORE B is invited — B is the non-member).
  const garbage = await hello(projectA, 'v1.not-a-real-token.nope');
  check('worker: garbage token refused (unauthenticated, 1008)',
    garbage.frames[0]?.t === 'error' && garbage.frames[0]?.message === 'unauthenticated' && garbage.closeCode === 1008,
    { frame: garbage.frames[0], close: garbage.closeCode });

  const tokenBown = await fetchToken(sessionB.access_token, projectB);
  const crossed = await hello(projectA, tokenBown);
  check('worker: B\'s token for another project refused on A\'s room',
    crossed.frames[0]?.t === 'error' && crossed.frames[0]?.message === 'unauthenticated' && crossed.closeCode === 1008,
    { frame: crossed.frames[0], close: crossed.closeCode });

  const nonMember = await roomTokenRequest(sessionB.access_token, projectA);
  check('function: non-member → 403', nonMember.status === 403, nonMember.status);

  const noSession = await fetch(`${SB_URL}/functions/v1/room-token?project=${projectA}`);
  check('function: no Authorization → 401', noSession.status === 401, noSession.status);

  // The anon key is a valid JWT for the gateway but NOT a user — the function's
  // own getUser gate answers 401. This is the REAL failure the transient-recovery
  // check below feeds the client.
  const anonAsUser = await roomTokenRequest(SB_KEY, projectA);
  check('function: anon key (no user) → 401 from the function itself', anonAsUser.status === 401, anonAsUser.status);

  // 6. Invite B as editor, then drive the REAL transport on both accounts.
  const invite = await rpc(sessionA.access_token, 'invite_collaborator', { p_project: projectA, p_email: sessionB.email, p_role: 'editor' });
  check('A: invited B as editor', invite.ok, invite.json);

  const seed = serializeProject(makeBlankProject('Deployed probe'));
  const a = makeHarness(projectA, () => fetchToken(sessionA.access_token, projectA!), seed);
  harnesses.push(a);
  a.client.start();
  await waitFor(() => a.welcomes >= 1, 'A real-client welcome');
  await waitFor(() => a.client.getStatus() === 'open', 'A real-client open');
  check('A (real client): seeded the room through needInit', a.welcomes === 1 && a.role === 'owner', { role: a.role, errors: a.errors });

  const b = makeHarness(projectA, () => fetchToken(sessionB.access_token, projectA!), null);
  harnesses.push(b);
  b.client.start();
  await waitFor(() => b.welcomes >= 1, 'B real-client welcome');
  await waitFor(() => b.client.getStatus() === 'open', 'B real-client open');
  check('B (real client): joined at the room state as editor', b.role === 'editor' && b.state?.title === 'Deployed probe', { role: b.role, title: b.state?.title });

  check('A (real client): action accepted', a.client.sendAction('dp-a1', { type: 'UPDATE_PROJECT', payload: { title: 'Live from the real A' } }));
  await waitFor(() => b.remotes.includes('dp-a1'), 'B receives the real action');
  check('B (real client): applied the action', b.state?.title === 'Live from the real A', b.state?.title);

  check('A (real client): sendUndo accepted', a.client.sendUndo());
  await waitFor(() => b.state?.title === 'Deployed probe' && a.state?.title === 'Deployed probe', 'both converge after the real undo');
  check('undo (real stack): both clients converged to the pre-action state',
    a.state?.title === 'Deployed probe' && b.state?.title === 'Deployed probe',
    { a: a.state?.title, b: b.state?.title });

  // 7. Transient-failure recovery (the deployed-pass fix, on real servers):
  //    the FIRST token request is a real 401 from the function; the client must
  //    note it once, retry on its backoff and reach `open` — no reload.
  let firstAttemptFailed = false;
  const c = makeHarness(
    projectA,
    async () => {
      if (!firstAttemptFailed) {
        firstAttemptFailed = true;
        const bad = await roomTokenRequest(SB_KEY, projectA!); // gateway-valid anon JWT, no user → function 401
        if (bad.status !== 401) throw new Error(`expected the real 401, got ${bad.status}`);
        throw new Error(`room token request failed (${bad.status})`);
      }
      return fetchToken(sessionA.access_token, projectA!);
    },
    null
  );
  harnesses.push(c);
  c.client.start();
  await waitFor(() => c.errors.some((e) => e.startsWith('could not obtain a room token')), 'C failure note');
  check('C: the real 401 surfaced as ONE note',
    c.errors.filter((e) => e.startsWith('could not obtain a room token')).length === 1,
    c.errors);
  await waitFor(() => c.client.getStatus() === 'open', 'C recovers without a reload');
  check('C: retried on its own and reached open', c.client.getStatus() === 'open' && c.statuses.includes('reconnecting'),
    { status: c.client.getStatus(), statuses: c.statuses });
  await waitFor(() => c.welcomes >= 1, 'C welcome');
  check('C: landed on the room state after recovery', c.state?.title === 'Deployed probe', c.state?.title);
} catch (e) {
  failures++;
  console.error('probe crashed:', e);
} finally {
  for (const h of harnesses) h.client.stop();
  if (projectA && (await deleteProject(sessionA.access_token, projectA))) console.log('• cleaned up probe project A');
  else if (projectA) console.log(`• project A cleanup failed — delete ${projectA} manually`);
  if (projectB && (await deleteProject(sessionB.access_token, projectB))) console.log('• cleaned up probe project B');
  else if (projectB) console.log(`• project B cleanup failed — delete ${projectB} manually`);
}

console.log(failures === 0 ? '\nDEPLOYED PROBE PASSED' : `\nDEPLOYED PROBE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
