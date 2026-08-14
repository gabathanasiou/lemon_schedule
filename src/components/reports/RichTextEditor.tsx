import React, { useEffect, useImperativeHandle, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { sanitizeRichText } from '../../lib/richText';
import { ReportFieldDef, searchReportFields } from '../../lib/reportFields';
import { Token, preprocessTokenHtml, stripTokenWrappers } from '../../lib/reportTokenExtension';
import { TokenSuggestion } from './TokenSuggestionPopup';

// TipTap-based rich-text editor for report text blocks. Stored value is
// sanitized HTML (see lib/richText.ts) where `{{field}}` tokens are PLAIN text.
// In the editor, tokens are engine-native atom nodes (see
// lib/reportTokenExtension.ts) with a React chip view; the `@` autocomplete is
// the TipTap suggestion plugin reusing the existing popup visuals. Storage is
// untouched: getHTML emits bare `{{field}}` text, so saved projects, print,
// preview and the canvas keep working byte-compatibly.
//
// `{{` is NOT a trigger — only `@` (user decision).

export interface RichTextEditorHandle {
  exec: (command: string, value?: string) => void;
  focus: () => void;
  /** Inserts a `{{field}}` token node at the caret. */
  insertToken: (field: string) => void;
}

/** Formatting state at the caret/selection — drives the toolbar's toggle lighting. */
export interface RichTextState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  link: boolean;
  color: string;
}

export const RICH_TEXT_STATE_IDLE: RichTextState = { bold: false, italic: false, underline: false, strike: false, link: false, color: '' };

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Scope-filtered attributes for the `@` token autocomplete. */
  fields?: ReportFieldDef[];
  /** Fired whenever the caret/selection moves or formatting changes. */
  onStateChange?: (state: RichTextState) => void;
}

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(({ value, onChange, placeholder, disabled, className, fields, onStateChange }, ref) => {
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const reportState = (ed: NonNullable<ReturnType<typeof useEditor>>) => {
    onStateChangeRef.current?.({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      link: ed.isActive('link'),
      color: (ed.getAttributes('textStyle').color as string | undefined) || '',
    });
  };

  // Storage form of the editor state: stripped tokens → sanitized; an
  // emptied doc serializes as empty paragraphs — store '' like the old
  // editor so hideBlock/hideText keep working.
  const toStorage = (html: string): string => {
    const clean = sanitizeRichText(stripTokenWrappers(html));
    return /^(<p[^>]*>(?:<br\s*\/?>)?<\/p>)+$/.test(clean) ? '' : clean;
  };

  // Stable per-fields instance: rebuilding the extension mid-session would
  // recreate the editor and drop the caret.
  const tokenExtension = React.useMemo(() => {
    const suggestion: Omit<SuggestionOptions<ReportFieldDef, { field: string }>, 'editor'> = {
      char: '@',
      // default allowedPrefixes (space) — a mid-word `@` does not trigger
      items: ({ query }) => searchReportFields(fieldsRef.current, query),
      command: ({ editor: ed, range, props }) => {
        ed.chain().focus().insertContentAt(range, { type: 'token', attrs: { field: props.field } }).run();
      },
      render: TokenSuggestion,
    };
    return Token.configure({ fields: fields ?? [], suggestion } as unknown as Parameters<typeof Token.configure>[0]);
  }, [fields]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      Underline,
      // Links: typed/pasted URLs auto-link; anchors open in a new tab and are
      // inert while editing (openOnClick false). Stored HTML keeps the <a>
      // (sanitizer whitelists it) so print/PDF anchors stay clickable.
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { target: '_blank', rel: 'noreferrer' },
      }),
      tokenExtension,
    ],
    content: preprocessTokenHtml(value || ''),
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current(toStorage(ed.getHTML()));
      reportState(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => reportState(ed),
  });

  // External value sync — only while the editor isn't focused (typing never
  // resets the caret). Compare in storage form so the comparison is a no-op
  // when the editor state already matches the stored value.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = toStorage(editor.getHTML());
    if (current !== value) {
      editor.commands.setContent(preprocessTokenHtml(value || ''), { emitUpdate: false });
      reportState(editor);
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  // Initial state report (mount/remount — e.g. switching blocks or surfaces).
  useEffect(() => {
    if (!editor) return;
    reportState(editor);
  }, [editor]);

  useImperativeHandle(ref, () => ({
    exec: (command: string, execValue?: string) => {
      if (!editor || disabledRef.current) return;
      switch (command) {
        case 'bold': editor.chain().focus().toggleBold().run(); break;
        case 'italic': editor.chain().focus().toggleItalic().run(); break;
        case 'underline': editor.chain().focus().toggleUnderline().run(); break;
        case 'strikeThrough': editor.chain().focus().toggleStrike().run(); break;
        case 'foreColor': editor.chain().focus().setColor(execValue).run(); break;
        case 'link': if (execValue) editor.chain().focus().extendMarkRange('link').setLink({ href: execValue }).run(); break;
        case 'unlink': editor.chain().focus().extendMarkRange('link').unsetLink().run(); break;
        default: break;
      }
    },
    focus: () => editor?.commands.focus(),
    insertToken: (field: string) => {
      if (!editor || disabledRef.current) return;
      editor.chain().focus().insertContent({ type: 'token', attrs: { field } }).run();
    },
  }), [editor]);

  return (
    <EditorContent editor={editor} className={`richtext-editor ${className || ''}`} />
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
