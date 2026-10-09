import React, { useMemo } from 'react';
import { ReportBlock, ReportCollection, Project } from '../../types';
import {
  COLLECTION_LABELS, collectionPickPatch, repeatMenuCollections, tableMenuCollections,
  tableFieldScope, tableItemCollection, selfRepeatDisabledCategories,
} from '../../lib/reportBlocks';
import { getReportFieldDefs, fieldsForScope, ReportFieldDef } from '../../lib/reportFields';
import { FieldPickerItems } from './FieldPicker';
import { CollectionMenuItems } from './CollectionMenu';
import { useReportControlContext } from './blockControls';
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuSub } from '../ContextMenu';
import {
  AlignLeft, ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, Check, CopyPlus, CornerDownRight,
  ImageOff, LocateFixed, MapPinOff, MoveDown, MoveLeft, MoveRight, MoveUp, Repeat, Table2, Trash2, Type,
} from 'lucide-react';

export interface MenuState { x: number; y: number; id: string; colIndex?: number; }

interface ReportContextMenuProps {
  menu: MenuState;
  block: ReportBlock;
  project: Project;
  insertScope: string | null;
  insertCategory?: string;
  /** The owning repeat/table collection of the selection — table columns
   *  resolve their item scope through tableFieldScope(block, parent). */
  parentCollection?: ReportCollection;
  /** The owning repeat's category (elements/cast parents) — self-repeat
   *  disabled categories in the collection picker. */
  parentCategory?: string;
  onClose: () => void;
  onChangeField: (field: string) => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onAddChild: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onColumnInsertAt: (colIndex: number) => void;
  onColumnMove: (dir: -1 | 1) => void;
  onColumnRemove: () => void;
  /** Columns-block column: append a text block to that column. */
  onColumnAddText?: () => void;
  /** Simple quick actions (collection picks, image "Remove image", map pin controls). */
  onPatch?: (patch: Partial<ReportBlock>) => void;
}

const itemIcon = (node: React.ReactNode) => <span className="w-3.5 shrink-0">{node}</span>;

/** Block / column right-click menu (kit ContextMenu — submenus, keyboard and
 *  press-point anchoring share the ONE kit implementation). Attribute and
 *  collection pickers are the SAME item bodies as the chrome's FieldPicker /
 *  CollectionMenu (FieldPickerItems / CollectionMenuItems) — never a forked
 *  list. Tables are LEAF surfaces: "Add block inside" exists only for
 *  repeat/relative (an insert aimed at a table would never render). */
