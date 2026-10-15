/**
 * Collab rename sync — two-window repro (MANUAL tool, not a CI test).
 *
 *   npm run dev                         # repo root (:3000, VITE_ROOMS_URL set)
 *   node workers/rooms/test/rename-repro.mjs
 *
 * The room worker rides the shared launcher (tools/rooms-dev.mjs, roadmap
 * 246): reused when one already runs, spawned otherwise and stopped again on
 * exit. `ROOMS_PORT` picks another port for parallel work.
 *
 * Roadmap 253/249 diagnosis: A (owner) and B (editor) share ONE project;
 * every rename entry point is driven through the REAL UI —
 *
 *   A header title · B header title · A Project Manager row · B PM row —
 *
 * and each step reports what every surface shows:
 *   1. the renamer's own header (immediate),
 *   2. the PEER's open document header (realtime, via the room),
 *   3. the Supabase row title (ground truth, REST),
 *   4. the renamer's Project Manager row (after its own Refresh),
 *   5. the PEER's Project Manager row (after pressing Refresh) — the
 *      "not syncing ever" suspect: the PM merges `onlineProjects` with the
 *      session metas in `projectList`, and a stale session meta wins.
 *
 * Reuses the two-window-repro harness pattern (robot accounts from .env,
 * throwaway project row deleted in the finally block).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ensureRoomsWorker } from '../../../tools/rooms-dev.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);
const { chromium } = require('@playwright/test');

const APP = process.env.APP_URL || 'http://localhost:3000/lemon_schedule/';
/** Local room-worker port (see the header): parallel-run isolation. */
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
async function account(tag) {
  const suffix = tag.toUpperCase();
  const email = env[`LEMON_TEST_SB_USER_${suffix}`] ?? `lemon-agent-${tag}@example.com`;
  const password = env[`LEMON_TEST_SB_PASS_${suffix}`];
  if (!password) throw new Error(`LEMON_TEST_SB_PASS_${suffix} missing from .env`);
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
async function rowTitle(token) {
  const res = await fetch(`${SB_URL}/rest/v1/projects?id=eq.${PROJECT_ID}&select=title`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? (json[0]?.title ?? null) : null;
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
const TAG = PROJECT_ID.slice(0, 6);
const T1 = `A-header-${TAG}`;
const T2 = `B-header-${TAG}`;
const T3 = `A-pm-${TAG}`;
const T4 = `B-pm-${TAG}`;
const T5 = `A-live-${TAG}`;

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
  page.on('console', (m) => { if (/\[rooms\]/i.test(m.text())) log(`   [${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => log(`   [${tag} pageerror] ${e.message}`));
  await seedPage(page, session, seedOpts);
  await page.goto(APP);
  await page.getByRole('button', { name: 'Breakdown', exact: true }).waitFor({ timeout: 20000 });
  return { ctx, page };
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

// ── UI helpers ──────────────────────────────────────────────────────────────
const headerTitle = async (page) => (await page.locator('[data-presence-anchor="header:project-title"]').textContent())?.trim() ?? null;

/** Poll a predicate until true (default 8s). */
async function until(fn, tries = 80) {
  for (let i = 0; i < tries; i++) { if (await fn()) return true; await sleep(100); }
  return false;
}

/** Rename through the header title (click → input → fill → Enter). */
async function renameViaHeader(page, next) {
  await page.locator('[data-presence-anchor="header:project-title"]').click();
  const input = page.locator('header input').first();
  await input.waitFor({ timeout: 5000 });
  await input.fill(next);
  await page.keyboard.press('Enter');
  return until(async () => (await headerTitle(page)) === next, 50);
}

/** Open the Project Manager and land on the Shared tab. */
async function openPM(page) {
  await page.locator('[data-presence-anchor="toolbar:header:file"]').click();
  await page.getByRole('menuitem', { name: 'Project Manager' }).click();
  await page.getByText('Project Manager', { exact: true }).first().waitFor({ timeout: 5000 });
  await page.locator('button', { hasText: 'Shared' }).first().click();
  await until(async () => (await pmTitles(page)).length > 0 || (await page.getByText('No shared projects').count()) > 0, 50);
}
const closePM = async (page) => { await page.keyboard.press('Escape'); await sleep(300); };
/** Every Project Manager card title (the row h3s). */
const pmTitles = (page) => page.evaluate(() => [...document.querySelectorAll('h3')].map((h) => h.textContent.trim()));
/** OUR row's title as THIS window's PM shows it (titles carry the run tag). */
async function pmOurTitle(page) {
  const titles = await pmTitles(page);
  return titles.find((t) => t.includes(TAG)) ?? null;
}
/** Press the Shared tab's Refresh and wait for the list to settle again. */
async function pmRefresh(page) {
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await until(async () => (await pmOurTitle(page)) !== null && (await page.getByText('Loading shared projects...').count()) === 0, 60);
}
/** Rename OUR row through the Project Manager card (pencil → input → Enter). */
async function renameViaPM(page, next) {
  const h3 = page.locator(`h3:has-text("${TAG}")`).first();
  await h3.waitFor({ timeout: 5000 });
  // Pin the CARD node: entering rename mode swaps the h3 for the input, so an
  // h3-based locator chain would stop resolving mid-flow.
  const card = await h3.locator('xpath=ancestor::div[contains(@class, "group")][1]').elementHandle();
  await card.hover();
  await (await card.$('button[title="Rename"]')).click();
  const input = await card.waitForSelector('input', { timeout: 5000 });
  await input.fill(next);
  await input.press('Enter');
  return until(async () => (await pmOurTitle(page)) === next, 60);
}

// ── Flow ────────────────────────────────────────────────────────────────────
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

  // A: local project → Collaborate.
  const A = await openWindow(browser, sessionA, { onlineId: null }, 'A');
  await A.page.getByTestId('user-cluster').click();
  await A.page.getByText('Collaborate...', { exact: true }).click();
  await A.page.locator('[data-modal-confirm]').click();
  const collabOk = await until(() => bridge(A.page, `b.getProjectList().some(p => p.id === '${PROJECT_ID}' && p.onlineId)`), 100);
  check('A: project collaborated online', collabOk, null);
  await A.page.keyboard.press('Escape');
  const dA = await waitForRoomOpen(A.page, 'A');

  // B: invited editor, opens the shared project.
  const invite = await rpc(sessionA.access_token, 'invite_collaborator', { p_project: PROJECT_ID, p_email: sessionB.email, p_role: 'editor' });
  check('A: invited B as editor', invite.ok, invite.json);
  const B = await openWindow(browser, sessionB, { onlineId: PROJECT_ID }, 'B');
  const dB = await waitForRoomOpen(B.page, 'B');
  check('both rooms open', dA.roomStatus === 'open' && dB.roomStatus === 'open', { a: dA.roomStatus, b: dB.roomStatus });

  // ── Phase 1: A renames through the HEADER.
  log(`\n• phase 1 — A renames via the header → "${T1}"`);
  check('A: own header shows the new title', await renameViaHeader(A.page, T1), await headerTitle(A.page));
  check('B: peer header updates in realtime (room)', await until(async () => (await headerTitle(B.page)) === T1), await headerTitle(B.page));
  check('server row = new title', await until(async () => (await rowTitle(sessionA.access_token)) === T1), await rowTitle(sessionA.access_token));

  await openPM(A.page);
  check('A: own PM row shows the new title', (await pmOurTitle(A.page)) === T1, await pmOurTitle(A.page));
  await closePM(A.page);

  await openPM(B.page);
  const bPmRealtime = await until(async () => (await pmOurTitle(B.page)) === T1, 30);
  check('B: PM row updates WITHOUT a manual refresh (realtime)', bPmRealtime, { shown: await pmOurTitle(B.page) });
  await pmRefresh(B.page);
  check('B: PM row shows the new title AFTER Refresh (the "ever" bug)', (await pmOurTitle(B.page)) === T1, { all: await pmTitles(B.page) });
  await closePM(B.page);

  // ── Phase 2: B renames through the HEADER (editor — does the row push work?).
  log(`\n• phase 2 — B renames via the header → "${T2}"`);
  check('B: own header shows the new title', await renameViaHeader(B.page, T2), await headerTitle(B.page));
  check('A: peer header updates in realtime (room)', await until(async () => (await headerTitle(A.page)) === T2), await headerTitle(A.page));
  check('server row = new title (B is an editor — RLS row update)', await until(async () => (await rowTitle(sessionB.access_token)) === T2), await rowTitle(sessionB.access_token));

  await openPM(B.page);
  check('B: own PM row shows the new title', (await pmOurTitle(B.page)) === T2, await pmOurTitle(B.page));
  await closePM(B.page);

  await openPM(A.page);
  await pmRefresh(A.page);
  check('A: PM row shows the new title AFTER Refresh (the "ever" bug)', (await pmOurTitle(A.page)) === T2, { all: await pmTitles(A.page) });
  await closePM(A.page);

  // ── Phase 3: A renames through the PM ROW (the open project).
  log(`\n• phase 3 — A renames via the PM row → "${T3}"`);
  await openPM(A.page);
  check('A: PM row started from the previous title', (await pmOurTitle(A.page)) === T2, await pmOurTitle(A.page));
  check('A: PM-row rename committed', await renameViaPM(A.page, T3), await pmOurTitle(A.page));
  check('server row = new title', await until(async () => (await rowTitle(sessionA.access_token)) === T3), await rowTitle(sessionA.access_token));
  check('B: peer header updates in realtime (room)', await until(async () => (await headerTitle(B.page)) === T3), await headerTitle(B.page));
  await closePM(A.page);

  await openPM(B.page);
  await pmRefresh(B.page);
  check('B: PM row shows the new title AFTER Refresh', (await pmOurTitle(B.page)) === T3, { all: await pmTitles(B.page) });
  await closePM(B.page);

  // ── Phase 4: B renames through the PM ROW.
  log(`\n• phase 4 — B renames via the PM row → "${T4}"`);
  await openPM(B.page);
  check('B: PM row committed the rename', await renameViaPM(B.page, T4), await pmOurTitle(B.page));
  check('server row = new title (editor PM rename)', await until(async () => (await rowTitle(sessionB.access_token)) === T4), await rowTitle(sessionB.access_token));
  check('A: peer header updates in realtime (room)', await until(async () => (await headerTitle(A.page)) === T4), await headerTitle(A.page));
  await closePM(B.page);

  await openPM(A.page);
  await pmRefresh(A.page);
  check('A: PM row shows the new title AFTER Refresh', (await pmOurTitle(A.page)) === T4, { all: await pmTitles(A.page) });
  await closePM(A.page);

  // ── Phase 5: B's Manager is OPEN while A renames — the row updates in place
  // (the open document's title overlays the catalog; no Refresh involved).
  log(`\n• phase 5 — A renames while B's PM is open → "${T5}"`);
  await openPM(B.page);
  check('B: PM row started from the previous title', (await pmOurTitle(B.page)) === T4, await pmOurTitle(B.page));
  check('A: renamed via the header', await renameViaHeader(A.page, T5), await headerTitle(A.page));
  check('B: open PM row updates in place (no Refresh)', await until(async () => (await pmOurTitle(B.page)) === T5, 80), { all: await pmTitles(B.page) });
  check('B: header shows the new title too', await until(async () => (await headerTitle(B.page)) === T5), await headerTitle(B.page));
  await closePM(B.page);

  log(`\nserver row final: "${await rowTitle(sessionA.access_token)}"  (expected "${T5}")`);
  log(failures === 0 ? '\nALL RENAME PATHS SYNCED' : `\n${failures} problem(s) observed`);
} catch (e) {
  console.error('repro crashed:', e);
} finally {
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
