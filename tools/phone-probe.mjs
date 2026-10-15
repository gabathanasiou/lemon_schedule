/**
 * TEMPORARY phone-debug probe server (roadmap 267) — run in the background:
 *
 *   node tools/phone-probe.mjs
 *
 * DEV builds beacon viewport/shell measurements here (`src/lib/devProbe.ts`,
 * `import.meta.env.DEV` gate, fired on load/rotate/resize); each payload is
 * written to `/tmp/lemon-phone-probe.json` + appended to
 * `/tmp/lemon-phone-probe.log`. Useful for inspecting a real iPhone's Safari
 * without Web Inspector (WebKit has no CLI inspector bridge). Remove both
 * files once the phone pass on roadmap 267 is done.
 */
import { createServer } from 'node:http';
import { writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = join(tmpdir(), 'lemon-phone-probe.json');
const LOG = join(tmpdir(), 'lemon-phone-probe.log');

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try { writeFileSync(OUT, body); } catch { /* ignore */ }
    try { appendFileSync(LOG, `${new Date().toISOString()} ${req.method} ${req.url} ${body}\n`); } catch { /* ignore */ }
    res.statusCode = 204;
    res.end();
  });
}).listen(3999, '0.0.0.0', () => console.log(`lemon probe server on :3999 → ${OUT}`));
