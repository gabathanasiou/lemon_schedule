import React, { useMemo, useState } from 'react';
import { RotateCcw, Trash2, Film, Layers, CalendarDays, ShieldAlert, LayoutTemplate, Package, Tags, Palette, UserRound } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { ItemCard } from './cards/ItemCard';
import { useDialog } from './Dialog';
import { RULE_TYPE_META, describeRule, getRuleSearchText } from './rules/ruleMeta';
import { DEFAULT_CATEGORY_LABELS } from '../store';
import type { Action } from '../store';
import type { Project } from '../types';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type TrashKind = 'scene' | 'version' | 'calendarVersion' | 'rule' | 'ribbon' | 'element' | 'category' | 'colorrule' | 'crew';

interface TrashEntry {
  id: string;
  title: string;
  subtitle: string;
  deletedAt: number;
  actionType: Action['type'];
}

interface TrashSection {
  kind: TrashKind;
  label: string;
  icon: React.ReactNode;
  iconClass: string;
  entries: TrashEntry[];
}

const KIND_META: Record<TrashKind, { label: string; icon: React.ReactNode; iconClass: string }> = {
  scene: { label: 'Scenes', icon: <Film className="w-3.5 h-3.5" />, iconClass: 'text-sky-400' },
  version: { label: 'Versions', icon: <Layers className="w-3.5 h-3.5" />, iconClass: 'text-emerald-400' },
  calendarVersion: { label: 'Calendar Plans', icon: <CalendarDays className="w-3.5 h-3.5" />, iconClass: 'text-lime-400' },
  rule: { label: 'Rules', icon: <ShieldAlert className="w-3.5 h-3.5" />, iconClass: 'text-amber-400' },
  ribbon: { label: 'Ribbon Designs', icon: <LayoutTemplate className="w-3.5 h-3.5" />, iconClass: 'text-violet-400' },
  element: { label: 'Elements', icon: <Package className="w-3.5 h-3.5" />, iconClass: 'text-orange-400' },
  category: { label: 'Custom Categories', icon: <Tags className="w-3.5 h-3.5" />, iconClass: 'text-pink-400' },
  colorrule: { label: 'Color Rules', icon: <Palette className="w-3.5 h-3.5" />, iconClass: 'text-teal-400' },
  crew: { label: 'Crew', icon: <UserRound className="w-3.5 h-3.5" />, iconClass: 'text-cyan-400' },
};

export interface TrashModalProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  dispatch: React.Dispatch<Action>;
}

