import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useProject } from '../store';
import { parseFDX, parseFountain, ImportResult, commitImport } from '../lib/importScreenplay';
import { X, Upload, Loader2, Wand2 } from 'lucide-react';

interface ImportDialogProps {
  onClose: () => void;
}

export default function ImportDialog({ onClose }: ImportDialogProps) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<'select' | 'parsing' | 'review' | 'importing'>('select');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [castIds, setCastIds] = useState<Record<string, string>>({});
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [fileLabel, setFileLabel] = useState('');

  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of project.castMembers || []) ids.add(c.id);
    return ids;
  }, [project.castMembers]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileLabel(file.name);
    setStage('parsing');

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let parsed: ImportResult;

      if (ext === 'fdx' || (file.type === 'application/xml' && file.name.endsWith('.fdx'))) {
        parsed = await parseFDX(file);
      } else if (ext === 'fountain' || ext === 'fdx' || file.type === 'text/plain' || file.type === '') {
        parsed = await parseFountain(file);
      } else {
        parsed = await parseFountain(file);
      }

      setResult(parsed);

      const ids: Record<string, string> = {};
      let nextId = 1;
      for (const ch of parsed.characters) {
        while (existingIds.has(String(nextId))) nextId++;
        ids[ch.name] = String(nextId++);
      }
      setCastIds(ids);

      const cats = new Set<string>();
      for (const c of parsed.unknownCategories) cats.add(c);
      setSelectedCategories(cats);

      setStage('review');
    } catch (e: any) {
      setError(e.message || 'Failed to parse file');
      setStage('select');
    }
  }, [existingIds]);

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

  const autoAssign = useCallback(() => {
    const ids: Record<string, string> = {};
    let nextId = 1;
    for (const ch of result?.characters || []) {
      while (existingIds.has(String(nextId))) nextId++;
      ids[ch.name] = String(nextId++);
    }
    setCastIds(ids);
  }, [result, existingIds]);

  const handleImport = useCallback(() => {
    if (!result) return;
    setStage('importing');

    const castIdMap = new Map<string, string>();
    for (const [name, id] of Object.entries(castIds) as [string, string][]) {
      castIdMap.set(name.toUpperCase(), id);
    }

    commitImport({
      dispatch,
      result,
      castIdMap,
      newCustomCategories: [...selectedCategories],
      existingCastMembers: project.castMembers || [],
    });

    onClose();
  }, [result, castIds, selectedCategories, dispatch, project.castMembers, onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-[600px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-white font-bold text-sm">Import Screenplay</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
                <p className="text-zinc-600 text-xs mt-1">.fdx, .fountain, .txt</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".fdx,.fountain,.txt"
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
                  <button
                    onClick={autoAssign}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                  >
                    <Wand2 className="w-3 h-3" />
                    Auto-Assign
                  </button>
                </div>
                <div className="rounded-lg border border-zinc-800 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-zinc-900 border-b border-zinc-800">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-20">
                          ID
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-24">
                          In Scenes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.characters.map((ch, i) => (
                        <tr key={ch.name} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/50'}`}>
                          <td className="px-3 py-2 text-zinc-200 text-xs font-medium">
                            {ch.name}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={castIds[ch.name] || ''}
                              onChange={e => {
                                setCastIds(prev => ({ ...prev, [ch.name]: e.target.value }));
                              }}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-zinc-500 outline-none font-mono"
                            />
                          </td>
                          <td className="px-3 py-2 text-zinc-500 text-[10px] font-mono">
                            {ch.scenes.slice(0, 5).join(', ')}{ch.scenes.length > 5 ? '...' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {(stage === 'select' || stage === 'review') && (
          <div className="border-t border-zinc-800 px-5 py-3 flex items-center justify-end gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            {stage === 'review' && (
              <button
                onClick={handleImport}
                disabled={stage !== 'review'}
                className="px-4 py-2 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import {result?.scenes.length || 0} Scenes
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
