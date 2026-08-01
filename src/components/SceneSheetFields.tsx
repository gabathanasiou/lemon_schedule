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
  breakdownItems: Record<string, { id: string; name: string }[]>;
  allBreakdownCats: string[];
  allBreakdownLabel: Record<string, string>;
  palette?: SceneColorPalette;
  customCategories: CustomCategoryDef[] | undefined;
  sheetNumber: number;
}

/** Header table + category grid of the Scene Sheet (matches the print layout). */
export default function SceneSheetFields({
  scene, val, update, commitField, commitTextEdits, readOnly, inputCls, blurOnEnter,
  setItems, breakdownItems, allBreakdownCats, allBreakdownLabel, palette, customCategories, sheetNumber,
}: SceneSheetFieldsProps) {
  return (
    <>
      {/* Header table - matches print layout */}
      <div className="bg-white border border-zinc-300">
        <table className="w-full border-collapse text-xs">
          <tbody>
            <tr className="border-b border-zinc-300">
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300 w-[85px]">Scene Sheet</td>
              <td className="px-2.5 py-1.5 border-r border-zinc-300"><span className="text-sm font-semibold text-zinc-800">{sheetNumber}</span></td>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300 w-[85px]">Scene No.</td>
              <td className="px-2.5 py-1.5"><input className={inputCls} value={val('sceneNumber')} readOnly={readOnly} onChange={e => update('sceneNumber', e.target.value)} onBlur={commitTextEdits} onKeyDown={blurOnEnter} /></td>
            </tr>
            <tr className="border-b border-zinc-300">
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Int/Ext</td>
              <td className="px-2.5 py-1.5 border-r border-zinc-300"><AutocompleteDropdown value={val('intExt')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'intExt', v)} options={getIntExtOptions(palette)} showAll /></td>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Day/Night</td>
              <td className="px-2.5 py-1.5"><AutocompleteDropdown value={val('dayNight')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'dayNight', v)} options={getDayNightOptions(palette)} showAll /></td>
            </tr>
            <tr className="border-b border-zinc-300">
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Set</td>
              <td className="px-2.5 py-1.5 border-r border-zinc-300"><EntityDropdown value={val('set')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'set', v.toUpperCase())} items={setItems} mode="single" keepAlphabetical panelMinWidth="min-w-[220px]" placeholder="Set" className="text-xs" /></td>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Location</td>
              <td className="px-2.5 py-1.5"><input className={inputCls} readOnly onKeyDown={blurOnEnter} /></td>
            </tr>
            <tr className="border-b border-zinc-300">
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Pages</td>
              <td className="px-2.5 py-1.5 border-r border-zinc-300"><CellInput value={val('pageCount')} readOnly={readOnly} onChange={v => { if (!scene) return; if (v === '') { commitField(scene.id, 'pageCount', ''); } else { const d = parsePageCount(v); commitField(scene.id, 'pageCount', formatPageCount(d)); } }} className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent" suffix="pgs" /></td>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Script Day</td>
              <td className="px-2.5 py-1.5"><input className={inputCls} value={val('scriptDay')} readOnly={readOnly} onChange={e => update('scriptDay', e.target.value.replace(/[^0-9]/g, ''))} onBlur={commitTextEdits} onKeyDown={blurOnEnter} /></td>
            </tr>
            <tr>
              <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300 align-top">Synopsis</td>
              <td colSpan={3} className="px-2.5 py-1.5">
                <textarea className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none" rows={2}
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
            <div key={cat} className="bg-white border border-zinc-300 rounded overflow-hidden">
              <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">{allBreakdownLabel[cat]}</div>
              <div className={cat === 'cast' ? 'p-1 min-h-[80px]' : 'p-1'}>
                {cat === 'notes' ? (
                  <textarea className="w-full border-0 p-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none" rows={2}
                    value={val('notes')} readOnly={readOnly} onChange={e => update('notes', e.target.value)}
                    onBlur={commitTextEdits}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
                ) : cat === 'cast' ? (
                  <EntityDropdown value={val('cast')} readOnly={readOnly} onChange={v => scene && commitField(scene.id, 'cast', v)} items={breakdownItems['cast'] || []} positioning="fixed" mode="multi" placeholder="Cast" className="text-xs" displayMode="id" renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name || '?'}</span></>} />
                ) : (
                  <EntityDropdown value={val(cat)} readOnly={readOnly} onChange={v => scene && commitField(scene.id, cat, v)} items={breakdownItems[cat] || []} positioning="fixed" mode={isMultiValue(cat, customCategories) ? 'multi' : 'single'} placeholder={allBreakdownLabel[cat]} className="text-xs" renderItem={(item) => <span className="truncate flex-1">{item.name}</span>} />
                )}
              </div>
            </div>
          ))}
        </div>
    </>
  );
}
