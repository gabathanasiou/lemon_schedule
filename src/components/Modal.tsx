import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  icon,
  width,
  children,
}: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[9999] bg-black/50" />
        <RadixDialog.Content
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col focus:outline-none ${width || 'max-w-lg w-full'}`}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
              <RadixDialog.Title className="text-sm font-bold text-white truncate">
                {title}
              </RadixDialog.Title>
            </div>
            <RadixDialog.Close className="text-zinc-500 hover:text-white transition-colors shrink-0 ml-2">
              <X className="w-4 h-4" />
            </RadixDialog.Close>
          </div>

          <div className="overflow-y-auto flex-1">
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
