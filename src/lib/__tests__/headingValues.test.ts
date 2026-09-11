import { describe, it, expect } from 'vitest';
import { collectUnknownHeadingValues, applyHeadingMapping, buildHeadingMappingUpdate, knownDayNightPhrases } from '../import/headingValues';
import type { ImportResult, ParsedScene } from '../import/shared';
import type { Project } from '../../types';

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p', title: '', draftNumber: '', scenes: [], versions: [], activeVersionId: '',
    calendarVersions: [], activeCalendarVersionId: '', trash: [], versionTrash: [],
    rulesTrash: [], colorRulesTrash: [], ribbonTrash: [], rules: [], castMembers: [],
    customCategories: [], hiddenCategories: [], categoryLabels: {}, elementsTrash: [],
    categoryTrash: [], breakdownElements: {}, sceneRibbon: [], ribbonDesigns: [], activeRibbonId: '',
    colorPalette: {
      intExtOptions: ['INT', 'EXT'], dayNightOptions: ['DAY', 'NIGHT'],
      sceneColors: [], selectedStripBg: '#fff', selectedStripText: '#000',
      dayHeaderBg: '#000', dayHeaderText: '#fff', dayFooterBg: '#fff', dayFooterText: '#000',
      noteBg: '#fff', noteText: '#000',
    },
    ...over,
  } as Project;
}

const parsed = (over: Partial<ParsedScene>): ParsedScene => ({
  sceneNumber: '1', intExt: 'INT', set: 'ROOM', dayNight: 'DAY', description: '',
  characters: [], taggedElements: {}, ...over,
});

const result = (scenes: ParsedScene[]): ImportResult => ({ scenes, characters: [], unknownCategories: [] });

describe('heading value mapping (roadmap 127)', () => {
  it('collects values the project does not know (and ignores aliased ones)', () => {
    const r = result([parsed({ intExt: 'ΕΣΩΤ', dayNight: 'DREAM' }), parsed({ sceneNumber: '2', dayNight: 'NIGHT' })]);
    const unknown = collectUnknownHeadingValues(r, project());
    expect(unknown.intExt).toContain('ΕΣΩΤ');
    expect(unknown.dayNight).toContain('DREAM');
    expect(unknown.dayNight).not.toContain('NIGHT');

    const aliased = project({ headingAliases: { dayNight: { DREAM: 'NIGHT' } } });
    expect(collectUnknownHeadingValues(r, aliased).dayNight).not.toContain('DREAM');
  });

  it('maps values to existing options and records aliases', () => {
    const r = result([parsed({ dayNight: 'DREAM' })]);
    const applied = applyHeadingMapping(r, project(), { intExt: {}, dayNight: { DREAM: { action: 'map', mapTo: 'NIGHT' } } });
    expect(applied.result.scenes[0].dayNight).toBe('NIGHT');
    expect(applied.aliases.dayNight).toEqual({ DREAM: 'NIGHT' });
    expect(applied.addedDayNight).toEqual([]);
  });

  it('keeps new values and reports them for the Colors options', () => {
    const r = result([parsed({ dayNight: 'DREAM' })]);
    const applied = applyHeadingMapping(r, project(), { intExt: {}, dayNight: { DREAM: { action: 'add' } } });
    expect(applied.result.scenes[0].dayNight).toBe('DREAM');
    expect(applied.addedDayNight).toEqual(['DREAM']);

    const update = buildHeadingMappingUpdate(project(), applied);
    expect(update.colorPalette?.dayNightOptions).toContain('DREAM');
  });

  it('known day/night phrases include palette options and alias keys', () => {
    const p = project({
      colorPalette: {
        intExtOptions: ['INT'], dayNightOptions: ['DAY', 'MAGIC HOUR'],
        sceneColors: [], selectedStripBg: '#fff', selectedStripText: '#000',
        dayHeaderBg: '#000', dayHeaderText: '#fff', dayFooterBg: '#fff', dayFooterText: '#000',
        noteBg: '#fff', noteText: '#000',
      },
      headingAliases: { dayNight: { DREAM: 'NIGHT' } },
    });
    const known = knownDayNightPhrases(p);
    expect(known.has('MAGIC HOUR')).toBe(true);
    expect(known.has('DREAM')).toBe(true);
    expect(known.has('DAY')).toBe(true);
  });
});
