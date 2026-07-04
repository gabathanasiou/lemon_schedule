import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Download, Loader2 } from 'lucide-react';

interface PdfPreviewModalProps {
  generate: () => Promise<Blob>;
  fileName?: string;
  onClose: () => void;
}

const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ generate, fileName, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const urlRef = useRef<string | null>(null);

  const generatePdf = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await generate();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const blobUrl = URL.createObjectURL(blob);
      urlRef.current = blobUrl;
      setUrl(blobUrl);
    } catch (e: any) {
      setError(e?.message || 'Failed to generate PDF');
    } finally {
      setLoading(false);
    }
  }, [generate]);

  useEffect(() => {
    generatePdf();
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [generatePdf]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await generate();
      const safeName = fileName || 'schedule.pdf';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = safeName;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(e?.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-zinc-950/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-zinc-200">PDF Preview</span>
          {fileName && <span className="text-xs text-zinc-500">{fileName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={loading || downloading || !!error}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {downloading ? 'Downloading...' : 'Download PDF'}
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />Close
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
              <span className="text-sm text-zinc-500">Generating PDF...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 max-w-md text-center">
              <span className="text-sm text-red-400">{error}</span>
              <button onClick={generatePdf} className="px-4 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Retry</button>
            </div>
          </div>
        )}
        {url && <iframe src={url} className="w-full h-full border-none" title="PDF Preview" />}
      </div>
    </div>
  );
};

export default PdfPreviewModal;
