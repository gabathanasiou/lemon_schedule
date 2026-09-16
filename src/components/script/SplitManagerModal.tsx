import React, { useMemo, useState } from 'react';
import { GitMerge, Hash, Scissors, SplitSquareHorizontal, Wrench } from 'lucide-react';
import { useProject } from '../../store';
import { useDialog } from '../Dialog';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import SplitBreakModal from './SplitBreakModal';
import {
  mergeSplitGroup, mergedGroupStream, renumberSplitGroup, resolveSplitGroup,
  splitGroupBadge, splitGroupMembers, splitGroupRenumberTargets, splitGroups,
  type SplitGroup,
} from '../../lib/splitGroups';
import { findSceneNumberCollision } from '../../lib/sceneNumbering';
import { TEST_IDS } from '../../lib/testIds';

/**
 * Split Manager (roadmap 132 Part E) — lists every cut group (`5 → 5 + 5A`) with
 * a clean/diverged badge and offers Open / Renumber / Move break / Resolve /
 * Merge back. Renumber normalizes the group's numbers (and its script bodies);
 * Move break relocates the cut; Resolve rebuilds a missing body / re-anchors a
 * drifted tag; Merge back reverses the cut. Each is ONE undo batch.
 */
export default function SplitManagerModal({ onOpen, onClose }: { onOpen?: (sceneId: string) => void; onClose: () => void }) {
  const { state, dispatch, readOnly } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const groups = useMemo(() => splitGroups(project.scenes), [project.scenes]);
  const [breakGroup, setBreakGroup] = useState<SplitGroup | null>(null);

  const mergeBack = (originalId: string, label: string) => {
    void dialog.confirm({
      title: 'Merge the split back?',
      message: `${label} — the fragments' script joins the original and those scenes are removed (to Trash, restorable). One undo step.`,
      danger: true,
    }).then(ok => { if (ok) mergeSplitGroup(dispatch, project, originalId); });
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Split Manager"
        icon={<SplitSquareHorizontal className="w-4 h-4" />}
        width="max-w-2xl"
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
            const members = splitGroupMembers(group);
            const targets = splitGroupRenumberTargets(group);
            const needsRenumber = members.some((s, i) => s.sceneNumber !== targets[i]);
            const renumberClash = members.some((s, i) => !!findSceneNumberCollision(project.scenes, s.id, targets[i]));
            const stream = mergedGroupStream(project.scriptDocument, group);
            const canMoveBreak = !!stream && (stream.boundaries[0] > 1 || stream.boundaries[1] - 1 > stream.boundaries[0]);
            const label = `${group.original.sceneNumber} → ${[group.original.sceneNumber, ...group.fragments.map(f => f.sceneNumber)].join(' + ')}`;
            return (
              <div key={group.original.id} className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200">{label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${badge === 'clean' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'}`}>{badge}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {onOpen && (
                    <Button variant="subtle" theme="dark" type="button" onClick={() => { onOpen(group.original.id); onClose(); }}>Open</Button>
                  )}
                  <Button
                    variant="subtle"
                    theme="dark"
                    type="button"
                    disabled={readOnly || !needsRenumber || renumberClash}
                    title={renumberClash ? 'A target number is already used by another scene' : 'Normalize the group’s scene numbers'}
                    onClick={() => renumberSplitGroup(dispatch, project, group.original.id)}
                  >
                    <Hash className="w-3.5 h-3.5" /> Renumber
                  </Button>
                  <Button
                    variant="subtle"
                    theme="dark"
                    type="button"
                    disabled={readOnly || !canMoveBreak}
                    title={canMoveBreak ? 'Move the cut break' : 'Needs every member’s script body'}
                    onClick={() => setBreakGroup(group)}
                  >
                    <Scissors className="w-3.5 h-3.5" /> Move break
                  </Button>
                  <Button
                    variant="subtle"
                    theme="dark"
                    type="button"
                    disabled={readOnly}
                    title="Rebuild a missing body / re-anchor drifted tags"
                    onClick={() => resolveSplitGroup(dispatch, project, group.original.id)}
                  >
                    <Wrench className="w-3.5 h-3.5" /> Resolve
                  </Button>
                  <Button variant="subtle" theme="dark" type="button" disabled={readOnly} onClick={() => mergeBack(group.original.id, label)}>
                    <GitMerge className="w-3.5 h-3.5" /> Merge back
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
      {breakGroup && <SplitBreakModal group={breakGroup} onClose={() => setBreakGroup(null)} />}
    </>
  );
}
