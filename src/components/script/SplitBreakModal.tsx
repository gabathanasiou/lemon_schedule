import React, { useMemo, useState } from 'react';
import { Scissors } from 'lucide-react';
import { useProject } from '../../store';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import { mergedGroupStream, moveSplitBreak, splitGroupMembers, type SplitGroup } from '../../lib/splitGroups';
import { ScriptBlockLine } from './ScriptSceneScript';
import { TEST_IDS } from '../../lib/testIds';

/**
 * Move the cut break of a split group (roadmap 132 Part E). The group's bodies
 * are shown as one continuous screenplay; the break line is stepped up/down by
 * whole blocks. Blocks above the break stay in the original, blocks below move
 * into the first fragment; later fragments are untouched. One undo batch.
 */
export default function SplitBreakModal({ group, onClose }: { group: SplitGroup; onClose: () => void }) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const stream = useMemo(() => mergedGroupStream(project.scriptDocument, group), [project.scriptDocument, group]);
  const members = splitGroupMembers(group);
  const [boundary, setBoundary] = useState(() => stream?.boundaries[0] ?? 1);
  const [error, setError] = useState(false);

  if (!stream) {
    return (
      <Modal open onClose={onClose} title="Move Break" icon={<Scissors className="w-4 h-4" />} width="max-w-2xl"
        footer={<ModalFooter><ModalFooterButton variant="hero" onClick={onClose}>Close</ModalFooterButton></ModalFooter>}>
        <div className="p-6">
          <p className="text-xs text-zinc-400">This group has a missing script body. Use Resolve first.</p>
        </div>
      </Modal>
    );
  }

  const current = stream.boundaries[0];
  const max = Math.max(1, stream.boundaries[1] - 1);
  const changed = boundary !== current && boundary >= 1 && boundary <= max;

  const apply = () => {
    if (readOnly) return;
    if (moveSplitBreak(dispatch, project, group.original.id, boundary)) onClose();
    else setError(true);
  };

  const first = members[0];
  const second = members[1];

  return (
    <Modal
      open
      onClose={onClose}
      title="Move Break"
      icon={<Scissors className="w-4 h-4" />}
      width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton variant="hero" onClick={apply} disabled={readOnly || !changed}>Move break</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="space-y-3 p-6" data-testid={TEST_IDS.splitBreakModal}>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Step the break between <b className="text-zinc-200">{first.sceneNumber}</b> and{' '}
          <b className="text-zinc-200">{second.sceneNumber}</b>. Blocks above the line stay in {first.sceneNumber};
          blocks below move into {second.sceneNumber}.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="subtle" theme="dark" type="button" disabled={boundary <= 1} onClick={() => setBoundary(b => Math.max(1, b - 1))}>◀ Earlier</Button>
          <span className="text-[11px] text-zinc-400 tabular-nums">Block {boundary} / {stream.merged.length}</span>
          <Button variant="subtle" theme="dark" type="button" disabled={boundary >= max} onClick={() => setBoundary(b => Math.min(max, b + 1))}>Later ▶</Button>
        </div>
        <div className="max-h-[380px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-[12.5px] leading-[1.45] text-zinc-200">
          {stream.merged.map((block, i) => (
            <React.Fragment key={i}>
              {i === boundary && <BreakLine from={first.sceneNumber} to={second.sceneNumber} />}
              <ScriptBlockLine block={{ type: block[0], text: block[1], tone: 'same' }} />
            </React.Fragment>
          ))}
        </div>
        {error && <p className="text-[11px] text-rose-400">Couldn’t move the break — one of the bodies is missing.</p>}
      </div>
    </Modal>
  );
}

function BreakLine({ from, to }: { from: string; to: string }) {
  return (
    <div className="my-1.5 flex items-center gap-2">
      <span className="h-px flex-1 bg-blue-500" />
      <span className="shrink-0 rounded bg-blue-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-200">
        Break · {from} / {to}
      </span>
      <span className="h-px flex-1 bg-blue-500" />
    </div>
  );
}
