import React from 'react';
import { useProject } from '../../store';
import { ProjectRule } from '../../types';
import { anchoredKeysFor } from '../../lib/elementLinks';
import Modal from '../Modal';
import { RuleEditorPanel } from './RuleEditorPanel';

export interface RuleEditorModalProps {
  open: boolean;
  initial: ProjectRule | null;
  onClose: () => void;
  onSave: (rules: ProjectRule[]) => void;
  onDelete?: () => void;
}

/** The "New Rule" / "Edit Rule" modal — ONE shell for the Rules tab and the
 *  Element View events tab (both used to inline the same Modal wrapper). The
 *  project-derived panel inputs (scenes, cast, anchored cast keys, production
 *  start) are resolved here so hosts only supply the rule + handlers. */
export const RuleEditorModal: React.FC<RuleEditorModalProps> = ({ open, initial, onClose, onSave, onDelete }) => {
  const { state } = useProject();
  const project = state.present;
  const productionStart = project.calendarVersions.find(v => v.id === project.activeCalendarVersionId)?.productionStart;
  const isEditing = !!initial && !!initial.id;

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Rule' : 'New Rule'} width="max-w-lg">
      <div className="p-6">
        <RuleEditorPanel
          bare
          initial={initial}
          scenes={project.scenes}
          castMembers={project.castMembers || []}
          anchoredKeys={anchoredKeysFor(project.links, 'cast')}
          productionStart={productionStart}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
        />
      </div>
    </Modal>
  );
};
