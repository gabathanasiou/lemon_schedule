import type { ReportBlock } from '../types';
import { escapeHtml, normalizeSpaces } from './richText';
import { isCovered } from './reportTableMerges';
import { resolveReportTextStyleSpans } from './reportTextStyles';
import type { ReportCtx } from './reportData';
import { fieldValueSafe, parseLookupKey, lookupIdentityField, lookupItemLabel, lookupTargetItem, referenceOffer, scopeLookupTarget, chainSceneScope, type LookupPath, type LookupRef, type ParsedLookupKey } from './reportLookup';
import type { ReportFieldDef, FieldAux } from './reportFields';

// Token vocabulary + resolution for the Reports Designer (roadmap 190
// extraction): `{{field}}` token parse/compose, plain + HTML token resolution,
// free-table cell references (mirrors / pins / relative offsets) and the chip
// color palette. The lookup grammar, scope registry, field-value reading and
// reference navigation live in reportLookup.ts; the field REGISTRY stays in
// reportFields.ts. Both re-export this module so every existing import site
// keeps working. `ReportFieldDef`/`FieldAux` are imported type-only — no
// runtime cycle.

/**
 * Re-joins a comma-separated attribute with per-item affixes. Only used when
 * the field is multiValue and the block carries at least one item option —
 * otherwise the raw value passes through untouched.
 */
export function applyItemAffixes(value: string, opts: { itemPrefix?: string; itemSuffix?: string; itemSeparator?: string }): string {
  const parts = value.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return value;
  // Empty separator segment = ", " default — joining items with no spacing is
  // never wanted, so only an EXPLICIT separator (e.g. "; ") overrides it.
  const sep = opts.itemSeparator || ', ';
  return parts.map(p => `${opts.itemPrefix ?? ''}${p}${opts.itemSuffix ?? ''}`).join(sep);
}

// ---- token resolution (text blocks) ------------------------------------------

export const TOKEN_RE = /\{\{([^}]+)\}\}/g;
const KEY_POSITION_KEYS = new Set(['director', 'producer', 'lineProducer', 'firstAD', 'upm']);

/** Item-formatting options parsed from a token's `|`-separated tail:
 *  `{{field|itemPrefix|itemSuffix|itemSeparator}}` — empty segments mean
 *  defaults. Tokens without pipes carry no options (exact current behavior). */
export interface TokenItemOpts {
  itemPrefix?: string;
  itemSuffix?: string;
  itemSeparator?: string;
}

export function parseToken(raw: string): { field: string; opts: TokenItemOpts } {
  const parts = raw.split('|');
  const field = parts[0].trim();
  if (parts.length === 1) return { field, opts: {} };
  return {
    field,
    opts: {
      itemPrefix: parts[1] ?? '',
      itemSuffix: parts[2] ?? '',
      itemSeparator: parts[3] ?? '',
    },
  };
}

/** Compose a piped token key from parts (omits pipes when all empty). */
export function composeTokenKey(field: string, prefix: string, suffix: string, separator: string): string {
  if (!prefix && !suffix && !separator) return field;
  return `${field}|${prefix}|${suffix}|${separator}`;
}


export interface TokenResolveOptions {
  /** Designer canvas: render the raw token ({{field}}) when its value is empty
   *  so templates stay visible instead of showing a blank spot. Print/preview
   *  keep true empty values. */
  showUnresolved?: boolean;
  /** Free-table cell editing (roadmap 190): the containing block + the FORMULA
   *  cell's own stable ids — relative offsets resolve from that index and
   *  absolute refs look the target up in the same block. */
  cellRef?: CellRefContext;
}

// ---- free-table cell references (roadmap 190) --------------------------------
// A free-table cell can reference another cell (Excel-style):
//   {{cellref.<rowId>.<colId>}}          mirror the target cell's content
//   {{cellref.<rowId>.<colId>.<field>}}  pin one attribute of the target's item
//   {{cellref.rel.<dx>.<dy>[.<field>]}}  the same, relative to the formula cell
// Relative offsets resolve against the FORMULA cell's current row/column index
// at render time ("above" follows the neighbour when rows move); absolute refs
// use the stable row/column ids, so column reorder + row insert/delete survive.
// The `.` picker stores a pinned attribute as a SECOND adjacent chip (the 121
// pair convention) — `suppressCellRefPairs` prints only the pinned one.

export type CellRefKey =
  | { kind: 'abs'; rowId: string; colId: string; field?: string }
  | { kind: 'rel'; dx: number; dy: number; field?: string };

