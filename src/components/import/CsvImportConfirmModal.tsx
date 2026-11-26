import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import type { GlideCsvImport } from '../../lib/glideShell';

interface CsvImportConfirmModalProps {
  open: boolean;
  /** The database's import title, e.g. "Import Crew CSV". */
  title: string;
  /** Parsed rows awaiting confirmation — null while no file is pending. */
  result: GlideCsvImport | null;
  fileName: string;
  /** What a row is, e.g. "crew members". */
  importNoun: string;
  /** How the import merges/creates, from the database's config. */
  importSummary: string;
  onClose: () => void;
  onImport: () => void;
}

/** CSV import review for the shared Glide database shell (Crew/Locations). */
export default function CsvImportConfirmModal({
  open,
  title,
  result,
  fileName,
  importNoun,
  importSummary,
  onClose,
  onImport,
}: CsvImportConfirmModalProps) {
  if (!result) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={onImport}>Import</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <p className="text-xs text-[color:var(--ui-text-muted)] leading-relaxed">
          <span className="text-[color:var(--ui-input-text)] font-semibold">{result.count}</span> {importNoun} in <span className="text-[color:var(--ui-input-text)] font-semibold">{fileName}</span>. {importSummary}
        </p>
        {result.newCategories.length > 0 && (
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)] mb-1.5">
              {result.newCategories.length} new {result.newCategories.length === 1 ? 'category' : 'categories'}
            </h4>
            <div className="flex flex-wrap gap-1">
              {result.newCategories.map(c => (
                <span key={c.key} className="text-[11px] bg-[var(--ui-input-bg)] border border-[color:var(--ui-card-border)] rounded px-2 py-0.5 text-[color:var(--ui-text)]">{c.label}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
