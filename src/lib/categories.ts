import React from 'react';
import { Users, Building2, Package, UserPlus, Flame, Car, Shirt, Scissors, Volume2, Music, PawPrint, Leaf, PaintBucket, Tag, Camera, Dog, Zap, Sofa, Wrench, Shield, Briefcase, Sparkles, Cog, MoreHorizontal, CircleDot } from 'lucide-react';

export const ELEMENT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'cast', label: 'Cast Members' },
  { key: 'set', label: 'Set' },
  { key: 'backgroundActors', label: 'Background Actors' },
  { key: 'stunts', label: 'Stunts' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'props', label: 'Props' },
  { key: 'camera', label: 'Camera' },
  { key: 'specialEffects', label: 'Special Effects' },
  { key: 'wardrobe', label: 'Wardrobe' },
  { key: 'makeup', label: 'Makeup/Hair' },
  { key: 'animals', label: 'Animals' },
  { key: 'animalWrangler', label: 'Animal Wrangler' },
  { key: 'music', label: 'Music' },
  { key: 'sound', label: 'Sound' },
  { key: 'artDept', label: 'Art Department' },
  { key: 'setDressing', label: 'Set Dressing' },
  { key: 'greenery', label: 'Greenery' },
  { key: 'specialEquipment', label: 'Special Equipment' },
  { key: 'security', label: 'Security' },
  { key: 'additionalLabor', label: 'Additional Labor' },
  { key: 'visualEffects', label: 'Visual Effects' },
  { key: 'mechanicalEffects', label: 'Mechanical Effects' },
  { key: 'miscellaneous', label: 'Miscellaneous' },
];

export const CAT_ICONS: Record<string, React.ElementType> = {
  cast: Users, set: Building2, backgroundActors: UserPlus, stunts: Flame,
  vehicles: Car, props: Package, camera: Camera, specialEffects: Zap,
  wardrobe: Shirt, makeup: Scissors, animals: PawPrint, animalWrangler: Dog,
  music: Music, sound: Volume2, artDept: PaintBucket, setDressing: Sofa,
  greenery: Leaf, specialEquipment: Wrench, security: Shield,
  additionalLabor: Briefcase, visualEffects: Sparkles, mechanicalEffects: Cog,
  miscellaneous: MoreHorizontal,
};

export const CUSTOM_ICON_OPTIONS: { name: string; Icon: React.ElementType }[] = [
  { name: 'Tag', Icon: Tag },
  { name: 'Package', Icon: Package },
  { name: 'Car', Icon: Car },
  { name: 'Shirt', Icon: Shirt },
  { name: 'Flame', Icon: Flame },
  { name: 'Sparkles', Icon: Sparkles },
  { name: 'Zap', Icon: Zap },
  { name: 'Music', Icon: Music },
  { name: 'PawPrint', Icon: PawPrint },
  { name: 'Dog', Icon: Dog },
  { name: 'Leaf', Icon: Leaf },
  { name: 'PaintBucket', Icon: PaintBucket },
  { name: 'UserPlus', Icon: UserPlus },
  { name: 'Camera', Icon: Camera },
  { name: 'Scissors', Icon: Scissors },
  { name: 'Users', Icon: Users },
  { name: 'Building2', Icon: Building2 },
  { name: 'Volume2', Icon: Volume2 },
  { name: 'Sofa', Icon: Sofa },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Shield', Icon: Shield },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Cog', Icon: Cog },
  { name: 'MoreHorizontal', Icon: MoreHorizontal },
  { name: 'CircleDot', Icon: CircleDot },
];

export function getCustomIcon(name: string): React.ElementType {
  const opt = CUSTOM_ICON_OPTIONS.find(o => o.name === name);
  return opt ? opt.Icon : Tag;
}

export const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  cast: 'Cast Members',
  set: 'Set',
  backgroundActors: 'Background Actors',
  stunts: 'Stunts',
  vehicles: 'Vehicles',
  props: 'Props',
  camera: 'Camera',
  specialEffects: 'Special Effects',
  wardrobe: 'Wardrobe',
  makeup: 'Makeup/Hair',
  animals: 'Animals',
  animalWrangler: 'Animal Wrangler',
  music: 'Music',
  sound: 'Sound',
  artDept: 'Art Department',
  setDressing: 'Set Dressing',
  greenery: 'Greenery',
  specialEquipment: 'Special Equipment',
  security: 'Security',
  additionalLabor: 'Additional Labor',
  visualEffects: 'Visual Effects',
  mechanicalEffects: 'Mechanical Effects',
  miscellaneous: 'Miscellaneous',
  location: 'Location',
  sequence: 'Sequence',
  unit: 'Unit',
};

export function getLabel(key: string, fallback: string, categoryLabels?: Record<string, string>): string {
  return categoryLabels?.[key] || DEFAULT_CATEGORY_LABELS[key] || fallback;
}
