import React, { useMemo, useState } from 'react';
import { Scissors } from 'lucide-react';
import { useProject } from '../../store';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Checkbox from '../Checkbox';
import { formatSceneHeading, scriptSceneOf } from '../../lib/script';
import { commitSceneCut } from '../../lib/scriptSceneOps';
import { nextLetterSceneNumber } from '../../lib/sceneNumbering';
import { generateUUID } from '../../lib/utils';
import { TEST_IDS } from '../../lib/testIds';
import type { Scene, ScriptBlock } from '../../types';

/**
 * Cut a scene at a block boundary into a new lettered scene (roadmap 132
 * Part C). The new scene inherits the parent's element fields, gets an editable
 * heading, and lands in the boneyard (schedule untouched). ONE batch:
 * `UPDATE_SCRIPT_DOCUMENT` (body split; baseline NOT rotated) + `ADD_SCENE`
 * (+ tag re-anchoring when "move tags" is on) — a single undo step.
 */
export default function SceneCutModal({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const live = project.scenes.find(s => s.id === sceneId);
  const doc = project.scriptDocument;
  const docScene = live ? scriptSceneOf(doc, live.sceneNumber) : undefined;
  const blocks = docScene?.blocks || [];

  const defaultNumber = useMemo(() => (live ? nextLetterSceneNumber(project.scenes, live.sceneNumber) : ''), [live, project.scenes]);
  const [splitIndex, setSplitIndex] = useState(Math.min(1, Math.max(0, blocks.length - 1)));
  const [newNumber, setNewNumber] = useState(defaultNumber);
  const [intExt, setIntExt] = useState(live?.intExt || 'INT');
  const [set, setSet] = useState(live?.set || '');
  const [dayNight, setDayNight] = useState(live?.dayNight || 'DAY');
  const [moveTags, setMoveTags] = useState(true);

  const blockLabel = (b?: ScriptBlock) => (b ? (b[1] || (b[0] === 'page_break' ? '— page break —' : `(${b[0]})`)) : '');

  const confirm = () => {
    if (!live || !doc || !docScene || readOnly) return;
    const k = Math.min(Math.max(1, splitIndex), blocks.length - 1);
    const number = newNumber.trim() || defaultNumber;
    const upperSet = set.trim().toUpperCase();
    const newScene: Scene = {
      ...live,
      id: generateUUID(),
      sceneNumber: number,
      intExt,
      set: upperSet,
      dayNight,
      pageCount: '0',
      pageCountDecimal: 0,
    };
    commitSceneCut({
      dispatch,
      project,
      parentId: live.id,
      parentNumber: live.sceneNumber,
      newScene,
      splitIndex: k,
      headingText: formatSceneHeading(intExt, upperSet, dayNight),
      moveTags,
    });
    onClose();
  };

  const canCut = !!live && !!docScene && blocks.length >= 2 && !readOnly;

  return (
    <Modal
      open
      onClose={onClose}
      title={live ? `Cut Scene ${live.sceneNumber}` : 'Cut Scene'}
      icon={<Scissors className="w-4 h-4" />}
      width="max-w-lg"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton variant="hero" onClick={confirm} disabled={!canCut || !newNumber.trim()}>Cut scene</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="space-y-4 p-5" data-testid={TEST_IDS.sceneCutModal}>
        {!canCut ? (
          <p className="text-xs text-zinc-500">This scene has no retained script body to cut (or the project is read-only).</p>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Cut before</p>
              <div className="max-h-44 space-y-0.5 overflow-y-auto rounded border border-zinc-200 p-1">
                {blocks.slice(1).map((b, i) => {
                  const k = i + 1;
                  return (
                    <label key={k} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${splitIndex === k ? 'bg-zinc-100' : 'hover:bg-zinc-50'}`}>
                      <input type="radio" name="cut-point" checked={splitIndex === k} onChange={() => setSplitIndex(k)} />
                      <span className="truncate text-zinc-700"><span className="uppercase text-zinc-400">{b[0]}</span> {blockLabel(b)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">New number</span>
                <input value={newNumber} onChange={e => setNewNumber(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-xs" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">INT/EXT</span>
                <input value={intExt} onChange={e => setIntExt(e.target.value.toUpperCase())} className="w-full rounded border border-zinc-300 px-2 py-1 text-xs" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Set</span>
                <input value={set} onChange={e => setSet(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-xs" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Day / night</span>
                <input value={dayNight} onChange={e => setDayNight(e.target.value.toUpperCase())} className="w-full rounded border border-zinc-300 px-2 py-1 text-xs" />
              </label>
            </div>

            <Checkbox variant="plain" checked={moveTags} onChange={setMoveTags} label={<span className="text-xs text-zinc-700">Move tags after the cut to the new scene</span>} />
            <p className="text-[11px] text-zinc-500">The new scene inherits the parent's elements and lands in the boneyard — your schedule is untouched. One undo step.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