export function parseCellRefKey(raw: string): CellRefKey | null {
  if (!raw.startsWith('cellref.')) return null;
  const parts = raw.split('.');
  if (parts[1] === 'rel') {
    if (parts.length < 4) return null;
    const dx = Number(parts[2]);
    const dy = Number(parts[3]);
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) return null;
    return { kind: 'rel', dx, dy, field: parts.slice(4).join('.') || undefined };
  }
  if (!parts[1] || !parts[2]) return null;
  return { kind: 'abs', rowId: parts[1], colId: parts[2], field: parts.slice(3).join('.') || undefined };
}

export function composeCellRefKey(rowId: string, colId: string, field?: string): string {
  return `cellref.${rowId}.${colId}${field ? `.${field}` : ''}`;
}

export function composeRelativeCellRefKey(dx: number, dy: number, field?: string): string {
  return `cellref.rel.${dx}.${dy}${field ? `.${field}` : ''}`;
}

/** The formula cell's own table position — relative offsets resolve from here. */
export interface CellRefContext {
  block: ReportBlock;
  rowId: string;
  colId: string;
}

export interface CellRefTarget {
  rowId: string;
  colId: string;
  rowIndex: number;
  colIndex: number;
  html: string;
}

/** Locate a ref's target BODY cell (covered cells map to their merge anchor);
 *  null when the row/column is gone or an offset leaves the table. */
export function cellRefTarget(cellRefCtx: CellRefContext, key: CellRefKey): CellRefTarget | null {
  const block = cellRefCtx.block;
  const rows = block.customRows || [];
  const columns = block.columns || [];
  let rowIndex: number;
  let colIndex: number;
  if (key.kind === 'abs') {
    rowIndex = rows.findIndex(r => r.id === key.rowId);
    colIndex = columns.findIndex(c => c.id === key.colId);
  } else {
    rowIndex = rows.findIndex(r => r.id === cellRefCtx.rowId);
    colIndex = columns.findIndex(c => c.id === cellRefCtx.colId);
    if (rowIndex < 0 || colIndex < 0) return null;
    rowIndex += key.dy;
    colIndex += key.dx;
  }
  if (rowIndex < 0 || rowIndex >= rows.length || colIndex < 0 || colIndex >= columns.length) return null;
  const row = rows[rowIndex];
  const col = columns[colIndex];
  const merge = isCovered(block.cellMerges || [], rows, columns, row.id, col.id);
  const rowId = merge ? merge.rowId : row.id;
  const colId = merge ? merge.colId : col.id;
  const ri = merge ? rows.findIndex(r => r.id === rowId) : rowIndex;
  const ci = merge ? columns.findIndex(c => c.id === colId) : colIndex;
  if (ri < 0 || ci < 0) return null;
  return { rowId, colId, rowIndex: ri, colIndex: ci, html: rows[ri].cells[ci] || '' };
}

/** Same-target ref+pinned pairs (the 121 chip convention): print only the
 *  pinned token — the reference chip is its anchor. */
function suppressCellRefPairs(text: string): string {
  return text.replace(/\{\{(cellref\.[^{}]+)\}\}\{\{(cellref\.[^{}]+)\}\}/g, (m, a: string, b: string) => {
    const pa = parseCellRefKey(a);
    const pb = parseCellRefKey(b);
    if (!pa || !pb || pa.field || !pb.field) return m;
    if (pa.kind === 'abs' && pb.kind === 'abs' && pa.rowId === pb.rowId && pa.colId === pb.colId) return `{{${b}}}`;
    if (pa.kind === 'rel' && pb.kind === 'rel' && pa.dx === pb.dx && pa.dy === pb.dy) return `{{${b}}}`;
    return m;
  });
}

type CellRefResolution =
  | { kind: 'mirror'; target: CellRefTarget; nextSeen: Set<string> }
  | { kind: 'pinned'; value: string; def?: ReportFieldDef; ref: LookupRef }
  | { kind: 'empty' }
  | { kind: 'error'; error: '#REF!' | '#VALUE!' };

/** Resolve one ref against its formula cell: mirror descriptor, pinned value,
 *  empty target or an Excel-style error. `seen` carries the cells already
 *  entered on this token's chain (reference cycles → #REF!). */
