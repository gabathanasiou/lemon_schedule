import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { useProject } from '../../store';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import RadioList from '../RadioList';
import { buildSceneDuplicate, type DuplicateMode } from '../../lib/sceneDuplicates';
import { nextLetterSceneNumber } from '../../lib/sceneNumbering';
import { scriptSceneOf } from '../../lib/script';
import { TEST_IDS } from '../../lib/testIds';
import type { Scene } from '../../types';

const MODES: { mode: DuplicateMode; label: string; hint: string }[] = [
  { mode: 'split', label: 'Split / second scene', hint: 'Renumber (6 → 6A) and copy the scene’s script.' },
  { mode: 'coverage', label: 'Coverage / second unit', hint: 'Keep the same number + a “copy” badge; schedule-only, script untouched.' },
  { mode: 'plain', label: 'Not care', hint: 'Plain duplicate — renumber, no relationship recorded.' },
];

/**
 * ONE duplicate flow (roadmap 132 Part D) shared by the stripboard / Glide /
 * Scene Sheet. The chosen mode is dispatched by the caller through the shared
 * `buildSceneDuplicate`; the body copy (split) + the scene insert are ONE undo
 * batch.
 */
export default function SceneDuplicateModal({ scene, onConfirm, onClose }: {
  scene: Scene;
  onConfirm: (duplicate: Scene) => void;
  onClose: () => void;
}) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const [mode, setMode] = useState<DuplicateMode>('plain');
  const [number, setNumber] = useState(() => nextLetterSceneNumber(project.scenes, scene.sceneNumber));

  const confirm = () => {
    if (readOnly) return;
    const result = buildSceneDuplicate(project, scene, mode);
    if (mode !== 'coverage' && number.trim()) result.scene.sceneNumber = number.trim();
    dispatch({ type: 'BATCH_START' });
    const doc = project.scriptDocument;
    const src = result.scriptScene ? scriptSceneOf(doc, scene.sceneNumber) : undefined;
    if (doc && src && result.scriptScene) {
      const scenes = [...doc.scenes];
      scenes.splice(doc.scenes.indexOf(src) + 1, 0, result.scriptScene);
      dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes } } });
    }
    onConfirm(result.scene);
    dispatch({ type: 'BATCH_COMMIT' });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Duplicate Scene ${scene.sceneNumber}`}
      icon={<Copy className="w-4 h-4" />}
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton variant="hero" onClick={confirm} disabled={readOnly || (mode !== 'coverage' && !number.trim())}>Duplicate</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="space-y-5 p-6" data-testid={TEST_IDS.sceneDuplicateModal}>
        <RadioList
          theme="dark"
          value={mode}
          onChange={id => setMode(id as DuplicateMode)}
          items={MODES.map(m => ({
            id: m.mode,
            label: (
              <span className="block">
                <span className="block text-xs font-medium text-zinc-200">{m.label}</span>
                <span className="mt-0.5 block text-[11px] text-zinc-500">{m.hint}</span>
              </span>
            ),
          }))}
        />
        {mode !== 'coverage' && (
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">New number</span>
            <input value={number} onChange={e => setNumber(e.target.value)} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 outline-none focus:border-zinc-500" />
          </label>
        )}
      </div>
    </Modal>
  );
}
