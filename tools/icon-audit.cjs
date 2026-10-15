/**
 * Icon audit — every lucide icon the app imports, in one reviewable page.
 *
 *   npm run icons:audit            (writes /tmp/icon-audit.html and opens it)
 *   node tools/icon-audit.cjs [out.html]
 *
 * Section 1 lists the LIVE tab icons (header + mini bars) with a badge saying
 * where each is used — the badges are scanned from the source (AppHeader's
 * TAB_ICONS map + the PageToolbar callers' `label: '…', icon: <Name` entries),
 * so a swap changes the page automatically. Under each icon: candidate
 * alternatives (the CURATED map where it matters, closest lucide siblings
 * otherwise — keep CURATED in sync when you add new tab icons). Section 2 is
 * every other icon imported under src/, most-used first; section 3 the full
 * name list. Nothing here ships to the app.
 */
const fs = require('fs');
const path = require('path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const L = require('lucide-react');

const OUT = process.argv[2] || '/tmp/icon-audit.html';

/* ---- 1. inventory: every lucide icon imported under src/ ---- */
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) files.push(p);
  }
})('src');

const used = new Map(); // name -> Set(files)
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*'lucide-react'/g;
  let m;
  while ((m = re.exec(src))) {
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part) continue;
      const [orig] = part.split(/\s+as\s+/).map(s => s.trim());
      if (!orig || orig === 'type' || !L[orig]) continue;
      if (!used.has(orig)) used.set(orig, new Set());
      used.get(orig).add(f.replace('src/', ''));
    }
  }
}

/* ---- 2. what each icon currently IS — scanned from the source so the page
       stays true after a swap ---- */
const ROLES = {}; // lucide name -> [badge texts]
const TAB_LABEL = { breakdown: 'Breakdown', schedule: 'Schedule', calendar: 'Calendar', design: 'Design', rules: 'Rules', production: 'Production', reports: 'Reports' };
try {
  const header = fs.readFileSync('src/components/AppHeader.tsx', 'utf8');
  const block = header.slice(header.indexOf('TAB_ICONS'), header.indexOf('};', header.indexOf('TAB_ICONS')));
  for (const m of block.matchAll(/(\w+):\s*<(\w+)/g)) {
    (ROLES[m[2]] ||= []).push(`header tab · ${TAB_LABEL[m[1]] || m[1]}`);
  }
  for (const f of ['BreakdownTab', 'CalendarTab', 'DesignTab', 'ReportsTab', 'ProductionTab']) {
    const src = fs.readFileSync(`src/components/${f}.tsx`, 'utf8');
    for (const m of src.matchAll(/label:\s*'([^']+)',\s*icon:\s*<(\w+)/g)) {
      (ROLES[m[2]] ||= []).push(`mini tab · ${m[1]}`);
    }
  }
} catch (e) {
  console.warn('tab-icon scan failed (badges only):', e.message);
}