function resolveCellRefAtom(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  cellRefCtx: CellRefContext,
  key: CellRefKey,
  item: any,
  aux: FieldAux | undefined,
  seen: Set<string>,
): CellRefResolution {
  const target = cellRefTarget(cellRefCtx, key);
  if (!target) return { kind: 'error', error: '#REF!' };
  const targetKey = `${target.rowId}:${target.colId}`;
  if (seen.has(targetKey)) return { kind: 'error', error: '#REF!' };
  if (!plainText(target.html)) return { kind: 'empty' };
  if (!key.field) {
    const nextSeen = new Set(seen);
    nextSeen.add(targetKey);
    return { kind: 'mirror', target, nextSeen };
  }
  const lookup = reduceCellToLookup(
    ctx, fieldMap, target.html,
    { block: cellRefCtx.block, rowId: target.rowId, colId: target.colId },
    item, aux, seen,
  );
  if (!lookup) return { kind: 'error', error: '#VALUE!' };
  const hit = lookupTargetItem(ctx, lookup.collection, lookup.itemKey, lookup.path);
  if (!hit) return { kind: 'error', error: '#REF!' };
  const def = fieldMap[key.field];
  if (!def) return { kind: 'error', error: '#VALUE!' };
  // A chained ref resolves against its OWN path context (roadmap 196): the
  // path's ancestor intersection, never the formula cell's aux — so smart and
  // scene-derived fields read the chain's chain, not wherever the ref sits.
  const scope = lookup.path ? chainSceneScope(ctx, lookup.path) : aux?.sceneScope;
  const scoped = scopeLookupTarget(ctx, fieldMap, lookup.collection, hit, scope);
  return { kind: 'pinned', value: fieldValueSafe(def, ctx, scoped, lookup.path ? { ...aux, sceneScope: scope } : aux), def, ref: lookup };
}


/** Reduce a target cell's raw HTML to exactly ONE item reference (a lookup
 *  token, possibly the suppressed 121 ref+attribute pair), following nested
 *  cellrefs transitively — a PINNED cellref still identifies the same item,
 *  so `@Bob` | `LEFT.phone` | `LEFT.email` chains resolve. Surrounding label
 *  text is fine ("Director: @Bob") — only the TOKEN count decides; several
 *  tokens stay ambiguous. Null when the cell isn't one reference. */
function reduceCellToLookup(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  html: string,
  cellRefCtx: CellRefContext,
  item: any,
  aux: FieldAux | undefined,
  seen: Set<string>,
): LookupRef | null {
  const supp = suppressCellRefPairs(suppressLookupPairs(html));
  const tokens = [...supp.matchAll(TOKEN_RE)].map(m => m[1]);
  if (tokens.length !== 1) return null;
  const raw = tokens[0];
  const lookup = parseLookupKey(raw);
  if (lookup) return { collection: lookup.collection, field: lookup.field, itemKey: lookup.itemKey, path: lookup.path };
  const nested = parseCellRefKey(raw);
  if (!nested) return null;
  const r = resolveCellRefAtom(ctx, fieldMap, cellRefCtx, nested, item, aux, seen);
  if (r.kind === 'mirror') {
    return reduceCellToLookup(
      ctx, fieldMap, r.target.html,
      { block: cellRefCtx.block, rowId: r.target.rowId, colId: r.target.colId },
      item, aux, r.nextSeen,
    );
  }
  // A pinned ref still identifies the SAME item — chains keep passing the
  // reference downstream (`@Bob` | `LEFT.phone` | `LEFT.email`).
  if (r.kind === 'pinned') return r.ref;
  return null;
}

/** A lone cellref token in a cell's content (mirrors OR pinned pair form) —
 *  `reduceCellToLookup` for chains; null when the cell isn't just a ref. */
function loneCellRefToken(html: string): string | null {
  const supp = suppressCellRefPairs(html);
  if (plainText(supp.replace(TOKEN_RE, ''))) return null;
  const tokens = [...supp.matchAll(TOKEN_RE)].map(m => m[1]);
  if (tokens.length !== 1) return null;
  return parseCellRefKey(tokens[0]) ? tokens[0] : null;
}

/** The hover highlight chain for a cellref: the direct target plus every cell
 *  reached by following lone-cellref contents, ending at the origin (the first
 *  cell that isn't a lone ref — the item reference the chain resolves to).
 *  Cycle-safe. */
