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

// Deliberately-large or expected-to-grow docs: the design booklet, the roadmap
// backlog and the completed-items index (grep-only, one row per item) are not
// "per-feature manuals".
const EXEMPT = new Set(['ROADMAP.md', 'ROADMAP-ARCHIVE.md', 'DESIGN-LANGUAGE.md']);

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
    warnings.push(
      `${rel} is over its manual cap (${m.lines}/${MANUAL.maxLines} lines, ` +
        `${fmt(m.bytes)}/${fmt(MANUAL.maxBytes)} B) — split it or move detail into a focused sibling doc.`,
    );
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
// 23 → 17: hygiene — retired `glide-breakdown`'s never-failing legacy edit test
// (6 sleeps died with it). Locked rather than left as headroom.
const E2E_WAIT_BASELINE = 17;
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
// 260 → 267: roadmap 38 script-diff acceptance (split/merge badges + in-app edit
// conflict), 132 Part D duplicate modes and Part F tag remap — behavior needs
// real DOM/file-chooser coverage, not unit-only.
// 267 → 268: roadmap 136 tagging overhaul (selection→category menu + FDX commit
// + the Suggestions toggle) needs a second spec case; the old picker e2e is gone.
// 268 → 270: roadmap 165 positioning engine — app-level geometry guards that a
// panel never overhangs the visual viewport (the kit playground covers flip).
// 270 → 271: roadmap 180 fix — re-enable the multi-value range-fill confirm spec
// (was `test.fixme`d; disabled cases aren't counted by this check).
// 271 → 272: roadmap 206 — WebKit-only EntityDropdown finger-scroll regression
// (coarse+touch path; no unit/Chromium layer can drive it).
// 272 → 273: roadmap 198 — designer day picker: the picked day must survive a
// reload (localStorage pref + designer remount; unit tests can't drive the app).
// 273 → 274: roadmap 159 — precalls block: the call-sheet precall edit must
// persist to daybreakMeta.departmentPrecalls (silent loss is plausible).
// 274 → 275: DropdownPanel/SelectDropdown portal isolation — a stripboard
// entity-dropdown item click unmounted the editor mid-toggle (silent loss).
// 275 → 278: EntityDropdown context matrix (entity-dropdown-contexts.spec.ts
// + the Glide canvas overlay case) — panel picks must commit and never leak
// into host handlers on every host shape (Scene Sheet / popup / Glide).
// 278 → 280: roadmap 233 — the designers' editing focus moved to a per-user
// localStorage pref; "the pick must not write the project (a room action) and
// must survive a reload" needs a real client (designer remount + onAction spy).
// 280 → 281: roadmap 163 — script-tab perf harness with a generated full-length
// screenplay; before/after evidence needs the real DOM at document scale.
// 281 → 282: roadmap 255 — the Glide's NEW rows (add row + paste) skipped the
// cast creation guard, silently writing a NAME into scene.cast; that path can
// only be driven through the real grid overlay.
// 282 → 283: roadmap 263 — tab-switch perf harness (click→surface + pill glide
// frames); the before/after evidence IS a real client with the pill on screen.
// 283 → 284: roadmap 274 — report rich text P0: hostile stored markup only
// executes in a browser, so the ingest strip and the two render sinks need a
// real client (the node unit layer has no DOM to sanitize with).
// 284 → 283: hygiene — retired `glide-breakdown`'s never-failing "edits a cell
// via double-click" legacy test (its only assertion sat inside `if (overlayInput)`
// and its edit path is covered by the range-fill/context-matrix tests). Locked
// the freed slot rather than leaving headroom.
// 283 → 280: roadmap 295 (second rebalancing pass) — three state-only e2e cases
// moved to Vitest and retired: linked-elements add-propagation (already covered
// by elementLinks unit + the sibling removal case), SET_SCRIPT_DOCUMENT baseline
// rotation (scriptDocumentStore.test.ts), and the days-off span walk
// (daysOffSync + computeRowData section-date cursor unit tests).
// 280 → 281: roadmap 298 — the crew table's repeated column header: the page
// budget (pageStartExtra) and the continuation render only exist in measured
// print DOM; an unbudgeted repeat silently overflows/clips the page.
// 281 → 283: roadmap 257 — Board ID data safety: (a) Auto-ID plus a manual
// renumber must never rewrite scene fields, (b) a duplicate number must not
// land (the cell reverts) — both are silent-corruption paths.
// 283 → 284: roadmap 157 — cast detail edits behind the Details toggle must
// persist (a dropped performer/contact is silent data loss).
// 284 → 285: roadmap 306 — Element View property edits + picker navigation
// share the manager's write paths (a stale selection or dropped edit is silent).
const E2E_TEST_CAP = 285;
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
