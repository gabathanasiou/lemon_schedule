import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
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
    setDialog(null);
  }, []);

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

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dialog.kind === 'confirm') dialog.resolve(false);
        else if (dialog.kind === 'prompt') dialog.resolve(null);
        else dialog.resolve();
        setDialog(null);
      }
      if (e.key === 'Enter') {
        if (dialog.kind === 'confirm') { dialog.resolve(true); setDialog(null); }
        if (dialog.kind === 'alert') { dialog.resolve(); setDialog(null); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  const resolvePrompt = () => {
    if (!dialog || dialog.kind !== 'prompt') return;
    dialog.resolve(inputRef.current?.value?.trim() || null);
    setDialog(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt, alert }}>
      {children}

      {dialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => {
          if (dialog.kind === 'confirm') { dialog.resolve(false); setDialog(null); }
          else if (dialog.kind === 'prompt') { dialog.resolve(null); setDialog(null); }
          else { dialog.resolve(); setDialog(null); }
        }}>
          <div
            className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{dialog.options.title}</h3>
              <button onClick={() => {
                if (dialog.kind === 'confirm') dialog.resolve(false);
                else if (dialog.kind === 'prompt') dialog.resolve(null);
                else dialog.resolve();
                setDialog(null);
              }} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {dialog.options.message && (
              <p className="text-xs text-zinc-400 leading-relaxed">{dialog.options.message}</p>
            )}

            {dialog.kind === 'prompt' && (
              <input
                ref={inputRef}
                type="text"
                defaultValue={dialog.options.defaultValue || ''}
                placeholder={dialog.options.placeholder}
                onKeyDown={e => { if (e.key === 'Enter') resolvePrompt(); }}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {dialog.kind !== 'alert' && (
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
                  if (dialog.kind === 'confirm') { dialog.resolve(true); setDialog(null); }
                  else if (dialog.kind === 'prompt') resolvePrompt();
                  else { dialog.resolve(); setDialog(null); }
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  dialog.kind === 'confirm' && dialog.options.danger
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-white text-zinc-900 hover:bg-zinc-200'
                }`}
              >
                {dialog.kind === 'alert' ? 'OK' : dialog.kind === 'confirm' ? 'Confirm' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
