import React, { useRef } from 'react';
import { GridCellKind, type Item } from '@glideapps/glide-data-grid';
import { AutocompleteDropdown } from '../components/AutocompleteDropdown';
import { EntityDropdown } from '../components/EntityDropdown';
import { isMultiValue } from './categories';
import type { CustomCategoryDef } from '../types';

export interface GlideEditorOptions {
  readOnlyRef: React.MutableRefObject<boolean>;
  columns: { key: string }[];
  allBreakdownCategories: string[];
  allBreakdownLabels: Record<string, string>;
  customCategories: CustomCategoryDef[] | undefined;
  scenesRef: React.MutableRefObject<any[]>;
  intExtOptions: string[];
  dayNightOptions: string[];
  setItems: { id: string; name: string }[];
  breakdownEditorItems: Map<string, { id: string; name: string }[]>;
  portalRef: React.MutableRefObject<HTMLElement | null>;
}

/**
 * Builds Glide's provideEditor callback: inline entity dropdowns for
 * cast/set/intExt/dayNight/custom-category columns. Uses the component's
 * row-marker offset (dataCol = col - 1) per Glide's provideEditor contract.
 */
export function createGlideCellEditor(opts: GlideEditorOptions) {
  const {
    readOnlyRef, columns, allBreakdownCategories, allBreakdownLabels, customCategories,
    scenesRef, intExtOptions, dayNightOptions, setItems, breakdownEditorItems, portalRef,
  } = opts;

  return (cellData: any & { location?: Item }): any => {
    if (readOnlyRef.current) return undefined;
    const loc = cellData.location;
    if (!loc || cellData.kind !== GridCellKind.Text) return undefined;
    const [col, row] = loc;
    const dataCol = col - 1;
    const colDef = columns[dataCol];
    if (!colDef) return undefined;
    const colKey = colDef.key;
    const isEntity = colKey === 'cast' || colKey === 'set' || colKey === 'intExt' || colKey === 'dayNight' || allBreakdownCategories.includes(colKey);
    if (!isEntity) return undefined;

    const storedVal = String(scenesRef.current[row]?.[colKey] ?? '');
    const skipComma = storedVal !== (cellData.data ?? '');

    const editor = (p: any) => {
      const { value: cellValue, onChange, onFinishedEditing } = p;
      const currentVal = cellValue?.data ?? '';
      const latestRef = useRef(cellValue);

      const handleChange = (newVal: string) => {
        const next = {
          kind: GridCellKind.Text,
          data: newVal,
          displayData: newVal,
          allowOverlay: true,
        };
        latestRef.current = next;
        onChange(next);
      };

      const handleClose = () => {
        onFinishedEditing(latestRef.current);
      };

      const handleTabClose = () => {
        onFinishedEditing(latestRef.current, [1, 0] as any);
      };

      if (colKey === 'intExt') {
        return <AutocompleteDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} options={intExtOptions} showAll positioning="fixed" portalTarget={portalRef.current} defaultOpen autoFocus placeholder="INT, EXT, D/E..." />;
      }
      if (colKey === 'dayNight') {
        return <AutocompleteDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} options={dayNightOptions} showAll positioning="fixed" portalTarget={portalRef.current} defaultOpen autoFocus placeholder="DAY, NIGHT, MORNING..." />;
      }
      if (colKey === 'set') {
        return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} items={setItems} mode="single" uppercase keepAlphabetical skipComma={skipComma} positioning="fixed" portalTarget={portalRef.current} defaultOpen autoFocus placeholder="Set" className="text-xs" />;
      }
      if (colKey === 'cast') {
        return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} mode="multi" displayMode="id" skipComma={skipComma} positioning="fixed" portalTarget={portalRef.current} defaultOpen autoFocus placeholder="Cast" className="text-xs" renderItem={(item: any, _sel: any) => (<><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '\u2014'}</span></>)} />;
      }
      const categoryItems = breakdownEditorItems.get(colKey) || [];
      return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} onTabExit={handleTabClose} items={categoryItems} mode={isMultiValue(colKey, customCategories) ? 'multi' : 'single'} skipComma={skipComma} positioning="fixed" portalTarget={portalRef.current} defaultOpen autoFocus placeholder={allBreakdownLabels[colKey] || colKey} className="text-xs" />;
    };
    return { editor, disablePadding: true, styleOverride: { overflow: 'visible' } };
  };
}