export function cellRefChain(block: ReportBlock, cell: { rowId: string; colId: string }, key: CellRefKey): CellRefTarget[] {
  const out: CellRefTarget[] = [];
  const seen = new Set<string>();
  let ctx: CellRefContext = { block, rowId: cell.rowId, colId: cell.colId };
  let ref: CellRefKey | null = key;
  while (ref) {
    const target = cellRefTarget(ctx, ref);
    if (!target) break;
    const id = `${target.rowId}:${target.colId}`;
    if (seen.has(id)) break;
    seen.add(id);
    out.push(target);
    const nextRaw = loneCellRefToken(target.html);
    ctx = { block, rowId: target.rowId, colId: target.colId };
    ref = nextRaw ? parseCellRefKey(nextRaw) : null;
  }
  return out;
}

/** A target cell stored as ONE paragraph mirrors its inner content — the
 *  formula cell's own paragraph would otherwise nest. */
function unwrapSingleParagraph(html: string): string {
  const m = html.match(/^\s*<p[^>]*>([\s\S]*)<\/p>\s*$/i);
  return m ? m[1] : html;
}

/** Wraps Excel-style errors for the designer/preview/print cell renderers
 *  (plain-text resolution keeps the bare marker). */
function errorSpan(error: string): string {
  return `<span class="report-cell-error">${error}</span>`;
}

/** DOM-free visible text of a rich-text string (the kit's stripRichText needs
 *  a document — unit tests run in node). Emptiness + chip-label checks only. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}


/** The 121 pair rule: a lookup token DIRECTLY followed by another lookup token
 *  of the same target prints as the attribute only — the reference chip is its
 *  anchor and renders empty. The same adjacency suppresses the anchor when a
 *  chain chip starts a navigation from it (roadmap 196). Deleting either chip
 *  leaves the other resolving on its own. Repeated until stable: an
 *  `anchor + chain + attribute` run needs more than one pass. */
function suppressLookupPairs(text: string): string {
  const re = /\{\{(lookup\.[^{}]+)\}\}\{\{(lookup\.[^{}]+)\}\}/g;
  let prev: string;
  do {
    prev = text;
    text = text.replace(re, (m, a: string, b: string) => {
      const pa = parseLookupKey(a);
      const pb = parseLookupKey(b);
      if (!pa || !pb) return m;
      if (pa.collection === pb.collection && pa.itemKey === pb.itemKey) return `{{${b}}}`;
      if (pathExtends(pa, pb)) return `{{${b}}}`;
      return m;
    });
  } while (text !== prev);
  return text;
}

/** True when `next` is `prev` plus exactly one navigation hop (roadmap 196):
 *  the chain chip sits directly after its anchor chip and suppresses it. */
function pathExtends(prev: ParsedLookupKey, next: ParsedLookupKey): boolean {
  const np = next.path;
  if (!np || np.hops.length === 0) return false;
  if (prev.path) {
    return np.hops.length === prev.path.hops.length + 1
      && JSON.stringify(np.root) === JSON.stringify(prev.path.root)
      && JSON.stringify(np.hops.slice(0, -1)) === JSON.stringify(prev.path.hops);
  }
  return np.root.collection === prev.collection && np.root.itemKey === prev.itemKey && np.hops.length === 1;
}

function resolveToken(ctx: ReportCtx, fieldMap: Record<string, ReportFieldDef>, raw: string, item: any, aux?: FieldAux): string {
  const lookup = parseLookupKey(raw);
  if (lookup) {
    const hit = lookupTargetItem(ctx, lookup.collection, lookup.itemKey, lookup.path);
    // Excel-style error markers: a dangling reference and an attribute that
    // doesn't exist on the item are LOUD (an existing-but-empty value stays
    // blank — only "can't resolve" is an error).
    if (!hit) return '#REF!';
    const def = fieldMap[lookup.field];
    if (!def) return '#VALUE!';
    // A chained ref resolves against its OWN path context (roadmap 196): the
    // path's ancestor intersection, never the containing chain's aux.
    const scope = lookup.path ? chainSceneScope(ctx, lookup.path) : aux?.sceneScope;
    const target = scopeLookupTarget(ctx, fieldMap, lookup.collection, hit, scope);
    return fieldValueSafe(def, ctx, target, lookup.path ? { ...aux, sceneScope: scope } : aux);
  }
  const { field, opts } = parseToken(raw);
  const [base, sub] = field.split('.');
  const def = fieldMap[base];
  if (!def) return '';
  if (def.scope === 'production' && KEY_POSITION_KEYS.has(base)) {
    const people = ctx.project.crew?.[base] || [];
    if (sub === 'phone') return people[0]?.phone || '';
    if (sub === 'email') return people[0]?.email || '';
    return people.map(p => p.name).join(', ');
  }
  const value = fieldValueSafe(def, ctx, item, aux);
  // Item affixes only apply to multi-value attributes (the same rule as the
  // retired attribute block) — single values are formatted by typing around
  // the token, and link fields must stay unaffixed so their hrefs stay valid.
  if (def.multiValue && (opts.itemPrefix !== undefined || opts.itemSuffix !== undefined || opts.itemSeparator !== undefined)) {
    return applyItemAffixes(value, opts);
  }
  return value;
}

