import React, { useMemo, useState } from 'react';
import { Scissors } from 'lucide-react';
import { useProject } from '../../store';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import RadioList from '../RadioList';
import Checkbox from '../Checkbox';
import { formatSceneHeading, scriptSceneOf } from '../../lib/script';
import { commitSceneCut } from '../../lib/scriptSceneOps';
import { nextLetterSceneNumber } from '../../lib/sceneNumbering';
import { generateUUID } from '../../lib/utils';
import { TEST_IDS } from '../../lib/testIds';
import type { Scene, ScriptBlock } from '../../types';

const FIELD_LABEL = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500';
const FIELD_INPUT = 'w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500';

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
      duplicateOf: live.id,
      duplicateKind: 'split',
      cutAnchor: blocks.slice(k).find(b => b[0] !== 'page_break')?.[1] ?? '',
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
      <div className="space-y-5 p-6" data-testid={TEST_IDS.sceneCutModal}>
        {!canCut ? (
          <p className="text-xs text-zinc-400">This scene has no retained script body to cut (or the project is read-only).</p>
        ) : (
          <>
            <RadioList
              theme="dark"
              title="Cut before"
              maxHeight={176}
              value={splitIndex}
              onChange={id => setSplitIndex(Number(id))}
              items={blocks.slice(1).map((b, i) => ({
                id: i + 1,
                leading: <span className="text-[10px] uppercase text-zinc-500">{b[0]}</span>,
                label: <span className="block truncate font-mono">{blockLabel(b)}</span>,
              }))}
            />

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={FIELD_LABEL}>New number</span>
                <input value={newNumber} onChange={e => setNewNumber(e.target.value)} className={FIELD_INPUT} />
              </label>
              <label>
                <span className={FIELD_LABEL}>INT/EXT</span>
                <input value={intExt} onChange={e => setIntExt(e.target.value.toUpperCase())} className={FIELD_INPUT} />
              </label>
              <label>
                <span className={FIELD_LABEL}>Set</span>
                <input value={set} onChange={e => setSet(e.target.value)} className={FIELD_INPUT} />
              </label>
              <label>
                <span className={FIELD_LABEL}>Day / night</span>
                <input value={dayNight} onChange={e => setDayNight(e.target.value.toUpperCase())} className={FIELD_INPUT} />
              </label>
            </div>

            <Checkbox variant="plain" checked={moveTags} onChange={setMoveTags} label={<span className="text-xs text-zinc-300">Move tags after the cut to the new scene</span>} />
            <p className="text-[10px] text-zinc-600">The new scene inherits the parent's elements and lands in the boneyard — your schedule is untouched. One undo step.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
