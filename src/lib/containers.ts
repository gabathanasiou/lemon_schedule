import { ScheduleRow } from '../types';

export type ContainerBlock = 'boneyard' | 'stripboard' | 'clipboard';

export function getContainerBlock(row: { containerId: number | null | undefined }): ContainerBlock {
  if (row.containerId === -1) return 'clipboard';
  if (row.containerId == null) return 'boneyard';
  return 'stripboard';
}

export function getContainerBlockForId(
  id: string,
  rows: { id: string; containerId: number | null | undefined }[],
): ContainerBlock | null {
  const row = rows.find(r => r.id === id);
  if (!row) return null;
  return getContainerBlock(row);
}

export function isInBoneyard(
  id: string,
  rows: { id: string; containerId: number | null | undefined }[],
): boolean {
  return getContainerBlockForId(id, rows) === 'boneyard';
}

export type ContainerIds = Record<ContainerBlock, string[]>;

export type LastSelectedByContainer = Record<ContainerBlock, string | null>;

export function makeEmptyContainerIds(): ContainerIds {
  return { boneyard: [], stripboard: [], clipboard: [] };
}