/* ---- 3. curated families for likely-to-change icons (wins over the guess) ---- */
const CURATED = {
  FileSpreadsheet: ['Sheet', 'Table2', 'Table', 'FileGrid', 'FileChartColumn', 'ClipboardList'],
  Timer: ['Clock', 'Clock4', 'AlarmClock', 'Hourglass', 'Gauge', 'CalendarClock'],
  CalendarDays: ['Calendar', 'CalendarRange', 'CalendarFold', 'CalendarCheck', 'CalendarSync', 'Calendar1'],
  Palette: ['Paintbrush', 'Brush', 'SwatchBook', 'Pipette', 'Droplet', 'Shapes'],
  Scale: ['Gavel', 'ListChecks', 'ShieldCheck', 'SlidersHorizontal', 'Landmark', 'BookOpenCheck'],
  Clapperboard: ['Film', 'Video', 'Camera', 'Projector', 'Popcorn', 'Aperture'],
  BarChart3: ['FileChartColumn', 'ChartColumn', 'ChartPie', 'ChartLine', 'Table2', 'Printer'],
  Table2: ['Sheet', 'TableProperties', 'Grid3x3', 'Table', 'LayoutGrid', 'Rows3'],
  FileText: ['FileType', 'ScrollText', 'NotebookText', 'FilePen', 'FileCode', 'StickyNote'],
  ToyBrick: ['Users', 'UserRound', 'Boxes', 'Package', 'Puzzle', 'Blocks', 'Dices'],
  TableProperties: ['Table2', 'Grid3x3', 'Sheet', 'Table', 'LayoutPanelTop'],
  Tags: ['Tag', 'Bookmark', 'CircleDot', 'Flag', 'Palette', 'Shapes'],
  StretchHorizontal: ['RectangleHorizontal', 'Rows3', 'PanelTop', 'GalleryHorizontal', 'Frame', 'LayoutPanelTop'],
  CalendarRange: ['CalendarDays', 'CalendarFold', 'Calendar1', 'Calendar', 'GanttChart', 'CalendarClock'],
  Layers: ['Boxes', 'Package', 'Stack', 'Group', 'Blocks', 'Layers2'],
  CalendarClock: ['Clock', 'CalendarCheck', 'ClipboardList', 'NotepadText', 'ListTodo', 'AlarmClock'],
  Users: ['UserRound', 'UsersRound', 'UserCog', 'Contact', 'IdCard', 'UserPlus'],
  MapPin: ['MapPinned', 'MapPinHouse', 'Map', 'Navigation', 'Compass', 'Route'],
  ChevronDown: ['ChevronRight', 'ChevronsUpDown', 'ArrowDown', 'ChevronsDownUp', 'CaretDown'],
  Check: ['CheckCheck', 'CheckCircle2', 'CircleCheck', 'BadgeCheck', 'SquareCheck'],
  Plus: ['CirclePlus', 'SquarePlus', 'PlusCircle', 'Diff'],
  Trash2: ['Trash', 'Eraser', 'CircleX', 'Archive'],
  X: ['CircleX', 'Ban', 'Delete', 'CircleSlash'],
  Loader2: ['Loader', 'LoaderCircle', 'RefreshCw', 'Clock'],
  Eye: ['EyeOff', 'ScanEye', 'ScanSearch', 'View', 'Focus'],
  Clock: ['Timer', 'AlarmClock', 'Hourglass', 'Clock3', 'CalendarClock'],
  Copy: ['CopyPlus', 'Files', 'ClipboardCopy', 'Layers2'],
  Flag: ['FlagTriangleRight', 'TriangleAlert', 'Bookmark', 'Target'],
  Printer: ['FileText', 'FileDown', 'HardDriveDownload', 'ScanText'],
  Scissors: ['ScissorsLineDashed', 'Slice', 'Split', 'Cable'],
  Pencil: ['PenLine', 'Pen', 'SquarePen', 'PencilLine', 'Edit3'],
  Sun: ['Sunrise', 'Sunset', 'SunMedium', 'CloudSun', 'Moon'],
  AlignLeft: ['AlignJustify', 'AlignStartVertical', 'TextAlignStart', 'List', 'Baseline'],
  StickyNote: ['NotebookText', 'MessageSquareText', 'SquarePen', 'Note'],
  RotateCcw: ['RotateCw', 'Undo2', 'Redo2', 'History', 'RefreshCcw'],
  ArrowUp: ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ChevronUp', 'MoveUp'],
};

/* ---- 4. fallback: stem/sibling matching against the whole library ---- */
const ALL = Object.keys(L).filter(n => /^[A-Z]/.test(n) && typeof L[n] === 'function');
const stem = (n) => n.replace(/[0-9]+$/, '');
const stemOf = new Map(ALL.map(n => [n, stem(n)]));
function autoAlts(name) {
  const s = stemOf.get(name) || name;
  const exact = ALL.filter(n => n !== name && stemOf.get(n) === s);
  if (exact.length >= 3) return exact.slice(0, 6);
  const firstWord = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ')[0];
  const fw = firstWord(s);
  const byWord = ALL.filter(n => n !== name && !exact.includes(n) && firstWord(n) === fw);
  return [...exact, ...byWord].slice(0, 6);
}
const altsOf = (name) => (CURATED[name] || autoAlts(name)).filter(n => L[n] && n !== name).slice(0, 7);

