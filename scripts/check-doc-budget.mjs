#!/usr/bin/env node
// Deterministic guard against agent-doc bloat.
//
// AGENTS.md loads into EVERY session, so it has a hard budget. Each docs/*.md
// manual is read on demand and gets a looser one. Claude Code's guidance: keep
// the always-loaded file under ~200 lines — past that, rules get lost in the
// noise and adherence drops. Instructions are advisory; this check is not.
//
// Wired into `npm run lint` (and available as `npm run lint:docs`) so every
// verify pass catches regrowth. Also guards ROADMAP hygiene: the live roadmap
// holds OPEN items only, and the archive index has unique, stable ids (see the
// `manage-roadmap` skill).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BYTES_PER_TOKEN = 4;

// The always-loaded hub. Budget = current size + modest headroom, measured in
// BOTH lines and bytes (long lines make line count understate real cost).
const HUB = { file: 'AGENTS.md', maxLines: 200, maxBytes: 36000 };

// Per-feature manuals, read on demand.
const MANUAL = { maxLines: 400, maxBytes: 50000 };

// Deliberately-large or expected-to-grow docs: the design booklet and the
// roadmap backlog are not "per-feature manuals".
const EXEMPT = new Set(['ROADMAP.md', 'DESIGN-LANGUAGE.md']);

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function measure(text) {
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  const bytes = Buffer.byteLength(text, 'utf8');
  return { lines, bytes, tokens: Math.round(bytes / BYTES_PER_TOKEN) };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

function row(rel, m, cap) {
  const linePct = cap ? Math.round((m.lines / cap.maxLines) * 100) : null;
  const over = cap && (m.lines > cap.maxLines || m.bytes > cap.maxBytes);
  const flag = cap ? (over ? 'OVER' : `${linePct}%`) : 'exempt';
  return `  ${rel.padEnd(42)} ${String(m.lines).padStart(5)} lines  ${fmt(m.bytes).padStart(8)} B  ~${fmt(m.tokens).padStart(6)} tok  ${flag}`;
}

const errors = [];
const warnings = [];

const hub = measure(read(HUB.file));
console.log(`Agent-doc budget (hub cap: ${HUB.maxLines} lines / ${fmt(HUB.maxBytes)} B)\n`);
console.log(row(HUB.file, hub, HUB));
if (hub.lines > HUB.maxLines || hub.bytes > HUB.maxBytes) {
  errors.push(
    `${HUB.file} is over budget (${hub.lines}/${HUB.maxLines} lines, ${fmt(hub.bytes)}/${fmt(HUB.maxBytes)} B).\n` +
      `  Fix: move detail to a docs/*.md manual and leave a summary + MUST-NOT invariants + pointer.\n` +
      `  See the write-agent-docs skill ("Hub vs manual").`,
  );
}

const docsDir = join(ROOT, 'docs');
const manuals = readdirSync(docsDir)
  .filter((f) => f.endsWith('.md'))
  .sort();

console.log('\nOn-demand manuals (cap: ~%d lines / %s B):', MANUAL.maxLines, fmt(MANUAL.maxBytes));
for (const f of manuals) {
  const rel = `docs/${f}`;
  const text = read(rel);
  const m = measure(text);
  if (EXEMPT.has(f)) {
    console.log(row(rel, m, null));
    continue;
  }
  console.log(row(rel, m, MANUAL));
  if (m.lines > MANUAL.maxLines || m.bytes > MANUAL.maxBytes) {
    warnings.push(`${rel} is ${m.lines} lines — split it or move detail into a focused sibling doc.`);
  }
  // Agent-doc hygiene: a live manual must open with a title + a read-first line,
  // so an agent knows when to read it and future sessions can spot stale docs.
  const head = text.split('\n').slice(0, 8).join('\n');
  if (!/^#\s+\S/m.test(head)) warnings.push(`${rel} has no "# Title" in its first lines.`);
  if (!/read this|read before|status:/i.test(head)) {
    warnings.push(`${rel} has no read-first/Status line in its first 8 lines.`);
  }
}

// --- Roadmap hygiene ---------------------------------------------------------
// The live roadmap holds OPEN items only; completed items live in the archive
// as ONE-line index rows with stable, unique ids (full narratives in git).
// This is what keeps the two files from drifting into duplicate narratives.
const ROADMAP = 'docs/ROADMAP.md';
const ARCHIVE = 'docs/ROADMAP-ARCHIVE.md';
const roadmapText = read(ROADMAP);
const archiveText = read(ARCHIVE);

const doneInLive = [...roadmapText.matchAll(/^##\s+\d+\..*\[x\]/gm)].map((m) => m[0].trim());
const openCount = [...roadmapText.matchAll(/^##\s+\d+\..*/gm)].length;

const ids = [...archiveText.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => Number(m[1]));
const dupIds = [...new Set(ids.filter((n, i) => ids.indexOf(n) !== i))];

console.log('\nRoadmap hygiene: %d open item(s) in %s; %d archived index row(s).', openCount, ROADMAP, ids.length);
if (doneInLive.length) {
  errors.push(
    `${ROADMAP} contains ${doneInLive.length} completed (\`[x]\`) item(s) — the live roadmap must hold OPEN items only.\n` +
      `  Fix: add/move a one-line row in ${ARCHIVE}, then delete the full section (git preserves the narrative).\n` +
      `  Found: ${doneInLive.slice(0, 6).join(' | ')}${doneInLive.length > 6 ? ' …' : ''}`,
  );
}
if (dupIds.length) {
  errors.push(
    `${ARCHIVE} has duplicate item id(s): ${dupIds.join(', ')} — ids are stable and unique; give the newer item the next free number.`,
  );
}

// --- E2E spec hygiene --------------------------------------------------------
// Every spec must be reachable from the smart-test RULES map, otherwise
// `npm run test:smart` never selects it — the feature silently loses coverage.
// @perf / @quarantine-only specs are intentionally out of the default suite.
const e2eDir = join(ROOT, 'e2e');
const smartSrc = read('scripts/smart-test.mjs');
const orphanSpecs = [];
for (const f of readdirSync(e2eDir).filter((x) => x.endsWith('.spec.ts')).sort()) {
  const base = f.replace(/\.spec\.ts$/, '');
  if (smartSrc.includes(`'${base}'`)) continue;
  const titles = [...read(`e2e/${f}`).matchAll(/\btest(?:\.\w+)?\(\s*['"`]([^'"`]*)/g)].map((m) => m[1]);
  const excluded = titles.length > 0 && titles.every((t) => /@perf|@quarantine/.test(t));
  if (!excluded) orphanSpecs.push(`e2e/${f}`);
}
console.log('\nE2E specs: %d total, %d orphaned (not in smart-test RULES).', 
  readdirSync(e2eDir).filter((x) => x.endsWith('.spec.ts')).length, orphanSpecs.length);
if (orphanSpecs.length) {
  errors.push(
    `unmapped e2e spec(s) — unreachable from scripts/smart-test.mjs RULES, so test:smart never selects them:\n  ` +
      `${orphanSpecs.join(', ')}\n  Fix: add the spec base name to a bucket in smart-test.mjs, or tag its tests @perf/@quarantine.`,
  );
}

// Anti-regrowth ratchet: `waitForTimeout` is legitimate canvas/drag pacing, but
// it is also the #1 flake source. Hold the non-@perf count at/below the
// baseline — a new wait must be paid for by removing one (use expect.poll).
const E2E_WAIT_BASELINE = 30;
let waitCount = 0;
for (const f of readdirSync(e2eDir).filter((x) => x.endsWith('.spec.ts'))) {
  const body = read(`e2e/${f}`);
  if (body.includes('@perf')) continue; // perf harnesses measure, they don't pace
  waitCount += (body.match(/waitForTimeout\(/g) || []).length;
}
console.log('Non-@perf waitForTimeout calls: %d / baseline %d.', waitCount, E2E_WAIT_BASELINE);
if (waitCount > E2E_WAIT_BASELINE) {
  errors.push(
    `non-@perf waitForTimeout calls rose to ${waitCount} (baseline ${E2E_WAIT_BASELINE}) — prefer expect/expect.poll/waitForFunction.\n` +
      `  If a wait is genuine canvas/drag pacing, remove another or consciously lower E2E_WAIT_BASELINE in this script.`,
  );
}

// Selector hygiene: flag the fragile locator patterns that break on styling
// (the documented drift cause in docs/KNOWN-TEST-FAILURES.md). Role/testid/data-*
// are fine; these are not. Non-blocking — migrate opportunistically.
const FRAGILE_SELECTORS = [
  { re: /locator\((['"`])[^'"`]*\[style\*=[^\])]*/g, why: 'inline-style selector' },
  { re: /locator\((['"`])div\.[a-zA-Z]/g, why: 'utility-class selector' },
  { re: /locator\((['"`])\.\./g, why: 'parent (`..`) selector' },
  { re: /locator\((['"`])[^'"`]*\[class\*=/g, why: '[class*=] selector' },
];
let fragileTotal = 0;
const fragileFiles = [];
for (const f of readdirSync(e2eDir).filter((x) => x.endsWith('.spec.ts'))) {
  const body = read(`e2e/${f}`);
  const n = FRAGILE_SELECTORS.reduce((sum, { re }) => sum + (body.match(re)?.length || 0), 0);
  if (n) {
    fragileTotal += n;
    fragileFiles.push(f);
  }
}
if (fragileTotal) {
  warnings.push(
    `${fragileTotal} fragile locator(s) across ${fragileFiles.length} spec(s) — prefer role/getByTestId/data-*; ` +
      `most fragiles: ${fragileFiles.slice(0, 4).join(', ')}.`,
  );
}

// Suite-size ratchet: e2e is the expensive layer — growth must be deliberate.
// When this trips, do ONE of: merge the new cases into an existing spec; move
// pure logic down to a unit test (`npm run test:unit`); or consciously raise a
// cap here with a one-line reason. Never just append a spec.
const E2E_SPEC_CAP = 70;
const E2E_TEST_CAP = 260;
const e2eSpecFiles = readdirSync(e2eDir).filter((x) => x.endsWith('.spec.ts'));
const e2eTestCount = e2eSpecFiles.reduce(
  (n, f) => n + (read(`e2e/${f}`).match(/^\s*test\(/gm) || []).length,
  0,
);
console.log(
  'E2E suite: %d specs / %d tests (caps %d / %d).',
  e2eSpecFiles.length, e2eTestCount, E2E_SPEC_CAP, E2E_TEST_CAP,
);
if (e2eSpecFiles.length > E2E_SPEC_CAP || e2eTestCount > E2E_TEST_CAP) {
  errors.push(
    `e2e suite grew past its cap (${e2eSpecFiles.length}/${E2E_SPEC_CAP} specs, ${e2eTestCount}/${E2E_TEST_CAP} tests) — ` +
      `merge into an existing spec, move pure logic to a unit test, or raise the cap consciously (see docs/TESTING.md).`,
  );
}

if (warnings.length) {
  console.log(`\nWarnings (non-blocking):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length) {
  console.log(`\nFAIL: doc/roadmap hygiene.\n`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}

console.log('\nDoc budget + roadmap + e2e hygiene OK.');
