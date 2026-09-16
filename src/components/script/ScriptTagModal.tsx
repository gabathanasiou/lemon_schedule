import React, { useMemo, useState } from 'react';
import { Tag as TagIcon, Trash2 } from 'lucide-react';
import { useProject } from '../../store';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { CategoryDropdown } from '../rules/CategoryDropdown';
import { EntityDropdown } from '../EntityDropdown';
import { ELEMENT_CATEGORIES, getLabel } from '../../lib/categories';
import { getCategoryElements } from '../../lib/elements';
import { addNewElement, useQueueCastNaming } from '../../lib/newCastNaming';
import { generateUUID } from '../../lib/utils';
import { TEST_IDS } from '../../lib/testIds';
import type { ScriptAnnotation } from '../../types';

/** The selected span an annotation anchors to (roadmap 123 Phase 2). */
export interface ScriptTagTarget {
  sceneId: string;
  blockIndex: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Tag editor (roadmap 123 Phase 2 / 132 Part B) — links a selected screenplay
 * phrase to a breakdown element in a category. Reuses the shared
 * `CategoryDropdown` + `EntityDropdown` (and `addNewElement`, so a new cast
 * member queues for naming) — never a second entity picker. Writes the
 * canonical `ADD_/UPDATE_/REMOVE_SCRIPT_ANNOTATION` actions.
 */
export default function ScriptTagModal({ target, annotation, onClose }: {
  target: ScriptTagTarget;
  annotation?: ScriptAnnotation;
  onClose: () => void;
}) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const { queue } = useQueueCastNaming();
  const [category, setCategory] = useState(annotation?.category || 'props');
  const [elementKey, setElementKey] = useState(annotation?.elementKey || '');
  const [catOpen, setCatOpen] = useState(false);

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    const seen = new Set<string>();
    for (const c of ELEMENT_CATEGORIES) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: false }); } }
    for (const c of project.customCategories || []) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: true }); } }
    return keys;
  }, [project.customCategories]);

  const items = useMemo(() => getCategoryElements(project, category), [project, category]);

  const changeCategory = (c: string) => {
    setCategory(c);
    setElementKey('');
    setCatOpen(false);
  };

  const save = () => {
    if (readOnly) return;
    const key = elementKey.trim();
    if (!key) return;
    if (annotation) {
      dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: annotation.id, updates: { category, elementKey: key, recognized: false } } });
    } else {
      dispatch({
        type: 'ADD_SCRIPT_ANNOTATION',
        payload: {
          annotation: {
            id: generateUUID(),
            sceneId: target.sceneId,
            blockIndex: target.blockIndex,
            start: target.start,
            end: target.end,
            text: target.text,
            category,
            elementKey: key,
          },
        },
      });
    }
    onClose();
  };

  const remove = () => {
    if (annotation && !readOnly) dispatch({ type: 'REMOVE_SCRIPT_ANNOTATION', payload: annotation.id });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={annotation ? 'Edit Tag' : 'Tag Script Text'}
      icon={<TagIcon className="w-4 h-4" />}
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          {annotation && (
            <ModalFooterButton variant="ghost" onClick={remove} disabled={readOnly}>
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </ModalFooterButton>
          )}
          <ModalFooterButton variant="hero" onClick={save} disabled={readOnly || !elementKey.trim()}>
            {annotation ? 'Save' : 'Tag'}
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="space-y-3 p-5" data-testid={TEST_IDS.scriptTagModal}>
        <blockquote className="border-l-2 border-amber-400 pl-3 font-mono text-xs text-zinc-700">{target.text}</blockquote>
        <div className="flex items-center gap-2">
          <CategoryDropdown
            value={category}
            onChange={changeCategory}
            allCategoryKeys={allCategoryKeys}
            categoryLabelLookup={categoryLabelLookup}
            customCategories={project.customCategories}
            open={catOpen}
            onOpenChange={setCatOpen}
            btnClass="text-xs"
          />
          <EntityDropdown
            value={elementKey}
            onChange={setElementKey}
            onCreateItem={(item) => addNewElement(dispatch, queue, category, item)}
            items={items}
            positioning="fixed"
            portalTarget={document.body}
            mode="single"
            variant="chip"
            placeholder={category === 'cast' ? 'Search cast members…' : 'Search elements…'}
            className="min-w-0 flex-1 text-xs"
            displayMode={category === 'cast' ? 'id' : 'name'}
            renderItem={category === 'cast'
              ? (item) => <><span className="shrink-0 text-zinc-400">{item.id}.</span><span className="flex-1 truncate">{item.name && item.name !== item.id ? item.name : '?'}</span></>
              : undefined}
          />
        </div>
        <p className="text-[11px] text-zinc-500">A tag links this phrase to a breakdown element. It does not change the scene fields.</p>
      </div>
    </Modal>
  );
}
