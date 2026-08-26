#!/usr/bin/env node
// Worker preview hub — a small manager webapp (zero deps).
//   - one dev server per feature worktree (ports 3101, 3111, …)
//   - tabbed viewer with feature-named tabs + shared localStorage bridge
//   - UI at http://localhost:3210 (no terminal needed beyond launching this)
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOGS = path.join(ROOT, '.opencode', 'logs');
const HUB_PORT = Number(process.env.HUB_PORT || 3210);
fs.mkdirSync(LOGS, { recursive: true });

// ---------- worktree discovery ----------
const items = () => {
  const out = spawnSync('git', ['-C', ROOT, 'worktree', 'list'], { encoding: 'utf8' });
  const list = [];
  let idx = 0;
  for (const line of (out.stdout || '').split('\n')) {
    const m = line.match(/lemon_schedule-wt\/([^ ]+)/);
    if (m) list.push({ item: m[1], port: 3101 + idx * 10, idx: idx++ });
  }
  return list;
};

const titleFor = (item) => {
  try {
    const txt = fs.readFileSync(path.join(ROOT, 'docs', 'ROADMAP.md'), 'utf8');
    // "23-24" matches the "## 23." heading (item's leading number)
    const head = item.split('-')[0].replace(/[.]/g, '\\$&');
    const re = new RegExp(`^## ${head}[.\\s]`, 'm');
    const m = txt.match(re);
    if (!m) return item;
    const line = txt.slice(m.index).split('\n')[0].replace(/^## /, '');
    const clean = line.replace(/^\d+\.\s*/, '').replace(/\s*\(`\[[ x]\]`\)\s*$/, '');
    return `${item} — ${clean}`;
  } catch {
    return item;
  }
};

const portBusy = (port) => spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).status === 0;

