#!/usr/bin/env node
// Smart E2E selector — runs only the Playwright specs your changes can touch.
//
//   npm run test:smart            # run affected specs (writes a Playwright --test-list file first)
//   npm run test:smart -- --list  # just print the selection, don't run
//   SMART_BASE=origin/main npm run test:smart   # diff against a branch instead of HEAD
//   npm run test:smart -- --full  # always run the entire suite
//
// How it works:
//  1. Collect changed files (git working tree vs $BASE, incl. untracked/staged).
//  2. Every changed file is looked up in the RULES map below (source -> specs).
//     - A rule marked 'ALL' (core state/store/config/shared libs) forces the full suite.
//     - A spec file change pulls in exactly that spec.
//     - An UNMAPPED src change cannot be attributed, so only the tab-spanning canaries
//       run, with a loud warning asking you to either add a mapping rule or run
//       `npm run test:full` before you're done. (Core files MUST be in the ALL list —
//       if you can't name the specs a change could hit, that change is core.)
//  3. Canaries (seeded-smoke, debug-bridge) + last-run failures are always included.
//
// The rule map is a judgment call by nature — extend it as features grow. Never
// second-guess the ALL entries; when in doubt, run the full suite.

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SMART_BASE || 'HEAD';
const E2E = join(ROOT, 'e2e');

// ---- Spec buckets (base names under e2e/, no extension) ----
const REPORT = [
  'report-chrome', 'report-designer-move', 'report-editor-polish',
  'report-menu-self-repeat', 'report-page-breaks', 'report-pagination',
  'report-block-gap', 'report-chip-affix', 'report-smart-counts',
  'report-smart-scoping', 'report-sun-weather-map', 'report-violations',
  'report-xmlns', 'report-canvas-sampling', 'report-ribbon-samples',
  'report-breakdown-day-gap-look', 'report-table-resize',
];
const RIBBON = [...REPORT, 'ribbon-design-default', 'ribbon-designer-resize'];
const SCHED = ['keyboard-mode', 'digit-schedule'];
const CAL = ['calendar-travel-hold', 'day-types'];
const GLIDE = ['glide-breakdown', 'glide-clipboard'];
const ELEM = ['element-manager-merge', 'element-manager-day-columns', 'element-events'];
const CAST = ['cast-single-source'];
const LINKED = ['linked-elements'];
const CREW = ['crew-glide', 'crew-manager'];
const LOC = ['locations', 'location-types'];
const IMPORT = ['msd-import', 'cast-single-source'];
const PRINT = ['report-pagination', 'report-page-breaks'];
const MODAL = ['pen-modal', 'keyboard-mode'];
const MANAGERS = [...ELEM, ...CREW, ...LOC];
const CANARY = ['seeded-smoke', 'debug-bridge'];

