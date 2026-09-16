import React, { useMemo } from 'react';
import { GitMerge, SplitSquareHorizontal } from 'lucide-react';
import { useProject } from '../../store';
import { useDialog } from '../Dialog';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import { mergeSplitGroup, splitGroupBadge, splitGroups } from '../../lib/splitGroups';
import { TEST_IDS } from '../../lib/testIds';

/**
 * Split Manager (roadmap 132 Part E) — lists every cut group (`5 → 5 + 5A`) with
 * a clean/diverged badge and offers Merge back / Open. Tag/renumber/move-break
 * refinements remain (see the roadmap item).
 */
export default function SplitManagerModal({ onOpen, onClose }: { onOpen?: (sceneId: string) => void; onClose: () => void }) {
  const { state, dispatch, readOnly } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const groups = useMemo(() => splitGroups(project.scenes), [project.scenes]);

  const mergeBack = (originalId: string, label: string) => {
    void dialog.confirm({
      title: 'Merge the split back?',
      message: `${label} — the fragments' script joins the original and those scenes are removed (to Trash, restorable). One undo step.`,
      danger: true,
    }).then(ok => { if (ok) mergeSplitGroup(dispatch, project, originalId); });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Split Manager"
      icon={<SplitSquareHorizontal className="w-4 h-4" />}
      width="max-w-lg"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="hero" onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="space-y-2 p-6" data-testid={TEST_IDS.splitManagerModal}>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-400">No split scenes. Cutting a scene in the Script tab creates a group.</p>
        ) : groups.map(group => {
          const badge = splitGroupBadge(project, group);
          const label = `${group.original.sceneNumber} → ${[group.original.sceneNumber, ...group.fragments.map(f => f.sceneNumber)].join(' + ')}`;
          return (
            <div key={group.original.id} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200">{label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${badge === 'clean' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'}`}>{badge}</span>
              {onOpen && (
                <Button variant="subtle" theme="dark" type="button" onClick={() => { onOpen(group.original.id); onClose(); }}>Open</Button>
              )}
              <Button variant="subtle" theme="dark" type="button" onClick={() => mergeBack(group.original.id, label)} disabled={readOnly}>
                <GitMerge className="w-3.5 h-3.5" /> Merge back
              </Button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