export default function TrashModal({ open, onClose, project, dispatch }: TrashModalProps) {
  const dialog = useDialog();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sections = useMemo<TrashSection[]>(() => {
    const entries: TrashSection[] = [
      {
        kind: 'scene',
        label: KIND_META.scene.label,
        icon: KIND_META.scene.icon,
        iconClass: KIND_META.scene.iconClass,
        entries: (project.trash || []).map(t => ({
          id: t.scene.id,
          title: `${t.scene.sceneNumber}. ${t.scene.set}`,
          subtitle: `${t.versionName} · ${formatTime(t.deletedAt)}`,
          deletedAt: t.deletedAt,
          actionType: 'RESTORE_SCENE' as const,
        })),
      },
      {
        kind: 'version',
        label: KIND_META.version.label,
        icon: KIND_META.version.icon,
        iconClass: KIND_META.version.iconClass,
        entries: (project.versionTrash || []).map(t => ({
          id: t.version.id,
          title: t.version.name,
          subtitle: `Version · ${formatTime(t.deletedAt)}`,
          deletedAt: t.deletedAt,
          actionType: 'RESTORE_VERSION_FROM_TRASH' as const,
        })),
      },
      {
        kind: 'calendarVersion',
        label: KIND_META.calendarVersion.label,
        icon: KIND_META.calendarVersion.icon,
        iconClass: KIND_META.calendarVersion.iconClass,
        entries: (project.calendarVersionTrash || []).map(t => ({
          id: t.version.id,
          title: t.version.name,
          subtitle: `Calendar Plan · ${formatTime(t.deletedAt)}`,
          deletedAt: t.deletedAt,
          actionType: 'RESTORE_CALENDAR_VERSION_FROM_TRASH' as const,
        })),
      },
      {
        kind: 'rule',
        label: KIND_META.rule.label,
        icon: KIND_META.rule.icon,
        iconClass: KIND_META.rule.iconClass,
        entries: (project.rulesTrash || []).map(t => {
          const meta = RULE_TYPE_META[t.rule.type];
          const castLabel = t.rule.type === 'CAST_CONFLICT' || t.rule.type === 'CAST_SCENE_FLAG'
            ? getRuleSearchText(t.rule) || 'multiple'
            : t.rule.castId;
          return {
            id: t.rule.id,
            title: `${meta.short} · Cast ${castLabel} · ${describeRule(t.rule)}`,
            subtitle: `Rule · ${formatTime(t.deletedAt)}`,
            deletedAt: t.deletedAt,
            actionType: 'RESTORE_RULE_FROM_TRASH' as const,
          };
        }),
      },
      {
        kind: 'element',
        label: KIND_META.element.label,
        icon: KIND_META.element.icon,
        iconClass: KIND_META.element.iconClass,
        entries: (project.elementsTrash || []).map(t => {
          const builtinLabels: Record<string, string> = DEFAULT_CATEGORY_LABELS;
          const catLabel = project.categoryLabels?.[t.category] || builtinLabels[t.category] || t.category;
          return {
            id: t.element.id,
            title: `${catLabel} · ${t.element.name || t.element.id}`,
            subtitle: `Element · ${formatTime(t.deletedAt)}`,
            deletedAt: t.deletedAt,
            actionType: 'RESTORE_ELEMENT_FROM_TRASH' as const,
          };
        }),
      },
      {
        kind: 'category',
        label: KIND_META.category.label,
        icon: KIND_META.category.icon,
        iconClass: KIND_META.category.iconClass,
        entries: (project.categoryTrash || []).map(t => ({
          id: t.category.key,
          title: t.category.label,
          subtitle: `Custom Category · ${t.elements.length} elements · ${formatTime(t.deletedAt)}`,
          deletedAt: t.deletedAt,
          actionType: 'RESTORE_CATEGORY_FROM_TRASH' as const,
        })),
      },
      {
        kind: 'colorrule',
        label: KIND_META.colorrule.label,
        icon: KIND_META.colorrule.icon,
        iconClass: KIND_META.colorrule.iconClass,
        entries: (project.colorRulesTrash || []).map(t => ({
          id: t.rule.id,
          title: t.rule.name,
          subtitle: `Color Rule · ${formatTime(t.deletedAt)}`,
          deletedAt: t.deletedAt,
          actionType: 'RESTORE_COLOR_RULE_FROM_TRASH' as const,
        })),
      },
      {
        kind: 'crew',
        label: KIND_META.crew.label,
        icon: KIND_META.crew.icon,
        iconClass: KIND_META.crew.iconClass,
        entries: (project.crewTrash || []).map(t => ({
          id: t.person.id,
          title: t.person.name || 'Unnamed',
          subtitle: `${t.roleLabel} · Crew · ${formatTime(t.deletedAt)}`,
          deletedAt: t.deletedAt,
          actionType: 'RESTORE_CREW_PERSON_FROM_TRASH' as const,
        })),
      },
      {
        kind: 'ribbon',
        label: KIND_META.ribbon.label,
        icon: KIND_META.ribbon.icon,
        iconClass: KIND_META.ribbon.iconClass,
        entries: (project.ribbonTrash || []).map(t => ({
          id: t.design.id,
          title: t.design.name,
          subtitle: `Ribbon Design · ${formatTime(t.deletedAt)}`,
          deletedAt: t.deletedAt,
          actionType: 'RESTORE_RIBBON_FROM_TRASH' as const,
        })),
      },
    ];
    return entries
      .map(s => ({ ...s, entries: s.entries.sort((a, b) => b.deletedAt - a.deletedAt) }))
      .filter(s => s.entries.length > 0);
  }, [project]);

  const totalItems = sections.reduce((n, s) => n + s.entries.length, 0);

  const emptyTrash = async () => {
    const ok = await dialog.confirm({
      title: 'Empty Trash?',
      message: 'Permanently delete all trash items?',
      danger: true,
      suppressKey: 'lemon_schedule_dnwa_empty_trash',
    });
    if (ok) dispatch({ type: 'EMPTY_TRASH' });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Trash"
      icon={<Trash2 className="w-3.5 h-3.5" />}
      width="max-w-xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="danger" className="mr-auto" onClick={emptyTrash} disabled={totalItems === 0}>
            Empty
          </ModalFooterButton>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-5 space-y-3">
        <p className="text-[11px] text-zinc-500">Items expire after 30 days</p>
        {totalItems === 0 ? (
          <div className="text-zinc-500 text-center py-12 text-sm">Trash is empty</div>
        ) : (
          sections.map(section => (
            <ItemCard
              key={section.kind}
              title={section.label}
              icon={<span className={section.iconClass}>{section.icon}</span>}
              count={section.entries.length}
              collapsed={!!collapsed[section.kind]}
              onToggle={() => setCollapsed(prev => ({ ...prev, [section.kind]: !prev[section.kind] }))}
              dataProps={{ 'data-trash-section': section.kind }}
            >
              {section.entries.map(entry => (
                <div key={entry.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-zinc-800/60 group" data-trash-item={section.kind}>
                  <div className="min-w-0">
                    <div className="text-white text-sm font-semibold truncate">{entry.title}</div>
                    <div className="text-zinc-500 text-[11px] mt-0.5">{entry.subtitle}</div>
                  </div>
                  <button
                    onClick={() => dispatch({ type: entry.actionType, payload: entry.id } as Action)}
                    className="hover-reveal text-zinc-400 hover:text-white p-1 rounded transition-all shrink-0 ml-3"
                    title="Restore"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </ItemCard>
          ))
        )}
      </div>
    </Modal>
  );
}