// ---- Source -> specs map. First match wins per file. s: 'ALL' = full suite. ----
const RULES = [
  // tooling changes don't touch the app
  { g: 'scripts/**', s: [] },
  // core / shared — full suite
  { g: 'src/store/**', s: 'ALL' },
  { g: 'src/lib/daybreakUtils.ts', s: 'ALL' },
  { g: 'src/lib/containers.ts', s: 'ALL' },
  { g: 'src/lib/categories.ts', s: 'ALL' },
  { g: 'src/lib/ribbonUtils.ts', s: 'ALL' },
  { g: 'src/lib/useDaybreakSections.ts', s: 'ALL' },
  { g: 'src/lib/persistentStorage.ts', s: 'ALL' },
  { g: 'src/lib/persist.ts', s: 'ALL' },
  { g: 'src/lib/syncManager.ts', s: 'ALL' },
  { g: 'src/lib/googleDrive*.ts', s: 'ALL' },
  { g: 'src/lib/useDriveProjectList.ts', s: 'ALL' },
  { g: 'src/types/**', s: 'ALL' },
  { g: 'src/types.ts', s: 'ALL' },
  { g: 'src/App.tsx', s: 'ALL' },
  { g: 'src/main.tsx', s: 'ALL' },
  // config / harness files — full suite
  { g: 'package*.json', s: 'ALL' },
  { g: 'vite.config.*', s: 'ALL' },
  { g: 'playwright*.config.ts', s: 'ALL' },
  { g: 'tsconfig*.json', s: 'ALL' },
  { g: 'index.html', s: 'ALL' },
  { g: 'e2e/helpers.ts', s: 'ALL' },
  // reports designer + violations
  { g: 'src/components/reports/**', s: REPORT },
  { g: 'src/components/ReportsTab.tsx', s: REPORT },
  { g: 'src/lib/report*.ts', s: REPORT },
  { g: 'src/lib/richText.ts', s: REPORT },
  { g: 'src/lib/rulesEngine.ts', s: REPORT },
  { g: 'src/lib/violation*.ts', s: REPORT },
  { g: 'src/components/Violation*.tsx', s: REPORT },
  { g: 'src/components/DesignTab.tsx', s: RIBBON },
  // print
  { g: 'src/components/print/**', s: PRINT },
  { g: 'src/components/Print*.tsx', s: PRINT },
  // ribbon designer + stripboard cell rendering
  { g: 'src/components/ribbon/**', s: RIBBON },
  { g: 'src/components/RibbonTab.tsx', s: RIBBON },
  { g: 'src/components/SortableRibbon.tsx', s: [...RIBBON, ...LINKED] },
  { g: 'src/components/RibbonCellText.tsx', s: RIBBON },
  { g: 'src/components/columnResize.tsx', s: RIBBON },
  { g: 'src/lib/ribbon*.ts', s: RIBBON },
  { g: 'src/lib/sceneColors.ts', s: [...RIBBON, ...SCHED] },
  { g: 'src/lib/mergeGroups.ts', s: [...RIBBON, ...ELEM] },
  // schedule stripboard
  { g: 'src/components/schedule/**', s: SCHED },
  { g: 'src/components/ScheduleTab.tsx', s: SCHED },
  { g: 'src/components/StripBlock.tsx', s: [...SCHED, ...RIBBON] },
  { g: 'src/components/Boneyard*.tsx', s: SCHED },
  { g: 'src/components/StripboardContextMenuContent.tsx', s: SCHED },
  { g: 'src/lib/dndSensors.ts', s: SCHED },
  { g: 'src/lib/useMarquee.tsx', s: SCHED },
  { g: 'src/lib/useStripboardContextMenu.ts', s: SCHED },
  { g: 'src/lib/virtualChunk.ts', s: SCHED },
  { g: 'src/lib/sceneFactory.ts', s: [...SCHED, ...GLIDE] },
  { g: 'src/lib/useLongPressMenu.tsx', s: [...SCHED, ...CAL] },
  // calendar + day types
  { g: 'src/components/calendar/**', s: CAL },
  { g: 'src/components/CalendarTab.tsx', s: CAL },
  { g: 'src/lib/dayTypes.ts', s: CAL },
  { g: 'src/lib/nonShoot*.ts', s: CAL },
  { g: 'src/lib/places.ts', s: CAL },
  { g: 'src/lib/timezones.ts', s: CAL },
  // glide breakdown
  { g: 'src/components/BreakdownTabGlide.tsx', s: [...GLIDE, ...LINKED] },
  { g: 'src/lib/glide*', s: GLIDE },
  { g: 'src/components/SceneSheet*.tsx', s: [...CAST, ...ELEM, ...LINKED] },
  { g: 'src/lib/paletteOps.ts', s: [...GLIDE, ...ELEM] },
  { g: 'src/lib/elements.ts', s: [...ELEM, ...REPORT] },
  // element / cast / crew / locations managers (buffered editor managers)
  { g: 'src/components/ElementManager.tsx', s: [...ELEM, ...LINKED] },
  { g: 'src/lib/elementDayStats.ts', s: ELEM },
  { g: 'src/lib/elementEvents.ts', s: ELEM },
  { g: 'src/lib/elementLinks.ts', s: LINKED },
  { g: 'src/lib/useLinkedEditGuard.ts', s: LINKED },
  { g: 'src/components/rules/ElementPicker.tsx', s: [...RIBBON, ...LINKED] },
  { g: 'src/components/elements/LinkManagerModal.tsx', s: LINKED },
  { g: 'src/components/elements/**', s: ELEM },
  { g: 'src/components/CastTab.tsx', s: CAST },
  { g: 'src/lib/legacyMigration.ts', s: [...CAST, ...IMPORT] },
  { g: 'src/components/CrewGlideTab.tsx', s: CREW },
  { g: 'src/components/CrewManager.tsx', s: CREW },
  { g: 'src/lib/crew*.ts', s: CREW },
  { g: 'src/components/Locations*.tsx', s: LOC },
  { g: 'src/lib/location*', s: LOC },
  { g: 'src/lib/locations.ts', s: LOC },
  // shared location picker modal (locations manager + reports map block)
  { g: 'src/components/location/**', s: [...LOC, 'report-sun-weather-map'] },
  { g: 'src/lib/rowBuffer.ts', s: MANAGERS },
  { g: 'src/lib/managerShell.tsx', s: MANAGERS },
  // import / export
  { g: 'src/lib/import/**', s: IMPORT },
  { g: 'src/components/ImportDialog.tsx', s: IMPORT },
  { g: 'e2e/fixtures/**', s: ['msd-import'] },
  // pointer / keyboard / modals
  { g: 'src/lib/device.ts', s: MODAL },
  { g: 'src/components/Modal.tsx', s: MODAL },
  { g: 'src/components/ColorField.tsx', s: MODAL },
  { g: 'src/components/KeyboardToggleButton.tsx', s: ['keyboard-mode'] },
  // color rules + shared element pickers (rules tab + colors tab)
  { g: 'src/components/rules/**', s: RIBBON },
  { g: 'src/components/ColorRule*.tsx', s: RIBBON },
  // entity dropdowns are shared app-wide (sheets, glide, stripboard, modals)
  { g: 'src/components/EntityDropdown.tsx', s: 'ALL' },
  { g: 'src/components/DropdownPanel.tsx', s: 'ALL' },
];

