import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  ACTION_SCHEMA_JSON_PATH,
  buildSchema,
  parseActionUnion,
  parseActionTypesMirror,
  parseSource,
} from '../../../tools/mcp/actionSchema.mjs';

const schema = buildSchema();

describe('action schema (derived from source)', () => {
  it('lists every action and stays in sync with ACTION_TYPES', () => {
    expect(schema.actions.length).toBeGreaterThan(80);
    expect(schema.consistency.mirrorCount).toBe(schema.consistency.unionCount);
    expect(schema.consistency.missingInMirror).toEqual([]);
    expect(schema.consistency.extraInMirror).toEqual([]);
  });

  it('captures payload types (and bare actions)', () => {
    const add = schema.actions.find((a: { type: string }) => a.type === 'ADD_SCENE');
    expect(add?.payload).toContain('Scene');
    expect(schema.actions.find((a: { type: string }) => a.type === 'UNDO')?.payload).toBeNull();
  });

  it('parses core entity interfaces', () => {
    const scene = schema.entities.Scene.fields.map((f: { name: string }) => f.name);
    expect(scene).toContain('sceneNumber');
    expect(scene).toContain('cast');
    const cast = schema.entities.CastMember.fields.map((f: { name: string }) => f.name).sort();
    expect(cast).toEqual(['id', 'name']);
  });

  it('parser helpers read the union + mirror directly', () => {
    const sf = parseSource("export type Action = { type: 'A'; payload: string } | { type: 'B' };\nexport const ACTION_TYPES = new Set<string>(['A']);");
    expect(parseActionUnion(sf)).toEqual([
      { type: 'A', payloadType: 'string' },
      { type: 'B', payloadType: null },
    ]);
    expect(parseActionTypesMirror(sf)).toEqual(['A']);
  });

  it('keeps the committed snapshot (shipped by the npm package) in sync', () => {
    const committed = JSON.parse(fs.readFileSync(ACTION_SCHEMA_JSON_PATH, 'utf8'));
    const fresh = buildSchema({ force: true });
    expect(committed).toEqual(fresh);
  });
});
