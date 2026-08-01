import React from 'react';
import {
  Hash, Clock, Timer, MapPin, Building2, Sun, Users, FileText, AlignLeft,
  Calendar, StickyNote, UserPlus, Sparkles, Car, Package, Shirt, Scissors,
  Volume1, Video, Volume2, Music, PawPrint, Sword, Leaf, PaintBucket,
  Type, Tag, CircleDot, ClipboardList,
} from 'lucide-react';

export const FIELD_ICONS: Record<string, React.ElementType> = {
  sceneNumber: Hash, callTime: Clock, duration: Timer, intExt: MapPin,
  set: Building2, dayNight: Sun, cast: Users, pageCount: FileText,
  sheetNumber: ClipboardList,
  description: AlignLeft, scriptDay: Calendar, notes: StickyNote,
  backgroundActors: UserPlus, stunts: Sparkles, vehicles: Car, props: Package,
  wardrobe: Shirt, makeup: Scissors, sfx: Volume1, vfx: Video,
  sound: Volume2, music: Music, animalsAndWranglers: PawPrint, weapons: Sword,
  greenery: Leaf, artDept: PaintBucket, text: Type,
};

const CUSTOM_ICON_MAP: Record<string, React.ElementType> = {
  Tag, Package, Car, Shirt, Sword, Sparkles, Volume1, Music,
  PawPrint, Leaf, PaintBucket, UserPlus, Video, Scissors, Users, Building2, Volume2, CircleDot,
};

export function getCustomIcon(name: string): React.ElementType {
  return CUSTOM_ICON_MAP[name] || Tag;
}
