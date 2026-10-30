import React from 'react';
import { ChevronDown, Lock, RotateCcw, Unlock } from 'lucide-react';
import type { Budget, BudgetVersion } from '../../types';
import Button from '../Button';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import DropdownMenu, { ItemManagerDropdown } from '../DropdownMenu';
import DropdownItem from '../DropdownItem';

/** Budget version picker — the same `ItemManagerDropdown` contract as schedule
 *  and calendar versions, plus lock/unlock and version-trash restore
 *  (`docs/BUDGETING-SURFACES.md` §2). */
export function BudgetVersionMenu({
  budget, activeVersion, locked, canEdit,
  onSelect, onCreate, onRename, onDuplicate, onDelete, onRestore, onLock, onUnlock,
}: {
  budget: Budget;
  activeVersion: BudgetVersion;
  locked: boolean;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onLock: () => void;
  onUnlock: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [lockOpen, setLockOpen] = React.useState(false);
  const [trashOpen, setTrashOpen] = React.useState(false);
  const trash = budget.versionTrash || [];

  return (
    <div className="flex items-center gap-1">
      <ItemManagerDropdown
        open={open}
        onClose={setOpen}
        items={budget.versions.map(v => ({ id: v.id, name: v.name }))}
        activeId={budget.activeVersionId}
        closeOnSelect
        onSelect={onSelect}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onCreate={onCreate}
        onTrash={trash.length > 0 ? () => setTrashOpen(true) : undefined}
        readOnly={!canEdit}
        theme="light"
        label="Budget"
        header="BUDGET VERSIONS"
        itemLabel="Version"
        minItems={1}
        itemRender={(item) => {
          const v = budget.versions.find(x => x.id === item.id);
          return (
            <span className="flex items-center gap-1.5">
              {v?.locked && <Lock className="w-3 h-3 text-[color:var(--ui-text-faint)]" />}
              {item.name}
            </span>
          );
        }}
        trigger={
          <Button theme="light" data-presence-anchor="toolbar:budget:versions">
            <span className="text-xs font-semibold text-[color:var(--ui-text-faint)]">Budget:</span>
            <span className="text-xs font-semibold text-[color:var(--ui-text-strong)]">{activeVersion.name}</span>
            {locked && <Lock className="w-3 h-3 text-amber-600" />}
            <ChevronDown className="w-3 h-3 text-[color:var(--ui-text-faint)]" />
          </Button>
        }
      />
      {canEdit && (
        <DropdownMenu
          open={lockOpen}
          onOpenChange={setLockOpen}
          width="w-44"
          theme="light"
          trigger={
            <Button theme="light" title={locked ? 'Unlock this version' : 'Lock this version'} aria-label={locked ? 'Unlock budget version' : 'Lock budget version'}>
              {locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            </Button>
          }
        >
          {locked ? (
            <DropdownItem onClick={() => { setLockOpen(false); onUnlock(); }} icon={<Unlock className="w-3.5 h-3.5" />}>
              Unlock version
            </DropdownItem>
          ) : (
            <DropdownItem onClick={() => { setLockOpen(false); onLock(); }} icon={<Lock className="w-3.5 h-3.5" />}>
              Lock version…
            </DropdownItem>
          )}
        </DropdownMenu>
      )}

      <Modal
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        title="Budget version trash"
        width="max-w-lg"
        footer={<ModalFooter><ModalFooterButton onClick={() => setTrashOpen(false)}>Close</ModalFooterButton></ModalFooter>}
      >
        <div className="px-5 py-3 max-h-[55vh] overflow-y-auto scrollbar-custom">
          {trash.length === 0 && (
            <div className="text-xs text-[color:var(--ui-text-faint)] py-6 text-center">No deleted budget versions.</div>
          )}
          {trash.map(item => (
            <div key={item.version.id} className="flex items-center justify-between gap-3 py-2 border-b border-[color:var(--ui-border)] last:border-0">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[color:var(--ui-text-strong)] truncate">{item.version.name}</div>
                <div className="text-[10px] text-[color:var(--ui-text-faint)]">
                  {new Date(item.deletedAt).toLocaleDateString()} · {item.version.lines.length} lines
                </div>
              </div>
              <Button theme="light" onClick={() => { onRestore(item.version.id); setTrashOpen(false); }}>
                <RotateCcw className="w-3 h-3" /> Restore
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
