import type {
  ScriptBlock,
  ScriptBlockType,
  ScriptDocument,
  ScriptFormat,
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

export function pushScriptBlock(scene: ScriptScene, type: ScriptBlockType, text: string): void {
  scene.blocks.push([type, text] as ScriptBlock);
}
