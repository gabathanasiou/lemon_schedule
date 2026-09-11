import { gzip, ungzip } from 'pako';
import { Project, Scene } from '../types';
import { createBlankScene } from './sceneFactory';
import { ELEMENT_CATEGORIES } from './categories';

/**
 * localStorage project codec (roadmap 124).
 *
 * The localStorage copy is `base64(gzip(json))` — the same shape the Drive
 * path uses above 100KB. Reads detect the format by the first non-space char:
 * legacy plain JSON starts with `{`/`[`, base64 never does. Legacy entries
 * keep loading and are rewritten compressed on the next save.
 *
 * Empty/undefined scene element fields are dropped on serialize and rebuilt
 * from `createBlankScene` defaults on load — a pure serialize/deserialize
 * boundary, so the in-memory Project and its memo/immutability contract are
 * untouched. Drive uploads and `.lemon` exports stay plain JSON.
 */

/** True for legacy/uncompressed JSON payloads (Drive uses the same test). */
export function isPlainProjectJson(raw: string): boolean {
  const t = raw.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Element category keys (built-in + custom) carried directly on scenes. */
function elementKeys(project: Project): string[] {
  return [
    ...ELEMENT_CATEGORIES.map(c => c.key),
    ...(project.customCategories || []).map(c => c.key),
  ];
}

/** Serialize a project for localStorage: compacted scene element fields + gzip/base64. */
export function serializeProject(project: Project): string {
  const keys = elementKeys(project);
  const scenes = project.scenes.map(scene => {
    let out = scene;
    for (const key of keys) {
      const value = (scene as any)[key];
      if (value === '' || value == null) {
        if (out === scene) out = { ...scene };
        delete (out as any)[key];
      }
    }
    return out;
  });
  return bytesToBase64(gzip(JSON.stringify({ ...project, scenes })));
}

/** Decode a persisted project (compressed or legacy plain JSON) + rehydrate defaults. */
export function deserializeProject(raw: string): Project {
  const json = isPlainProjectJson(raw) ? raw : ungzip(base64ToBytes(raw.trim()), { toText: true });
  return rehydrateProject(JSON.parse(json));
}

function rehydrateProject(project: Project): Project {
  const defaults = { ...createBlankScene() };
  const customKeys = (project.customCategories || []).map(c => c.key);
  const scenes = (project.scenes || []).map(scene => {
    const rehydrated: any = { ...defaults, ...scene };
    for (const key of customKeys) {
      if (rehydrated[key] == null) rehydrated[key] = '';
    }
    return rehydrated as Scene;
  });
  return { ...project, scenes };
}
