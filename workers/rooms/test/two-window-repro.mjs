/**
 * S4 per-user undo — two-window peer-sync repro (MANUAL tool, not a CI test).
 *
 *   npm run dev                         # repo root (:3000)
 *   node workers/rooms/test/two-window-repro.mjs
 *
 * The room worker comes up through the shared launcher (tools/rooms-dev.mjs,
 * roadmap 246): reused when one already runs, spawned otherwise, killed +
 * restarted around the offline-queue section, and released (detached) at the
 * end so the dev machine keeps a worker. Parallel-agent friendly: set
 * `ROOMS_PORT` (default 8787) to run on another port and point the app's
 * `VITE_ROOMS_URL` at it — only THAT port is touched.
 *
 * Proves (or refutes) that a peer window converges after another window
 * presses Cmd+Z. It drives the REAL app in two isolated browser contexts:
 *
 *   • creates two throwaway Supabase accounts (mailer_autoconfirm must be on),
 *   • context A opens the seeded local project and "Collaborate"s it online
 *     (the online row id == the project id, so onlineId == project id),
 *   • invites account B as an editor through the `invite_collaborator` RPC,
 *   • context B opens the same shared project through the online path,
 *   • captures every WebSocket frame in both windows,
 *   • A edits a stripboard scene, then presses Meta+z,
 *   • extra sections: the peer PRESENCE cursor (renders + follows), the
 *     input-modality glyph (touch = hand, roadmap 241), the local-overlay
 *     dots cue (menu/modal, roadmap 240 + the 244 freeze for ANY overlay /
 *     window glyph / collision fade), the peer GRID-SELECTION highlight
 *     (roadmap 234 — broadcast + painted on the peer's grid canvas) and the
 *     peer DOM-SURFACE selection (roadmap 234 stage 2 — a stripboard row
 *     publishes item ids; the peer paints the outline on ITS row element),
 *     and the OFFLINE BUFFER (roadmap 239
 *     stage 2 — kills wrangler mid-session, edits buffer in A, restart replays
 *     them; the script restarts wrangler itself).
 *
 * ACCOUNTS: signs in as the REUSABLE robot accounts held in the gitignored
 * `.env` (`LEMON_TEST_SB_USER_A/PASS_A` + `_B`) — no new users are created per
 * run. If those vars are missing, run `node workers/rooms/test/ensure-test-accounts.mjs`
 * once: it creates the pair (or re-creates a deleted one) and writes `.env`.
 * Cleanup:
 * a throwaway `projects` row (+ memberships) IS created each run, and DELETED
 * again in a finally block; the local room DB it leaves under the MAIN tree's
 * `workers/rooms/.wrangler/state/v3/do/lemon-rooms-Room/` is a few KB of dev
 * state (wipe that folder to reclaim it).
 *
 * Reads `.env` (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) and points at the
 * local room worker via VITE_ROOMS_URL. Exits 0 always (prints checks).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ensureRoomsWorker, killRoomsWorker, releaseRoomsWorker } from '../../../tools/rooms-dev.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);
const { chromium } = require('@playwright/test');

const APP = process.env.APP_URL || 'http://localhost:3000/lemon_schedule/';
/** Local room-worker port (see the header): the harness only ever touches THIS
 *  port, so a parallel agent's worker on the default stays safe. */
const ROOMS_PORT = Number(process.env.ROOMS_PORT || 8787);

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
const STORAGE_KEY = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`;

async function auth(path, body) {
  const res = await fetch(`${SB_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}
/**
 * The REUSABLE robot account for a role letter. Credentials come from the
 * gitignored `.env` (set once — see the file header); if the account does not
 * exist yet it is created here, so a fresh machine self-heals on the first run.
 * Reusing fixed identities keeps runs from littering the Supabase project with
 * auth users.
 */
async function account(tag) {
  const suffix = tag.toUpperCase();
  const email = env[`LEMON_TEST_SB_USER_${suffix}`] ?? `lemon-agent-${tag}@example.com`;
  const password = env[`LEMON_TEST_SB_PASS_${suffix}`];
  if (!password) {
    throw new Error(
      `LEMON_TEST_SB_PASS_${suffix} is missing from .env — run ` +
        `\`node workers/rooms/test/ensure-test-accounts.mjs\` once to create the robot accounts ` +
        `and record their credentials, then re-run this harness.`
    );
  }
  let r = await auth('signup', { email, password });
  if (!r.json.access_token) r = await auth('token?grant_type=password', { email, password });
  if (!r.json.access_token) throw new Error(`auth failed for ${tag} (${email}): ${JSON.stringify(r.json).slice(0, 300)}`);
  const { access_token, token_type, expires_in, expires_at, refresh_token, user } = r.json;
  return { email, access_token, token_type, expires_in, expires_at, refresh_token, user };
}
async function rpc(token, fn, body) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json().catch(() => null) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = console.log;
let failures = 0;
function check(label, ok, detail) {
  log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const project = JSON.parse(readFileSync(`${REPO}/e2e/fixtures/seed.lemon`, 'utf8'));
const PROJECT_ID = crypto.randomUUID();
project.id = PROJECT_ID;
const TITLE = project.title;
const EDIT = 'S4REPRO-SCENE';

function seedPage(page, session, { onlineId }) {
  const meta = { id: PROJECT_ID, title: TITLE, lastModified: Date.now(), createdAt: Date.now() };
  const last = { id: PROJECT_ID, at: Date.now() };
  if (onlineId) { meta.onlineId = onlineId; last.onlineId = onlineId; }
  return page.addInitScript(({ projectJson, metaJson, lastJson, storageKey, sessionJson }) => {
    localStorage.setItem('lemon_schedule_project_v1_' + JSON.parse(projectJson).id, projectJson);
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([JSON.parse(metaJson)]));
    localStorage.setItem('lemon_schedule_last_project', lastJson);
    localStorage.setItem(storageKey, sessionJson);
  }, {
    projectJson: JSON.stringify(project), metaJson: JSON.stringify(meta),
    lastJson: JSON.stringify(last), storageKey: STORAGE_KEY, sessionJson: JSON.stringify(session),
  });
}

