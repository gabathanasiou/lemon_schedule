import { chromium } from 'playwright';
import fs from 'node:fs';
const seedPath = '/Users/gabrielathanasiou/Downloads/Town - Jason.lemon';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const seed = fs.readFileSync(seedPath, 'utf8');
await page.addInitScript((raw) => {
  const project = JSON.parse(raw);
  const meta = JSON.stringify({ id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() });
  localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
  localStorage.setItem('lemon_schedule_project_index', JSON.stringify([JSON.parse(meta)]));
}, seed);
await page.goto('http://localhost:3000/lemon_schedule/', { waitUntil: 'networkidle' });
await page.getByText('Town - Jason', { exact: true }).first().click({ timeout: 8000 });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Schedule' }).click();
await page.waitForTimeout(900);
const row = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-row-id]')];
  const r = rows.find(x => {
    const rect = x.getBoundingClientRect();
    return rect.x > 20 && rect.x < 1000 && rect.y > 120 && rect.y < 700 && rect.width > 100;
  });
  if (!r) return null;
  const rect = r.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
if (!row) { console.log('NO VISIBLE ROW'); process.exit(1); }
console.log('row:', JSON.stringify(row));
await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    window.__frames.push(now - last);
    last = now;
    if (window.__frames.length > 4000) return;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
await page.waitForTimeout(600);
await page.evaluate(() => { window.__frames = []; });
const cs = await ctx.newCDPSession(page);
await cs.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: row.x, y: row.y }] });
await page.waitForTimeout(300);
for (let i = 1; i <= 30; i++) {
  await cs.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: row.x + 6, y: row.y + i * 4 }] });
  await page.waitForTimeout(45);
}
await page.waitForTimeout(300);
const stats = await page.evaluate(() => {
  const f = window.__frames;
  const s = [...f].sort((a, b) => a - b);
  return {
    frames: f.length,
    avg: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(1),
    over33ms: f.filter(x => x > 33).length,
    over100ms: f.filter(x => x > 100).length,
    worst: f.slice().sort((a, b) => b - a).slice(0, 3).map(x => +x.toFixed(0)),
  };
});
console.log('FRAME STATS:', JSON.stringify(stats));
await cs.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await browser.close();
