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
  const contentRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const resizeRef = useRef<{ dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'; startX: number; startY: number; startL: number; startT: number; startW: number; startH: number } | null>(null);

  const isDragging = dragRef.current !== null;
  const isResizing = resizeRef.current !== null;

  useEffect(() => {
    if (!dialog) { setDragPos(null); setSize(null); }
  }, [dialog]);

  const captureRect = useCallback((): { left: number; top: number; width: number; height: number } | null => {
    const el = contentRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = captureRect(); if (!r) return;
    setDragPos(r); setSize({ w: r.width, h: r.height });
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: r.left, posY: r.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [captureRect]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setDragPos({ left: d.posX + e.clientX - d.startX, top: d.posY + e.clientY - d.startY });
  }, []);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  const startResize = useCallback((dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const r = captureRect(); if (!r) return;
    setDragPos(r); setSize({ w: r.width, h: r.height });
    resizeRef.current = { dir, startX: e.clientX, startY: e.clientY, startL: r.left, startT: r.top, startW: r.width, startH: r.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [captureRect]);

  const MIN_W = 200, MIN_H = 100, MAX_EDGE = 32;

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    const rs = resizeRef.current;
    if (!rs) return;
    const dx = e.clientX - rs.startX;
    const dy = e.clientY - rs.startY;
    let newW = rs.startW, newH = rs.startH, newL = rs.startL, newT = rs.startT;

    if (rs.dir.includes('e')) newW = rs.startW + dx;
    if (rs.dir.includes('w')) { newW = rs.startW - dx; newL = rs.startL + dx; }
    if (rs.dir.includes('s')) newH = rs.startH + dy;
    if (rs.dir.includes('n')) { newH = rs.startH - dy; newT = rs.startT + dy; }

    const vw = window.innerWidth, vh = window.innerHeight;
    newW = Math.max(MIN_W, Math.min(newW, vw - MAX_EDGE * 2));
    newH = Math.max(MIN_H, Math.min(newH, vh - MAX_EDGE * 2));
    if (rs.dir.includes('w')) newL = Math.max(MAX_EDGE, Math.min(newL, vw - newW - MAX_EDGE));
    if (rs.dir.includes('n')) newT = Math.max(MAX_EDGE, Math.min(newT, vh - newH - MAX_EDGE));

    setSize({ w: newW, h: newH });
    setDragPos({ left: newL, top: newT });
  }, []);

  const onResizeUp = useCallback(() => { resizeRef.current = null; }, []);

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

      <RadixDialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }} modal={true}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-[10000] bg-black/20" />
          <RadixDialog.Content
            ref={contentRef}
            className={`fixed z-[10000] bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-5 space-y-4 focus:outline-none ${dragPos || size ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'} ${size ? '' : 'w-full max-w-sm'}`}
            style={{ ...(dragPos ? { left: dragPos.left, top: dragPos.top } : {}), ...(size ? { width: size.w, height: size.h } : {}) }}
            onEscapeKeyDown={(e) => {
              close();
              e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              close();
              e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (dialog?.kind === 'prompt' && e.target instanceof HTMLInputElement) return;
                e.preventDefault();
                if (!dialog) return;
                if (dialog.kind === 'confirm') { dialog.resolve(true); setDialog(null); }
                else if (dialog.kind === 'prompt') resolvePrompt();
                else { dialog.resolve(); setDialog(null); }
              }
            }}
          >
            <div
              className={`flex items-center justify-between select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
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
                    : 'bg-zinc-800 text-white hover:bg-zinc-700'
                }`}
              >
                {dialog?.kind === 'alert' ? 'OK' : dialog?.kind === 'confirm' ? 'Confirm' : 'Save'}
              </button>
            </div>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-2 right-2 top-0 h-[6px] cursor-n-resize pointer-events-auto" onPointerDown={startResize('n')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
              <div className="absolute left-2 right-2 bottom-0 h-[6px] cursor-s-resize pointer-events-auto" onPointerDown={startResize('s')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
              <div className="absolute top-2 bottom-2 left-0 w-[6px] cursor-w-resize pointer-events-auto" onPointerDown={startResize('w')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
              <div className="absolute top-2 bottom-2 right-0 w-[6px] cursor-e-resize pointer-events-auto" onPointerDown={startResize('e')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
              <div className="absolute top-0 left-0 w-[10px] h-[10px] cursor-nw-resize pointer-events-auto" onPointerDown={startResize('nw')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
              <div className="absolute top-0 right-0 w-[10px] h-[10px] cursor-ne-resize pointer-events-auto" onPointerDown={startResize('ne')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
              <div className="absolute bottom-0 left-0 w-[10px] h-[10px] cursor-sw-resize pointer-events-auto" onPointerDown={startResize('sw')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
              <div className="absolute bottom-0 right-0 w-[10px] h-[10px] cursor-se-resize pointer-events-auto" onPointerDown={startResize('se')} onPointerMove={onResizeMove} onPointerUp={onResizeUp} />
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </DialogContext.Provider>
  );
}
