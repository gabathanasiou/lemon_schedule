import React from 'react';
import { Scene, SceneColorEntry, SceneColorPalette, ColorRule } from '../types';
import { isMultiValue } from './categories';

export const INT_EXT_OPTIONS: string[] = ['INT', 'EXT', 'INT/EXT'];
export const DAY_NIGHT_OPTIONS: string[] = ['DAY', 'NIGHT', 'MORNING', 'EVENING'];

export function getIntExtOptions(palette?: SceneColorPalette): string[] {
  return palette?.intExtOptions || INT_EXT_OPTIONS;
}

export function getDayNightOptions(palette?: SceneColorPalette): string[] {
  return palette?.dayNightOptions || DAY_NIGHT_OPTIONS;
}

const SCENE_COLOR_FALLBACKS: Record<string, { background: string; color: string }> = {
  'INT|DAY':    { background: '#ffffff', color: '#000000' },
  'EXT|DAY':    { background: '#d7da50', color: '#000000' },
  'INT/EXT|DAY':   { background: '#00af2f', color: '#000000' },
  'INT|NIGHT':  { background: '#41a31a', color: '#ffffff' },
  'EXT|NIGHT':  { background: '#005c93', color: '#ffffff' },
  'INT/EXT|NIGHT': { background: '#00af2f', color: '#000000' },
  'INT|MORNING':  { background: '#ff9ca2', color: '#000000' },
  'EXT|MORNING':  { background: '#ff9ca2', color: '#000000' },
  'INT/EXT|MORNING': { background: '#00af2f', color: '#000000' },
  'INT|EVENING':  { background: '#ff9d25', color: '#000000' },
  'EXT|EVENING':  { background: '#ff9d25', color: '#000000' },
  'INT/EXT|EVENING': { background: '#00af2f', color: '#000000' },
};

const DEFAULT_FALLBACK = { background: '#ffffff', color: '#000000' };

export function sceneMatchesRule(scene: Scene, rule: ColorRule): boolean {
  for (const condition of rule.conditions) {
    const cat = condition.category;
    const search = condition.elementId.trim().toLowerCase();
    if (!search) return false;

    if (cat === 'cast') {
      const items = (scene.cast || '').split(',').map(x => x.trim().toLowerCase());
      if (!items.includes(search)) return false;
    } else if (!isMultiValue(cat)) {
      const val = (String((scene as any)[cat] ?? '')).trim().toLowerCase();
      if (val !== search) return false;
    } else {
      const val = String((scene as any)[cat] ?? '');
      const items = val.split(',').map(x => x.trim().toLowerCase());
      if (!items.includes(search)) return false;
    }
  }
  return true;
}

export function resolveSceneColor(
  intExt: string,
  dayNight: string,
  colorEntries?: SceneColorEntry[],
  fallbackOverride?: { background: string; color: string },
  scene?: Scene,
  colorRules?: ColorRule[],
): { background: string; color: string } {
  if (scene && colorRules && colorRules.length > 0) {
    for (const rule of colorRules) {
      if (!rule.enabled) continue;
      if (!sceneMatchesRule(scene, rule)) continue;
      if (rule.override.type === 'single') {
        return { background: rule.override.background, color: rule.override.text };
      }
      const ie = (intExt || '').toUpperCase();
      const dn = (dayNight || '').toUpperCase();
      const match = rule.override.sceneColors.find(e => e.intExt.toUpperCase() === ie && e.dayNight.toUpperCase() === dn);
      if (match) {
        return { background: match.background, color: match.text };
      }
    }
  }

  const ie = intExt.toUpperCase();
  const dn = dayNight.toUpperCase();
  if (colorEntries) {
    const match = colorEntries.find(e => e.intExt.toUpperCase() === ie && e.dayNight.toUpperCase() === dn);
    if (match) return { background: match.background, color: match.text };
  }
  if (fallbackOverride) return fallbackOverride;
  return SCENE_COLOR_FALLBACKS[`${ie}|${dn}`] || DEFAULT_FALLBACK;
}

export function sceneStyle(
  scene?: Scene | null,
  colorEntries?: SceneColorEntry[],
  fallbackOverride?: { background: string; color: string },
  colorRules?: ColorRule[],
): React.CSSProperties {
  if (!scene) return fallbackOverride || DEFAULT_FALLBACK;
  return resolveSceneColor(scene.intExt || '', scene.dayNight || '', colorEntries, fallbackOverride, scene, colorRules);
}

export function getDefaultSceneColors(intExtOptions?: string[], dayNightOptions?: string[]): SceneColorEntry[] {
  const ieOpts = intExtOptions || INT_EXT_OPTIONS;
  const dnOpts = dayNightOptions || DAY_NIGHT_OPTIONS;
  const entries: SceneColorEntry[] = [];
  for (const ie of ieOpts) {
    for (const dn of dnOpts) {
      const key = `${ie}|${dn}`;
      const fb = SCENE_COLOR_FALLBACKS[key] || DEFAULT_FALLBACK;
      entries.push({ intExt: ie, dayNight: dn, background: fb.background, text: fb.color });
    }
  }
  return entries;
}

export const DEFAULT_COLOR_PALETTE: SceneColorPalette = {
  intExtOptions: [...INT_EXT_OPTIONS],
  dayNightOptions: [...DAY_NIGHT_OPTIONS],
  sceneColors: getDefaultSceneColors(),
  selectedStripBg: '#b20000',
  selectedStripText: '#ffffff',
  dayHeaderBg: '#000000',
  dayHeaderText: '#ffffff',
  dayFooterBg: '#ffffff',
  dayFooterText: '#000000',
  noteBg: '#3f0000',
  noteText: '#ffffff',
  fallbackStripBg: '#a77b00',
  fallbackStripText: '#ffffff',
};

export function getFallbackStripColors(palette?: SceneColorPalette): { background: string; color: string } {
  return palette?.fallbackStripBg
    ? { background: palette.fallbackStripBg, color: palette.fallbackStripText || '#ffffff' }
    : { background: '#a77b00', color: '#ffffff' };
}

export function getSelectedStripColors(palette?: SceneColorPalette): { background: string; color: string } {
  return palette ? { background: palette.selectedStripBg, color: palette.selectedStripText } : { background: '#b20000', color: '#ffffff' };
}

export function getDayHeaderColors(palette?: SceneColorPalette): { background: string; color: string } {
  return palette ? { background: palette.dayHeaderBg, color: palette.dayHeaderText } : { background: '#000000', color: '#ffffff' };
}

export function getDayFooterColors(palette?: SceneColorPalette): { background: string; color: string } {
  if (!palette || !palette.dayFooterBg) return { background: '#ffffff', color: '#000000' };
  return { background: palette.dayFooterBg, color: palette.dayFooterText || '#000000' };
}

export function getNoteBannerColors(palette?: SceneColorPalette): { background: string; color: string } {
  return palette ? { background: palette.noteBg, color: palette.noteText } : { background: '#3f0000', color: '#ffffff' };
}