/* ---- 5. render ---- */
const glyph = (name, size, cls = '') => renderToStaticMarkup(React.createElement(L[name], { size, strokeWidth: 1.75, className: cls }));

const card = (name) => {
  const contexts = [...(used.get(name) || [])];
  const roles = ROLES[name] || [];
  const alts = altsOf(name);
  /* Headline = WHERE it is used (the thing you scan for); the icon's name is
     the small bubble (the handle you quote when asking for a change). */
  const headline = roles.length ? roles.join('  ·  ') : (contexts[0] || 'unused?') + (contexts.length > 1 ? `  ·  +${contexts.length - 1} more` : '');
  return `
  <div class="card" data-icon="${name}">
    <div class="head">
      <span class="glyph">${glyph(name, 30)}</span>
      <div class="meta">
        <div class="name">${headline}</div>
        <div class="sub"><span class="badge">${name}</span><span class="where">${contexts.slice(0, 3).join(', ')}${contexts.length > 3 ? ` +${contexts.length - 3} more` : ''}</span></div>
      </div>
    </div>
    ${alts.length ? `<div class="alts"><span class="alts-label">options</span>${alts.map(a => `<span class="alt" title="${a}">${glyph(a, 20)}<i>${a}</i></span>`).join('')}</div>` : '<div class="alts empty">no close siblings in lucide</div>'}
  </div>`;
};

const tabIcons = Object.keys(ROLES).filter(n => used.has(n));
const rest = [...used.keys()].filter(n => !ROLES[n]).sort((a, b) => (used.get(b).size - used.get(a).size) || a.localeCompare(b));

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lemon — icon audit</title><style>
body{margin:0;background:#09090b;color:#e4e4e7;font:12px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
h2{font-size:13px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.08em;margin:26px 18px 4px}
p.note{margin:2px 18px 0;color:#71717a;max-width:900px;line-height:1.5}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px 18px}
@media (min-width:1100px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.card{background:#18181b;border:1px solid #27272a;border-radius:10px;padding:12px}
.head{display:flex;gap:12px;align-items:center}
.glyph{width:44px;height:44px;border-radius:8px;background:#27272a;display:flex;align-items:center;justify-content:center;color:#fafafa;flex:0 0 auto}
.name{font-weight:600;color:#fafafa;padding-right:8px}
.sub{display:flex;align-items:center;gap:8px;margin-top:4px;min-width:0}
.badge{display:inline-block;padding:1px 7px;border-radius:999px;background:#1e3a5f;color:#93c5fd;font-size:10px;font-weight:500;font-family:ui-monospace,Menlo,monospace;white-space:nowrap}
.where{color:#71717a;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:32ch}
.alts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}
.alts-label{color:#52525b;font-size:10px;text-transform:uppercase;letter-spacing:.06em;width:100%}
.alts.empty{color:#52525b;font-size:11px}
.alt{display:flex;flex-direction:column;align-items:center;gap:4px;color:#a1a1aa;width:64px}
.alt i{font-style:normal;font-size:9px;text-align:center;line-height:1.15;word-break:break-word}
ul.names{columns:4;margin:8px 18px 30px;padding:0;list-style:none;color:#a1a1aa}
ul.names li{margin:3px 0;break-inside:avoid}
</style></head><body>
<h2>Tab icons (live)</h2>
<p class="note">Big line = where the icon is used (header / mini tab); the blue bubble = its lucide name (quote that when asking for a swap). Under each: candidate alternatives — curated where it matters, closest siblings otherwise.</p>
<div class="grid">${tabIcons.map(n => card(n)).join('')}</div>

<h2>Everything else (${rest.length} icons, by usage)</h2>
<p class="note">Every other lucide icon imported under src/ — most used first. Big line = where it lives (primary file + count); the bubble is the name to quote.</p>
<div class="grid">${rest.map(n => card(n)).join('')}</div>

<h2>Full name list (copy-paste)</h2>
<ul class="names">${[...used.keys()].sort().map(n => `<li>${n}</li>`).join('')}</ul>
</body></html>`;

fs.writeFileSync(OUT, html);
console.log('icons:', used.size, '->', OUT);
