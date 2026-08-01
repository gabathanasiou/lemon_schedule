import React from 'react';
import { useProject } from '../../store';
import { ScheduleRow, Scene, RuleViolation } from '../../types';
import { resolveSceneColor, getNoteBannerColors, getSelectedStripColors, getFallbackStripColors, getDayFooterColors } from '../../lib/ribbonUtils';
import { IS_COARSE } from '../../lib/device';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flag } from 'lucide-react';
import { ViolationTooltip } from '../ViolationTooltip';

export const SceneCardContent: React.FC<{ row: ScheduleRow; scene?: Scene; displayField: string; violations?: RuleViolation[]; isSelected?: boolean; selBg?: string; selColor?: string }> = ({ row, scene, displayField, violations, isSelected, selBg, selColor }) => {
  const { state } = useProject();
  const palette = state.present.colorPalette;
  const sz = IS_COARSE ? 'text-xs px-2 py-1' : 'text-[9px] px-1.5 py-0.5';
  if (!scene) {
    const label = row.type === 'BREAK' ? row.breakLabel || 'BREAK' : row.type === 'NOTE' ? row.noteText || 'Note' : row.type === 'DAYBREAK' ? row.daybreakLabel || 'End of Day' : null;
    if (!label) return null;
    const nb = getNoteBannerColors(palette);
    const df = getDayFooterColors(palette);
    const rawBg = row.type === 'DAYBREAK' ? df.background : row.noteColor || nb.background;
    const rawFg = row.type === 'DAYBREAK' ? df.color : row.noteTextColor || nb.color;
    const bg = isSelected && selBg ? selBg : rawBg;
    const fg = isSelected && selColor ? selColor : rawFg;
    return (
      <div style={{ background: bg, color: fg }} className={`${sz} font-semibold truncate border-b border-black select-none cursor-grab ${row.type === 'NOTE' ? 'italic' : ''}`}>
        {label}
      </div>
    );
  }
  const getDisplayValue = (): string => {
    if (displayField === 'description') return scene.description;
    if (displayField === 'cast') {
      const ids = scene.cast.split(',').map(s => s.trim()).filter(Boolean);
      const members = state.present.castMembers || [];
      return ids.map(id => members.find(m => m.id === id)?.name || id).join(', ');
    }
    return (scene as any)[displayField] || '';
  };
  const c = resolveSceneColor(scene.intExt || '', scene.dayNight || '', palette?.sceneColors, getFallbackStripColors(palette), scene, palette?.colorRules);
  const bg = isSelected && selBg ? selBg : c.background;
  const fg = isSelected && selColor ? selColor : c.color;
  const vFlag = violations && violations.length > 0 ? (
    <ViolationTooltip violations={violations}>
      <Flag className="w-2 h-2 text-red-500 fill-red-500 shrink-0" />
    </ViolationTooltip>
  ) : null;
  return (
    <div style={{ background: bg, color: fg }} className={`${sz} truncate leading-tight whitespace-nowrap font-semibold flex items-center gap-0.5 border-b border-black select-none cursor-grab`}>
      <span className="truncate">{scene.sceneNumber}. {getDisplayValue()}</span>
      {vFlag}
    </div>
  );
};

export const SceneCard: React.FC<{ row: ScheduleRow; scene?: Scene; displayField: string; violations?: RuleViolation[]; isSelected?: boolean; isFaded?: boolean; onToggle?: (id: string, e: React.MouseEvent) => void; onDoubleClick?: (id: string) => void; onContextMenu?: (e: React.MouseEvent) => void }> = ({ row, scene, displayField, violations, isSelected, isFaded, onToggle, onDoubleClick, onContextMenu }) => {
  const { state, readOnly } = useProject();
  const sel = getSelectedStripColors(state.present.colorPalette);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { type: 'SCENE_CARD', row, scene },
    disabled: readOnly,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.3 } : {}),
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
  };
    return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      onClick={(e) => onToggle?.(row.id, e)}
      onDoubleClick={(e) => { e.preventDefault(); onDoubleClick?.(row.id, e.shiftKey); }}
      onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(e); } }}
      data-row-id={row.id}
      data-container-id={row.containerId == null ? 'null' : row.containerId}
      className={`${isSelected && !isFaded ? 'z-10' : ''} ${isFaded ? 'opacity-30' : ''}`}>
      <SceneCardContent row={row} scene={scene} displayField={displayField} violations={violations} isSelected={isSelected} selBg={sel.background} selColor={sel.color} />
    </div>
  );
};
