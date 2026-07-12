import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useProject, DEFAULT_CATEGORY_LABELS } from '../store';
import { parseFDX, parseFountain, parseCSV, ImportResult, ImportCharacter, commitImport } from '../lib/importScreenplay';
import { Upload, Loader2, GripVertical } from 'lucide-react';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ImportDialogProps {
  initialResult?: ImportResult;
  initialFileName?: string;
  onClose: () => void;
  fileFilter?: string;
}

function SortableCastRow({ character, index, startId }: { character: ImportCharacter; index: number; startId: number; key?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: character.name,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={`border-b border-zinc-800/50 ${index % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/50'}`}>
      <td className="px-3 py-2 text-zinc-300 text-xs font-mono font-medium w-10">
        {startId + index}
      </td>
      <td className="px-3 py-2 text-zinc-200 text-xs font-medium">
        {character.name}
      </td>
      <td className="px-3 py-2 text-zinc-500 text-[10px] font-mono">
        {character.scenes.slice(0, 5).join(', ')}{character.scenes.length > 5 ? '...' : ''}
      </td>
      <td className="px-3 py-2 w-8">
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of project.castMembers || []) ids.add(c.id);
    return ids;
  }, [project.castMembers]);

  const startId = useMemo(() => {
    let n = 1;
    while (existingIds.has(String(n))) n++;
    return n;
  }, [existingIds]);

  useEffect(() => {
    if (stage === 'select') {
      const t = setTimeout(() => fileInputRef.current?.click(), 100);
      return () => clearTimeout(t);
    }
  }, [stage]);

  useEffect(() => {
    if (initialResult) {
      setProjectTitle(initialResult.title || '');
      const taggedKeys = new Set<string>();
      for (const s of initialResult.scenes) {
        for (const k of Object.keys(s.taggedElements)) taggedKeys.add(k);
      }
      const hiddenItems: { key: string; label: string }[] = [];
      for (const hk of project.hiddenCategories || []) {
        if (taggedKeys.has(hk)) {
          hiddenItems.push({ key: hk, label: DEFAULT_CATEGORY_LABELS[hk] || hk });
        }
      }
      setHiddenWithData(hiddenItems);
      setSelectedHidden(new Set());
      const sorted = [...initialResult.characters].sort((a, b) => b.scenes.length - a.scenes.length);
      setCastOrder(sorted);
      const cats = new Set<string>();
      for (const c of initialResult.unknownCategories) cats.add(c);
      setSelectedCategories(cats);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCastOrder(prev => {
      const oldIndex = prev.findIndex(c => c.name === active.id);
      const newIndex = prev.findIndex(c => c.name === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
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

      setResult(parsed);
      setProjectTitle(parsed.title || '');

      const taggedKeys = new Set<string>();
      for (const s of parsed.scenes) {
        for (const k of Object.keys(s.taggedElements)) taggedKeys.add(k);
      }
      const hiddenItems: { key: string; label: string }[] = [];
      for (const hk of project.hiddenCategories || []) {
        if (taggedKeys.has(hk)) {
          hiddenItems.push({ key: hk, label: DEFAULT_CATEGORY_LABELS[hk] || hk });
        }
      }
      setHiddenWithData(hiddenItems);
      setSelectedHidden(new Set());

      const sorted = [...parsed.characters].sort((a, b) => b.scenes.length - a.scenes.length);
      setCastOrder(sorted);

      const cats = new Set<string>();
      for (const c of parsed.unknownCategories) cats.add(c);
      setSelectedCategories(cats);

      setStage('review');
    } catch (e: any) {
      setError(e.message || 'Failed to parse file');
      setStage('select');
    }
  }, []);

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

    const castIdMap = new Map<string, string>();
    castOrder.forEach((ch, i) => {
      castIdMap.set(ch.name, String(startId + i));
    });

    commitImport({
      dispatch,
      result,
      castIdMap,
      newCustomCategories: [...selectedCategories],
      existingCastMembers: project.castMembers || [],
      projectTitle: projectTitle.trim() || undefined,
      reEnableCategories: [...selectedHidden],
    });

    onClose();
  }, [result, castOrder, startId, selectedCategories, selectedHidden, dispatch, project.castMembers, projectTitle, onClose]);

  const footer = (stage === 'select' || stage === 'review') ? (
    <ModalFooter>
      <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
        Cancel
      </button>
      {stage === 'review' && (
        <button
          onClick={handleImport}
          className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2"
        >
          <Upload className="w-3.5 h-3.5" />
          Import {result?.scenes.length || 0} Scenes
        </button>
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
                      accept={fileFilter || ".csv,.fdx,.fountain,.txt"}
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

              {hiddenWithData.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Hidden Categories
                  </h3>
                  <p className="text-zinc-500 text-[10px] mb-2">These categories were previously hidden but contain data in this file.</p>
                  <div className="space-y-1.5">
                    {hiddenWithData.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedHidden.has(key)}
                          onChange={() => {
                            const next = new Set(selectedHidden);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            setSelectedHidden(next);
                          }}
                          className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-zinc-300 text-xs">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

          {stage === 'review' && result && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider">File</span>
                <span className="text-zinc-300 text-xs">{fileLabel}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider shrink-0">Rename Project</span>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={e => setProjectTitle(e.target.value)}
                  placeholder="Leave blank to keep current title"
                  className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-3 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-xs">{result.scenes.length} scenes</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400 text-xs">{result.characters.length} characters</span>
                {result.unknownCategories.length > 0 && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span className="text-amber-400 text-xs">{result.unknownCategories.length} new categories found</span>
                  </>
                )}
              </div>

              {result.unknownCategories.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    New Categories
                  </h3>
                  <div className="space-y-1.5">
                    {result.unknownCategories.map(cat => (
                      <label key={cat} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedCategories.has(cat)}
                          onChange={() => {
                            const next = new Set(selectedCategories);
                            if (next.has(cat)) next.delete(cat);
                            else next.add(cat);
                            setSelectedCategories(next);
                          }}
                          className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-zinc-300 text-xs">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Cast ID Assignment
                  </h3>
                </div>
                <p className="text-zinc-500 text-[10px] mb-2">Drag rows to reorder. IDs are assigned by row position (starting from {startId}).</p>
                <div className="rounded-lg border border-zinc-800 overflow-hidden">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={castOrder.map(c => c.name)} strategy={verticalListSortingStrategy}>
                      <table className="w-full">
                        <thead>
                          <tr className="bg-zinc-900 border-b border-zinc-800">
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-10">
                              #
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-24">
                              In Scenes
                            </th>
                            <th className="px-3 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {castOrder.map((ch, i) => (
                            <SortableCastRow key={ch.name} character={ch} index={i} startId={startId} />
                          ))}
                        </tbody>
                      </table>
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            </>
          )}
        </div>

    </Modal>
  );
}
