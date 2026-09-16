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
