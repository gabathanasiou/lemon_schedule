import React, { useState } from 'react';
import { useProject } from '../store';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import { EntityDropdown } from './EntityDropdown';
import { ruleModalSizes } from './rules/ColorRuleFormParts';
import { getCategoryElements } from '../lib/elements';
import { useQueueCastNaming, addNewElement } from '../lib/newCastNaming';
import { createBlankScene, getNextSceneNumber } from '../lib/sceneFactory';
import { getIntExtOptions, getDayNightOptions } from '../lib/ribbonUtils';
import { usePortalTarget } from '../lib/popoutTarget';
import { DD_CHIP_TRIGGER_CLASS } from '../lib/dropdown';
import { Clapperboard, ChevronDown } from 'lucide-react';

/** New Scene modal (roadmap 227) — the Boneyard header's Scene button fills
 *  number / INT-EXT / Day-Night / Set up front; Create dispatches ADD_SCENE
 *  and the empty strip lands in the Boneyard like any other new scene.
 *  EntityDropdown auto-creates a typed Set via the shared `addNewElement`
 *  flow. `onCreated` lets the host reveal (scroll + select) the new strip. */
export function NewSceneModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (sceneId: string) => void }) {
  const { state, dispatch, readOnly } = useProject();
  const { queue } = useQueueCastNaming();
  const portalTarget = usePortalTarget();
  const project = state.present;
  const sizes = ruleModalSizes();
  const { XSZ, CREM_BODY, CREM_LABEL, CREM_TEXT } = sizes;

  const [sceneNumber, setSceneNumber] = useState(() => {
    const last = project.scenes[project.scenes.length - 1];
    return last ? getNextSceneNumber(last.sceneNumber) : '1';
  });
  const [intExt, setIntExt] = useState('');
  const [dayNight, setDayNight] = useState('');
  const [set, setSet] = useState('');
  const [ieOpen, setIeOpen] = useState(false);
  const [dnOpen, setDnOpen] = useState(false);

  const ieOptions = getIntExtOptions(project.colorPalette);
  const dnOptions = getDayNightOptions(project.colorPalette);
  const setItems = getCategoryElements(project, 'set');

  const create = () => {
    const scene = createBlankScene({
      sceneNumber: sceneNumber.trim(),
      intExt: intExt as any,
      dayNight: dayNight as any,
      set: set.trim().toUpperCase(),
    });
    dispatch({ type: 'ADD_SCENE', payload: scene });
    onCreated?.(scene.id);
    onClose();
  };

  const labelCls = `${CREM_LABEL} text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1.5 mb-1.5`;

  return (
    <Modal open onClose={onClose} title="New Scene" width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={create} disabled={readOnly}>Create</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>
        <div>
          <span className={labelCls}>
            <Clapperboard className={`${XSZ} text-zinc-500`} />
            Scene Number
          </span>
          <input
            type="text"
            value={sceneNumber}
            onChange={(e) => setSceneNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !readOnly) create(); }}
            placeholder="e.g. 12A"
            className={`${CREM_TEXT} w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-700 outline-none focus:border-zinc-500 placeholder-zinc-600`}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3 items-start">
          <div>
            <span className={labelCls}>INT / EXT</span>
            <DropdownMenu
              open={ieOpen}
              onOpenChange={setIeOpen}
              width="w-40"
              theme="dark"
              trigger={
                <button type="button" className={`${DD_CHIP_TRIGGER_CLASS} text-xs cursor-pointer w-full justify-between`}>
                  <span className={`truncate ${intExt ? '' : 'text-zinc-500'}`}>{intExt || 'INT / EXT'}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                </button>
              }
            >
              {ieOptions.map(opt => (
                <DropdownItem key={opt} onClick={() => { setIntExt(opt); setIeOpen(false); }}>{opt}</DropdownItem>
              ))}
            </DropdownMenu>
          </div>
          <div>
            <span className={labelCls}>Day / Night</span>
            <DropdownMenu
              open={dnOpen}
              onOpenChange={setDnOpen}
              width="w-40"
              theme="dark"
              trigger={
                <button type="button" className={`${DD_CHIP_TRIGGER_CLASS} text-xs cursor-pointer w-full justify-between`}>
                  <span className={`truncate ${dayNight ? '' : 'text-zinc-500'}`}>{dayNight || 'DAY / NIGHT'}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                </button>
              }
            >
              {dnOptions.map(opt => (
                <DropdownItem key={opt} onClick={() => { setDayNight(opt); setDnOpen(false); }}>{opt}</DropdownItem>
              ))}
            </DropdownMenu>
          </div>
        </div>

        <div>
          <span className={labelCls}>Set</span>
          <EntityDropdown
            value={set}
            onChange={setSet}
            onCreateItem={(item) => addNewElement(dispatch, queue, 'set', item)}
            items={setItems}
            mode="single"
            variant="chip"
            uppercase
            displayMode="name"
            placeholder="Search sets..."
            className="text-xs w-full"
            portalTarget={portalTarget ?? document.body}
          />
        </div>
      </div>
    </Modal>
  );
}
