import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSex, exportSex } from '../import/sex';

const FIXTURE = fileURLToPath(new URL('../../../e2e/fixtures/lair-v10.sex', import.meta.url));
const GOLDEN = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('../../../e2e/fixtures/lair-v10.expected.json', import.meta.url)), 'utf8'),
);

function readArrayBuffer(p: string): ArrayBuffer {
  const buf = fs.readFileSync(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function castNames(project: any, scene: any): (string | undefined)[] {
  const byId = new Map<string, string>(project.castMembers.map((c: any) => [String(c.id), String(c.name)]));
  return String(scene.cast || '')
    .split(',')
    .map((x: string) => x.trim())
    .filter(Boolean)
    .map((id: string) => byId.get(id));
}

describe('parseSex — Lair V10 golden', () => {
  const project: any = parseSex(readArrayBuffer(FIXTURE));

  it('imports every scene', () => {
    expect(project.scenes).toHaveLength(GOLDEN.scenes.length);
  });

  it('cast is sequential integer ids in first-appearance order', () => {
    expect(project.castMembers.map((c: any) => c.name)).toEqual(GOLDEN.cast);
    expect(project.castMembers.every((c: any) => /^\d+$/.test(c.id))).toBe(true);
  });

  it('invents no sections: one pinned daybreak, scenes in the boneyard', () => {
    const active = project.versions.find((v: any) => v.id === project.activeVersionId);
    const daybreaks = active.rows.filter((r: any) => r.type === 'DAYBREAK');
    expect(daybreaks).toHaveLength(1);
    expect(daybreaks[0].pinned).toBe(true);
    const boneyard = active.rows.filter((r: any) => r.type === 'SCENE');
    expect(boneyard).toHaveLength(GOLDEN.scenes.length);
    expect(boneyard.every((r: any) => r.containerId === null)).toBe(true);
  });

  it('resolves scene fields and cast-by-id against the golden', () => {
    const g0 = GOLDEN.scenes[0];
    const s0 = project.scenes[0];
    expect(s0.sceneNumber).toBe(g0.n);
    expect(s0.scriptPageNumbers).toBe(g0.spn);
    expect(s0.intExt).toBe(g0.ie);
    expect(s0.set).toBe(g0.set);
    expect(s0.dayNight).toBe(g0.dn);
    expect(s0.pageCountDecimal).toBe(g0.pg / 8);
    expect(castNames(project, s0)).toEqual(g0.cast);

    const scene5 = project.scenes.find((s: any) => s.sceneNumber === '5');
    expect(castNames(project, scene5)).toEqual(GOLDEN.scenes.find((g: any) => g.n === '5').cast);

    const omitted = project.scenes.filter((s: any) => s.sceneNumber === '8' || s.sceneNumber === '9');
    expect(omitted).toHaveLength(2);
  });
});

describe('exportSex round trip', () => {
  it('re-parses to the same breakdown', () => {
    const project: any = parseSex(readArrayBuffer(FIXTURE));
    const out = exportSex(project);
    const again: any = parseSex(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
    expect(again.scenes).toHaveLength(GOLDEN.scenes.length);
    expect(again.scenes.map((s: any) => s.sceneNumber)).toEqual(GOLDEN.scenes.map((g: any) => g.n));
    expect(again.scenes.map((s: any) => s.intExt)).toEqual(GOLDEN.scenes.map((g: any) => g.ie));
    expect(again.castMembers.map((c: any) => c.name)).toEqual(GOLDEN.cast);
    expect(again.scenes[0].pageCountDecimal).toBe(GOLDEN.scenes[0].pg / 8);
  });
});

// Roadmap 276 (audit F3): record lengths must count UTF-8 BYTES, not UTF-16
// units, and import must decode UTF-8 with a latin1 fallback for legacy files.
describe('exportSex unicode round trip (roadmap 276)', () => {
  const toBuf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

  function unicodeProject(): any {
    return {
      scenes: [{
        id: 's1', sceneNumber: '1', scriptPageNumbers: '1', pageCountDecimal: 1,
        intExt: 'INT', set: 'CAFÉ', dayNight: 'DAY',
        description: '', cast: '1', location: '',
        backgroundActors: '', stunts: '', vehicles: '',
        props: '😀 Sign, Clé anglaise',
        sfx: '', wardrobe: '', makeup: '', animalsAndWranglers: '', music: '',
        sound: '', setDressing: '', greenery: '', weapons: '', vfx: '', artDept: '',
        notes: 'Dit « bonjour »',
      }],
      castMembers: [{ id: '1', name: 'JOSÉ' }],
      customCategories: [],
    };
  }

  it('preserves accented and non-BMP text through export → parse', () => {
    const bytes = exportSex(unicodeProject());
    const again: any = parseSex(toBuf(bytes));

    const scene = again.scenes[0];
    expect(scene.set).toBe('CAFÉ');
    expect(scene.props).toBe('😀 Sign, Clé anglaise');
    expect(scene.notes).toBe('Dit « bonjour »');
    expect(again.castMembers.map((c: any) => c.name)).toEqual(['JOSÉ']);
  });

  it('re-exports byte-identically after a parse (framing stays aligned)', () => {
    const bytes = exportSex(unicodeProject());
    const again: any = parseSex(toBuf(bytes));
    expect(exportSex(again)).toEqual(bytes);
  });

  it('decodes legacy latin1 element text that is not valid UTF-8', () => {
    const project = unicodeProject();
    project.castMembers = [{ id: '1', name: 'PIAF' }];
    const bytes = exportSex(project);

    // Rewrite the 'A' of PIAF as the single latin1 byte 0xC4 (Ä) — invalid as
    // UTF-8 start byte (next byte 0x46 is not a continuation), so the parser
    // must fall back to latin1 for this string.
    const latin = new Uint8Array(bytes);
    const at = findSequence(latin, 'PIAF');
    latin[at + 2] = 0xc4;

    const again: any = parseSex(toBuf(latin));
    expect(again.castMembers.map((c: any) => c.name)).toEqual(['PIÄF']);
  });
});

function findSequence(hay: Uint8Array, seq: string): number {
  const code = Array.from(seq, c => c.charCodeAt(0));
  outer: for (let i = 0; i <= hay.length - code.length; i++) {
    for (let j = 0; j < code.length; j++) {
      if (hay[i + j] !== code[j]) continue outer;
    }
    return i;
  }
  throw new Error(`byte sequence "${seq}" not found`);
}
