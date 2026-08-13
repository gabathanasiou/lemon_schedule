import React, { useEffect, useImperativeHandle, useRef } from 'react';
import { sanitizeRichText } from '../../lib/richText';

// contentEditable rich-text editor for report text blocks. Stored value is
// sanitized HTML (see lib/richText.ts). Formatting commands run through
// execCommand with styleWithCSS so they produce spans with inline styles the
// sanitizer whitelists. External value syncs only while the editor isn't
// focused (typing never resets the caret). `{{field}}` tokens are plain text
// and survive sanitization untouched.

export interface RichTextEditorHandle {
  exec: (command: string, value?: string) => void;
  focus: () => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(({ value, onChange, placeholder, disabled, className }, ref) => {
  const elRef = useRef<HTMLDivElement>(null);

  const sync = () => {
    const el = elRef.current;
    if (!el || el.innerHTML === value) return;
    el.innerHTML = value || '';
  };

  useEffect(() => {
    const el = elRef.current;
    if (!el || document.activeElement === el) return;
    if (el.innerHTML !== value) el.innerHTML = value || '';
  }, [value]);

  useImperativeHandle(ref, () => ({
    exec: (command: string, execValue?: string) => {
      const el = elRef.current;
      if (!el || disabled) return;
      el.focus();
      try {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand(command, false, execValue);
      } catch { /* execCommand can throw in odd states */ }
      onChange(sanitizeRichText(el.innerHTML));
    },
    focus: () => elRef.current?.focus(),
  }), [disabled, onChange]);

  return (
    <div
      ref={elRef}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      className={`richtext-editor ${className || ''}`}
      onInput={e => onChange(sanitizeRichText((e.currentTarget as HTMLDivElement).innerHTML))}
      onPaste={e => {
        // let the browser paste; the sanitizer runs onInput right after
        setTimeout(() => onChange(sanitizeRichText(elRef.current?.innerHTML || '')), 0);
      }}
      onBlur={() => {
        const el = elRef.current;
        if (el) onChange(sanitizeRichText(el.innerHTML));
      }}
    />
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
