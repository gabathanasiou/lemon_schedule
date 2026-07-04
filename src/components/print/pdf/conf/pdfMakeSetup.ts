import pdfMake from 'pdfmake/build/pdfmake';

// Vite replaces BASE_URL at build time; we cast to access it without type dependencies
const BASE_PATH = (typeof import.meta !== 'undefined' && typeof (import.meta as any).env?.BASE_URL === 'string')
  ? (import.meta as any).env.BASE_URL
  : '/';
import type { TDocumentDefinitions, PageSize, PageOrientation, PredefinedPageSize, Content, Table, TableCell, CustomTableLayout, Alignment } from 'pdfmake/interfaces';

export type { TDocumentDefinitions, PageSize, PageOrientation, PredefinedPageSize, Content, Table, TableCell, CustomTableLayout, Alignment };

let initialized = false;
let initPromise: Promise<void> | null = null;

const FONT_NAMES = ['Arimo-Regular', 'Arimo-Bold', 'Arimo-Italic', 'Arimo-BoldItalic'] as const;

async function loadFontBase64(name: string): Promise<string> {
  const resp = await fetch(`${BASE_PATH}fonts/${name}.ttf`);
  if (!resp.ok) throw new Error(`Failed to load font: ${name}.ttf`);
  const u8 = new Uint8Array(await resp.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode(...u8.subarray(i, Math.min(i + CHUNK, u8.length)));
  }
  const base64 = btoa(binary);
  return base64;
}

export async function initPdfMake(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const vfs: Record<string, string> = {};
    const entries = await Promise.all(
      FONT_NAMES.map(async (name) => {
        const base64 = await loadFontBase64(name);
        return [`${name}.ttf`, base64] as const;
      }),
    );
    for (const [key, val] of entries) {
      vfs[key] = val;
    }

    pdfMake.addVirtualFileSystem(vfs);
    pdfMake.addFonts({
      Helvetica: {
        normal: 'Arimo-Regular.ttf',
        bold: 'Arimo-Bold.ttf',
        italics: 'Arimo-Italic.ttf',
        bolditalics: 'Arimo-BoldItalic.ttf',
      },
    });

    initialized = true;
    initPromise = null;
  })();

  return initPromise;
}

export function isPdfMakeReady(): boolean {
  return initialized;
}

export { pdfMake };
