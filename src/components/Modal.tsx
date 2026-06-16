import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X, RotateCcw } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onReset?: () => void;
}

export default function Modal({
  open,
  onClose,
  title,
  icon,
  width,
  footer,
  children,
  onReset,
}: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[9999] bg-black/50" />
        <RadixDialog.Content
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col focus:outline-none ${width ? `${width} w-full` : 'max-w-xl w-full'}`}
        >
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
              <RadixDialog.Title className="text-xs font-bold text-white truncate">
                {title}
              </RadixDialog.Title>
            </div>
            <div className="flex items-center gap-2">
              {onReset && (
                <button onClick={onReset} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-800 hover:bg-zinc-700 rounded px-2 py-1 shrink-0">
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              )}
              <RadixDialog.Close className="text-zinc-500 hover:text-white transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </RadixDialog.Close>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {children}
          </div>

          {footer && (
            <div className="shrink-0">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-3 px-5 py-2.5 border-t border-zinc-800 bg-zinc-900">
      {children}
    </div>
  );
}
