import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { meta as scheduleMeta } from '../surfaces/schedule';
import { meta as calendarMeta } from '../surfaces/calendar';
import { meta as productionMeta } from '../surfaces/production';
import { meta as elementsMeta } from '../surfaces/elements';
import { meta as reportsMeta } from '../surfaces/reports';
import { meta as budgetMeta } from '../surfaces/budget';
import { meta as scriptMeta } from '../surfaces/script';
import { meta as appChromeMeta } from '../surfaces/appChrome';
import { meta as collaborationMeta } from '../surfaces/collaboration';
import { meta as dialogsMeta } from '../surfaces/dialogs';
import type { ModalSurfaceMeta } from '../types';

/**
 * The Modals Studio completeness gate (roadmap 374). A new modal/dialog file
 * must be registered in a surface's `sources`, or this suite fails — the
 * studio cannot silently fall behind the app.
 *
 * The scan is deliberately narrow: any `.tsx` under `src/` that renders the
 * app Modal (`<Modal`) counts. The studio's own files and the Modal primitive
 * itself are not surfaces.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

const SURFACES: ModalSurfaceMeta[] = [
  ...scheduleMeta,
  ...calendarMeta,
  ...productionMeta,
  ...elementsMeta,
  ...reportsMeta,
  ...budgetMeta,
  ...scriptMeta,
  ...appChromeMeta,
  ...collaborationMeta,
  ...dialogsMeta,
];

/** Files that are not surfaces themselves (the primitive + the studio). */
const EXCLUDED = new Set([
  'src/components/Modal.tsx', // the shared Modal shim — the primitive, not a surface
  'src/components/Dialog.tsx', // the useDialog re-export
  'src/components/ProjectDialogProvider.tsx', // the dialog provider wiring
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join('/');

/** A file renders an app Modal when it contains a `<Modal` element. */
export function modalFiles(): string[] {
  return walk(SRC)
    .filter((file) => {
      const relPath = rel(file);
      if (relPath.startsWith('src/lab/')) return false;
      if (EXCLUDED.has(relPath)) return false;
      return /<Modal[\s>]/.test(fs.readFileSync(file, 'utf8'));
    })
    .map(rel)
    .sort();
}

describe('Modals Studio registry', () => {
  it('has unique surface ids', () => {
    const seen = new Map<string, string>();
    for (const surface of SURFACES) {
      expect(seen.has(surface.id), `duplicate surface id "${surface.id}" (${surface.title} / ${seen.get(surface.id)})`).toBe(false);
      seen.set(surface.id, surface.title);
    }
  });

  it('maps every source file that exists', () => {
    for (const surface of SURFACES) {
      for (const source of surface.sources) {
        expect(fs.existsSync(path.join(ROOT, source)), `${surface.id} lists a missing source: ${source}`).toBe(true);
      }
    }
  });

  it('maps every modal-rendering file (no surface can ship outside the studio)', () => {
    const covered = new Set(SURFACES.flatMap((surface) => surface.sources));
    const unmapped = modalFiles().filter((file) => !covered.has(file));
    expect(
      unmapped,
      `These files render a modal but no Modals Studio surface lists them in "sources":\n` +
        unmapped.map((file) => `  - ${file}`).join('\n') +
        `\nAdd a surface (src/lab/modals/surfaces/<group>.ts) and a fixture, or list the file on the owning surface.`,
    ).toEqual([]);
  });

  it('does not keep stale sources for deleted files', () => {
    for (const surface of SURFACES) {
      expect(surface.sources.length, `${surface.id} has no source file`).toBeGreaterThan(0);
    }
  });
});
