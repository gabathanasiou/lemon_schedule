/**
 * Deployed-stack probe (roadmap 229 go-live) — proves the PRODUCTION token path
 * end to end against the real deployed services, the piece the local dev loop
 * never exercises (dev builds use `dev:` tokens, `workers/rooms/src/room.ts`
 * `DEV_AUTH`). Run manually after `wrangler deploy` + `supabase functions
 * deploy` + both `ROOM_TOKEN_SECRET` puts:
 *
 *   ROOMS_URL="https://lemon-rooms.<subdomain>.workers.dev" \
 *     node workers/rooms/test/deployed-probe.mjs
 *
 * What it proves, in order:
 *   1. robot account A signs in (Supabase Auth) and a throwaway `projects` row
 *      is created (RLS insert-own) — its owner membership comes from the
 *      `handle_new_project` trigger, so the function's role read is the REAL one;
 *   2. the deployed `room-token` function answers `{ token }` for A (the app's
 *      exact request shape — Authorization only, no apikey header);
 *   3. the token payload carries A's owner claims ({p,u,r,exp}) — bound to
 *      THIS project id and expiring;
 *   4. a real WebSocket `hello` to the DEPLOYED worker with that token is
 *      ACCEPTED (`needInit` on a fresh room) — mint and verify share one secret;
 *   5. a garbage token is refused (`unauthenticated`, close 1008); a token for
 *      a DIFFERENT project is refused on this room (project binding);
 *   6. a non-member (robot B) gets 403 from the function; the CORS preflight
 *      the browser needs answers 204 with a wildcard origin;
 *   7. both throwaway rows are deleted (owner cleanup).
 *
 * Reads the gitignored `.env` (robot credentials) like the other harnesses —
 * see ensure-test-accounts.mjs for creating them. Exits 0/1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const REPO = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');

function envFile() {
  const out = {};
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
function check(label, ok, detail) {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function auth(path, body) {
  const res = await fetch(`${SB_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

async function account(tag) {
  const suffix = tag.toUpperCase();
  const email = env[`LEMON_TEST_SB_USER_${suffix}`] ?? `lemon-agent-${tag}@example.com`;
  const password = env[`LEMON_TEST_SB_PASS_${suffix}`];
  if (!password) throw new Error(`LEMON_TEST_SB_PASS_${suffix} missing from .env — run ensure-test-accounts.mjs once`);
  let r = await auth('token?grant_type=password', { email, password });
  if (!r.json.access_token) throw new Error(`auth failed for ${tag}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return r.json;
}

/** Insert a throwaway online project row (RLS insert-own; owner membership via trigger). */
async function createProject(token, userId, title) {
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

async function deleteProject(token, id) {
  const res = await fetch(`${SB_URL}/rest/v1/projects?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' },
  });
  return res.ok;
}

/** The app's exact request shape — Authorization only, NO apikey header. */
function roomTokenRequest(accessToken, projectId) {
  return fetch(`${SB_URL}/functions/v1/room-token?project=${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function decodeClaims(token) {
  const payload = token.split('.')[1] ?? '';
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch {
    return null;
  }
}

/** Connect, send hello, collect frames until close or timeout. */
function hello(projectId, token, ms = 8000) {
  const url = `${ROOMS_URL.replace(/^http/, 'ws')}/room/${encodeURIComponent(projectId)}`;
  return new Promise((resolve) => {
    const frames = [];
    const ws = new WebSocket(url);
    const done = (extra) => {
      try { ws.close(); } catch { /* already closed */ }
      resolve({ frames, ...extra });
    };
    const timer = setTimeout(() => done({ closed: false }), ms);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token, projectId })));
    ws.on('message', (d) => {
      const frame = JSON.parse(d.toString());
      frames.push(frame);
      // Accepted auth is already proven by the first frame; no need to wait out
      // the timeout (refused sockets close instead).
      if (frame.t === 'needInit' || frame.t === 'welcome') { clearTimeout(timer); done({ closed: false }); }
    });
    ws.on('close', (code) => { clearTimeout(timer); resolve({ frames, closed: true, closeCode: code }); });
    ws.on('error', () => { /* close follows */ });
  });
}

console.log(`deployed-stack probe — worker ${ROOMS_URL}`);
const sessionA = await account('a');
const sessionB = await account('b');
console.log(`  A=${sessionA.user.id.slice(0, 8)}  B=${sessionB.user.id.slice(0, 8)}`);

let projectA = null;
let projectB = null;
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
  const minted = await mintRes.json().catch(() => ({}));
  const tokenA = typeof minted.token === 'string' ? minted.token : '';
  check('function: answered { token }', tokenA.startsWith('v1.'), minted);
  const claims = decodeClaims(tokenA);
  const now = Math.floor(Date.now() / 1000);
  check('token claims: project + user + owner role + future expiry',
    !!claims && claims.p === projectA && claims.u === sessionA.user.id && claims.r === 'owner' && claims.exp > now,
    claims && { p: String(claims.p).slice(0, 8), u: String(claims.u).slice(0, 8), r: claims.r, exp: claims.exp - now });

  // 4. The deployed worker accepts the minted token (one secret on both sides).
  const accepted = await hello(projectA, tokenA);
  const acceptedFrame = accepted.frames[0];
  check('worker: hello with the minted token is ACCEPTED', acceptedFrame?.t === 'needInit' || acceptedFrame?.t === 'welcome',
    acceptedFrame);

  // 5. Negatives: garbage token, and a token minted for ANOTHER project.
  const garbage = await hello(projectA, 'v1.not-a-real-token.nope');
  check('worker: garbage token refused (unauthenticated, 1008)',
    garbage.frames[0]?.t === 'error' && garbage.frames[0]?.message === 'unauthenticated' && garbage.closeCode === 1008,
    { frame: garbage.frames[0], close: garbage.closeCode });

  const mintB = await roomTokenRequest(sessionB.access_token, projectB);
  const tokenB = (await mintB.json().catch(() => ({}))).token;
  const crossed = await hello(projectA, tokenB);
  check('worker: B\'s token for another project refused on A\'s room',
    crossed.frames[0]?.t === 'error' && crossed.frames[0]?.message === 'unauthenticated' && crossed.closeCode === 1008,
    { frame: crossed.frames[0], close: crossed.closeCode });

  // 6. Non-member: B asking for a token on A's project.
  const nonMember = await roomTokenRequest(sessionB.access_token, projectA);
  check('function: non-member → 403', nonMember.status === 403, nonMember.status);

  // 7. Missing/invalid session.
  const noSession = await fetch(`${SB_URL}/functions/v1/room-token?project=${projectA}`);
  check('function: no Authorization → 401', noSession.status === 401, noSession.status);
} catch (e) {
  failures++;
  console.error('probe crashed:', e);
} finally {
  if (projectA && (await deleteProject(sessionA.access_token, projectA))) console.log('• cleaned up probe project A');
  else if (projectA) console.log(`• project A cleanup failed — delete ${projectA} manually`);
  if (projectB && (await deleteProject(sessionB.access_token, projectB))) console.log('• cleaned up probe project B');
  else if (projectB) console.log(`• project B cleanup failed — delete ${projectB} manually`);
}

console.log(failures === 0 ? '\nDEPLOYED PROBE PASSED' : `\nDEPLOYED PROBE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
