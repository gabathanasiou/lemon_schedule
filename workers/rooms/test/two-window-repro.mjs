/**
 * S4 per-user undo — two-window peer-sync repro (MANUAL tool, not a CI test).
 *
 *   npx wrangler dev --port 8787        # in workers/rooms (background)
 *   npm run dev                         # repo root (:3000)
 *   node workers/rooms/test/two-window-repro.mjs
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
 *   • A edits a stripboard scene, then presses Meta+z.
 *
 * SIDE EFFECTS (why it is not a test): each run creates 2 Supabase auth users
 * and 1 `projects` row + membership in the configured project. Run against a
 * throwaway/local Supabase and clean up rows when done.
 *
 * Reads `.env` (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) and points at the
 * local room worker via VITE_ROOMS_URL. Exits 0 always (prints checks).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);
const { chromium } = require('@playwright/test');

const APP = process.env.APP_URL || 'http://localhost:3000/lemon_schedule/';

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
async function account(tag) {
  const email = `lemon-s4-${tag}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}@example.com`;
  const password = 'password123';
  let r = await auth('signup', { email, password });
  if (!r.json.access_token) r = await auth('token?grant_type=password', { email, password });
  if (!r.json.access_token) throw new Error(`auth failed for ${tag}: ${JSON.stringify(r.json).slice(0, 300)}`);
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
      try { t = JSON.parse(str).t; } catch { /* ignore */ }
      return { t, bytes: str.length };
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
try {
  log('• creating two throwaway accounts…');
  const [sessionA, sessionB] = await Promise.all([account('a'), account('b')]);
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

  const before = B.frames.length;
  await A.page.keyboard.press('Meta+z');
  let reverted = false;
  for (let i = 0; i < 80; i++) { if ((await descOf(B.page)) !== EDIT) { reverted = true; break; } await sleep(100); }
  const newFrames = B.frames.slice(before);
  const gotWelcome = newFrames.some((f) => f.dir === 'recv' && f.t === 'welcome');
  check("A: undo reverted A's own state", (await descOf(A.page)) !== EDIT, await descOf(A.page));
  check('B: received a welcome frame after A undo', gotWelcome, newFrames.map((f) => `${f.dir}:${f.t}`));
  check('B: state reverted (undo visible)', reverted, await descOf(B.page));
  check('B: stripboard DOM reverted too', !(await domHas(B.page, EDIT)), null);

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

  // ── Per-user invariant, the USER'S ORDER, driven through the REAL UI:
  // A edits → B edits → A undoes. A's action is NOT the latest overall, so the
  // room must rebuild while REPLAYING B's later edit on top — B's edit MUST
  // survive. UI-driven because the real cell edit is a multi-action batch.
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

  await A.page.keyboard.press('Meta+z');
  for (let i = 0; i < 80; i++) {
    if ((await descOf(A.page)) === B_EDIT && (await descOf(B.page)) === B_EDIT) break;
    await sleep(100);
  }
  check("A: A's own edit was undone (room rebuilt while replaying B's)", (await descOf(A.page)) === B_EDIT, await descOf(A.page));
  check("B: B's LATER edit survived A's undo", (await descOf(B.page)) === B_EDIT, await descOf(B.page));
  check('B: B never dropped back to the original', (await descOf(B.page)) !== ORIG, await descOf(B.page));

  await B.page.keyboard.press('Meta+z');
  for (let i = 0; i < 80; i++) {
    if ((await descOf(B.page)) === ORIG && (await descOf(A.page)) === ORIG) break;
    await sleep(100);
  }
  check("B: B's own undo removed B's edit (back to the original)", (await descOf(B.page)) === ORIG, await descOf(B.page));
  check('A: converged on the original too', (await descOf(A.page)) === ORIG, await descOf(A.page));

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

  log(failures === 0 ? '\nNO DIVERGENCE — the welcome re-sync reached the peer' : `\n${failures} problem(s) observed`);
} catch (e) {
  console.error('repro crashed:', e);
} finally {
  await browser.close();
}
process.exit(0);