/** Resolve token VALUES inside a plain string (cellref mirrors recurse here). */
function resolveTextInner(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  text: string,
  item: any,
  aux: FieldAux | undefined,
  opts: TokenResolveOptions | undefined,
  seen: Set<string>,
): string {
  return suppressCellRefPairs(suppressLookupPairs(text)).replace(TOKEN_RE, (_m, raw: string) => {
    const cellRef = parseCellRefKey(raw);
    if (cellRef) {
      const info = opts?.cellRef;
      if (!info) return '#REF!';
      const r = resolveCellRefAtom(ctx, fieldMap, info, cellRef, item, aux, seen);
      if (r.kind === 'error') return r.error;
      if (r.kind === 'empty') return '';
      if (r.kind === 'pinned') return r.value;
      return resolveTextInner(
        ctx, fieldMap, unwrapSingleParagraph(r.target.html), item, aux,
        { ...opts, cellRef: { block: info.block, rowId: r.target.rowId, colId: r.target.colId } },
        r.nextSeen,
      );
    }
    const value = resolveToken(ctx, fieldMap, raw, item, aux);
    return opts?.showUnresolved && !value ? `{{${raw}}}` : value;
  });
}

export function resolveReportTokens(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  text: string,
  item: any,
  aux?: FieldAux,
  opts?: TokenResolveOptions,
): string {
  return resolveTextInner(ctx, fieldMap, text, item, aux, opts, new Set());
}

/** One token's HTML replacement — lookup/field behavior unchanged; cells refs
 *  mirror the target's resolved HTML or print the pinned value with the same
 *  link handling. */
function resolveTokenHtml(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  raw: string,
  item: any,
  aux: FieldAux | undefined,
  opts: TokenResolveOptions | undefined,
  seen: Set<string>,
): string {
  const cellRef = parseCellRefKey(raw);
  if (cellRef) {
    const info = opts?.cellRef;
    if (!info) return errorSpan('#REF!');
    const r = resolveCellRefAtom(ctx, fieldMap, info, cellRef, item, aux, seen);
    if (r.kind === 'error') return errorSpan(r.error);
    if (r.kind === 'empty') {
      if (opts?.showUnresolved) {
        const chip = cellRefChipMeta({ ...info, ctx, fieldMap, item, aux }, raw);
        return unresolvedPairTagCss(chip?.label || raw);
      }
      return '';
    }
    if (r.kind === 'mirror') {
      return resolveHtmlInner(
        ctx, fieldMap, unwrapSingleParagraph(r.target.html), item, aux,
        { ...opts, cellRef: { block: info.block, rowId: r.target.rowId, colId: r.target.colId } },
        r.nextSeen,
      );
    }
    if (opts?.showUnresolved && !r.value) {
      const chip = cellRefChipMeta({ ...info, ctx, fieldMap, item, aux }, raw);
      return unresolvedPairTagCss(chip?.label || raw);
    }
    if (r.value && r.def?.link) {
      const kind = r.def.linkKind || 'url';
      const href = kind === 'mailto' ? `mailto:${r.value}` : kind === 'tel' ? `tel:${r.value}` : r.value;
      if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
        const label = kind === 'url' && r.def.linkLabel ? r.def.linkLabel(ctx, item) : r.value;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label || href)}</a>`;
      }
    }
    return escapeHtml(r.value);
  }
  const lookup = parseLookupKey(raw);
  const { field } = parseToken(raw);
  const value = resolveToken(ctx, fieldMap, raw, item, aux);
  // Lookup tokens reference an existing field — reuse its group color + link
  // behavior so a looked-up phone/email still renders as a link.
  const baseKey = lookup ? lookup.field : field.split('.')[0];
  if (opts?.showUnresolved && !value) {
    // Designer canvas: an empty token reads as a chip instead of a blank spot.
    // References (lookup) render the error pair chip — item + attribute label
    // — matching the editor's chip pair; plain fields keep the group-color
    // chip with the field's label.
    if (lookup) {
      const attr = fieldMap[lookup.field];
      const isIdentity = lookup.field === lookupIdentityField(lookup.collection);
      const refLabel = lookupItemLabel(ctx, fieldMap, aux, lookup) || raw;
      return unresolvedPairTagCss(refLabel, isIdentity ? undefined : (attr?.label || lookup.field));
    }
    const color = fieldMap[baseKey] ? fieldChipColor(fieldMap[baseKey].group) : { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' };
    return `<span data-ui-tooltip="No value" style="${tokenTagCss(color)}">${escapeHtml(fieldMap[baseKey]?.label || raw)}</span>`;
  }
  if (value === '#REF!' || value === '#VALUE!') return errorSpan(value);
  // Link fields (map links, emails, phones) resolve to clickable anchors.
  // Scheme-guarded so token values can't inject javascript: URLs. Key
  // positions' .phone/.email sub-tokens link too.
  const subKey = lookup ? undefined : field.split('.')[1];
  const def = fieldMap[baseKey];
  let kind: 'url' | 'mailto' | 'tel' | null = null;
  if (subKey === 'phone') kind = 'tel';
  else if (subKey === 'email') kind = 'mailto';
  else if (def?.link) kind = def.linkKind || 'url';
  if (kind && value) {
    const href = kind === 'mailto' ? `mailto:${value}` : kind === 'tel' ? `tel:${value}` : value;
    if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
      const label = kind === 'url' && def?.linkLabel ? def.linkLabel(ctx, item) : value;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label || href)}</a>`;
    }
  }
  return escapeHtml(value);
}

