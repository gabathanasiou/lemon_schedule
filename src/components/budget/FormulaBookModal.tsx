import React, { useMemo, useState } from 'react';
import { BookOpen, CornerDownLeft } from 'lucide-react';
import { inputCls } from '@gabriel/ui-kit';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import { formulaBookKindLabel, searchFormulaBook, type FormulaBookEntry } from '../../lib/budget/formulaBook';

/** The searchable formula reference (roadmap 346) — ONE modal shared by every
 *  `FormulaField`; the field keeps its caret/insert logic and supplies the
 *  registry entries. Extracted so the Modals Studio can preview it without
 *  opening a budget sheet. */
export function FormulaBookModal({
  open, onClose, entries, readOnly, onInsert,
}: {
  open: boolean;
  onClose: () => void;
  entries: FormulaBookEntry[];
  readOnly?: boolean;
  onInsert: (entry: FormulaBookEntry) => void;
}) {
  const [query, setQuery] = useState('');
  const bookEntries = useMemo(() => searchFormulaBook(entries, query), [entries, query]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Formula book"
      icon={<BookOpen className="w-3.5 h-3.5" />}
      width="max-w-lg"
      footer={<ModalFooter><ModalFooterButton onClick={onClose}>Done</ModalFooterButton></ModalFooter>}
    >
      <div className="p-5 space-y-3">
        <input
          className={`${inputCls('md')} w-full`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbols and functions…"
          aria-label="Search the formula book"
          autoFocus
        />
        {(['system', 'project', 'function'] as const).map(kind => {
          const rows = bookEntries.filter(entry => entry.kind === kind);
          if (rows.length === 0) return null;
          return (
            <section key={kind} className="space-y-1">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)]">{formulaBookKindLabel(kind)}</h3>
              {rows.map(entry => (
                <div key={`${entry.kind}:${entry.key}`} className="flex items-start gap-2 rounded-md border border-[color:var(--ui-border)] px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-semibold text-[color:var(--ui-text-strong)]">
                      {entry.key}{entry.kind === 'function' ? '(…)' : ''}
                      {entry.value !== undefined && <span className="ml-2 font-sans text-[10px] font-normal text-[color:var(--ui-text-faint)]">= {entry.value}</span>}
                    </p>
                    <p className="text-[10px] text-[color:var(--ui-text-muted)]">{entry.detail}</p>
                    {entry.example && <p className="text-[10px] font-mono text-[color:var(--ui-text-faint)] mt-0.5">{entry.example}</p>}
                  </div>
                  <Button variant="subtle" onClick={() => { onInsert(entry); onClose(); }} disabled={readOnly} title={`Insert ${entry.key}`}>
                    <CornerDownLeft className="w-3.5 h-3.5" /> Insert
                  </Button>
                </div>
              ))}
            </section>
          );
        })}
        {bookEntries.length === 0 && <p className="text-xs text-[color:var(--ui-text-faint)]">No symbols or functions match “{query}”.</p>}
      </div>
    </Modal>
  );
}
