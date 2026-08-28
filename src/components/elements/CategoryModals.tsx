import React from 'react';
import { Plus, Pencil } from 'lucide-react';
import { IconGrid } from './IconGrid';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  icon: React.ReactNode;
  name: string;
  onNameChange: (v: string) => void;
  catIcon: string;
  onIconChange: (v: string) => void;
  multiValue: boolean;
  onMultiValueChange: (v: boolean) => void;
  onSubmit: () => void;
  withValueType: boolean;
}

function CategoryFormModal({ open, onClose, title, submitLabel, icon, name, onNameChange, catIcon, onIconChange, multiValue, onMultiValueChange, onSubmit, withValueType }: CategoryFormProps) {
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={title} icon={icon} width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={onSubmit} disabled={!name.trim()}>{submitLabel}</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <div>
          <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{withValueType ? 'Name' : 'New label'}</label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSubmit(); }}
            autoFocus
            className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
            placeholder={withValueType ? 'e.g. Firearms, Period Vehicles...' : undefined}
          />
        </div>
        {withValueType && (
          <>
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Icon</label>
              <IconGrid value={catIcon} onChange={onIconChange} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Value Type</label>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => onMultiValueChange(true)}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${multiValue ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                >
                  Multiple values
                </button>
                <button
                  type="button"
                  onClick={() => onMultiValueChange(false)}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${!multiValue ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                >
                  Single value
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function AddCustomCategoryModal(props: Omit<CategoryFormProps, 'open' | 'title' | 'submitLabel' | 'icon' | 'withValueType'> & { open: boolean }) {
  return <CategoryFormModal {...props} title="Add Category" submitLabel="Create" icon={<Plus className="w-4 h-4" />} withValueType />;
}

export function EditCustomCategoryModal(props: Omit<CategoryFormProps, 'open' | 'title' | 'submitLabel' | 'icon' | 'withValueType'> & { open: boolean }) {
  return <CategoryFormModal {...props} title="Edit Category" submitLabel="Save" icon={<Pencil className="w-4 h-4" />} withValueType />;
}

/** Generic single-field label modal (rename or add). */
export function LabelModal({ title = 'Rename', submitLabel = 'Save', ...rest }: Omit<CategoryFormProps, 'open' | 'title' | 'submitLabel' | 'icon' | 'withValueType' | 'catIcon' | 'onIconChange' | 'multiValue' | 'onMultiValueChange'> & { open: boolean; title?: string; submitLabel?: string }) {
  return <CategoryFormModal {...rest} title={title} submitLabel={submitLabel} icon={<Pencil className="w-4 h-4" />} withValueType={false} catIcon="" onIconChange={() => {}} multiValue={false} onMultiValueChange={() => {}} />;
}

export function EditBuiltinLabelModal(props: Omit<CategoryFormProps, 'open' | 'title' | 'submitLabel' | 'icon' | 'withValueType' | 'catIcon' | 'onIconChange' | 'multiValue' | 'onMultiValueChange'> & { open: boolean }) {
  return <LabelModal {...props} title="Rename Category" />;
}
