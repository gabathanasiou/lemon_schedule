import { IntExt, DayNight, CastMember, CustomCategoryDef } from '../../types';
import Papa from 'papaparse';
import { parsePageCount } from '../utils';
import { ELEMENT_CATEGORIES } from '../categories';
import { FDX_CATEGORY_MAP, ImportCharacter, ImportResult, ParsedScene, categoryNameToKey } from './shared';

export function buildCSVLabelToKeyMap(customCategories: CustomCategoryDef[], categoryLabels: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();

  const core: Record<string, string> = {
    'scene': 'sceneNumber', 'scene #': 'sceneNumber',
    'pages': 'pageCount',
    'script day': 'scriptDay',
    'i/e': 'intExt', 'int/ext': 'intExt',
    'set': 'set',
    'd/n': 'dayNight',
    'description': 'description',
    'cast': 'cast',
    'notes': 'notes',
  };
  for (const [label, key] of Object.entries(core)) map.set(label.toLowerCase(), key);

  for (const cat of ELEMENT_CATEGORIES) {
    if (cat.key !== 'cast') map.set(cat.label.toLowerCase(), cat.key);
  }

  for (const cc of customCategories) {
    if (cc.key !== 'cast') map.set(cc.label.toLowerCase(), cc.key);
    if (cc.label) map.set(cc.label.toLowerCase(), cc.key);
  }

  for (const [key, label] of Object.entries(categoryLabels)) {
    if (label && key !== 'cast') map.set(label.toLowerCase(), key);
  }

  for (const [label, key] of Object.entries(FDX_CATEGORY_MAP)) {
    if (key !== null) map.set(label.toLowerCase(), key);
  }

  return map;
}

function looksLikeIds(values: string[]): boolean {
  const nonEmpty = values.filter(v => v.trim());
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every(v => /^[\d,\s]+$/.test(v) && /^\d/.test(v.trim()));
}

export async function parseCSV(
  file: File,
  castMembers: CastMember[],
  customCategories: CustomCategoryDef[],
  categoryLabels: Record<string, string>,
): Promise<ImportResult> {
  const text = await file.text();

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        if (!rows.length) { resolve({ scenes: [], characters: [], unknownCategories: [] }); return; }

        const headers = Object.keys(rows[0]);
        const labelToKey = buildCSVLabelToKeyMap(customCategories, categoryLabels);
        const unknownCategories = new Set<string>();

        const headerMap = new Map<string, { key: string; isUnknown: boolean }>();
        for (const h of headers) {
          const lower = h.trim().toLowerCase();
          const mapped = labelToKey.get(lower);
          if (mapped) {
            headerMap.set(h, { key: mapped, isUnknown: false });
          } else {
            unknownCategories.add(h);
            headerMap.set(h, { key: categoryNameToKey(h), isUnknown: true });
          }
        }

        const sceneCharacters = new Set<string>();
        const scenes: ParsedScene[] = [];
        const characterMap = new Map<string, Set<number>>();
        let allCastLooksLikeIds = false;

        const allCastVals: string[] = [];
        for (const row of rows) {
          const castHeader = headers.find(h => h.trim().toLowerCase() === 'cast');
          if (castHeader) allCastVals.push((row[castHeader] || '') as string);
        }
        allCastLooksLikeIds = looksLikeIds(allCastVals);

        for (const row of rows) {
          let sceneNumber = '';
          let pageCountStr: string | undefined;
          let pageCountDec: number | undefined;
          let intExt: IntExt = 'INT';
          let set = '';
          let dayNight: DayNight = 'DAY';
          let description = '';
          let rawCast: string | undefined;
          const characters: string[] = [];
          const taggedElements: Record<string, string[]> = {};

          for (const h of headers) {
            const val = (row[h] || '').trim();
            if (!val) continue;
            const info = headerMap.get(h);
            if (!info) continue;

            if (info.isUnknown) {
              taggedElements[info.key] = val.split(',').map(x => x.trim()).filter(Boolean);
              continue;
            }

            switch (info.key) {
              case 'sceneNumber':
                sceneNumber = val;
                break;
              case 'pageCount': {
                const parsed = parsePageCount(val);
                pageCountDec = parsed;
                pageCountStr = val;
                break;
              }
              case 'scriptDay':
                taggedElements.scriptDay = [val];
                break;
              case 'intExt':
                intExt = val.toUpperCase() as IntExt;
                break;
              case 'set':
                set = val.toUpperCase();
                break;
              case 'dayNight':
                dayNight = val.toUpperCase() as DayNight;
                break;
              case 'description':
                description = val;
                break;
              case 'cast':
                if (allCastLooksLikeIds) {
                  rawCast = val;
                } else {
                  const names = val.split(',').map(n => n.trim().toUpperCase()).filter(Boolean);
                  for (const n of names) {
                    characters.push(n);
                    if (!characterMap.has(n)) characterMap.set(n, new Set());
                    characterMap.get(n)!.add(scenes.length);
                  }
                }
                break;
              case 'notes':
                taggedElements.notes = [val];
                break;
              default:
                taggedElements[info.key] = val.split(',').map(x => x.trim()).filter(Boolean);
                break;
            }
          }

          if (!sceneNumber) sceneNumber = String(scenes.length + 1);

          scenes.push({
            sceneNumber,
            pageCount: pageCountStr,
            pageCountDecimal: pageCountDec,
            intExt,
            set,
            dayNight,
            description,
            characters,
            taggedElements,
            rawCast,
          });
        }

        const characters: ImportCharacter[] = [];
        for (const [name, sceneNums] of characterMap) {
          characters.push({ name, scenes: [...sceneNums] });
        }

        resolve({ scenes, characters, unknownCategories: [...unknownCategories] });
      },
      error: (err: any) => { reject(err); },
    });
  });
}
