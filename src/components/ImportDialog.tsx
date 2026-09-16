import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useProject, DEFAULT_CATEGORY_LABELS, makeBlankProject } from '../store';
import { parseFDX, parseFountain, parseCSV, ImportResult, ImportCharacter, commitImport, buildProjectFromImport, buildCastIdMap, firstFreeCastId, fileBaseTitle, collectUnknownHeadingValues, applyHeadingMapping, buildHeadingMappingUpdate, knownIntExtValues, knownDayNightValues, knownDayNightPhrases } from '../lib/import';
import type { HeadingMapping, AppliedHeadingMapping } from '../lib/import';
import HeadingValueMapper from './import/HeadingValueMapper';
import { Upload, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import { pickerAccept } from '../lib/device';
import { CastAssignmentTable, CategoryChecklist, RenameProjectField } from './import/ImportReviewControls';
import type { Project } from '../types';

interface ImportDialogProps {
  initialResult?: ImportResult;
  initialFileName?: string;
  onClose: () => void;
  fileFilter?: string;
  /** `append` (default) adds the reviewed scenes to the open project;
   *  `new-project` builds a brand-new project from them (roadmap 129/131). */
  mode?: 'append' | 'new-project';
  /** new-project mode: receives the finished Project (the caller loads it). */
  onCreateProject?: (project: Project) => void | Promise<void>;
}

/** Plain import review. **Append** mode adds every parsed scene to the open
 *  project (fresh ids, boneyard) — updating in place is the separate
 *  `ScriptUpdateModal` (roadmap 38). **New-project** mode runs the SAME review
 *  (rename, cast Board IDs, categories) but builds a fresh project instead. */
export default function ImportDialog({ initialResult, initialFileName, onClose, fileFilter, mode = 'append', onCreateProject }: ImportDialogProps) {
  const { state, dispatch } = useProject();
  const project = state.present;
  // New-project imports review against a blank project (default Colors options,
  // Board IDs from 1, no existing cast/hidden categories).
  const blankBase = useMemo(() => makeBlankProject(), []);
  const base = mode === 'new-project' ? blankBase : project;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<'select' | 'parsing' | 'mapping' | 'review' | 'importing'>(
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
  const [pendingMapping, setPendingMapping] = useState<{ parsed: ImportResult; fileBase: string; unknown: { intExt: string[]; dayNight: string[] } } | null>(null);
  const [appliedMapping, setAppliedMapping] = useState<AppliedHeadingMapping | null>(null);

  const startId = useMemo(() => firstFreeCastId(base.castMembers || []), [base.castMembers]);
  // Reuse existing cast ids by name (never duplicate a member on re-import).
  const castAssignments = useMemo(
    () => buildCastIdMap(castOrder, base.castMembers || []),
    [castOrder, base.castMembers],
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
    for (const hk of base.hiddenCategories || []) {
      if (taggedKeys.has(hk)) hiddenItems.push({ key: hk, label: DEFAULT_CATEGORY_LABELS[hk] || hk });
    }
    setHiddenWithData(hiddenItems);
    setSelectedHidden(new Set());
    setCastOrder([...parsed.characters].sort((a, b) => b.scenes.length - a.scenes.length));
    setSelectedCategories(new Set(parsed.unknownCategories));
    setStage('review');
  }, [base.hiddenCategories]);

  /** Route a parsed result through the heading-value mapper first when the
   *  script carries unknown/localized INT-EXT or day/night values (127). */
  const startParsed = useCallback((parsed: ImportResult, fileBase: string) => {
    const unknown = collectUnknownHeadingValues(parsed, base);
    if (unknown.intExt.length || unknown.dayNight.length) {
      setPendingMapping({ parsed, fileBase, unknown });
      setStage('mapping');
    } else {
      prepareParsed(parsed, fileBase);
    }
  }, [base, prepareParsed]);

  const confirmMapping = useCallback((mapping: HeadingMapping) => {
    if (!pendingMapping) return;
    const applied = applyHeadingMapping(pendingMapping.parsed, base, mapping);
    setAppliedMapping(applied);
    // Append updates the open project's Colors options + aliases; new-project
    // carries them into the built project instead (never touches the open one).
    if (mode === 'append') {
      dispatch({ type: 'UPDATE_PROJECT', payload: buildHeadingMappingUpdate(base, applied) });
    }
    setPendingMapping(null);
    prepareParsed(applied.result, pendingMapping.fileBase);
  }, [pendingMapping, base, mode, dispatch, prepareParsed]);

  useEffect(() => {
    if (initialResult) startParsed(initialResult, fileBaseTitle(initialFileName || ''));
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
        parsed = await parseFDX(file, knownDayNightPhrases(base));
      } else if (ext === 'csv') {
        parsed = await parseCSV(file, base.castMembers || [], base.customCategories || [], base.categoryLabels || {});
      } else {
        parsed = await parseFountain(file, knownDayNightPhrases(base));
      }

      startParsed(parsed, fileBaseTitle(file.name));
    } catch (e: any) {
      setError(e.message || 'Failed to parse file');
      setStage('select');
    }
  }, [startParsed, base]);

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

    if (mode === 'new-project') {
      let built = buildProjectFromImport(result, projectTitle.trim(), fileBaseTitle(initialFileName || fileLabel), {
        castIdMap: castAssignments,
        newCustomCategories: [...selectedCategories],
      });
      if (appliedMapping) built = { ...built, ...buildHeadingMappingUpdate(base, appliedMapping) };
      void onCreateProject?.(built);
    } else {
      commitImport({
        dispatch,
        result,
        castIdMap: castAssignments,
        newCustomCategories: [...selectedCategories],
        existingCastMembers: project.castMembers || [],
        projectTitle: projectTitle.trim() || undefined,
        reEnableCategories: [...selectedHidden],
      });
    }

    onClose();
  }, [result, mode, castAssignments, selectedCategories, selectedHidden, dispatch, project.castMembers, projectTitle, base, appliedMapping, onCreateProject, initialFileName, fileLabel, onClose]);

  const newCategoryItems = useMemo(
    () => (result?.unknownCategories || []).map(cat => ({ key: cat, label: cat })),
    [result],
  );

  if (stage === 'mapping' && pendingMapping) {
    return (
      <HeadingValueMapper
        unknown={pendingMapping.unknown}
        knownIntExt={knownIntExtValues(base)}
        knownDayNight={knownDayNightValues(base)}
        onCancel={onClose}
        onConfirm={confirmMapping}
      />
    );
  }

  const isNewProject = mode === 'new-project';
  const footer = (stage === 'select' || stage === 'review') ? (
    <ModalFooter>
      <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
      {stage === 'review' && (
        <ModalFooterButton onClick={handleImport}>
          <Upload className="w-3.5 h-3.5" />
          {isNewProject ? 'Create Project' : `Import ${result?.scenes.length || 0} Scenes`}
        </ModalFooterButton>
      )}
    </ModalFooter>
  ) : undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title={isNewProject ? 'New Project from Script' : fileFilter === '.csv' ? 'Import CSV' : 'Import Screenplay / CSV'}
      icon={<Upload className="w-4 h-4" />}
      width="max-w-2xl"
      footer={footer}
    >
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
