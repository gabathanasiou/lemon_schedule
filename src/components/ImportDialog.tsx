import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useProject, DEFAULT_CATEGORY_LABELS } from '../store';
import { parseFDX, parseFountain, parseCSV, ImportResult, ImportCharacter, commitImport, buildCastIdMap, firstFreeCastId, fileBaseTitle } from '../lib/import';
import { Upload, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { pickerAccept } from '../lib/device';
import { CastAssignmentTable, CategoryChecklist, RenameProjectField } from './import/ImportReviewControls';

interface ImportDialogProps {
  initialResult?: ImportResult;
  initialFileName?: string;
  onClose: () => void;
  fileFilter?: string;
}

/** Plain **append** import: every parsed scene becomes a new scene (fresh ids,
 *  boneyard). Updating an existing screenplay in place is the separate
 *  `ScriptUpdateModal` (roadmap 38) — never this flow. */
export default function ImportDialog({ initialResult, initialFileName, onClose, fileFilter }: ImportDialogProps) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<'select' | 'parsing' | 'review' | 'importing'>(
    initialResult ? 'review' : 'select'
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(initialResult || null);
  const [castOrder, setCastOrder] = useState<ImportCharacter[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedHidden, setSelectedHidden] = useState<Set<string>>(new Set());
  const [hiddenWithData, setHiddenWithData] = useState<{ key: string; label: string }[]>([]);
  const [fileLabel, setFileLabel] = useState(initialFileName || '');
  const [projectTitle, setProjectTitle] = useState('');

  const startId = useMemo(() => firstFreeCastId(project.castMembers || []), [project.castMembers]);
  // Reuse existing cast ids by name (never duplicate a member on re-import).
  const castAssignments = useMemo(
    () => buildCastIdMap(castOrder, project.castMembers || []),
    [castOrder, project.castMembers],
  );

  useEffect(() => {
    if (stage === 'select') {
      const t = setTimeout(() => fileInputRef.current?.click(), 100);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const prepareParsed = useCallback((parsed: ImportResult, fileBase: string) => {
    setResult(parsed);
    // Default the project name to the script's filename when it has no title.
    setProjectTitle(parsed.title?.trim() || fileBase);

    const taggedKeys = new Set<string>();
    for (const s of parsed.scenes) {
      for (const k of Object.keys(s.taggedElements)) taggedKeys.add(k);
    }
    const hiddenItems: { key: string; label: string }[] = [];
    for (const hk of project.hiddenCategories || []) {
      if (taggedKeys.has(hk)) hiddenItems.push({ key: hk, label: DEFAULT_CATEGORY_LABELS[hk] || hk });
    }
    setHiddenWithData(hiddenItems);
    setSelectedHidden(new Set());
    setCastOrder([...parsed.characters].sort((a, b) => b.scenes.length - a.scenes.length));
    setSelectedCategories(new Set(parsed.unknownCategories));
    setStage('review');
  }, [project.hiddenCategories]);

  useEffect(() => {
    if (initialResult) prepareParsed(initialResult, fileBaseTitle(initialFileName || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileLabel(file.name);
    setStage('parsing');

    try {
      let parsed: ImportResult;
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'fdx') {
        parsed = await parseFDX(file);
      } else if (ext === 'csv') {
        parsed = await parseCSV(file, project.castMembers || [], project.customCategories || [], project.categoryLabels || {});
      } else {
        parsed = await parseFountain(file);
      }

      prepareParsed(parsed, fileBaseTitle(file.name));
    } catch (e: any) {
      setError(e.message || 'Failed to parse file');
      setStage('select');
    }
  }, [prepareParsed, project.castMembers, project.customCategories, project.categoryLabels]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleImport = useCallback(() => {
    if (!result) return;
    setStage('importing');

    commitImport({
      dispatch,
      result,
      castIdMap: castAssignments,
      newCustomCategories: [...selectedCategories],
      existingCastMembers: project.castMembers || [],
      projectTitle: projectTitle.trim() || undefined,
      reEnableCategories: [...selectedHidden],
    });

    onClose();
  }, [result, castAssignments, selectedCategories, selectedHidden, dispatch, project.castMembers, projectTitle, onClose]);

  const newCategoryItems = useMemo(
    () => (result?.unknownCategories || []).map(cat => ({ key: cat, label: cat })),
    [result],
  );

  const footer = (stage === 'select' || stage === 'review') ? (
    <ModalFooter>
      <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
      {stage === 'review' && (
        <ModalFooterButton onClick={handleImport}>
          <Upload className="w-3.5 h-3.5" />
          Import {result?.scenes.length || 0} Scenes
        </ModalFooterButton>
      )}
    </ModalFooter>
  ) : undefined;

  return (
    <Modal open onClose={onClose} title={fileFilter === '.csv' ? 'Import CSV' : 'Import Screenplay / CSV'} icon={<Upload className="w-4 h-4" />} width="max-w-2xl" footer={footer}>
      <div className="px-5 py-4 space-y-4">
        {stage === 'select' && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            >
              <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm font-medium">Drop a screenplay file here</p>
              <p className="text-zinc-600 text-xs mt-1">{fileFilter === '.csv' ? '.csv' : '.fdx, .fountain, .txt, .csv'}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={pickerAccept(fileFilter || ".csv,.fdx,.fountain,.txt")}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-3">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}
          </>
        )}

        {stage === 'parsing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
            <p className="text-zinc-400 text-sm">Parsing {fileLabel}...</p>
          </div>
        )}

        {stage === 'review' && result && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider">File</span>
              <span className="text-zinc-300 text-xs">{fileLabel}</span>
            </div>

            <RenameProjectField value={projectTitle} onChange={setProjectTitle} />

            <div className="flex items-center gap-3">
              <span className="text-zinc-400 text-xs">{result.scenes.length} scenes</span>
              {result.unknownCategories.length > 0 && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="text-amber-400 text-xs">{result.unknownCategories.length} new categories found</span>
                </>
              )}
            </div>

            <CategoryChecklist
              title="New Categories"
              hint="These categories are new in this file."
              items={newCategoryItems}
              selected={selectedCategories}
              onToggle={(key) => {
                const next = new Set(selectedCategories);
                if (next.has(key)) next.delete(key); else next.add(key);
                setSelectedCategories(next);
              }}
            />

            <CategoryChecklist
              title="Hidden Categories"
              hint="These categories were previously hidden but contain data in this file."
              items={hiddenWithData}
              selected={selectedHidden}
              onToggle={(key) => {
                const next = new Set(selectedHidden);
                if (next.has(key)) next.delete(key); else next.add(key);
                setSelectedHidden(next);
              }}
            />

            <CastAssignmentTable castOrder={castOrder} onReorder={setCastOrder} startId={startId} ids={castOrder.map(ch => castAssignments.get(ch.name))} />
          </>
        )}
      </div>
    </Modal>
  );
}