const ReportContextMenu: React.FC<ReportContextMenuProps> = ({
  menu, block, project, insertScope, insertCategory, parentCollection, parentCategory,
  onClose, onChangeField, onInsertAbove, onInsertBelow, onAddChild, onDuplicate, onRemove,
  onColumnInsertAt, onColumnMove, onColumnRemove, onColumnAddText, onPatch,
}) => {
  const isColumnMenu = menu.colIndex !== undefined;
  const isTableColumn = isColumnMenu && block.type === 'table';
  const colIndex = menu.colIndex;
  // Rows-axis tables render `block.columns` as matrix rows: same ops, row wording.
  const isTableRow = isTableColumn && (block.axis ?? 'columns') === 'rows';

  const fields: ReportFieldDef[] = useMemo(() => {
    if (isTableColumn && colIndex !== undefined) {
      // Same scope source as the column chrome — never the raw block.collection.
      return fieldsForScope(getReportFieldDefs(project), tableFieldScope(block, parentCollection), block.category);
    }
    if (block.type === 'field') return fieldsForScope(getReportFieldDefs(project), insertScope, insertCategory);
    return [];
  }, [block, isTableColumn, colIndex, project, insertScope, insertCategory, parentCollection]);

  const { categoryKeys, categoryLabels } = useReportControlContext(project, parentCollection, parentCategory);

  // Repeat/Table over — the same collection sets the chrome's pickers use.
  const collectionPicker = useMemo(() => {
    if (block.custom) return null;
    if (block.type === 'repeat') {
      return {
        label: 'Repeat over',
        collections: repeatMenuCollections(block.collection, parentCollection, parentCategory),
        value: (block.collection || 'scenes') as ReportCollection,
        category: block.category || 'props',
      };
    }
    if (block.type === 'table') {
      return {
        label: 'Table over',
        collections: tableMenuCollections(block, parentCollection, parentCategory),
        value: tableItemCollection(block, parentCollection),
        category: block.category || 'props',
      };
    }
    return null;
  }, [block, parentCollection, parentCategory]);

  const colField = isTableColumn && colIndex !== undefined ? ((block.columns || [])[colIndex]?.field ?? '') : '';
  // Bounds — impossible moves/deletes are disabled (grayed), never offered as
  // no-op actions (the same rule the free-table cell menu applies).
  const colTotal = isTableColumn ? (block.columns || []).length : (block.cols || []).length;
  const canMovePrev = colIndex !== undefined && colIndex > 0;
  const canMoveNext = colIndex !== undefined && colIndex < colTotal - 1;
  const canDeleteColumn = colIndex !== undefined && colTotal > 1;
  // Only a repeat and an Advance take an "inside" insert; the label is the
  // effective scope (a repeat's items / an Advance's parent repeat).
  const canAddInside = !isColumnMenu && (block.type === 'repeat' || block.type === 'relative');
  const insideLabel = COLLECTION_LABELS[insertScope || block.collection || 'scenes'] || insertScope || 'Scenes';
  const hasPin = block.mapLat != null || block.mapLng != null;

  return (
    <ContextMenu open x={menu.x} y={menu.y} theme="dark" onClose={onClose}>
      {isColumnMenu ? (
        <>
          <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            {isTableColumn ? `Table ${isTableRow ? 'row' : 'column'} ${colIndex! + 1} of ${(block.columns || []).length}` : `Column ${colIndex! + 1} of ${(block.cols || []).length}`}
          </div>
          {isTableColumn && (
            <>
              <ContextMenuSub id="attribute" label="Attribute" icon={<AlignLeft className="w-3.5 h-3.5" />} width="w-56">
                <FieldPickerItems
                  fields={fields}
                  value={colField}
                  scope={insertScope}
                  submenuWidth="w-56"
                  onPick={f => { onChangeField(f); onClose(); }}
                />
              </ContextMenuSub>
              <ContextMenuDivider />
            </>
          )}
          <ContextMenuItem disabled={!canMovePrev} icon={itemIcon(isTableRow ? <MoveUp className="w-3.5 h-3.5" /> : <MoveLeft className="w-3.5 h-3.5" />)} onClick={() => { onColumnMove(-1); onClose(); }}>
            {isTableRow ? 'Move row up' : 'Move column left'}
          </ContextMenuItem>
          <ContextMenuItem disabled={!canMoveNext} icon={itemIcon(isTableRow ? <MoveDown className="w-3.5 h-3.5" /> : <MoveRight className="w-3.5 h-3.5" />)} onClick={() => { onColumnMove(1); onClose(); }}>
            {isTableRow ? 'Move row down' : 'Move column right'}
          </ContextMenuItem>
          {!isTableColumn && onColumnAddText && (
            <ContextMenuItem icon={itemIcon(<Type className="w-3.5 h-3.5" />)} onClick={() => { onColumnAddText(); onClose(); }}>
              Add text in column
            </ContextMenuItem>
          )}
          <ContextMenuDivider />
          <ContextMenuItem icon={itemIcon(isTableRow ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowLeftToLine className="w-3.5 h-3.5" />)} onClick={() => { onColumnInsertAt(colIndex!); onClose(); }}>
            {isTableRow ? 'Insert row above' : 'Insert column before'}
          </ContextMenuItem>
          <ContextMenuItem icon={itemIcon(isTableRow ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowRightToLine className="w-3.5 h-3.5" />)} onClick={() => { onColumnInsertAt(colIndex! + 1); onClose(); }}>
            {isTableRow ? 'Insert row below' : 'Insert column after'}
          </ContextMenuItem>
          <ContextMenuDivider />
          <ContextMenuItem variant="danger" disabled={!canDeleteColumn} icon={itemIcon(<Trash2 className="w-3.5 h-3.5" />)} onClick={() => { onColumnRemove(); onClose(); }}>
            {isTableRow ? 'Delete row' : 'Delete column'}
          </ContextMenuItem>
        </>
      ) : (
        <>
          {block.type === 'field' && (
            <>
              <ContextMenuSub id="attribute" label="Change field" icon={<AlignLeft className="w-3.5 h-3.5" />} width="w-56">
                <FieldPickerItems
                  fields={fields}
                  value={block.field || ''}
                  scope={insertScope}
                  submenuWidth="w-56"
                  onPick={f => { onChangeField(f); onClose(); }}
                />
              </ContextMenuSub>
              <ContextMenuDivider />
            </>
          )}
          {collectionPicker && onPatch && (
            <>
              <ContextMenuSub
                id="collection"
                label={collectionPicker.label}
                icon={block.type === 'repeat' ? <Repeat className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
                width="w-56"
              >
                <CollectionMenuItems
                  value={collectionPicker.value}
                  category={collectionPicker.category}
                  collections={collectionPicker.collections}
                  categoryKeys={categoryKeys}
                  categoryLabels={categoryLabels}
                  customCategories={project.customCategories}
                  locationTypes={project.locationTypes}
                  disabledCategories={selfRepeatDisabledCategories(parentCollection, parentCategory, categoryKeys)}
                  submenuWidth="w-56"
                  onPick={(c, cat) => { onPatch(collectionPickPatch(c, cat)); onClose(); }}
                />
              </ContextMenuSub>
              <ContextMenuDivider />
            </>
          )}
          {canAddInside && (
            <>
              <ContextMenuItem icon={itemIcon(<CornerDownRight className="w-3.5 h-3.5" />)} onClick={() => { onAddChild(); onClose(); }}>
                Add block inside ({insideLabel})
              </ContextMenuItem>
              <ContextMenuDivider />
            </>
          )}
          {onPatch && block.type === 'image' && block.imageDataUrl && (
            <>
              <ContextMenuItem variant="danger" icon={itemIcon(<ImageOff className="w-3.5 h-3.5" />)} onClick={() => { onPatch({ imageDataUrl: undefined, imageHeight: undefined }); onClose(); }}>
                Remove image
              </ContextMenuItem>
              <ContextMenuDivider />
            </>
          )}
          {onPatch && block.type === 'map' && (
            <>
              <ContextMenuItem
                icon={itemIcon(<LocateFixed className="w-3.5 h-3.5" />)}
                trailing={block.mapInheritLocation ? <Check className="w-3.5 h-3.5" /> : undefined}
                onClick={() => { onPatch({ mapInheritLocation: !block.mapInheritLocation }); onClose(); }}
              >
                Use the day’s location
              </ContextMenuItem>
              {hasPin && (
                <ContextMenuItem
                  variant="danger"
                  icon={itemIcon(<MapPinOff className="w-3.5 h-3.5" />)}
                  onClick={() => { onPatch({ mapLat: undefined, mapLng: undefined, mapPlace: undefined, mapAddress: undefined, mapCity: undefined, mapPostcode: undefined, mapCountry: undefined }); onClose(); }}
                >
                  Clear pin
                </ContextMenuItem>
              )}
              <ContextMenuDivider />
            </>
          )}
          <ContextMenuItem icon={itemIcon(<ArrowUp className="w-3.5 h-3.5" />)} onClick={() => { onInsertAbove(); onClose(); }}>Insert above</ContextMenuItem>
          <ContextMenuItem icon={itemIcon(<ArrowDown className="w-3.5 h-3.5" />)} onClick={() => { onInsertBelow(); onClose(); }}>Insert below</ContextMenuItem>
          {/* A second callSheetEdit zone would be ignored (hosts honor the
              first) — never offer duplicating it. */}
          {block.type !== 'callSheetEdit' && (
            <ContextMenuItem icon={itemIcon(<CopyPlus className="w-3.5 h-3.5" />)} onClick={() => { onDuplicate(); onClose(); }}>Duplicate</ContextMenuItem>
          )}
          <ContextMenuDivider />
          <ContextMenuItem variant="danger" icon={itemIcon(<Trash2 className="w-3.5 h-3.5" />)} onClick={() => { onRemove(); onClose(); }}>Delete block</ContextMenuItem>
        </>
      )}
    </ContextMenu>
  );
};

export default ReportContextMenu;
