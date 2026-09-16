import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { useProject } from '../store';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { auditScriptMap, repairScriptMap } from '../lib/scriptIntegrity';
import { TEST_IDS } from '../lib/testIds';

/**
 * Script-map integrity audit + repair (roadmap 135). A read-only list of
 * project↔`scriptDocument` mismatches with an explicit, undoable repair
 * (renumber collisions, prune orphan bodies, restore missing rows). Read-only
 * projects can still audit.
 */
export default function ScriptIntegrityModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const report = useMemo(() => auditScriptMap(project), [project]);
  const canRepair = report.counts.repairable > 0 && !readOnly;

  const errors = report.issues.filter(i => i.severity === 'error');
  const warnings = report.issues.filter(i => i.severity === 'warning');

  return (
    <Modal
      open
      onClose={onClose}
      title="Script Integrity"
      icon={<ShieldCheck className="w-4 h-4" />}
      width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Close</ModalFooterButton>
          {canRepair && (
            <ModalFooterButton variant="hero" onClick={() => repairScriptMap(dispatch, project)}>
              Repair {report.counts.repairable} issue{report.counts.repairable === 1 ? '' : 's'}
            </ModalFooterButton>
          )}
        </ModalFooter>
      }
    >
      <div className="space-y-3 p-6" data-testid={TEST_IDS.scriptIntegrityModal}>
        {report.clean && errors.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>No integrity problems — the project and its script map are in sync.</span>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 leading-relaxed">
            The project and its retained script have mismatches. Repair renumbers collisions, prunes orphan
            bodies and restores missing rows in one undo step.
          </p>
        )}

        {[...errors, ...warnings].map((issue, i) => (
          <div
            key={`${issue.kind}-${issue.sceneNumber ?? issue.versionId ?? i}`}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${issue.severity === 'error' ? 'border-red-900 bg-red-950/30 text-red-200' : 'border-zinc-700 bg-zinc-800 text-zinc-300'}`}
          >
            {issue.severity === 'error'
              ? <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
              : <Info className="mt-0.5 w-3.5 h-3.5 shrink-0 text-zinc-500" />}
            <span className="min-w-0">{issue.message}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
