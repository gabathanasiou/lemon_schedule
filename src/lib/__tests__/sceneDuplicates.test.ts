import { describe, it, expect } from 'vitest';
import { buildSceneDuplicate } from '../sceneDuplicates';

function project(overrides: any = {}): any {
  return {
    scenes: [
      { id: 's1', sceneNumber: '6', set: 'KITCHEN' },
      { id: 's2', sceneNumber: '6A', set: 'KITCHEN' },
    ],
    scriptDocument: { scenes: [{ sceneNumber: '6', blocks: [['AMY'], ['Hello']] }] },
    ...overrides,
  };
}

const parent = () => ({ id: 's1', sceneNumber: '6', set: 'KITCHEN' } as any);

describe('buildSceneDuplicate', () => {
  it('coverage keeps the number and flags the copy', () => {
    const { scene, scriptScene } = buildSceneDuplicate(project(), parent(), 'coverage');
    expect(scene.id).not.toBe('s1');
    expect(scene.sceneNumber).toBe('6');
    expect(scene.duplicateOf).toBe('s1');
    expect(scene.duplicateKind).toBe('coverage');
    expect(scriptScene).toBeUndefined();
  });

  it('plain renumbers with the next free letter and no duplicate flags', () => {
    const { scene } = buildSceneDuplicate(project(), parent(), 'plain');
    expect(scene.sceneNumber).toBe('6B');
    expect(scene.duplicateOf).toBeUndefined();
    expect(scene.duplicateKind).toBeUndefined();
  });

  it('split renumbers AND copies the parent body under the new number', () => {
    const { scene, scriptScene } = buildSceneDuplicate(project(), parent(), 'split');
    expect(scene.sceneNumber).toBe('6B');
    expect(scene.duplicateKind).toBe('split');
    expect(scriptScene?.sceneNumber).toBe('6B');
    expect(scriptScene?.blocks).toEqual([['AMY'], ['Hello']]);
    // block arrays are copied, not shared with the source
    expect(scriptScene!.blocks[0]).not.toBe(project().scriptDocument.scenes[0].blocks[0]);
  });

  it('split of a scene with no retained body still renumbers', () => {
    const { scene, scriptScene } = buildSceneDuplicate(project({ scriptDocument: undefined }), parent(), 'split');
    expect(scene.sceneNumber).toBe('6B');
    expect(scriptScene).toBeUndefined();
  });
});
