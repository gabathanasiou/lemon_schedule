import React from 'react';
import { Users, Building2, Package, UserPlus, Sparkles, Car, Shirt, Scissors, Volume1, Video, Volume2, Music, PawPrint, Sword, Leaf, PaintBucket, Tag, CircleDot } from 'lucide-react';
import type { CustomCategoryDef } from '../types';

export const ELEMENT_CATEGORIES: { key: string; label: string; multiValue: boolean }[] = [
  { key: 'cast', label: 'Cast', multiValue: true },
  { key: 'set', label: 'Sets', multiValue: false },
  { key: 'props', label: 'Props', multiValue: true },
  { key: 'backgroundActors', label: 'Background Actors', multiValue: true },
  { key: 'stunts', label: 'Stunts', multiValue: true },
  { key: 'vehicles', label: 'Vehicles', multiValue: true },
  { key: 'wardrobe', label: 'Wardrobe', multiValue: true },
  { key: 'makeup', label: 'Makeup & Hair', multiValue: true },
  { key: 'sfx', label: 'SFX', multiValue: true },
  { key: 'vfx', label: 'VFX', multiValue: true },
  { key: 'sound', label: 'Sound', multiValue: true },
  { key: 'music', label: 'Music / Playback', multiValue: true },
  { key: 'animalsAndWranglers', label: 'Animals & Wranglers', multiValue: true },
  { key: 'weapons', label: 'Weapons / Armoury', multiValue: true },
  { key: 'greenery', label: 'Greenery', multiValue: true },
  { key: 'artDept', label: 'Art Department', multiValue: true },
];

export function isMultiValue(category: string, customCategories?: CustomCategoryDef[]): boolean {
  const builtin = ELEMENT_CATEGORIES.find(c => c.key === category);
  if (builtin) return builtin.multiValue;
  if (customCategories) {
    const custom = customCategories.find(c => c.key === category);
    if (custom) return custom.multiValue ?? true;
  }
  return true;
}

export function getFieldItems(field: string, value: string): string[] {
  if (!value || !value.trim()) return [];
  if (!isMultiValue(field)) return [value.trim()];
  return value.split(',').map(x => x.trim()).filter(Boolean);
}

export const CAT_ICONS: Record<string, React.ElementType> = {
  cast: Users, set: Building2, props: Package, backgroundActors: UserPlus, stunts: Sparkles,
  vehicles: Car, wardrobe: Shirt, makeup: Scissors, sfx: Volume1, vfx: Video,
  sound: Volume2, music: Music, animalsAndWranglers: PawPrint, weapons: Sword, greenery: Leaf, artDept: PaintBucket,
};

export const CUSTOM_ICON_OPTIONS: { name: string; Icon: React.ElementType }[] = [
  { name: 'Tag', Icon: Tag },
  { name: 'Package', Icon: Package },
  { name: 'Car', Icon: Car },
  { name: 'Shirt', Icon: Shirt },
  { name: 'Sword', Icon: Sword },
  { name: 'Sparkles', Icon: Sparkles },
  { name: 'Volume1', Icon: Volume1 },
  { name: 'Music', Icon: Music },
  { name: 'PawPrint', Icon: PawPrint },
  { name: 'Leaf', Icon: Leaf },
  { name: 'PaintBucket', Icon: PaintBucket },
  { name: 'UserPlus', Icon: UserPlus },
  { name: 'Video', Icon: Video },
  { name: 'Scissors', Icon: Scissors },
  { name: 'Users', Icon: Users },
  { name: 'Building2', Icon: Building2 },
  { name: 'Volume2', Icon: Volume2 },
  { name: 'CircleDot', Icon: CircleDot },
];

export function getCustomIcon(name: string): React.ElementType {
  const opt = CUSTOM_ICON_OPTIONS.find(o => o.name === name);
  return opt ? opt.Icon : Tag;
}

export const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  cast: 'Cast',
  set: 'Sets',
  props: 'Props',
  backgroundActors: 'Background Actors',
  stunts: 'Stunts',
  vehicles: 'Vehicles',
  wardrobe: 'Wardrobe',
  makeup: 'Makeup & Hair',
  sfx: 'SFX',
  vfx: 'VFX',
  sound: 'Sound',
  music: 'Music / Playback',
  animalsAndWranglers: 'Animals & Wranglers',
  weapons: 'Weapons / Armoury',
  greenery: 'Greenery',
  artDept: 'Art Department',
  location: 'Location',
};

export function getLabel(key: string, fallback: string, categoryLabels?: Record<string, string>): string {
  return categoryLabels?.[key] || DEFAULT_CATEGORY_LABELS[key] || fallback;
}
