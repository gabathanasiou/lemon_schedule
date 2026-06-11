import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  defaultValue?: string;
  placeholder?: string;
}

interface AlertOptions {
  title: string;
  message?: string;
}

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }
  | null;

interface DialogContextType {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  alert: (opts: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    if (dialog) {
      if (dialog.kind === 'confirm') dialog.resolve(false);
      else if (dialog.kind === 'prompt') dialog.resolve(null);
      else dialog.resolve();
      setDialog(null);
    }
  }, [dialog]);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setDialog({ kind: 'confirm', options: opts, resolve });
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions): Promise<string | null> => {
    return new Promise(resolve => {
      setDialog({ kind: 'prompt', options: opts, resolve });
    });
  }, []);

  const alert = useCallback((opts: AlertOptions): Promise<void> => {
    return new Promise(resolve => {
      setDialog({ kind: 'alert', options: opts, resolve });
    });
  }, []);

  useEffect(() => {
    if (dialog) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [dialog]);

  const resolvePrompt = () => {
    if (!dialog || dialog.kind !== 'prompt') return;
    dialog.resolve(inputRef.current?.value?.trim() || null);
    setDialog(null);
  };

  const open = dialog !== null;

  return (
    <DialogContext.Provider value={{ confirm, prompt, alert }}>
      {children}

      <RadixDialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }} modal={false}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-[10000] bg-black/50" />
          <RadixDialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4 focus:outline-none"
            onEscapeKeyDown={(e) => {
              close();
              e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              close();
              e.preventDefault();
            }}
          >
            <div className="flex items-center justify-between">
              <RadixDialog.Title className="text-sm font-bold text-white">
                {dialog?.options.title}
              </RadixDialog.Title>
              <RadixDialog.Close className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </RadixDialog.Close>
            </div>

            {dialog?.options.message && (
              <RadixDialog.Description className="text-xs text-zinc-400 leading-relaxed">
                {dialog.options.message}
              </RadixDialog.Description>
            )}

            {dialog?.kind === 'prompt' && (
              <input
                ref={inputRef}
                type="text"
                defaultValue={dialog.options.defaultValue || ''}
                placeholder={dialog.options.placeholder}
                onKeyDown={e => { if (e.key === 'Enter') resolvePrompt(); }}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {dialog?.kind !== 'alert' && (
                <button
                  onClick={() => {
                    if (dialog.kind === 'confirm') { dialog.resolve(false); setDialog(null); }
                    else if (dialog.kind === 'prompt') { dialog.resolve(null); setDialog(null); }
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  if (!dialog) return;
                  if (dialog.kind === 'confirm') { dialog.resolve(true); setDialog(null); }
                  else if (dialog.kind === 'prompt') resolvePrompt();
                  else { dialog.resolve(); setDialog(null); }
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  dialog?.kind === 'confirm' && dialog.options.danger
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-white text-zinc-900 hover:bg-zinc-200'
                }`}
              >
                {dialog?.kind === 'alert' ? 'OK' : dialog?.kind === 'confirm' ? 'Confirm' : 'Save'}
              </button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </DialogContext.Provider>
  );
}