/** Designer-only: a pinned cellref PAIR whose value is empty renders as ONE
 *  error-red chip ("✕ LEFT | VFX List") instead of a blank spot. Non-empty
 *  pairs collapse to the attribute token exactly like the normal suppressor. */
function unresolvedCellRefPairChips(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  html: string,
  item: any,
  aux: FieldAux | undefined,
  opts: TokenResolveOptions | undefined,
  seen: Set<string>,
): string {
  if (!opts?.showUnresolved || !opts.cellRef) return html;
  const info: CellRefEditorInfo = { ...opts.cellRef, ctx, fieldMap, item, aux };
  return html.replace(/\{\{(cellref\.[^{}]+)\}\}\{\{(cellref\.[^{}]+)\}\}/g, (m, a: string, b: string) => {
    const pa = parseCellRefKey(a);
    const pb = parseCellRefKey(b);
    if (!pa || !pb || pa.field || !pb.field) return m;
    const sameTarget =
      (pa.kind === 'abs' && pb.kind === 'abs' && pa.rowId === pb.rowId && pa.colId === pb.colId) ||
      (pa.kind === 'rel' && pb.kind === 'rel' && pa.dx === pb.dx && pa.dy === pb.dy);
    if (!sameTarget) return m;
    const r = resolveCellRefAtom(ctx, fieldMap, opts.cellRef!, pb, item, aux, seen);
    const empty = r.kind === 'empty' || (r.kind === 'pinned' && !r.value);
    if (!empty) return `{{${b}}}`;
    const refLabel = cellRefChipMeta(info, a)?.label || 'REF';
    const attrLabel = cellRefChipMeta(info, b)?.label;
    return unresolvedPairTagCss(refLabel, attrLabel);
  });
}

/** Rich-text token replacement (cellref mirrors recurse here). */
function resolveHtmlInner(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  html: string,
  item: any,
  aux: FieldAux | undefined,
  opts: TokenResolveOptions | undefined,
  seen: Set<string>,
): string {
  const cleaned = normalizeSpaces(html)
    // Old kit builds serialized via XMLSerializer — drop the xmlns noise it
    // left on every element so polluted stored text renders clean.
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
  const withPairs = unresolvedCellRefPairChips(ctx, fieldMap, cleaned, item, aux, opts, seen);
  return suppressCellRefPairs(suppressLookupPairs(withPairs)).replace(TOKEN_RE, (_m, raw: string) => (
    resolveTokenHtml(ctx, fieldMap, raw, item, aux, opts, seen)
  ));
}

