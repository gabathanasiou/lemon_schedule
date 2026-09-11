import type {
  ScriptBlock,
  ScriptBlockType,
  ScriptDocument,
  ScriptFormat,
  ScriptInline,
  ScriptScene,
  ScriptTitlePage,
} from '../../types';
/**
 * Screenplay body retention (roadmap 123 Phase 0).
 *
 * One canonical shape for the retained script body: the import parsers
 * (`fdx.ts`, `fountain.ts`) emit it alongside the breakdown data in the SAME
 * pass, `commitImport` persists it via `SET_SCRIPT_DOCUMENT`, and item 38's
 * diff/Phase 1+ renderer read it. This module owns the constructors so the
 * block shape lives in exactly one place — never hand-build the tuples.
 */

export function createScriptDocument(format: ScriptFormat, titlePage?: ScriptTitlePage): ScriptDocument {
  const doc: ScriptDocument = { format, scenes: [] };
  if (titlePage && Object.keys(titlePage).length > 0) doc.titlePage = titlePage;
  return doc;
}

export function createScriptScene(sceneNumber: string, scriptPage?: string): ScriptScene {
  const scene: ScriptScene = { sceneNumber, blocks: [] };
  if (scriptPage) scene.scriptPage = scriptPage;
  return scene;
}

export function pushScriptBlock(scene: ScriptScene, type: ScriptBlockType, text: string, runs?: ScriptInline[]): void {
  scene.blocks.push(runs && runs.length > 0 ? [type, text, runs] : [type, text]);
}

/** Parse Fountain-style inline emphasis (`***bolditalic***`, `**bold**`,
 *  `*italic*`, `_underline_`) into styled runs. Returns undefined when the text
 *  carries no markup so plain blocks stay compact `[type, text]`. */
export function parseInlineMarkup(text: string): ScriptInline[] | undefined {
  if (!text || !/[*_]/.test(text)) return undefined;
  const re = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_)/g;
  const runs: ScriptInline[] = [];
  let last = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matched = true;
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true, italic: true });
    else if (m[3] !== undefined) runs.push({ text: m[3], bold: true });
    else if (m[4] !== undefined) runs.push({ text: m[4], italic: true });
    else if (m[5] !== undefined) runs.push({ text: m[5], underline: true });
    last = m.index + m[0].length;
  }
  if (!matched) return undefined;
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

/** Normalize a scene number for matching/body lookup (`1A` vs `1a`, leading zeros). */
export function normalizeSceneNumber(n: string): string {
  return n.trim().toUpperCase().replace(/^0+(?=\d)/, '').replace(/[^A-Z0-9]/g, '');
}

/** The retained block stream for a scene number, or [] when absent. */
export function scriptSceneBlocks(doc: ScriptDocument | undefined, sceneNumber: string): ScriptBlock[] {
  if (!doc) return [];
  const target = normalizeSceneNumber(sceneNumber);
  return doc.scenes.find(s => normalizeSceneNumber(s.sceneNumber) === target)?.blocks ?? [];
}

/** The retained ScriptScene for a scene number (renderer input). */
export function scriptSceneOf(doc: ScriptDocument | undefined, sceneNumber: string): ScriptScene | undefined {
  if (!doc) return undefined;
  const target = normalizeSceneNumber(sceneNumber);
  return doc.scenes.find(s => normalizeSceneNumber(s.sceneNumber) === target);
}

/** Display heading "INT. KITCHEN - DAY" from scene field parts (shared by the
 *  Script sidebar and the preview pane — one formatter, never two). */
export function formatSceneHeading(intExt: string, set: string, dayNight: string): string {
  const ie = (intExt || '').trim().replace(/\.$/, '');
  const s = (set || '').trim();
  const dn = (dayNight || '').trim();
  const base = [ie ? `${ie}.` : '', s].filter(Boolean).join(' ');
  return dn ? `${base} - ${dn}` : base;
}
