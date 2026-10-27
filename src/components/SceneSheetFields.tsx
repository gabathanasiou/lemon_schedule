import React from 'react';
import { Scene, SceneColorPalette, CustomCategoryDef } from '../types';
import { getIntExtOptions, getDayNightOptions } from '../lib/ribbonUtils';
import { parsePageCount, formatPageCount } from '../lib/utils';
import { isMultiValue } from '../lib/categories';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { EntityDropdown } from './EntityDropdown';
import { CellInput } from './CellInput';

interface SceneSheetFieldsProps {
  scene: Scene;
  val: (field: string) => any;
  update: (field: string, value: any) => void;
  commitField: (sceneId: string, field: string, value: string) => void;
  commitTextEdits: () => void;
  readOnly: boolean;
  inputCls: string;
  blurOnEnter: (e: React.KeyboardEvent) => void;
  setItems: { id: string; name: string }[];
  locationItems: { id: string; name: string }[];
  breakdownItems: Record<string, { id: string; name: string }[]>;
  allBreakdownCats: string[];
  allBreakdownLabel: Record<string, string>;
  palette?: SceneColorPalette;
  customCategories: CustomCategoryDef[] | undefined;
  /** Per-category anchor item keys — Anchor icon next to anchored elements. */
  anchoredByCategory?: Record<string, Set<string>>;
  sheetNumber: number;
}

/** Header table + category grid of the Scene Sheet (matches the print layout). */
export default function SceneSheetFields({
  scene, val, update, commitField, commitTextEdits, readOnly, inputCls, blurOnEnter,
  setItems, locationItems, breakdownItems, allBreakdownCats, allBreakdownLabel, palette, customCategories, anchoredByCategory, sheetNumber,
}: SceneSheetFieldsProps) {
  // Presence (roadmap 236): stable pointer-anchor keys for this sheet's fields.
  // The scene id makes the key exact across clients — a peer on another scene
  // can never land on this one's box (the doc gate hides them anyway).
  const anchorPrefix = scene ? `sheet:${scene.id}:` : null;
  return (
    <>
      {/* Header table - matches print layout */}
      <div className="bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border-strong)]" data-presence-anchor={anchorPrefix ? `${anchorPrefix}header` : undefined}>
        <table className="w-full border-collapse text-xs">
          <tbody>
            <tr className="border-b border-[color:var(--ui-border-strong)]">
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)] w-[85px]">Scene Sheet</td>
              <td className="px-2.5 py-1.5 border-r border-[color:var(--ui-border-strong)]"><span className="text-sm font-semibold text-[color:var(--ui-text-strong)]">{sheetNumber}</span></td>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)] w-[85px]">Scene No.</td>
              <td className="px-2.5 py-1.5"><input className={inputCls} value={val('sceneNumber')} readOnly={readOnly} onChange={e => update('sceneNumber', e.target.value)} onBlur={commitTextEdits} onKeyDown={blurOnEnter} /></td>
            </tr>
            <tr className="border-b border-[color:var(--ui-border-strong)]">
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)]">Int/Ext</td>
              <td className="px-2.5 py-1.5 border-r border-[color:var(--ui-border-strong)]"><AutocompleteDropdown value={val('intExt')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'intExt', v)} options={getIntExtOptions(palette)} showAll /></td>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)]">Day/Night</td>
              <td className="px-2.5 py-1.5"><AutocompleteDropdown value={val('dayNight')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'dayNight', v)} options={getDayNightOptions(palette)} showAll /></td>
            </tr>
            <tr className="border-b border-[color:var(--ui-border-strong)]">
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)]">Set</td>
              <td className="border-r border-[color:var(--ui-border-strong)]"><EntityDropdown value={val('set')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'set', v.toUpperCase())} items={setItems} mode="single" keepAlphabetical panelMinWidth="min-w-[220px]" placeholder="Set" className="px-2.5 py-1.5 text-xs" anchoredKeys={anchoredByCategory?.['set']} wrapValue /></td>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)]">Location</td>
              <td className=""><EntityDropdown value={val('location')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'location', v)} items={locationItems} mode="single" keepAlphabetical panelMinWidth="min-w-[220px]" placeholder="Location" className="px-2.5 py-1.5 text-xs" wrapValue /></td>
            </tr>
            <tr className="border-b border-[color:var(--ui-border-strong)]">
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)]">Pages</td>
              <td className="px-2.5 py-1.5 border-r border-[color:var(--ui-border-strong)]"><CellInput value={val('pageCount')} readOnly={readOnly} noFill onChange={v => { if (!scene) return; if (v === '') { commitField(scene.id, 'pageCount', ''); } else { const d = parsePageCount(v); commitField(scene.id, 'pageCount', formatPageCount(d)); } }} className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent" suffix="pgs" /></td>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)]">Script Day</td>
              <td className="px-2.5 py-1.5"><input className={inputCls} value={val('scriptDay')} readOnly={readOnly} onChange={e => update('scriptDay', e.target.value)} onBlur={commitTextEdits} onKeyDown={blurOnEnter} /></td>
            </tr>
            <tr>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--ui-text)] uppercase bg-[var(--ui-card-band)] border-r border-[color:var(--ui-border-strong)] align-top">Synopsis</td>
              <td colSpan={3} className="px-2.5 py-1.5">
                <textarea className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none overflow-hidden leading-snug [field-sizing:content] min-h-[2lh]" rows={1}
                  value={val('description')} readOnly={readOnly} onChange={e => update('description', e.target.value)}
                  onBlur={commitTextEdits}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Category grid - 3 columns, each box has header + body, matches print */}
      <div className="grid grid-cols-3 gap-2 pr-0.5">
          {allBreakdownCats.filter(c => c !== 'set').map(cat => (
            <div key={cat} data-scene-field={cat} data-presence-anchor={anchorPrefix ? `${anchorPrefix}field:${cat}` : undefined} className="bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border-strong)] rounded overflow-hidden">
              <div className="bg-[var(--ui-card-band)] px-2.5 py-1.5 border-b border-[color:var(--ui-border-strong)] text-[10px] font-bold text-[color:var(--ui-text)] uppercase leading-tight">{allBreakdownLabel[cat]}</div>
              <div className={cat === 'cast' ? 'min-h-[80px] flex flex-col' : cat === 'notes' ? 'p-1 flex flex-col' : 'flex flex-col'}>
                {cat === 'notes' ? (
                  <textarea className="w-full border-0 p-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none overflow-hidden leading-snug [field-sizing:content] min-h-[2lh]" rows={1}
                    value={val('notes')} readOnly={readOnly} onChange={e => update('notes', e.target.value)}
                    onBlur={commitTextEdits}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
                ) : cat === 'cast' ? (
                  <EntityDropdown value={val('cast')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'cast', v)} items={breakdownItems['cast'] || []} mode="multi" placeholder="Cast" className="flex-1 p-1 text-xs" displayMode="id" anchoredKeys={anchoredByCategory?.['cast']} wrapValue resolveClosed />
                ) : (
                  <EntityDropdown value={val(cat)} readOnly={readOnly} onChange={v => scene && commitField(scene.id, cat, v)} items={breakdownItems[cat] || []} mode={isMultiValue(cat, customCategories) ? 'multi' : 'single'} placeholder={allBreakdownLabel[cat]} className="flex-1 p-1 text-xs" anchoredKeys={anchoredByCategory?.[cat]} wrapValue resolveClosed />
                )}
              </div>
            </div>
          ))}
        </div>
    </>
  );
}
