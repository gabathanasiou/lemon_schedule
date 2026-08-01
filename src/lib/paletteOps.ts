import { SceneColorEntry, SceneColorPalette } from '../types';

export function findEntry(entries: SceneColorEntry[], intExt: string, dayNight: string): number {
  const ie = intExt.toUpperCase();
  const dn = dayNight.toUpperCase();
  return entries.findIndex(e => e.intExt.toUpperCase() === ie && e.dayNight.toUpperCase() === dn);
}

export function clonePalette(p: SceneColorPalette): SceneColorPalette {
  return {
    ...p,
    intExtOptions: [...p.intExtOptions],
    dayNightOptions: [...p.dayNightOptions],
    sceneColors: p.sceneColors.map(c => ({ ...c })),
  };
}

export function updateSceneColor(p: SceneColorPalette, intExt: string, dayNight: string, bg: string, text: string): SceneColorPalette {
  const next = clonePalette(p);
  const idx = findEntry(next.sceneColors, intExt, dayNight);
  if (idx >= 0) {
    next.sceneColors[idx] = { ...next.sceneColors[idx], background: bg, text };
  } else {
    next.sceneColors.push({ intExt, dayNight, background: bg, text });
  }
  return next;
}