const pidsOnPort = (port) => {
  const out = spawnSync('lsof', ['-t', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  return (out.stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
};

const running = new Map(); // item -> { pid, external }

const startItem = (item, port) => {
  if (running.has(item)) return { ok: true, msg: 'already running' };
  if (portBusy(port)) {
    running.set(item, { external: true });
    return { ok: true, msg: 'port busy — marked running (external server)' };
  }
  const wt = path.join(ROOT, '..', `lemon_schedule-wt/${item}`);
  if (!fs.existsSync(wt)) return { ok: false, msg: 'worktree missing' };
  const fd = fs.openSync(path.join(LOGS, `hub-${item}.log`), 'a');
  const child = spawn('npm', ['run', 'dev', '--', `--port=${port}`, '--strictPort'], {
    cwd: wt, detached: true, stdio: ['ignore', fd, fd],
  });
  child.unref();
  running.set(item, { pid: child.pid });
  return { ok: true, msg: `started (pid ${child.pid})` };
};

const startMain = () => {
  if (running.has('main')) return { ok: true, msg: 'already running' };
  if (portBusy(3000)) {
    running.set('main', { external: true });
    return { ok: true, msg: 'port 3000 busy — external dev server' };
  }
  const fd = fs.openSync(path.join(LOGS, 'hub-main.log'), 'a');
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  running.set('main', { pid: child.pid });
  return { ok: true, msg: `main started (pid ${child.pid})` };
};

const stopItem = (item, port) => {
  const r = running.get(item);
  if (r && r.pid) {
    try { process.kill(-r.pid); } catch { try { process.kill(r.pid); } catch {} }
    running.delete(item);
  } else if (r && r.external) {
    for (const pid of pidsOnPort(port)) { try { process.kill(Number(pid)); } catch {} }
    running.delete(item);
  }
  return { ok: true };
};
const logTail = (item) => {
  try {
    const s = fs.readFileSync(path.join(LOGS, `hub-${item}.log`), 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
    return s.split('\n').filter(Boolean).slice(-6).join('\n').slice(-600);
  } catch {
    return '(no log yet)';
  }
};

// What the agent is doing right now — last line of the worker session log.
const agentDoing = (item) => {
  try {
    const s = fs.readFileSync(path.join(LOGS, `worker-${item}.log`), 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
    return s.split('\n').filter(Boolean).slice(-2).join(' ').slice(-150);
  } catch {
    return '';
  }
};

// Dev-config sync: worktrees branch off older commits whose vite.config.ts
// lacks the per-port cache + storage bridge. Copy the current dev files in
// (they're identical to main's — merging them is a no-op). Workers see them
// as modified; the worker contract says not to commit them.
const DEV_SYNC = ['vite.config.ts', 'public/hub-bridge.js'];
const syncDevFiles = () => {
  for (const { item } of items()) {
    const wt = path.join(ROOT, '..', `lemon_schedule-wt/${item}`);
    if (!fs.existsSync(wt)) continue;
    for (const rel of DEV_SYNC) {
      const src = path.join(ROOT, rel);
      const dst = path.join(wt, rel);
      if (!fs.existsSync(src)) continue;
      try {
        if (!fs.existsSync(dst) || fs.readFileSync(src).toString() !== fs.readFileSync(dst).toString()) {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
          console.log(`  synced ${rel} → ${item}`);
        }
      } catch (err) {
        console.log(`  sync ${rel} → ${item} failed: ${err.message}`);
      }
    }
  }
};

const status = () => ({
  hubPort: HUB_PORT,
  main: {
    running: running.has('main') ? (running.get('main').external ? 'external' : 'yes') : portBusy(3000) ? 'external' : 'no',
    log: logTail('main'),
  },
  items: items().map(({ item, port }) => ({
    item,
    label: titleFor(item),
    port,
    running: running.has(item) ? (running.get(item).external ? 'external' : 'yes') : portBusy(port) ? 'external' : 'no',
    doing: agentDoing(item),
    log: logTail(item),
  })),
});

// ---------- UI templates ----------
const TABS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hub-tabs.html');

const MANAGER_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Worker hub</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0c0c0e; color: #e4e4e7; padding: 20px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  p.sub { color: #71717a; font-size: 12px; margin: 0 0 16px; }
  .card { background: #16161a; border: 1px solid #27272a; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
  .card h2 { font-size: 14px; margin: 0 0 2px; }
  .card .port { color: #71717a; font-size: 11px; }
  .row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .dot.yes { background: #22c55e; } .dot.external { background: #f59e0b; } .dot.no { background: #3f3f46; }
  button { font: inherit; font-size: 12px; background: #1f1f23; border: 1px solid #2e2e33; color: #d4d4d8; border-radius: 7px; padding: 5px 12px; cursor: pointer; }
  button:hover { background: #26262b; color: #fff; }
  button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  .doing { color: #8b8b94; font-style: italic; font-size: 11px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  a.url { color: #60a5fa; font-size: 11px; text-decoration: none; }
  a.url:hover { text-decoration: underline; }
  pre { background: #0a0a0c; border: 1px solid #1f1f23; border-radius: 8px; padding: 8px 10px; font-size: 11px; color: #9ca3af; overflow: auto; max-height: 120px; white-space: pre-wrap; margin: 8px 0 0; }
</style></head><body>
<h1>🍋 Worker preview hub</h1>
<p class="sub">One dev server per feature worktree · <a href="/hub.html" target="_blank" style="color:#60a5fa">Open viewer tabs</a> · <button onclick="act('startAll')" style="vertical-align:baseline">Start all</button> · <button onclick="act('stopAll')" style="vertical-align:baseline">Stop all</button> · hub on port ${HUB_PORT}</p>
<div id="list"></div>
<script>
const $ = (s, r = document) => r.querySelector(s);
const hostUrl = (p) => 'http://' + location.hostname + ':' + p;
const stLabel = (r) => r === 'yes' ? 'running' : r === 'external' ? 'running (external)' : 'stopped';
async function refresh() {
  const s = await (await fetch('/api/status')).json();
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const mainSt = s.main.running;
  const main = '<div class="card" data-item="main"><h2>main</h2>' +
    '<div class="port">port 3000 · <a class="url" href="' + hostUrl(3000) + '" target="_blank">' + location.hostname + ':3000</a></div>' +
    '<div class="doing">' + esc(s.main.doing || '') + '</div><div class="row">' +
    '<span class="dot ' + mainSt + '"></span><span>' + stLabel(mainSt) + '</span>' +
    '<button data-act="start">Start</button><button data-act="stop">Stop</button>' +
    '<button class="primary" data-act="open">Open</button></div>' +
    '<pre>' + esc(s.main.log || '(no log yet)') + '</pre></div>';
  const cards = s.items.map(it => '<div class="card" data-item="' + esc(it.item) + '" data-port="' + it.port + '"><h2>' + esc(it.label) + '</h2>' +
    '<div class="port">port ' + it.port + ' · <a class="url" href="' + hostUrl(it.port) + '" target="_blank">' + location.hostname + ':' + it.port + '</a></div>' +
    '<div class="doing">' + esc(it.doing || (it.running !== 'no' ? 'running' : '')) + '</div><div class="row">' +
    '<span class="dot ' + it.running + '"></span><span>' + stLabel(it.running) + '</span>' +
    '<button data-act="start">Start</button><button data-act="stop">Stop</button>' +
    '<button class="primary" data-act="open">Open tab</button></div>' +
    '<pre>' + esc(it.log) + '</pre></div>');
  $('#list').innerHTML = main + cards.join('');
}
async function act(cmd) { await fetch('/api/' + cmd, { method: 'POST' }); setTimeout(refresh, 700); }
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const cardEl = btn.closest('.card');
  if (!cardEl) return;
  const item = cardEl.dataset.item;
  const a = btn.dataset.act;
  if (a === 'open') { window.open(hostUrl(item === 'main' ? 3000 : Number(cardEl.dataset.port))); return; }
  fetch('/api/' + a + '/' + item, { method: 'POST' }).then(() => setTimeout(refresh, 700));
});
refresh();
setInterval(refresh, 4000);
</script></body></html>`;

// ---------- HTTP server ----------
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${HUB_PORT}`);
  const p = url.pathname;
  if (req.method === 'GET' && p === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(MANAGER_HTML);
  } else if (req.method === 'GET' && p === '/hub.html') {
    let html = fs.readFileSync(TABS_PATH, 'utf8'); // read per request — hub file edits need no restart
    const tabs = [], panels = [];
    items().forEach(({ item, port }, i) => {
      const label = titleFor(item);
      tabs.push(`<button class="tab" data-panel="p${i}" title="${label.replace(/"/g, '&quot;')}">${item}<span class="port">${port}</span></button>`);
      panels.push(`<div class="panel" id="p${i}"><div class="bar">${label.replace(/</g, '&lt;')} — port ${port} <button class="reload">Reload</button></div><iframe data-src="${port}"></iframe></div>`);
    });
    html = html.replace('__TABS__', tabs.join('')).replace('__PANELS__', panels.join(''));
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html);
  } else if (req.method === 'GET' && p === '/api/status') {
    json(res, 200, status());
  } else if (req.method === 'POST') {
    const m = p.match(/^\/api\/(start|stop|open)\/([^/]+)$/);
    if (m) {
      const [_, action, item] = m;
      if (item === 'main') {
        if (action === 'start') return json(res, 200, startMain());
        if (action === 'stop') return json(res, 200, stopItem('main', 3000));
      }
      const it = items().find(x => x.item === item);
      if (!it) return json(res, 404, { ok: false });
      if (action === 'start') return json(res, 200, startItem(it.item, it.port));
      if (action === 'stop') return json(res, 200, stopItem(it.item, it.port));
      if (action === 'open') { spawnSync('open', [`http://localhost:${it.port}`]); return json(res, 200, { ok: true }); }
    }
    if (p === '/api/startAll') {
      startMain();
      items().forEach(it => startItem(it.item, it.port));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/stopAll') {
      stopItem('main', 3000);
      items().forEach(it => stopItem(it.item, it.port));
      return json(res, 200, { ok: true });
    }
    json(res, 404, { ok: false });
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(HUB_PORT, () => {
  console.log(`🍋 worker hub manager:  http://localhost:${HUB_PORT}`);
  console.log(`   viewer tabs:         http://localhost:${HUB_PORT}/hub.html`);
  console.log('   auto-starting main + all workers…');
  setTimeout(() => {
    syncDevFiles();
    const m = startMain();
    console.log('  main:', m.msg);
    items().forEach(it => { const r = startItem(it.item, it.port); console.log(`  ${it.item}:`, r.msg); });
  }, 300);
});
const shutdown = () => { items().forEach(it => stopItem(it.item, it.port)); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