// ---- tiny glob: supports `**` (any depth), `*` (within a segment) ----
function globRe(glob) {
  const parts = glob.split('/');
  const re = parts
    .map(p => {
      if (p === '**') return '(?:[^/]*(?:/[^/]*)*)?';
      return p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    })
    .join('/');
  return new RegExp(`^${re}$`);
}
const compiled = RULES.map(({ g, s }) => ({ re: globRe(g), s }));

function firstMatch(file) {
  for (const { re, s } of compiled) if (re.test(file)) return s;
  return null;
}

// ---- collect changed files (working tree vs BASE, incl. untracked) ----
function gitOut(args) {
  try { return execSync(`git ${args}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
  catch { return ''; }
}
// only these paths can affect the app under test; docs/scratch/etc are ignored
function isRelevant(f) {
  return (
    f.startsWith('src/') || f.startsWith('e2e/') || f.startsWith('scripts/') ||
    /^(package(?:-lock)?\.json|vite\.config\.[cm]?[jt]s?$|playwright[\w-]*\.config\.ts$|tsconfig[\w-]*\.json$|index\.html)$/.test(f)
  );
}
function changedFiles() {
  const files = new Set();
  for (const line of gitOut(`diff --name-only ${BASE}`).split('\n')) if (line.trim()) files.add(line.trim());
  for (const line of gitOut(`ls-files --others --exclude-standard`).split('\n')) if (line.trim()) files.add(line.trim());
  return [...files].filter(isRelevant).sort();
}

function execInherit(cmd) {
  try { execSync(cmd, { cwd: ROOT, stdio: 'inherit' }); process.exit(0); }
  catch (e) { process.exit(typeof e.status === 'number' ? e.status : 1); }
}

function run(sel, listOnly) {
  if (listOnly) {
    console.log(sel && sel.length ? sel.join('\n') : '(full suite)');
    return;
  }
  if (!sel) {
    console.log('running FULL suite');
    execInherit('npx playwright test');
  }
  const listFile = join(tmpdir(), `lemon-smart-test-${process.pid}.txt`);
  writeFileSync(listFile, sel.join('\n') + '\n');
  console.log(`running ${sel.length} spec(s):`);
  console.log(sel.map(s => '  ' + s).join('\n'));
  execInherit(`npx playwright test --test-list ${listFile}`);
}

function main() {
  const listOnly = process.argv.includes('--list');
  const forceFull = process.argv.includes('--full');
  const changed = changedFiles();
  if (forceFull) { console.log('--full: running entire suite'); run(null, false); process.exit(0); }
  if (changed.length === 0) {
    console.log(`no changes since ${BASE} — nothing to run. Use --full.`);
    process.exit(0);
  }

  const wanted = new Set(CANARY.map(s => `e2e/${s}.spec.ts`));
  const matched = [], unmatched = [];
  let full = false;
  for (const file of changed) {
    if (/^e2e\/.+\.spec\.ts$/.test(file)) { matched.push(file); wanted.add(file); continue; }
    const s = firstMatch(file);
    if (s === 'ALL') { full = true; break; }
    if (s) { matched.push(file); s.forEach(spec => wanted.add(`e2e/${spec}.spec.ts`)); }
    else unmatched.push(file);
  }

  // last-run failures are always retried
  try {
    const lr = JSON.parse(readFileSync(join(ROOT, 'test-results/.last-run.json'), 'utf8'));
    for (const t of lr.failedTests ?? []) {
      const m = String(t).match(/^(?:\[[^\]]+\]\s*›\s*)?(e2e\/[\w\-]+\.spec\.ts)/);
      if (m) wanted.add(m[1]);
    }
  } catch {}

  if (full) {
    console.log(`core/config change detected — running FULL suite.`);
    run(null, listOnly);
    process.exit(0);
  }
  if (unmatched.length) {
    console.warn('\nUNMAPPED changes (cannot attribute to specs) — running canaries only:');
    for (const f of unmatched) console.warn('  ' + f);
    console.warn('Add a mapping rule in scripts/smart-test.mjs, or run `npm run test:full` before done.\n');
  }
  console.log(`smart selection from ${BASE} (${changed.length} changed):`);
  for (const f of changed) console.log('  - ' + f);
  run([...wanted].sort(), listOnly);
}

main();
