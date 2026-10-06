import React, { useState } from 'react';
import { FontMenu, TB_DIVIDER, TB_NUM, TB_PICKER, TB_TOGGLE, TB_TOGGLE_OFF, TB_TOGGLE_ON } from '@gabriel/ui-kit';
import { Project, ReportTextStyle } from '../../types';
import { getTextStyles, newTextStyle } from '../../lib/reportTextStyles';
import DropdownMenu, { ItemManagerDropdown } from '../DropdownMenu';
import { LiveNumberInput } from '../LiveNumberInput';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { EditorGroup } from './reportEditorLayout';
import { Check, ChevronDown, Pencil, Wand2 } from 'lucide-react';
import { RichTextEditorHandle } from './RichTextEditor';

// Named text styles (Word/Pages-like): the picker + its manager modal. Extracted
// from blockControls (roadmap 191) so the shared RichTextControls body and the
// field/link StyleControls can both consume them without a circular import.

export const TextStyleMenu: React.FC<{
  value: string;
  project: Project;
  disabled: boolean;
  onChange: (id: string) => void;
  onEdit: () => void;
  onUpdateFromSelection?: () => void;
  /** Run-level target (roadmap 193): when the editor has a text selection the
   *  pick marks the RUN (`exec('textStyle', id)`, linked to the registry) and
   *  holds the ghost highlight while the menu is open. Without a selection the
   *  pick patches the object (`onChange`, Word-style paragraph default). */
  editorRef?: React.RefObject<RichTextEditorHandle | null>;
  hasSelection?: boolean;
  /** The selection spans different linked ids — show Mixed on the trigger. */
  mixed?: boolean;
}> = ({ value, project, disabled, onChange, onEdit, onUpdateFromSelection, editorRef, hasSelection, mixed }) => {
  const [open, setOpen] = useState(false);
  const styles = getTextStyles(project);
  const current = styles.find(s => s.id === value);
  React.useEffect(() => {
    if (!open || !hasSelection) return;
    editorRef?.current?.holdSelectionHighlight(true);
    return () => editorRef?.current?.holdSelectionHighlight(false);
  }, [open, hasSelection, editorRef]);
  const pick = (id: string) => {
    if (hasSelection && editorRef?.current) editorRef.current.exec(id ? 'textStyle' : 'unsetTextStyle', id || undefined);
    else onChange(id);
    setOpen(false);
  };
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width="w-52"
      trigger={
        <button type="button" disabled={disabled} className={`${TB_PICKER} w-32 disabled:pointer-events-none`}>
          <span className="truncate">{hasSelection && mixed ? 'Mixed' : current ? current.name : 'Direct formatting'}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
        </button>
      }
    >
      <DropdownItem onClick={() => pick('')} icon={!value ? <Check className="w-3.5 h-3.5" /> : undefined}>
        Direct formatting
      </DropdownItem>
      <DropdownDivider />
      {styles.map(s => (
        <DropdownItem key={s.id} onClick={() => pick(s.id)} icon={s.id === value ? <Check className="w-3.5 h-3.5" /> : undefined}>
          <span style={{ fontSize: s.fontSize, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', fontFamily: s.fontFamily || 'Helvetica' }}>{s.name}</span>
        </DropdownItem>
      ))}
      <DropdownDivider />
      {onUpdateFromSelection && !hasSelection && (
        <DropdownItem onClick={() => { onUpdateFromSelection(); setOpen(false); }} icon={<Wand2 className="w-3.5 h-3.5" />}>
          Update “{current?.name || 'style'}” from selection
        </DropdownItem>
      )}
      <DropdownItem onClick={() => { onEdit(); setOpen(false); }} icon={<Pencil className="w-3.5 h-3.5" />}>
        Edit styles…
      </DropdownItem>
    </DropdownMenu>
  );
};

export const TextStylesModal: React.FC<{
  open: boolean;
  project: Project;
  onClose: () => void;
  onSave: (styles: ReportTextStyle[]) => void;
}> = ({ open, project, onClose, onSave }) => {
  const [draft, setDraft] = useState<ReportTextStyle[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const styles = draft ?? getTextStyles(project);
  const sel = styles.find(s => s.id === selId) ?? styles[0];
  const set = (next: ReportTextStyle[]) => setDraft(next);
  const patchId = (id: string, p: Partial<ReportTextStyle>) => set(styles.map(s => s.id === id ? { ...s, ...p } : s));
  const patch = (p: Partial<ReportTextStyle>) => sel && patchId(sel.id, p);
  const commit = () => { onSave(draft ?? styles); setDraft(null); setSelId(null); onClose(); };
  const close = () => { setDraft(null); setSelId(null); onClose(); };

  // Fresh editing state each time the modal opens (registry → draft).
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(null);
      setImportErr(null);
      setSelId(getTextStyles(project)[0]?.id ?? null);
    }
    wasOpen.current = open;
  }, [open, project]);

  const styleCss = (s: ReportTextStyle): React.CSSProperties => ({
    fontFamily: s.fontFamily || 'Helvetica',
    fontSize: s.fontSize,
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? 'italic' : 'normal',
  });

  const exportStyles = () => {
    const blob = new Blob([JSON.stringify(styles, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report-text-styles.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const importStyles = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(s => s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.fontSize === 'number')) {
          throw new Error('bad shape');
        }
        set(parsed as ReportTextStyle[]);
        setSelId((parsed[0] as ReportTextStyle).id);
        setImportErr(null);
      } catch {
        setImportErr("Couldn't import — not a valid styles file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Text styles"
      width="max-w-[440px]"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={close}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={commit}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-5 space-y-3">
        <p className="text-xs text-zinc-500">Edits update every block that uses the style.</p>

        {/* Style picker (version-picker recipe) + the rich-text Format-bar
            controls for the style's typography — same chrome as the editors. */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          <ItemManagerDropdown
            open={pickerOpen}
            onClose={setPickerOpen}
            items={styles.map(s => ({ id: s.id, name: s.name }))}
            activeId={sel?.id || ''}
            closeOnSelect
            onSelect={id => setSelId(id)}
            onRename={(id, name) => patchId(id, { name })}
            onDuplicate={id => {
              const s = styles.find(x => x.id === id);
              if (!s) return;
              const copy = { ...s, id: newTextStyle('', []).id, name: `${s.name} Copy` };
              set([...styles, copy]);
              setSelId(copy.id);
              return copy.id;
            }}
            onDelete={id => {
              const next = styles.filter(s => s.id !== id);
              if (next.length === styles.length) return;
              set(next);
              if (id === selId) setSelId(next[0]?.id ?? null);
            }}
            onCreate={() => {
              const s = newTextStyle(`Style ${styles.length + 1}`, styles);
              set([...styles, s]);
              setSelId(s.id);
              return s.id;
            }}
            onImport={() => fileRef.current?.click()}
            onExport={exportStyles}
            theme="dark"
            label="Style"
            header="TEXT STYLES"
            itemLabel="Style"
            itemRender={s => {
              const st = styles.find(x => x.id === s.id);
              return st ? <span className="truncate" style={styleCss(st)}>{s.name}</span> : s.name;
            }}
            trigger={
              <button type="button" className={`${TB_PICKER} w-36`}>
                <span className="truncate">{sel ? sel.name : 'No styles'}</span>
                <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
              </button>
            }
          />
          {sel && (
            <>
              <div className={TB_DIVIDER} />
              <EditorGroup>
                <button
                  title="Bold"
                  onClick={() => patch({ bold: !sel.bold })}
                  className={`${TB_TOGGLE} font-bold ${sel.bold ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}
                >B</button>
                <button
                  title="Italic"
                  onClick={() => patch({ italic: !sel.italic })}
                  className={`${TB_TOGGLE} italic ${sel.italic ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}
                >I</button>
              </EditorGroup>
              <div className={TB_DIVIDER} />
              <EditorGroup>
                <FontMenu value={sel.fontFamily || 'Helvetica'} disabled={false} onChange={f => patch({ fontFamily: f === 'Helvetica' ? undefined : f })} />
                <LiveNumberInput
                  value={sel.fontSize}
                  min={6}
                  max={72}
                  fallback={10}
                  className={TB_NUM}
                  onCommit={v => patch({ fontSize: v })}
                  title="Font size (pt)"
                />
              </EditorGroup>
            </>
          )}
        </div>

        {/* live preview — paper white so it matches print; wraps inside the
            modal width (never widens it) */}
        {sel && (
          <div className="rounded-md border border-zinc-700 bg-white px-3 py-2">
            <div className="leading-snug break-words" style={{ ...styleCss(sel), color: '#000' }}>
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
        )}

        {importErr && <p className="text-xs text-red-400">{importErr}</p>}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importStyles(f); }}
        />
      </div>
    </Modal>
  );
};
