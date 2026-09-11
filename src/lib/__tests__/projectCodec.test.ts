import { describe, it, expect } from 'vitest';
import { ungzip } from 'pako';
import { serializeProject, deserializeProject, isPlainProjectJson } from '../projectCodec';
import { createBlankScene } from '../sceneFactory';
import type { Project } from '../../types';

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    title: 'Test',
    draftNumber: '',
    scenes: [],
    versions: [],
    activeVersionId: '',
    calendarVersions: [],
    activeCalendarVersionId: '',
    trash: [],
    versionTrash: [],
    rulesTrash: [],
    colorRulesTrash: [],
    ribbonTrash: [],
    rules: [],
    castMembers: [],
    customCategories: [],
    hiddenCategories: [],
    categoryLabels: {},
    elementsTrash: [],
    categoryTrash: [],
    breakdownElements: {},
    sceneRibbon: [],
    ribbonDesigns: [],
    activeRibbonId: '',
    ...overrides,
  };
}

function inflate(serialized: string): any {
  const bin = Buffer.from(serialized, 'base64');
  return JSON.parse(ungzip(bin, { toText: true }));
}

describe('projectCodec', () => {
  it('round-trips a project, preserving non-empty fields', () => {
    const scene = createBlankScene({ sceneNumber: '1', set: 'KITCHEN', cast: 'abc,def', props: 'KNIFE' });
    const project = baseProject({ scenes: [scene] });
    const decoded = deserializeProject(serializeProject(project));
    const s = decoded.scenes[0];
    expect(s.id).toBe(scene.id);
    expect(s.sceneNumber).toBe('1');
    expect(s.set).toBe('KITCHEN');
    expect(s.cast).toBe('abc,def');
    expect(s.props).toBe('KNIFE');
  });

  it('drops empty element fields from the stored payload and rehydrates them on load', () => {
    const scene = createBlankScene({ sceneNumber: '1' });
    const stored = inflate(serializeProject(baseProject({ scenes: [scene] })));
    expect(stored.scenes[0]).not.toHaveProperty('weapons');
    expect(stored.scenes[0]).not.toHaveProperty('artDept');
    expect(stored.scenes[0]).not.toHaveProperty('cast');

    const decoded = deserializeProject(serializeProject(baseProject({ scenes: [scene] })));
    expect(decoded.scenes[0].weapons).toBe('');
    expect(decoded.scenes[0].artDept).toBe('');
    expect(decoded.scenes[0].cast).toBe('');
  });

  it('compacts custom category fields too and rehydrates them', () => {
    const scene = createBlankScene({ sceneNumber: '1' });
    (scene as any).gadgets = '';
    (scene as any).gizmos = 'WIDGET';
    const project = baseProject({
      scenes: [scene],
      customCategories: [
        { key: 'gadgets', label: 'Gadgets', icon: 'Tag', multiValue: true },
        { key: 'gizmos', label: 'Gizmos', icon: 'Tag', multiValue: true },
      ],
    });
    const stored = inflate(serializeProject(project));
    expect(stored.scenes[0]).not.toHaveProperty('gadgets');
    expect(stored.scenes[0]).toHaveProperty('gizmos', 'WIDGET');

    const decoded = deserializeProject(serializeProject(project));
    expect((decoded.scenes[0] as any).gadgets).toBe('');
    expect((decoded.scenes[0] as any).gizmos).toBe('WIDGET');
  });

  it('stores a non-JSON (compressed base64) payload', () => {
    const serialized = serializeProject(baseProject({ scenes: [createBlankScene({ set: 'X' })] }));
    expect(serialized.trimStart().startsWith('{')).toBe(false);
    expect(isPlainProjectJson(serialized)).toBe(false);
  });

  it('loads legacy plain-JSON entries', () => {
    const scene = createBlankScene({ sceneNumber: '7', set: 'LEGACY' });
    const legacy = baseProject({ scenes: [scene] });
    const decoded = deserializeProject(JSON.stringify(legacy));
    expect(isPlainProjectJson(JSON.stringify(legacy))).toBe(true);
    expect(decoded.scenes[0].sceneNumber).toBe('7');
    expect(decoded.scenes[0].set).toBe('LEGACY');
    expect(decoded.scenes[0].weapons).toBe('');
  });

  it('compresses a bulk project smaller than the plain JSON', () => {
    const scenes = Array.from({ length: 50 }, (_, i) =>
      createBlankScene({ sceneNumber: String(i + 1), description: `Scene number ${i + 1} description text` }),
    );
    const project = baseProject({ scenes });
    const plain = JSON.stringify(project);
    const serialized = serializeProject(project);
    expect(serialized.length).toBeLessThan(plain.length);
    expect(ungzip(Buffer.from(serialized, 'base64'), { toText: true })).toBeTypeOf('string');
  });
});
