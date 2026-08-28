import React from 'react';
import { ArrowRight } from 'lucide-react';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';

export interface MergeItem {
  sourceNames: string[];
  targetName: string;
  /** Right-aligned summary (e.g. "3 scenes" or "contacts combined"). */
  summary?: string;
  /** Optional lines under the row (e.g. "Scenes: 1, 4, 7"). */
  detailLines?: string[];
}

export interface MergeGroup {
  label: string;
  merges: MergeItem[];
}

/** Shared merge-confirmation modal for buffered managers (Element Manager, Crew Manager). */
export function MergeRowsModal({ title, intro, groups, confirmLabel = 'Merge & Save', onConfirm, onCancel }: {
  title: string;
  intro: string;
  groups: MergeGroup[];
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open onClose={onCancel} title={title} width="max-w-lg"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onCancel}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={onConfirm}>{confirmLabel}</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-5">
        <p className="text-xs text-zinc-400 leading-relaxed">{intro}</p>
        {groups.map(g => (
          <div key={g.label} className="space-y-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</h4>
            {g.merges.map((m, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="text-xs text-zinc-300 font-medium">{m.sourceNames.join(', ')}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                    <span className="text-xs text-white font-semibold">{m.targetName}</span>
                  </div>
                  {m.summary && <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">{m.summary}</span>}
                </div>
                {m.detailLines && m.detailLines.length > 0 && (
                  <div className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed max-h-20 overflow-y-auto tab-scroll">
                    {m.detailLines.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
