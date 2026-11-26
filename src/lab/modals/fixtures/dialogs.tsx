import React, { useEffect, useState } from 'react';
import { MessageSquare, ShieldAlert, Sparkles } from 'lucide-react';
import { useDialog } from '../../../components/Dialog';
import Button from '../../../components/Button';
import type { SurfaceRender } from '../types';

/** The imperative kit dialog has no component prop surface — the fixture
 *  OPENS the real dialog on mount (and again on "Show again"), so the studio
 *  previews the actual confirm/prompt/alert ladder, not a screenshot. */

type DialogVariant = 'confirm' | 'danger' | 'suppress' | 'prompt' | 'alert';

const COPY: Record<DialogVariant, { title: string; message: string; hint: string; icon: React.ReactNode }> = {
  confirm: {
    title: 'Delete Scene 12?',
    message: 'The scene and its stripboard row will be removed. You can undo this.',
    hint: 'useDialog().confirm — Cancel / Delete.',
    icon: <MessageSquare className="h-3.5 w-3.5" />,
  },
  danger: {
    title: 'Delete this version?',
    message: 'Its rows, call times and day details move to the version trash for 30 days.',
    hint: 'confirm({ danger: true }) — the red primary.',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
  },
  suppress: {
    title: 'Delete the banner?',
    message: 'This note will be removed from the stripboard.',
    hint: 'confirm({ suppressKey }) — adds “Don’t ask again (24 hours)”.',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
  },
  prompt: {
    title: 'Rename version',
    message: 'Give this schedule version a name.',
    hint: 'useDialog().prompt — text field + Cancel / Save.',
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  alert: {
    title: 'Nothing to undo',
    message: 'There are no more edits in this session’s history.',
    hint: 'useDialog().alert — message + one Dismiss action.',
    icon: <MessageSquare className="h-3.5 w-3.5" />,
  },
};

const DialogPreview: React.FC<{ variant: DialogVariant }> = ({ variant }) => {
  const dialog = useDialog();
  const [run, setRun] = useState(0);
  const copy = COPY[variant];

  useEffect(() => {
    const open = async () => {
      if (variant === 'confirm') {
        await dialog.confirm({ title: copy.title, message: copy.message });
      } else if (variant === 'danger') {
        await dialog.confirm({ title: copy.title, message: copy.message, danger: true });
      } else if (variant === 'suppress') {
        await dialog.confirm({ title: copy.title, message: copy.message, danger: true, suppressKey: 'lab-banner-delete' });
      } else if (variant === 'prompt') {
        await dialog.prompt({ title: copy.title, message: copy.message, defaultValue: 'Director’s cut', placeholder: 'Version name' });
      } else {
        await dialog.alert({ title: copy.title, message: copy.message });
      }
    };
    void open();
    // The dialog API is stable; re-open only when the variant or the user's
    // "Show again" changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, run]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-5 text-center">
        <span className="text-[color:var(--ui-text-muted)]">{copy.icon}</span>
        <div className="text-xs font-semibold text-[color:var(--ui-text-strong)]">{copy.title}</div>
        <p className="text-[11px] leading-relaxed text-[color:var(--ui-text-muted)]">{copy.hint}</p>
        <Button theme="dark" variant="outline" size="minimal" onClick={() => setRun((n) => n + 1)}>
          Show dialog again
        </Button>
      </div>
    </div>
  );
};

export const render: Record<'dialog-confirm' | 'dialog-danger' | 'dialog-suppress' | 'dialog-prompt' | 'dialog-alert', SurfaceRender> = {
  'dialog-confirm': () => <DialogPreview variant="confirm" />,
  'dialog-danger': () => <DialogPreview variant="danger" />,
  'dialog-suppress': () => <DialogPreview variant="suppress" />,
  'dialog-prompt': () => <DialogPreview variant="prompt" />,
  'dialog-alert': () => <DialogPreview variant="alert" />,
};