/** Rich-text variant: token values are HTML-escaped so formatting can't be injected. */
export function resolveReportTokensHtml(
  ctx: ReportCtx,
  fieldMap: Record<string, ReportFieldDef>,
  html: string,
  item: any,
  aux?: FieldAux,
  opts?: TokenResolveOptions,
): string {
  const resolved = resolveHtmlInner(ctx, fieldMap, html, item, aux, opts, new Set());
  // Linked named-style runs resolve last: markers are tags, not tokens, so
  // token replacement never disturbs them.
  return resolveReportTextStyleSpans(resolved, ctx.project);
}

// ---- cellref editor vocabulary (the app RichTextEditor adapter) --------------

/** Everything the cell editor needs to label a cellref chip and offer the
 *  target item's attributes after a `.` (roadmap 190). */
export interface CellRefEditorInfo extends CellRefContext {
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  item?: any;
  aux?: FieldAux;
}

export interface CellRefChipMeta { label: string; error?: boolean; nested?: boolean; }
export interface CellRefAttributeItem { key: string; label: string; group?: string; }

/** Chip labels name the REFERENCED CELL, not its resolved value (Excel-style):
 *  `R1C2`, `R1C2.phone`, `ABOVE`, `ABOVE.phone`. Errors stay loud. */
const CELLREF_DIRECTIONS: Record<string, string> = {
  '-1.0': 'LEFT',
  '1.0': 'RIGHT',
  '0.-1': 'ABOVE',
  '0.1': 'BELOW',
};


/** The identity value of a reduced lookup ref ("Bob"), '' when dangling. */
function lookupRefItemLabel(info: CellRefEditorInfo, lookup: LookupRef): string {
  return lookupItemLabel(info.ctx, info.fieldMap, info.aux, lookup);
}

/** A cellref chip's display meta. The REFERENCE chip names the referenced
 *  cell (`R1C2`, `LEFT`, `ABOVE`); a pinned sub-chip shows ONLY the attribute
 *  label (`Phone`) nested — exactly like the 121 `@Bob` attribute bubble.
 *  `#REF!`/`#VALUE!` when broken. */
export function cellRefChipMeta(info: CellRefEditorInfo, raw: string): CellRefChipMeta | null {
  const key = parseCellRefKey(raw);
  if (!key) return null;
  const target = cellRefTarget(info, key);
  if (!target) return { label: '#REF!', error: true, nested: !!key.field };
  const r = resolveCellRefAtom(info.ctx, info.fieldMap, info, key, info.item, info.aux, new Set());
  if (r.kind === 'error') return { label: r.error, error: true, nested: !!key.field };
  if (key.field) {
    const def = info.fieldMap[key.field];
    return { label: def?.label || key.field, nested: true };
  }
  const base = key.kind === 'abs'
    ? `R${target.rowIndex + 1}C${target.colIndex + 1}`
    : CELLREF_DIRECTIONS[`${key.dx}.${key.dy}`] ?? `Δ${key.dx},${key.dy}`;
  return { label: base };
}

/** Stage-2 items for a cellref chip: the target item's attributes, keyed as
 *  the pinned form of the SAME ref (relative stays relative). Empty when the
 *  target isn't one item reference or the chip is already pinned. */
export function cellRefAttributeItems(
  info: CellRefEditorInfo,
  raw: string,
  query: string,
  allFields: ReportFieldDef[],
): CellRefAttributeItem[] {
  const key = parseCellRefKey(raw);
  if (!key || key.field) return [];
  const target = cellRefTarget(info, key);
  if (!target) return [];
  const lookup = reduceCellToLookup(
    info.ctx, info.fieldMap, target.html,
    { block: info.block, rowId: target.rowId, colId: target.colId },
    info.item, info.aux, new Set(),
  );
  if (!lookup) return [];
  // Attributes only: a cellref pin addresses ONE field of the target's item —
  // child navigation composes as lookup chips (a chain step isn't a pin).
  const offer = referenceOffer(allFields, info.ctx, lookup, query);
  const itemLabel = lookupRefItemLabel(info, lookup);
  return offer.attributes.map(f => ({
    key: key.kind === 'abs'
      ? composeCellRefKey(key.rowId, key.colId, f.key)
      : composeRelativeCellRefKey(key.dx, key.dy, f.key),
    label: f.label,
    group: itemLabel,
  }));
}
// ---- token chip colors -------------------------------------------------------
// One source of truth for attribute color coding (editor chips, autocomplete
// rows, designer key view). Stored as {text, bg} pairs — chips render with a
// tinted background + colored text.

export interface ChipColor { text: string; bg: string }