async function openWindow(browser, session, seedOpts, tag) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const frames = [];
  page.on('websocket', (ws) => {
    const info = (s) => {
      const raw = (s && typeof s === 'object' && !Buffer.isBuffer(s) && 'payload' in s) ? s.payload : s;
      const str = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString() : JSON.stringify(raw);
      let t = '?';
      let action = null;
      let message = null;
      try {
        const parsed = JSON.parse(str);
        t = parsed.t;
        action = parsed.action?.type ?? null;
        message = typeof parsed.message === 'string' ? parsed.message : null;
      } catch { /* ignore */ }
      return { t, action, message, bytes: str.length };
    };
    ws.on('framesent', (d) => frames.push({ dir: 'sent', ...info(d) }));
    ws.on('framereceived', (d) => frames.push({ dir: 'recv', ...info(d) }));
  });
  page.on('console', (m) => { if (/\[rooms\]|\[presence\]/i.test(m.text())) log(`   [${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => log(`   [${tag} pageerror] ${e.message}`));
  await seedPage(page, session, seedOpts);
  await page.goto(APP);
  await page.getByRole('button', { name: 'Breakdown', exact: true }).waitFor({ timeout: 20000 });
  return { ctx, page, frames };
}

const diag = (page) => page.evaluate(() => window.__lemonSchedule.diagnostics());
const bridge = (page, expr) => page.evaluate((e) => new Function('b', `return (${e})`)(window.__lemonSchedule), expr);
async function waitForRoomOpen(page, who) {
  for (let i = 0; i < 120; i++) {
    const d = await diag(page).catch(() => null);
    if (d && d.roomStatus === 'open') return d;
    await sleep(200);
  }
  throw new Error(`${who}: room never opened`);
}

const browser = await chromium.launch({ headless: true });
let sessionA = null;
try {
  // The shared launcher reuses a running worker or brings one up (roadmap 246).
  log('• ensuring the room worker…');
  const rooms = await ensureRoomsWorker({ port: ROOMS_PORT });
  if (!rooms.ok) log(`  [!] room worker not ready: ${rooms.error}`);
  log('• signing in as the reusable robot accounts…');
  sessionA = await account('a');
  const sessionB = await account('b');
  log(`  A=${sessionA.user.id.slice(0, 8)}  B=${sessionB.user.id.slice(0, 8)}`);

  // A: local project → Collaborate.
  const A = await openWindow(browser, sessionA, { onlineId: null }, 'A');
  await A.page.getByTestId('user-cluster').click();
  await A.page.getByText('Collaborate...', { exact: true }).click();
  await A.page.locator('[data-modal-confirm]').click();
  for (let i = 0; i < 100; i++) {
    if (await bridge(A.page, `b.getProjectList().some(p => p.id === '${PROJECT_ID}' && p.onlineId)`)) break;
    await sleep(200);
  }
  await A.page.keyboard.press('Escape');
  const dA = await waitForRoomOpen(A.page, 'A');

  // B: distinct account, invited as editor.
  const invite = await rpc(sessionA.access_token, 'invite_collaborator', { p_project: PROJECT_ID, p_email: sessionB.email, p_role: 'editor' });
  check('A: invited B as editor', invite.ok, invite.json);
  const B = await openWindow(browser, sessionB, { onlineId: PROJECT_ID }, 'B');
  const dB = await waitForRoomOpen(B.page, 'B');
  check('A: room open', dA.roomStatus === 'open', dA.roomStatus);
  check('B: room open', dB.roomStatus === 'open', dB.roomStatus);
  check('A and B are DIFFERENT room users (per-user undo basis)',
    !!dA.roomUserId && !!dB.roomUserId && dA.roomUserId !== dB.roomUserId,
    { a: dA.roomUserId, b: dB.roomUserId });
  check('A is owner, B is editor', dA.roomRole === 'owner' && dB.roomRole === 'editor', { a: dA.roomRole, b: dB.roomRole });

  // Button enablement is per USER — the room pushes this user's availability.
  const undoButton = (page) => page.getByRole('button', { name: 'Undo (Cmd+Z)' }).first();
  const redoButton = (page) => page.getByRole('button', { name: 'Redo (Cmd+Shift+Z)' }).first();
  check('A: undo button DISABLED with an empty history', await undoButton(A.page).isDisabled(), null);
  check('A: redo button DISABLED with nothing to redo', await redoButton(A.page).isDisabled(), null);
  check('B: undo button DISABLED with an empty history', await undoButton(B.page).isDisabled(), null);

  // Stripboard (Boot lands on the Glide canvas; ribbon cells are inputs).
  const domHas = (page, val) => page.evaluate((v) => {
    if (document.body.innerText.includes(v)) return true;
    for (const el of document.querySelectorAll('input,textarea')) if ((el.value || '').includes(v)) return true;
    return false;
  }, val);
  for (const page of [A.page, B.page]) {
    await page.getByRole('button', { name: 'Schedule', exact: true }).first().click();
    await sleep(800);
  }

  const hibernateMs = Number(process.env.HIBERNATE_MS || 0);
  if (hibernateMs) { log(`• idling ${hibernateMs}ms to hibernate the Durable Object…`); await sleep(hibernateMs); }

  const sceneId = await bridge(A.page, `(() => {
    const rows = b.getRows();
    const map = new Map((rows.rows || []).filter(r => r.type === 'SCENE' && r.sceneId).map(r => [r.id, r.sceneId]));
    for (const s of (rows.sections || [])) { if (s.isPinned) continue;
      for (const rid of (s.rows || [])) { const sid = map.get(rid); if (sid) return sid; } }
    return b.getProject().scenes[0]?.id;
  })()`);
  const descOf = (page) => bridge(page, `(() => { const s = b.getProject().scenes.find(x => x.id === '${sceneId}'); return s ? s.description : null; })()`);

  await bridge(A.page, `b.dispatch({ type: 'UPDATE_SCENE', payload: { id: '${sceneId}', description: '${EDIT}' } })`);
  let bGot = false;
  for (let i = 0; i < 60; i++) { if ((await descOf(B.page)) === EDIT) { bGot = true; break; } await sleep(100); }
  check("B: received A's stripboard edit", bGot, await descOf(B.page));
  check("B: stripboard DOM shows A's edit", await domHas(B.page, EDIT), null);
  check('A: undo button ENABLED after A edits', !(await undoButton(A.page).isDisabled()), null);
  check("B: undo button still DISABLED (A's edit is not B's to undo)", await undoButton(B.page).isDisabled(), null);
  check('A: redo button DISABLED right after a fresh edit', await redoButton(A.page).isDisabled(), null);

  const before = B.frames.length;
  await A.page.keyboard.press('Meta+z');
  let reverted = false;
  for (let i = 0; i < 80; i++) { if ((await descOf(B.page)) !== EDIT) { reverted = true; break; } await sleep(100); }
  const newFrames = B.frames.slice(before);
  // The undo must arrive as a NORMAL update (remote + LOAD), never a welcome.
  const gotUndoUpdate = newFrames.some((f) => f.dir === 'recv' && f.t === 'remote' && f.action === 'LOAD');
  const gotWelcome = newFrames.some((f) => f.dir === 'recv' && f.t === 'welcome');
  check("A: undo reverted A's own state", (await descOf(A.page)) !== EDIT, await descOf(A.page));
  check('B: received the undo as a normal remote update (LOAD)', gotUndoUpdate, newFrames.map((f) => `${f.dir}:${f.t}${f.action ? ':' + f.action : ''}`));
  check('B: undo did NOT depend on a welcome re-sync', gotWelcome === false, newFrames.map((f) => `${f.dir}:${f.t}`));
  check('B: state reverted (undo visible)', reverted, await descOf(B.page));
  check('B: stripboard DOM reverted too', !(await domHas(B.page, EDIT)), null);
  check('A: undo button DISABLED once the room has nothing left for A', await undoButton(A.page).isDisabled(), null);
  check('A: redo button ENABLED after the undo', !(await redoButton(A.page).isDisabled()), null);
  check("B: redo button still DISABLED (A's undo created nothing for B)", await redoButton(B.page).isDisabled(), null);

  // ── The HEADER UNDO BUTTON must take the SAME room-routed path as Cmd+Z.
  // (It used to do a local-only transcript undo — this window reverted, peers
  // never did, and the window drifted off the room's state.)
  const BTN_EDIT = 'S4REPRO-BUTTON-SCENE';
  await bridge(A.page, `b.dispatch({ type: 'UPDATE_SCENE', payload: { id: '${sceneId}', description: '${BTN_EDIT}' } })`);
  for (let i = 0; i < 60; i++) { if ((await descOf(B.page)) === BTN_EDIT) break; await sleep(100); }
  check('B: saw the edit before the button undo', (await descOf(B.page)) === BTN_EDIT, await descOf(B.page));
  check('A: header undo button ENABLED after the edit', !(await undoButton(A.page).isDisabled()), null);
  await undoButton(A.page).click();
  let bBtnReverted = false;
  for (let i = 0; i < 80; i++) { if ((await descOf(B.page)) !== BTN_EDIT) { bBtnReverted = true; break; } await sleep(100); }
  check('B: HEADER BUTTON undo reached the peer (room-routed)', bBtnReverted, await descOf(B.page));
  check("A: HEADER BUTTON undo reverted A's own state too", (await descOf(A.page)) !== BTN_EDIT, await descOf(A.page));
  check('A: after the button undo — redo ENABLED, undo DISABLED',
    !(await redoButton(A.page).isDisabled()) && (await undoButton(A.page).isDisabled()), null);

  // ── Strip MOVE (user report): a drop is ONE `UPDATE_VERSION` that rewrites
  // the rows array. A moves a strip → A undoes → B's store AND screen order
  // must revert.
  const sceneRowId0 = await bridge(A.page, `(() => {
    const r = (b.getRows().rows || []).find(x => x.type === 'SCENE' && x.sceneId === '${sceneId}');
    return r ? r.id : null;
  })()`);
  const sectionOf = (page) => bridge(page, `(() => {
    const rows = b.getRows();
    const all = (rows.sections || []).flatMap(s => s.rows || []);
    return { index: all.indexOf('${sceneRowId0}'), total: all.length };
  })()`);
  const domIndexOf = (page) => page.evaluate((rowId) => {
    const els = Array.from(document.querySelectorAll('[data-row-id]'));
    return { index: els.findIndex((e) => e.getAttribute('data-row-id') === rowId), total: els.length };
  }, sceneRowId0);

  const beforeStore = await sectionOf(A.page);
  const beforeDom = await domIndexOf(B.page);
  const moveInfo = await bridge(A.page, `(() => {
    const p = b.getProject();
    const v = p.versions.find(x => x.id === p.activeVersionId);
    const row = v.rows.find(r => r.type === 'SCENE' && r.sceneId === '${sceneId}');
    const containers = [...new Set(v.rows.filter(r => r.containerId != null).map(r => r.containerId))];
    const target = containers.find(c => c !== row.containerId) ?? row.containerId;
    const maxOrder = Math.max(0, ...v.rows.filter(r => r.containerId === target).map(r => r.order));
    const moved = { ...row, containerId: target, order: maxOrder + 1 };
    const newRows = [...v.rows.filter(r => r.id !== row.id), moved];
    b.dispatch({ type: 'UPDATE_VERSION', payload: { id: v.id, rows: newRows } });
    return { from: row.containerId, to: target };
  })()`);
  let bMoved = false;
  for (let i = 0; i < 80; i++) {
    const s = await sectionOf(B.page);
    if (s.index !== beforeStore.index) { bMoved = true; break; }
    await sleep(100);
  }
  check('B: saw the strip move', bMoved, { before: beforeStore, now: await sectionOf(B.page), move: moveInfo });
  const bDomMoved = await domIndexOf(B.page);
  check("B: screen order changed for the move", bDomMoved.index !== beforeDom.index, { before: beforeDom, after: bDomMoved });

  await A.page.keyboard.press('Meta+z');
  let bRevertedMove = false;
  for (let i = 0; i < 80; i++) {
    const s = await sectionOf(B.page);
    const d = await domIndexOf(B.page);
    if (s.index === beforeStore.index && d.index === beforeDom.index) { bRevertedMove = true; break; }
    await sleep(100);
  }
  const afterStore = await sectionOf(B.page);
  const afterDom = await domIndexOf(B.page);
  check('B: store reverted after the move undo', afterStore.index === beforeStore.index, { before: beforeStore, after: afterStore });
  check('B: SCREEN reverted after the move undo', afterDom.index === beforeDom.index, { before: beforeDom, after: afterDom });
  check('B: full convergence after the move undo', bRevertedMove === true, { store: afterStore, dom: afterDom });

  // ── Per-user invariant + BLOCKED UNDO, the USER'S ORDER, driven through the
  // REAL UI: A edits → B edits the same field → A undoes. B's whole-value edit
  // absorbed A's unit, so the rebuild lands EXACTLY on the current state — the
  // room must refuse the undo OUT LOUD (roadmap 242), leave the state alone and
  // offer no redo that would later clobber B's text.
  const ORIG = await descOf(A.page);
  const A_EDIT = 'S4REPRO-A-SCENE';
  const B_EDIT = 'S4REPRO-B-SCENE';
  const sceneRowId = await bridge(A.page, `(() => {
    const r = (b.getRows().rows || []).find(x => x.type === 'SCENE' && x.sceneId === '${sceneId}');
    return r ? r.id : null;
  })()`);
  const ensureEditMode = async (page) => {
    if (await page.locator('[data-edit-mode="1"]').count()) return;
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await sleep(400);
    log(`   edit mode now: ${(await page.locator('[data-edit-mode="1"]').count()) > 0}`);
  };
  const typeDesc = async (page, current, next) => {
    await ensureEditMode(page);
    // In Edit mode a CLICK on a cell targets that row for editing (its cells
    // render as inputs only while it is the editing target).
    const field = page.locator(`[data-row-id="${sceneRowId}"] [data-ribbon-field="description"]`).first();
    await field.click();
    const cell = field.locator('input,textarea').first();
    await cell.waitFor({ state: 'visible', timeout: 5000 });
    log(`   [type] cell="${(await cell.inputValue()).slice(0, 30)}" expected="${current.slice(0, 30)}"`);
    await cell.fill(next);
    log(`   [type] after fill="${(await cell.inputValue()).slice(0, 30)}"`);
    await page.keyboard.press('Enter'); // explicit blur → CellInput commits on blur
    await sleep(600);
  };

  await typeDesc(A.page, ORIG, A_EDIT);
  for (let i = 0; i < 60; i++) { if ((await descOf(B.page)) === A_EDIT) break; await sleep(100); }
  check("B: saw A's UI edit first", (await descOf(B.page)) === A_EDIT, await descOf(B.page));

  await typeDesc(B.page, A_EDIT, B_EDIT);
  for (let i = 0; i < 80; i++) {
    if ((await descOf(A.page)) === B_EDIT && (await descOf(B.page)) === B_EDIT) break;
    await sleep(100);
  }
  check("both windows converged on B's later UI edit", (await descOf(A.page)) === B_EDIT && (await descOf(B.page)) === B_EDIT, {
    a: await descOf(A.page), b: await descOf(B.page),
  });
  check("B: undo button ENABLED after B's own edit", !(await undoButton(B.page).isDisabled()), null);
  check("A: A's own edit gave A an undo to try", !(await undoButton(A.page).isDisabled()), null);

  const blockedFramesBefore = A.frames.length;
  await A.page.keyboard.press('Meta+z');
  // The note is TRANSIENT (a few seconds) — read it right after the keypress.
  let noteText = '';
  for (let i = 0; i < 40; i++) {
    const note = A.page.getByTestId('room-note');
    if (await note.count()) {
      noteText = (await note.first().textContent()) || '';
      if (noteText) break;
    }
    await sleep(100);
  }
  const blockedFrames = A.frames.slice(blockedFramesBefore);
  check("A: the blocked undo is SAID OUT LOUD (header note)", /Can.t undo/i.test(noteText), noteText);
  check('A: the room answered with the blocked-undo error frame',
    blockedFrames.some((f) => f.dir === 'recv' && f.t === 'error' && /Can.t undo/.test(f.message || '')),
    blockedFrames.map((f) => `${f.dir}:${f.t}${f.message ? ':' + f.message : ''}`));
  check('A: blocked undo broadcast NOTHING (no new LOAD at the peer)',
    !blockedFrames.some((f) => f.dir === 'recv' && f.t === 'remote' && f.action === 'LOAD'),
    blockedFrames.map((f) => `${f.dir}:${f.t}${f.action ? ':' + f.action : ''}`));
  check("A: state unchanged — B's later text intact", (await descOf(A.page)) === B_EDIT, await descOf(A.page));
  check("B: B's LATER edit survived A's blocked undo", (await descOf(B.page)) === B_EDIT, await descOf(B.page));
  check('B: B never dropped back to the original', (await descOf(B.page)) !== ORIG, await descOf(B.page));
  let undoExhausted = false;
  let redoStaysDisabled = true;
  for (let i = 0; i < 40; i++) {
    undoExhausted = await undoButton(A.page).isDisabled();
    redoStaysDisabled = redoStaysDisabled && (await redoButton(A.page).isDisabled());
    if (undoExhausted && redoStaysDisabled) break;
    await sleep(100);
  }
  check('A: undo is exhausted for A (the blocked unit was consumed)', undoExhausted, null);
  check('A: no stale REDO is offered after the blocked undo (it would clobber B)', redoStaysDisabled, null);

  // B's own undo reverts their edit — and A's consumed text goes with it (the
  // documented edge: the rebuild cannot replay the row the blocked undo deleted).
  await B.page.keyboard.press('Meta+z');
  for (let i = 0; i < 80; i++) {
    if ((await descOf(B.page)) === ORIG && (await descOf(A.page)) === ORIG) break;
    await sleep(100);
  }
  check("B: B's own undo removed B's edit (A's absorbed text went with it — pinned edge)", (await descOf(B.page)) === ORIG, await descOf(B.page));
  check('A: converged on the original too', (await descOf(A.page)) === ORIG, await descOf(A.page));

  // The consumed unit does not wedge undo: A's NEXT unit undoes fine.
  const A3 = 'S4REPRO-A3-SCENE';
  await bridge(A.page, `b.dispatch({ type: 'UPDATE_SCENE', payload: { id: '${sceneId}', description: '${A3}' } })`);
  for (let i = 0; i < 80; i++) {
    if ((await descOf(A.page)) === A3 && (await descOf(B.page)) === A3) break;
    await sleep(100);
  }
  await A.page.keyboard.press('Meta+z');
  for (let i = 0; i < 80; i++) {
    if ((await descOf(A.page)) === ORIG && (await descOf(B.page)) === ORIG) break;
    await sleep(100);
  }
  check('A: a later undo still works after a blocked one', (await descOf(A.page)) === ORIG && (await descOf(B.page)) === ORIG, {
    a: await descOf(A.page), b: await descOf(B.page),
  });
  let redoBack = false;
  for (let i = 0; i < 40; i++) { if (!(await redoButton(A.page).isDisabled())) { redoBack = true; break; } await sleep(100); }
  check('A: redo is offered again after the successful undo', redoBack, null);

  // ── Reverse order (A's unit is the latest): B edits → A edits → A undoes.
  const A2 = 'S4REPRO-A2-SCENE';
  const B2 = 'S4REPRO-B2-SCENE';
  await bridge(B.page, `b.dispatch({ type: 'UPDATE_SCENE', payload: { id: '${sceneId}', description: '${B2}' } })`);
  await bridge(A.page, `b.dispatch({ type: 'UPDATE_SCENE', payload: { id: '${sceneId}', description: '${A2}' } })`);
  for (let i = 0; i < 80; i++) {
    if ((await descOf(A.page)) === A2 && (await descOf(B.page)) === A2) break;
    await sleep(100);
  }
  await A.page.keyboard.press('Meta+z');
  for (let i = 0; i < 80; i++) {
    if ((await descOf(A.page)) === B2 && (await descOf(B.page)) === B2) break;
    await sleep(100);
  }
  check("B edits → A edits → A undo: only A's edit went", (await descOf(A.page)) === B2 && (await descOf(B.page)) === B2, {
    a: await descOf(A.page), b: await descOf(B.page),
  });

  // ── Presence pointer: renders and FOLLOWS after the glide-loop rewrite
  // (transforms are written via refs — a broken ref would pin it at 0,0).
  for (const page of [A.page, B.page]) {
    await page.getByRole('button', { name: 'Schedule', exact: true }).first().click();
    await sleep(500);
  }
  const cursorAt = () => B.page.evaluate(() => {
    const el = document.querySelector('[data-testid="presence-cursor"]');
    if (!el) return null;
    const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.parentElement?.style.transform ?? '');
    const r = el.getBoundingClientRect();
    return { tx: m ? Number(m[1]) : -1, ty: m ? Number(m[2]) : -1, domX: Math.round(r.x), domY: Math.round(r.y) };
  });
  await A.page.mouse.move(420, 320);
  await A.page.mouse.move(460, 340, { steps: 8 });
  let seen = null;
  for (let i = 0; i < 40; i++) { seen = await cursorAt(); if (seen) break; await sleep(250); }
  check('B: peer presence cursor rendered', !!seen, seen);
  const first = seen;
  await A.page.mouse.move(820, 420, { steps: 15 });
  await sleep(700);
  const after = await cursorAt();
  check(
    'B: peer cursor followed the move (glide loop writes transforms)',
    !!first && !!after && Math.abs(after.tx - first.tx) > 50 && after.domX > 0 && after.domY > 0,
    { first, after }
  );

  // ── Presence cue + input glyph (roadmaps 240/241): the pointer glyph
  // follows the publisher's INPUT MODALITY, and while a peer is inside a
  // local overlay (menu/modal) their pointer tag + header bubble show the
  // animated dots. Both windows are on Schedule here (the pointer section
  // above) so the pointer tag renders.
  const waitFor = async (fn, tries = 80) => {
    for (let i = 0; i < tries; i++) { if (await fn()) return true; await sleep(100); }
    return false;
  };
  const cursorSel = (extra = '') => `[data-testid="presence-cursor"]${extra}`;

  // 241: a synthetic TOUCH pointer event flips the published modality; a real
  // mouse move flips it back. B must render the hand / arrow glyph.
  const aPointer = () => diag(A.page).then((d) => d.presence?.cursorPointer ?? null).catch(() => null);
  await A.page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 430, clientY: 330, bubbles: true }));
  });
  const handOk = await waitFor(async () => (await B.page.locator(cursorSel('[data-pointer="touch"]')).count()) > 0);
  check('B: touch input renders the hand glyph', handOk, { a: await aPointer() });
  await A.page.mouse.move(560, 380, { steps: 4 });
  const arrowOk = await waitFor(async () => (await B.page.locator(cursorSel('[data-pointer="mouse"]')).count()) > 0);
  check('B: mouse input returns the arrow glyph', arrowOk, { a: await aPointer() });

  // 240: the account menu → the 'menu' cue on BOTH surfaces.
  await A.page.getByTestId('user-cluster').click();
  const menuBubble = await waitFor(async () => (await B.page.locator('[data-testid="presence-bubble-overlay"]').count()) > 0);
  const menuTag = await waitFor(async () => (await B.page.locator(cursorSel('[data-overlay="menu"]')).count()) > 0);
  const aMenu = await diag(A.page).then((d) => d.presence?.localOverlay ?? null).catch(() => null);
  check('B: peer-in-menu shows the dots on the header bubble', menuBubble, null);
  check('B: peer-in-menu shows the dots on the pointer tag', menuTag, null);
  check('A: the window announces the menu cue', aMenu === 'menu', aMenu);

  // ── 244 (widened 2026-10-15): MENUS freeze too — while A is in the account
  // menu, wandering inside it must not move B's marker (B sees only dots).
  await sleep(1200); // let the glide settle on the frozen target
  const menuFrozen = await cursorAt();
  await A.page.mouse.move(760, 560, { steps: 8 }); // wander INSIDE the menu
  await sleep(700);
  const menuStillFrozen = await cursorAt();
  check(
    'B: pointer stays frozen while the peer moves inside the menu',
    !!menuFrozen && !!menuStillFrozen && Math.abs(menuStillFrozen.tx - menuFrozen.tx) < 2 && Math.abs(menuStillFrozen.ty - menuFrozen.ty) < 2,
    { menuFrozen, menuStillFrozen }
  );

  // 240: a MODAL is the other kind — click through the OPEN menu (a modal
  // opened from a just-closed menu must still read as 'modal').
  await A.page.getByRole('menuitem', { name: 'Settings...' }).click();
  const modalBubble = await waitFor(async () => (await B.page.locator('[data-testid="presence-bubble-overlay"]').count()) > 0);
  const modalTag = await waitFor(async () => (await B.page.locator(cursorSel('[data-overlay="modal"]')).count()) > 0);
  const aModal = await diag(A.page).then((d) => d.presence?.localOverlay ?? null).catch(() => null);
  check('B: peer-in-modal shows the dots on the header bubble', modalBubble, null);
  check('B: peer-in-modal shows the dots on the pointer tag', modalTag, null);
  check('A: the window announces the modal cue', aModal === 'modal', aModal);

  // ── 244: while A is inside the modal their pointer FREEZES on B (their
  // moves happen over a dialog B cannot see) and renders the window glyph.
  const windowGlyph = await waitFor(async () => (await B.page.locator(cursorSel('[data-glyph="window"]')).count()) > 0);
  check('B: peer-in-modal renders the window glyph', windowGlyph, null);
  await sleep(1200); // let the glide settle on the frozen target
  const frozen = await cursorAt();
  await A.page.mouse.move(980, 620, { steps: 10 }); // wander INSIDE the modal
  await sleep(700);
  const stillFrozen = await cursorAt();
  check(
    'B: pointer stays frozen while the peer moves inside the modal',
    !!frozen && !!stillFrozen && Math.abs(stillFrozen.tx - frozen.tx) < 2 && Math.abs(stillFrozen.ty - frozen.ty) < 2,
    { frozen, stillFrozen }
  );

  // The close EDGE clears the cue (no waiting for the TTL).
  await A.page.keyboard.press('Escape');
  const modalCleared = await waitFor(async () =>
    (await B.page.locator('[data-testid="presence-bubble-overlay"]').count()) === 0 &&
    (await B.page.locator(cursorSel('[data-overlay]')).count()) === 0);
  check('B: cue clears when the modal closes', modalCleared, null);

  // ── 244: after the cue clears the pointer resumes — input-kind glyph back,
  // and frames move the marker again.
  const glyphBack = await waitFor(async () => (await B.page.locator(cursorSel('[data-glyph="arrow"]')).count()) > 0);
  check('B: glyph returns to the pointer kind after the modal closes', glyphBack, null);
  await A.page.mouse.move(300, 250, { steps: 8 });
  await sleep(700);
  const afterResume = await cursorAt();
  check(
    'B: pointer follows again after the modal closes',
    !!stillFrozen && !!afterResume && Math.abs(afterResume.tx - stillFrozen.tx) > 50,
    { stillFrozen, afterResume }
  );

  // ── 244: parking B's OWN pointer on A's marker for ~2s fades A's marker
  // (see what is underneath); moving apart restores full opacity.
  const anchorAt = afterResume ?? frozen ?? { domX: 400, domY: 400 };
  await B.page.mouse.move(anchorAt.domX, anchorAt.domY, { steps: 4 });
  const fadedSeen = await waitFor(async () => (await B.page.locator(cursorSel('[data-faded="1"]')).count()) > 0);
  check("B: resting on A's pointer fades it", fadedSeen, null);
  await B.page.mouse.move(anchorAt.domX + 260, anchorAt.domY + 160, { steps: 6 });
  const fadeRestored = await waitFor(async () => (await B.page.locator(cursorSel('[data-faded="1"]')).count()) === 0);
  check('B: moving apart restores full opacity', fadeRestored, null);

  // And the plain menu close edge (open → Esc, nothing else).
  await A.page.getByTestId('user-cluster').click();
  await waitFor(async () => (await B.page.locator('[data-testid="presence-bubble-overlay"]').count()) > 0);
  await A.page.keyboard.press('Escape');
  const menuCleared = await waitFor(async () =>
    (await B.page.locator('[data-testid="presence-bubble-overlay"]').count()) === 0 &&
    (await B.page.locator(cursorSel('[data-overlay]')).count()) === 0);
  check('B: cue clears when the menu closes', menuCleared, null);

  // ── Roadmap 234: peer GRID-SELECTION highlights. Both windows open the
  // Breakdown grid; A selects a block with a real drag; B must (a) receive the
  // selection broadcast and (b) PAINT it — proven by counting the peer's
  // colour (read from their header bubble) on B's grid canvases: absent
  // before, present after the select, gone after the clear edge.
  for (const page of [A.page, B.page]) {
    await page.getByRole('button', { name: 'Breakdown', exact: true }).first().click();
  }
  await Promise.all([A.page, B.page].map((p) => p.waitForSelector('[data-presence-grid="breakdown-glide"]', { timeout: 20000 })));
  await sleep(900);

  const peerRgb = await B.page.evaluate(() => {
    const el = document.querySelector('[data-testid="presence-bubble"] span[style*="background"]')
      ?? document.querySelector('[data-testid="presence-cursor"] span[style*="background"]');
    if (!el) return null;
    const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(getComputedStyle(el).backgroundColor);
    return m ? [+m[1], +m[2], +m[3]] : null;
  });
  check('B: the peer colour is readable (bubble/tag)', !!peerRgb, peerRgb);

  const countPeerPixels = (page, rgb, tol = 26) => page.evaluate(({ rgb, tol }) => {
    const grid = document.querySelector('[data-presence-grid="breakdown-glide"]');
    if (!grid) return -1;
    const [r, g, b] = rgb;
    let count = 0;
    for (const canvas of grid.querySelectorAll('canvas')) {
      if (!canvas.width || !canvas.height) continue;
      let data;
      try { data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data; } catch { continue; }
      if (!data) continue;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - r) <= tol && Math.abs(data[i + 1] - g) <= tol && Math.abs(data[i + 2] - b) <= tol) count++;
      }
    }
    return count;
  }, { rgb, tol });

  const basePixels = await countPeerPixels(B.page, peerRgb);
  const gridBox = await A.page.locator('[data-presence-grid="breakdown-glide"]').boundingBox();
  const gx = gridBox.x + 380;
  const gy = gridBox.y + 110;
  await A.page.mouse.move(gx, gy);
  await sleep(150);
  await A.page.mouse.down();
  await A.page.mouse.move(gx + 320, gy + 70, { steps: 12 });
  await A.page.mouse.up();
  await sleep(400);
  const aSel = await diag(A.page).then((d) => d.presence?.localSelection ?? null).catch(() => null);
  check('A: the grid selection is published (breakdown-glide scope)', typeof aSel === 'string' && aSel.startsWith('breakdown-glide'), aSel);
  let recvAt = 0;
  for (let i = 0; i < 60; i++) {
    recvAt = (await diag(B.page).catch(() => null))?.presence?.lastSelectionRecvAt ?? 0;
    if (recvAt > 0) break;
    await sleep(150);
  }
  check('B: received the peer selection frame', recvAt > 0, { recvAt });
  let traced = basePixels;
  for (let i = 0; i < 40; i++) {
    traced = await countPeerPixels(B.page, peerRgb);
    if (traced > basePixels + 120) break;
    await sleep(200);
  }
  check('B: painted the peer selection (peer colour on the grid canvas)', traced > basePixels + 120, { basePixels, traced });

  // The clear edge: A leaves the grid (tab switch → unmount) — B, still on the
  // Breakdown, must drop the highlight and A must report no selection.
  await A.page.getByRole('button', { name: 'Schedule', exact: true }).first().click();
  let cleared = traced;
  for (let i = 0; i < 60; i++) {
    cleared = await countPeerPixels(B.page, peerRgb);
    if (cleared <= basePixels + 40) break;
    await sleep(200);
  }
  check('B: the highlight clears when the peer leaves the grid', cleared <= basePixels + 40, { basePixels, cleared });
  const aCleared = await diag(A.page)
    .then((d) => (d.presence && 'localSelection' in d.presence ? d.presence.localSelection : 'absent'))
    .catch(() => 'error');
  check('A: the selection clear edge is published', aCleared === null, aCleared);

  // ── Roadmap 234 stage 2: DOM-SURFACE peer selection. A selects an item on a
  // DOM surface; B must (a) receive the item ids and (b) resolve them to ITS
  // OWN element and paint the peer-coloured ring (rect ≈ B's element rect),
  // then drop it when A leaves the surface (the clear edge). One pass per
  // surface: stripboard rows, Calendar cards, events-mode cards, Report
  // Designer blocks (+ the selected table column), Ribbon Designer cells.

  /** Items rendered AND on-screen by BOTH windows on one surface — each
   *  window has its own scroll / render window, so a shared id whose centre is
   *  in both viewports is the honest pick (the ring's hit test hides
   *  off-screen rects, by design). */
  const sharedItems = async (surface, attr) => {
    const ids = (page) => page.evaluate(({ surface, attr }) => {
      const out = [];
      for (const el of document.querySelectorAll(`[data-presence-surface="${surface}"] [${attr}]`)) {
        const v = el.getAttribute(attr) || '';
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const visible = r.width > 0 && r.height > 0 && cx > 0 && cy > 0 && cx < window.innerWidth && cy < window.innerHeight;
        if (v && !v.startsWith('empty-') && visible) out.push(v);
      }
      return out;
    }, { surface, attr });
    const a = await ids(A.page);
    const b = new Set(await ids(B.page));
    return a.find(v => b.has(v)) ?? null;
  };
  /** A's published selection key, or null when it holds none. */
  const localSelection = (page) => diag(page)
    .then((d) => (d.presence && 'localSelection' in d.presence ? d.presence.localSelection : 'absent'))
    .catch(() => 'error');
  /** B's outline for one item id + the target element's own rect. */
  const outlineOf = (page, item, targetSel) => page.evaluate(({ item, targetSel }) => {
    const el = document.querySelector(`[data-testid="peer-selection-outline"][data-item="${item}"]`);
    if (!el) return null;
    const target = targetSel ? document.querySelector(targetSel) : null;
    const r = el.getBoundingClientRect();
    const t = target ? target.getBoundingClientRect() : null;
    return {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      target: t ? { x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.width), h: Math.round(t.height) } : null,
      peer: el.getAttribute('data-peer'),
      shadow: getComputedStyle(el).boxShadow,
    };
  }, { item, targetSel });
  const rgbClose = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) <= 2 && Math.abs(a[2] - b[2]) <= 2;
  const outlineRgb = (o) => { const m = o ? /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(o.shadow) : null; return m ? m.slice(1).map(Number) : null; };
  /** B's outline of `item` appears and tracks its own element, in the peer's colour. */
  const expectOutline = async (tag, item, targetSel) => {
    let o = null;
    for (let i = 0; i < 40; i++) { o = await outlineOf(B.page, item, targetSel); if (o) break; await sleep(200); }
    check(`B: painted the peer ${tag} selection`, !!o, o);
    check(`B: the ${tag} outline tracks B's own element`, !!o && !!o.target
      && Math.abs(o.rect.x - o.target.x) < 6 && Math.abs(o.rect.y - o.target.y) < 6
      && Math.abs(o.rect.w - o.target.w) < 8 && Math.abs(o.rect.h - o.target.h) < 8, o);
    check(`B: the ${tag} outline wears the peer colour`, rgbClose(outlineRgb(o), peerRgb), { shadow: o?.shadow, peerRgb });
    // PERSISTENCE: A's pointer marker lands ON the item they just clicked — the
    // ring must survive it (the first build's centre hit test counted the
    // marker as an occluder and the ring flickered off a beat later).
    await sleep(1600);
    const still = await outlineOf(B.page, item, targetSel);
    check(`B: the ${tag} outline survives the peer's marker landing on the item`, !!still, still);
    return still ?? o;
  };
  /** A leaves the surface (tab switch) → B's outline goes + the clear edge. */
  const expectOutlineCleared = async (tag, item) => {
    await A.page.getByRole('button', { name: 'Breakdown', exact: true }).first().click();
    let gone = false;
    for (let i = 0; i < 60; i++) { if ((await outlineOf(B.page, item, null)) === null) { gone = true; break; } await sleep(200); }
    check(`B: the ${tag} outline clears when the peer leaves the surface`, gone, null);
    check(`A: the ${tag} clear edge is published`, (await localSelection(A.page)) === null, await localSelection(A.page));
  };

  // Stripboard rows (the Schedule tab).
  for (const page of [A.page, B.page]) {
    await page.getByRole('button', { name: 'Schedule', exact: true }).first().click();
  }
  await Promise.all([A.page, B.page].map((p) => p.waitForSelector('[data-presence-surface="schedule"]', { timeout: 20000 })));
  await sleep(900);
  const rowSel = await sharedItems('schedule', 'data-row-id');
  check('A: picked a stripboard row rendered in BOTH windows', !!rowSel, rowSel);
  await A.page.locator(`[data-presence-surface="schedule"] [data-row-id="${rowSel}"]`).first().click();
  check('A: the row selection is published (schedule item scope)', (await localSelection(A.page) || '').startsWith('schedule|i|'), await localSelection(A.page));
  await expectOutline('row', rowSel, `[data-presence-surface="schedule"] [data-row-id="${rowSel}"]`);
  await expectOutlineCleared('row', rowSel);

  // Calendar cards (strips mode).
  for (const page of [A.page, B.page]) {
    await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  }
  await Promise.all([A.page, B.page].map((p) => p.waitForSelector('[data-presence-surface="calendar"]', { timeout: 20000 })));
  await sleep(900);
  const cardSel = await sharedItems('calendar', 'data-row-id');
  check('A: picked a calendar card rendered in BOTH windows', !!cardSel, cardSel);
  await A.page.locator(`[data-presence-surface="calendar"] [data-row-id="${cardSel}"]`).first().click();
  check('A: the card selection is published (calendar item scope)', (await localSelection(A.page) || '').startsWith('calendar|i|'), await localSelection(A.page));
  await expectOutline('calendar card', cardSel, `[data-presence-surface="calendar"] [data-row-id="${cardSel}"]`);
  await expectOutlineCleared('calendar card', cardSel);

  // Events-mode day cards: seed an attachment card on a rendered non-shoot day
  // (the fixture has none), switch BOTH windows to Events, select it.
  const eventDate = await bridge(A.page, `(() => {
    const p = b.getProject();
    const cal = p.calendarVersions.find(v => v.id === p.activeCalendarVersionId);
    const start = cal.productionStart || cal.prepStart || '';
    const entry = (cal.nonShootDates || []).find(n => n.date >= start);
    const castId = (p.castMembers || [])[0]?.id;
    if (!entry || !castId) return null;
    const lists = { ...(entry.lists || {}) };
    lists.fitting = { ...(lists.fitting || {}), cast: [...((lists.fitting || {}).cast || []), castId] };
    b.dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: cal.id, nonShootDates: (cal.nonShootDates || []).map(n => n.date === entry.date ? { ...n, lists } : n) } });
    return entry.date;
  })()`);
  check('A: seeded an attachment card on a rendered day', !!eventDate, eventDate);
  await sleep(700);
  for (const page of [A.page, B.page]) {
    await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
    await page.getByTitle('Events view').first().click();
  }
  await sleep(900);
  const eventSel = await sharedItems('calendar', 'data-event-key');
  check('A: picked an events-mode card rendered in BOTH windows', !!eventSel, eventSel);
  await A.page.locator(`[data-presence-surface="calendar"] [data-event-key="${eventSel}"]`).first().click();
  check('A: the event-card selection is published (calendar-events item scope)', (await localSelection(A.page) || '').startsWith('calendar-events|i|'), await localSelection(A.page));
  await expectOutline('event card', eventSel, `[data-presence-surface="calendar"] [data-event-key="${eventSel}"]`);
  await expectOutlineCleared('event card', eventSel);

  // Report Designer: a block, then the selected table column (a composite id
  // resolving to every cell of that column).
  for (const page of [A.page, B.page]) {
    await page.getByRole('button', { name: 'Design', exact: true }).first().click();
    await page.getByRole('button', { name: 'Reports Designer', exact: true }).first().click();
  }
  await Promise.all([A.page, B.page].map((p) => p.waitForSelector('[data-presence-surface="report-designer"]', { timeout: 20000 })));
  await sleep(900);
  const blockSel = await sharedItems('report-designer', 'data-block-id');
  check('A: picked a designer block rendered in BOTH windows', !!blockSel, blockSel);
  await A.page.locator(`[data-presence-surface="report-designer"] [data-block-id="${blockSel}"]`).first().click();
  check('A: the block selection is published (report-designer scope)', (await localSelection(A.page) || '').startsWith('report-designer|i|'), await localSelection(A.page));
  await expectOutline('report block', blockSel, `[data-presence-surface="report-designer"] [data-block-id="${blockSel}"]`);

  const colCellSel = (page) => page.evaluate(() => {
    for (const cell of document.querySelectorAll('[data-presence-surface="report-designer"] [data-block-id] [data-table-col-ci]')) {
      const card = cell.closest('[data-block-id]');
      const r = cell.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (card && r.width > 0 && r.height > 0 && cx > 0 && cy > 0 && cx < window.innerWidth && cy < window.innerHeight) {
        return { block: card.getAttribute('data-block-id'), ci: cell.getAttribute('data-table-col-ci') };
      }
    }
    return null;
  });
  const colPick = await colCellSel(A.page);
  check('A: picked a designer table column', !!colPick, colPick);
  await A.page.locator(`[data-presence-surface="report-designer"] [data-block-id="${colPick.block}"] [data-table-col-ci="${colPick.ci}"]`).first().click();
  const aColSel = await localSelection(A.page);
  check('A: the column selection is published as a composite item', typeof aColSel === 'string' && aColSel.startsWith(`report-designer|i|col:${colPick.block}:${colPick.ci}`), aColSel);
  const colItem = typeof aColSel === 'string' ? aColSel.split('|i|')[1] : '';
  // B paints one ring per VISIBLE cell of that column — the rect set must
  // match B's own cells (the ring skips occluded/off-screen cells by design).
  let colRings = null;
  for (let i = 0; i < 40; i++) {
    colRings = await B.page.evaluate(({ block, ci, item }) => {
      const onScreen = (r) => {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return r.width > 0 && r.height > 0 && cx > 0 && cy > 0 && cx < window.innerWidth && cy < window.innerHeight;
      };
      const box = (el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
      const cells = [...document.querySelectorAll(`[data-presence-surface="report-designer"] [data-block-id="${block}"] [data-table-col-ci="${ci}"]`)]
        .filter((el) => onScreen(el.getBoundingClientRect())).map(box);
      const rings = [...document.querySelectorAll(`[data-testid="peer-selection-outline"][data-item="${item}"]`)].map(box);
      return { cells, rings };
    }, { block: colPick.block, ci: colPick.ci, item: colItem });
    if (colRings && colRings.rings.length > 0) break;
    await sleep(200);
  }
  const boxEq = (a, b) => a.length === 4 && b.length === 4 && a.every((v, i) => Math.abs(v - b[i]) <= 1.5);
  check('B: painted the peer table column (one ring per visible cell)',
    !!colRings && colRings.cells.length > 0 && colRings.rings.length === colRings.cells.length
      && colRings.rings.every((r) => colRings.cells.some((c) => boxEq(r, c))),
    colRings);
  // Persistence (the marker lands on the clicked cell): all cell rings stay.
  await sleep(1600);
  const colRingsLater = await B.page.evaluate(({ block, ci, item }) => {
    const onScreen = (r) => {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return r.width > 0 && r.height > 0 && cx > 0 && cy > 0 && cx < window.innerWidth && cy < window.innerHeight;
    };
    const box = (el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    const cells = [...document.querySelectorAll(`[data-presence-surface="report-designer"] [data-block-id="${block}"] [data-table-col-ci="${ci}"]`)]
      .filter((el) => onScreen(el.getBoundingClientRect())).map(box);
    const rings = [...document.querySelectorAll(`[data-testid="peer-selection-outline"][data-item="${item}"]`)].map(box);
    return { cells, rings };
  }, { block: colPick.block, ci: colPick.ci, item: colItem });
  check("B: the column rings survive the peer's marker landing on a cell",
    colRingsLater.rings.length === colRingsLater.cells.length
      && colRingsLater.rings.every((r) => colRingsLater.cells.some((c) => boxEq(r, c))),
    colRingsLater);
  // A leaves the surface once — both the block and the column rings must go.
  await A.page.getByRole('button', { name: 'Breakdown', exact: true }).first().click();
  let reportGone = false;
  for (let i = 0; i < 60; i++) {
    const left = await B.page.evaluate(({ col, block }) => ({
      col: !!document.querySelector(`[data-testid="peer-selection-outline"][data-item="${col}"]`),
      block: !!document.querySelector(`[data-testid="peer-selection-outline"][data-item="${block}"]`),
    }), { col: colItem, block: blockSel });
    if (!left.col && !left.block) { reportGone = true; break; }
    await sleep(200);
  }
  check('B: the report outlines clear when the peer leaves the surface', reportGone, null);
  check('A: the report clear edge is published', (await localSelection(A.page)) === null, await localSelection(A.page));

  // Ribbon Designer: the selected cell.
  for (const page of [A.page, B.page]) {
    await page.getByRole('button', { name: 'Design', exact: true }).first().click();
    await page.getByRole('button', { name: 'Ribbon Designer', exact: true }).first().click();
  }
  await Promise.all([A.page, B.page].map((p) => p.waitForSelector('[data-presence-surface="ribbon-designer"]', { timeout: 20000 })));
  await sleep(900);
  const cellSel = await sharedItems('ribbon-designer', 'data-cell-id');
  check('A: picked a ribbon cell rendered in BOTH windows', !!cellSel, cellSel);
  await A.page.locator(`[data-presence-surface="ribbon-designer"] [data-cell-id="${cellSel}"]`).first().click();
  check('A: the cell selection is published (ribbon-designer scope)', (await localSelection(A.page) || '').startsWith('ribbon-designer|i|'), await localSelection(A.page));
  await expectOutline('ribbon cell', cellSel, `[data-presence-surface="ribbon-designer"] [data-cell-id="${cellSel}"]`);
  await expectOutlineCleared('ribbon cell', cellSel);

  // ── Offline queue (roadmap 239 stage 2): kill the room worker mid-session,
  // edit in A (buffered locally + badge), restart the worker → A replays the
  // buffer right after the welcome and B converges with no lost edit.
  log('• killing the room worker to exercise the offline buffer…');
  await killRoomsWorker({ port: ROOMS_PORT });
  const roomDown = async (page, who) => {
    for (let i = 0; i < 80; i++) {
      const d = await diag(page).catch(() => null);
      if (d && d.roomStatus !== 'open') return true;
      await sleep(250);
    }
    return false;
  };
  check('A: room left the open state', await roomDown(A.page, 'A'), null);
  check('B: room left the open state', await roomDown(B.page, 'B'), null);

  const OFFLINE_1 = 'S4QUEUE-OFFLINE-ONE';
  const OFFLINE_2 = 'S4QUEUE-OFFLINE-TWO';
  const actsBefore = A.frames.filter((f) => f.dir === 'sent' && f.t === 'act').length;
  await bridge(A.page, `b.dispatch({ type: 'UPDATE_SCENE', payload: { id: '${sceneId}', description: '${OFFLINE_1}' } })`);
  await bridge(A.page, `b.dispatch({ type: 'UPDATE_SCENE', payload: { id: '${sceneId}', description: '${OFFLINE_2}' } })`);
  const aQueue = await diag(A.page).then((d) => d.roomPending).catch(() => null);
  check('A: edits queue while the room is down', !!aQueue && aQueue.pending === 2, aQueue);
  check('A: the offline edit applied locally', (await descOf(A.page)) === OFFLINE_2, await descOf(A.page));
  check('B: did not receive the offline edit', (await descOf(B.page)) !== OFFLINE_2, await descOf(B.page));
  let badgeSeen = false;
  for (let i = 0; i < 40; i++) { if ((await A.page.getByTestId('room-status-badge').count()) > 0) { badgeSeen = true; break; } await sleep(250); }
  check('A: header badge shows the offline state', badgeSeen, null);

  log('• restarting the room worker…');
  await ensureRoomsWorker({ port: ROOMS_PORT });
  const roomUp = async (page) => {
    for (let i = 0; i < 240; i++) {
      const d = await diag(page).catch(() => null);
      if (d && d.roomStatus === 'open') return true;
      await sleep(500);
    }
    return false;
  };
  check('A: room reopened after the restart', await roomUp(A.page), null);
  check('B: room reopened after the restart', await roomUp(B.page), null);

  let drained = false;
  for (let i = 0; i < 80; i++) {
    const d = await diag(A.page).catch(() => null);
    if (d && d.roomPending && d.roomPending.pending === 0) { drained = true; break; }
    await sleep(250);
  }
  check('A: offline buffer drained after the welcome', drained, await diag(A.page).then((d) => d.roomPending).catch(() => null));
  let bConverged = false;
  for (let i = 0; i < 80; i++) { if ((await descOf(B.page)) === OFFLINE_2) { bConverged = true; break; } await sleep(100); }
  check('B: received the replayed offline edit (no lost edit)', bConverged, await descOf(B.page));
  check('A: kept the offline edit', (await descOf(A.page)) === OFFLINE_2, await descOf(A.page));
  const actsAfter = A.frames.filter((f) => f.dir === 'sent' && f.t === 'act').length;
  check('A: replayed the buffer as normal act messages', actsAfter >= actsBefore + 2, { actsBefore, actsAfter });
  let badgeGone = false;
  for (let i = 0; i < 40; i++) { if ((await A.page.getByTestId('room-status-badge').count()) === 0) { badgeGone = true; break; } await sleep(250); }
  check('A: badge clears once the room is live again', badgeGone, null);

  log(failures === 0 ? '\nNO DIVERGENCE — undo/redo reach peers as normal updates' : `\n${failures} problem(s) observed`);
} catch (e) {
  console.error('repro crashed:', e);
} finally {
  // Hand the worker off so the dev machine keeps one after this run (the
  // offline-queue section killed it mid-session) — detached from this process.
  await releaseRoomsWorker({ port: ROOMS_PORT });
  // Leave no throwaway project behind: delete the row this run created (owner
  // A's token; memberships/share links cascade). If it fails, the dashboard is
  // the fallback — see the header.
  if (sessionA) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/projects?id=eq.${PROJECT_ID}`, {
        method: 'DELETE',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${sessionA.access_token}`, Prefer: 'return=minimal' },
      });
      log(res.ok
        ? `• cleaned up the throwaway project row (${PROJECT_ID.slice(0, 8)}…)`
        : `• project-row cleanup failed (${res.status}) — delete ${PROJECT_ID} manually`);
    } catch (e) {
      log(`• project-row cleanup failed — delete ${PROJECT_ID} manually (${e.message})`);
    }
  }
  await browser.close();
}
process.exit(0);
