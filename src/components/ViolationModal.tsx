import React from 'react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { ViolationContent } from './ViolationTooltip';
import { RuleViolation, CastMember } from '../types';
import { Flag } from 'lucide-react';

export interface ViolationModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  violations: RuleViolation[];
  castMembers: CastMember[];
}

export const ViolationModal: React.FC<ViolationModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  violations,
  castMembers,
}) => {
  if (!violations || violations.length === 0) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={<Flag className="w-3.5 h-3.5 text-red-400" />}
      width="max-w-lg"
      footer={
        <ModalFooter>
          <span className="text-[10px] text-zinc-500 mr-auto">{violations.length} violation{violations.length !== 1 ? 's' : ''}</span>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-3 max-h-[65vh] overflow-y-auto scrollbar-custom">
        {subtitle && (
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-3">{subtitle}</div>
        )}
        <ViolationContent violations={violations} castMembers={castMembers} />
      </div>
    </Modal>
  );
};

export interface ShootViolationsModalProps {
  open: boolean;
  onClose: () => void;
  dayViolations: Array<{ dayLabel: string; dateStr?: string; violations: RuleViolation[] }>;
  castMembers: CastMember[];
}

export const ShootViolationsModal: React.FC<ShootViolationsModalProps> = ({
  open,
  onClose,
  dayViolations,
  castMembers,
}) => {
  const totalViolations = dayViolations.reduce((sum, d) => sum + d.violations.length, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shoot Violations"
      icon={<Flag className="w-3.5 h-3.5 text-red-400" />}
      width="max-w-xl"
      footer={
        <ModalFooter>
          <span className="text-[10px] text-zinc-500 mr-auto">{totalViolations} violation{totalViolations !== 1 ? 's' : ''} across {dayViolations.length} day{dayViolations.length !== 1 ? 's' : ''}</span>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-3 space-y-4 max-h-[65vh] overflow-y-auto scrollbar-custom">
        {dayViolations.filter(d => d.violations.length > 0).map((day, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-white">{day.dayLabel}</span>
              {day.dateStr && (
                <span className="text-[10px] text-zinc-500">{day.dateStr}</span>
              )}
              <span className="text-[10px] text-red-400 ml-auto">{day.violations.length} violation{day.violations.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="border-t border-zinc-800 pt-2">
              <ViolationContent violations={day.violations} castMembers={castMembers} />
            </div>
          </div>
        ))}
        {dayViolations.every(d => d.violations.length === 0) && (
          <div className="text-[11px] text-zinc-500 text-center py-8">No violations found.</div>
        )}
      </div>
    </Modal>
  );
};