const FIELD_GROUP_COLORS: Record<string, ChipColor> = {
  'Scene Info': { text: '#1d4ed8', bg: 'rgba(37, 99, 235, 0.12)' },
  'Shooting': { text: '#6d28d9', bg: 'rgba(109, 40, 217, 0.12)' },
  'Breakdown': { text: '#047857', bg: 'rgba(5, 150, 105, 0.12)' },
  'Elements': { text: '#0e7490', bg: 'rgba(8, 145, 178, 0.12)' },
  'Cast & Talent': { text: '#be185d', bg: 'rgba(219, 39, 119, 0.12)' },
  'Categories': { text: '#b45309', bg: 'rgba(217, 119, 6, 0.12)' },
  'Document': { text: '#475569', bg: 'rgba(100, 116, 139, 0.12)' },
  'Days': { text: '#c2410c', bg: 'rgba(234, 88, 12, 0.12)' },
  'Day Types': { text: '#7c3aed', bg: 'rgba(147, 51, 234, 0.12)' },
  'Sun & Weather': { text: '#ca8a04', bg: 'rgba(202, 138, 4, 0.12)' },
  'Location': { text: '#0369a1', bg: 'rgba(14, 165, 233, 0.12)' },
  'Crew': { text: '#4338ca', bg: 'rgba(79, 70, 229, 0.12)' },
  'Production': { text: '#0f766e', bg: 'rgba(13, 148, 136, 0.12)' },
  'Key Positions': { text: '#334155', bg: 'rgba(71, 85, 105, 0.12)' },
  'Project': { text: '#57534e', bg: 'rgba(87, 83, 78, 0.12)' },
  'Smart': { text: '#a21caf', bg: 'rgba(168, 85, 247, 0.12)' },
  'Violations': { text: '#b91c1c', bg: 'rgba(220, 38, 38, 0.12)' },
};

const FALLBACK_CHIP_COLORS: ChipColor[] = [
  { text: '#1d4ed8', bg: 'rgba(37, 99, 235, 0.12)' },
  { text: '#047857', bg: 'rgba(5, 150, 105, 0.12)' },
  { text: '#be185d', bg: 'rgba(219, 39, 119, 0.12)' },
  { text: '#c2410c', bg: 'rgba(234, 88, 12, 0.12)' },
  { text: '#4338ca', bg: 'rgba(79, 70, 229, 0.12)' },
  { text: '#0e7490', bg: 'rgba(8, 145, 178, 0.12)' },
];

/** Deterministic chip color for an attribute group (custom groups hash onto
 *  the fallback palette). */
export function fieldChipColor(group: string | undefined): ChipColor {
  if (!group) return { text: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' };
  const known = FIELD_GROUP_COLORS[group];
  if (known) return known;
  let h = 0;
  for (const ch of group) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_CHIP_COLORS[h % FALLBACK_CHIP_COLORS.length];
}

/** Inline CSS for the editor token chip (white text on the group color).
 *  Canvas/preview tags use tokenTagCss (background-only) instead. */
export function tokenChipCss(color: ChipColor, margin = '0 2px'): string {
  return `background:${color.text};color:#fff;border-radius:2px;padding:4px;margin:${margin};font-weight:600;white-space:nowrap`;
}

/** Inline CSS for canvas token tags (designer only, `showUnresolved`): the
 *  same chip look as the editor chips — white semibold text on the color. */
export function tokenTagCss(color: ChipColor, margin = '0 2px'): string {
  return `background:${color.text};color:#fff;border-radius:10px;padding:0 6px;margin:${margin};font-weight:600;white-space:nowrap`;
}

/** Error-red reference tag (designer only): `✕ <ref>` with the attribute as a
 *  nested bubble — the editor chip pair's look — for a reference whose value
 *  is empty. Hovering explains it (`No items`). Preview/print never render
 *  tags and stay blank. */
function unresolvedPairTagCss(refLabel: string, attrLabel?: string, margin = '0 2px'): string {
  const inner = attrLabel
    ? `<span style="background:rgba(255,255,255,0.22);border-radius:10px;padding:0 5px;margin-left:4px">${escapeHtml(attrLabel)}</span>`
    : '';
  return `<span data-ui-tooltip="No items" style="background:#b91c1c;color:#fff;border-radius:10px;padding:0 6px;margin:${margin};font-weight:600;white-space:nowrap">✕ ${escapeHtml(refLabel)}${inner}</span>`;
}
