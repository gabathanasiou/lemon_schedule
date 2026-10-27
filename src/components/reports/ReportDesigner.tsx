import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../../store';
import { useCurrentDocument, useCurrentWindow } from '../../lib/popoutTarget';
import { CHROME_BAR_INSET, CHROME_ITEM_GAP } from '../../lib/chromeSpacing';
import { registerInFlightEdits } from '../../lib/inFlightEdits';
import { isTextEditingElement } from '../../lib/textEditing';
import { useReportCtx } from '../../lib/useReportCtx';
import { getReportFieldMap, type ReportFieldDef } from '../../lib/reportFields';
import { useSunWeather } from '../../lib/useSunWeather';
import type { ReportCtx } from '../../lib/reportData';
import { ReportDesign, ReportBlock, ReportCollection, ReportTextStyle, ReportViewMode } from '../../types';
import {
  findBlock, insertAfter, insertBefore, insertInto, removeBlock, duplicateBlockWithId,
  moveBlock, moveBlockTo, duplicateBlockTo, updateBlock, parentCollectionOf, parentCategoryOf, insertScopeFor,
  makeReportBlock, wrapWithColumns, appendToColumn, moveIntoColumn, moveIntoChildren, cloneBlock, listOwnerOf,
  insertColumnAt, removeColumnAt, moveColumnAt, moveIntoNewColumn, duplicateIntoNewColumn, insideColumnsBlock,
  moveTableColumn, insertTableColumnAt, removeTableColumnAt, blockAllowedIn, blockPlacementHint, designIsDayScoped,
  tableItemCollection, dayGridOffenders, isDayGridBlock, collectRibbonBlocks, countCallSheetZones,
  findDesignCallSheetZone, ribbonTimeOverrides,
} from '../../lib/reportBlocks';
import { fieldScopeFor } from '../../lib/reportLookup';
import { getDefaultReportDesigns } from '../../lib/reportTemplates';
import { useDayViews } from '../../lib/dayView';
import { useViewMode, usePersistState, useActiveDesignId, useReportViewMode, REPORT_ACTIVE_DESIGN_KEY } from '../../lib/persist';
import { generateUUID } from '../../lib/utils';
import { usePaneResize } from '../../lib/usePaneResize';
import { ItemManagerDropdown } from '../DropdownMenu';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import ReportPalette, { PaletteDropPayload } from './ReportPalette';
import ReportToolbar from './ReportToolbar';
import ReportModeSeg from './ReportModeSeg';
import ReportDesignerCanvas, { ColSel } from './ReportDesignerCanvas';
import { PeerItemOutlines } from '../PeerItemOutlines';
import { reportSelectionItems, resolveReportItem } from '../../lib/reportSelectionItems';
import { useFollowView } from '../../lib/supabase/useFollowView';
import ReportContextMenu, { MenuState } from './ReportContextMenu';
import ReportPreview from './ReportPreview';
import { dayScopeFilter } from './DayReportPreview';
import { DayPickerList } from '../production/day/DayPicker';
import DropdownSubmenu from '../DropdownSubmenu';
import DropdownDivider from '../DropdownDivider';
import DelegatedTooltip from '../DelegatedTooltip';
import CustomCellControls, { cellStructureOps } from './CustomCellControls';
import { CustomCellSelection, useCustomTableCells } from './useCustomTableCells';
import { RichTextEditorHandle, RICH_TEXT_STATE_IDLE, RichTextState } from './RichTextEditor';
import { Printer, Eye, EyeOff, ChevronDown, Check, ArrowRightLeft, PanelLeftClose, PanelLeftOpen, CalendarDays, Clock } from 'lucide-react';
import Button from '../Button';
import { ToolButton, TB_BTN_ICON } from '@gabriel/ui-kit';
import { useDialog } from '../Dialog';

function payloadToBlock(p: PaletteDropPayload, scope: string | null): ReportBlock {
  // Palette attributes become text blocks with the {{field}} token embedded —
  // an attribute block is just a text block with one token already in it.
  if (p.field) return makeReportBlock('text', { text: `{{${p.field}}}` });
  return makeReportBlock((p.type || 'text') as ReportBlock['type']);
}

/** Zone mode (item 10): edit ONE `callSheetEdit` zone's blocks for a single
 *  production day. The component edits only `zone.blocks` (never the design)
 *  and skips the design header/footer chrome. */
export interface ReportDesignerZone {
  designId: string;
  blocks: ReportBlock[];
  onChange: (blocks: ReportBlock[]) => void;
  /** Palette field scope when nothing is selected (the zone lives in a `days`
   *  repeat, so its content is day-scoped). */
  scope?: ReportCollection;
  /** The production day being edited (section index) — the zone canvas and its
   *  nested repeats resolve against it (roadmap 212). */
  previewSectionIndex?: number;
  /** Item 114 — the host's "Times" aid: force call times/durations on ribbons
   *  inside the zone canvas too (the page handles the template's own ribbons). */
  showRibbonTimes?: boolean;
  /** The host page built AROUND the bare zone canvas (the call-sheet WYSIWYG
   *  white page). The editor supplies the live canvas node + read state; the
   *  host owns the read-only template regions and the live grid blocks. */
  renderPage: (args: ReportZonePageArgs) => React.ReactNode;
}

/** What the zone host page needs from the editor. */
export interface ReportZonePageArgs {
  /** The live, BARE zone canvas — mount it at the design's zone slot. */
  canvas: React.ReactNode;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
}

interface ReportDesignerProps {
  headerTarget?: HTMLElement | null;
  /** `daySectionIndex` = the day picker's choice for a day-scoped design
   *  (roadmap 198) — the print dialog preselects it. */
  onPrint?: (design: ReportDesign, daySectionIndex?: number) => void;
  zone?: ReportDesignerZone;
}

export default function ReportDesigner({ headerTarget, onPrint, zone }: ReportDesignerProps) {
  const { state, dispatch, locked } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const currentWin = useCurrentWindow();
  const [viewMode, setViewMode, viewWidth] = useViewMode();
  const zoneMode = !!zone;

  // The design being EDITED is a per-user pref (roadmap 233) — the design
  // contents stay project state (`reportDesigns`), so two collaborators edit
  // two different designs without switching each other. The project-level
  // `activeReportId` is only the fallback (older files, first run); nothing in
  // the UI writes it anymore. In zone mode the host owns the design.
  const [editingDesignId, setEditingDesignId] = useActiveDesignId(
    REPORT_ACTIVE_DESIGN_KEY, project.reportDesigns || [], project.activeReportId,
  );
  const activeDesign: ReportDesign | undefined = project.reportDesigns?.find(d => d.id === (zone?.designId || editingDesignId)) || project.reportDesigns?.[0];

  const [blocks, setBlocks] = useState<ReportBlock[]>(() => (zone?.blocks ? JSON.parse(JSON.stringify(zone.blocks)) : activeDesign?.blocks || []));
  const [headerBlocks, setHeaderBlocks] = useState<ReportBlock[]>(() => activeDesign?.header || []);
  const [footerBlocks, setFooterBlocks] = useState<ReportBlock[]>(() => activeDesign?.footer || []);
  const [skipFirstHeader, setSkipFirstHeader] = useState(() => !!activeDesign?.headerSkipFirst);
  const [skipFirstFooter, setSkipFirstFooter] = useState(() => !!activeDesign?.footerSkipFirst);
  // Docked inspector is the DEFAULT (roadmap 205) — floating is opt-in and
  // persists per session.
  const [editorMode, setEditorMode] = useState<'floating' | 'toolbar'>(() => {
    try { return localStorage.getItem('lemon_schedule_report_editor_mode') === 'floating' ? 'floating' : 'toolbar'; } catch { return 'toolbar'; }
  });
  const toggleEditorMode = () => {
    setEditorMode(prev => {
      const next = prev === 'floating' ? 'toolbar' : 'floating';
      try { localStorage.setItem('lemon_schedule_report_editor_mode', next); } catch { /* ignore */ }
      return next;
    });
  };
  const [selId, setSelId] = useState<string | null>(null);
  const [selCol, setSelCol] = useState<ColSel | null>(null);
  // Peer selection (roadmap 234 stage 2): the designer's selected block — or
  // the selected table column — publishes as item ids.
  const reportSelection = useMemo(
    () => (zoneMode ? [] : reportSelectionItems(selId, selCol)),
    [zoneMode, selId, selCol],
  );
  // Free-table cell selection (roadmap 189) — lifted here so the docked
  // inspector mirrors the canvas selection and shares its editor target.
  const [selCell, setSelCell] = useState<(CustomCellSelection & { blockId: string }) | null>(null);
  const cellEditorRef = useRef<RichTextEditorHandle | null>(null);
  const [cellRtState, setCellRtState] = useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  // Inline text editing channel (roadmap 191) — ONE handle + formatting state
  // shared by the canvas text block's live editor and the chrome/dock's
  // Format + Style body (the block's own chip key rides along).
  const textEditorRef = useRef<RichTextEditorHandle | null>(null);
  const [textRtState, setTextRtState] = useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  const [textChipKey, setTextChipKey] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  // Docked rail (inspector + palette): collapse state and drag width persist
  // like the manager/script side panes.
  const [rail, setRail] = usePersistState('lemon_schedule_report_rail', { open: true, width: 360 });
  const onRailResize = usePaneResize({
    width: rail.width,
    min: 240,
    max: 560,
    edge: 'right',
    onChange: w => setRail(p => ({ ...p, width: w })),
  });
  // One global display/edit mode (roadmap 203): Fields = chips/keys with
  // single-click editing, Values = the final look with double-click/tap-again
  // entry. Default Values; the retired `lemon_schedule_report_view_keys` key is
  // ignored (no migration). The Call Sheet editor is ALWAYS Values (user
  // decision, roadmap 212): the mode switch is a designer-only tool.
  const [internalReportMode, setInternalReportMode] = useReportViewMode();
  const reportMode: ReportViewMode = zoneMode ? 'values' : internalReportMode;
  const setReportModePersisted = useCallback((mode: ReportViewMode) => {
    setSelCell(null);
    setInternalReportMode(mode);
  }, [setInternalReportMode]);
  // Designer day picker (roadmap 198): for a day-scoped design, pin which
  // production day the canvas sample AND the Preview/Print resolve against.
  // Persisted per design (localStorage); null = All days (the default).
  const { days: dayViews } = useDayViews();
  const [previewDay, setPreviewDay] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  // Item 114 — the Call Sheet's "Times" aid, ported to the designer (roadmap
  // 212): force call times + durations visible on every ribbon block in the
  // canvas WITHOUT mutating the design. Off by default (the designer shows the
  // design as stored); never saved, never printed. The call-sheet editor keeps
  // its own host-owned toggle (default on).
  const [showRibbonTimes, setShowRibbonTimes] = useState(false);
  // Sun & Weather values: warm the cache on load so canvas + preview render
  // real values instead of "—" (the hook prefetches per the storage policy —
  // roadmap 299 — and ticks so the memoized canvas re-renders). Location-aware:
  // also warms every pinned location the ACTIVE design iterates (a locations
  // repeat/table in the tree).
  const designId = activeDesign?.id;
  // Zone mode (roadmap 212): the call-sheet PAGE owns the weather warm (it
  // renders the whole day, template included) — skip the duplicate prefetch.
  useSunWeather(zoneMode ? null : ctx, activeDesign);

  // Presence (roadmap 236 + follow 243): publish the OPEN design so peers on
  // another design are hidden (the pointer document gate) — and mirror the
  // follow-lens state through the shared registration: the edited DESIGN
  // (per-user pref, mirrored through its own setter like the stripboard view
  // fields), Preview, and Fields/Values. The design switches first so the
  // toggles land on the peer's design.
  // Follow can switch the edited design from under in-flight text — flush
  // first (through a ref: `flushPendingText` is declared below this hook).
  const flushPendingTextRef = useRef<() => void>(() => {});
  const follow = useFollowView({
    place: { tab: 'design', sub: 'designer' },
    fields: [
      { key: 'designId', value: designId },
      { key: 'preview', value: preview },
      { key: 'reportViewMode', value: reportMode },
    ],
    apply: (view) => {
      if (view.designId && view.designId !== editingDesignId && (project.reportDesigns || []).some(d => d.id === view.designId)) {
        flushPendingTextRef.current();
        setEditingDesignId(view.designId);
      }
      if (typeof view.preview === 'boolean') setPreview(view.preview);
      if (view.reportViewMode) setReportModePersisted(view.reportViewMode);
    },
    enabled: !zoneMode,
  });

  // Warm sun/weather per the storage policy (roadmap 299) — deps are the ctx
  // (rebuilds on project changes) + the design id, so edits never refire it.
  useEffect(() => {
    if (zoneMode) return;
    // In-flight text belongs to the design it was typed into; a switch flushes
    // it first (the switch sites flush explicitly) — never re-home it.
    setBlocks(activeDesign?.blocks ? JSON.parse(JSON.stringify(activeDesign.blocks)) : []);
    setHeaderBlocks(activeDesign?.header ? JSON.parse(JSON.stringify(activeDesign.header)) : []);
    setFooterBlocks(activeDesign?.footer ? JSON.parse(JSON.stringify(activeDesign.footer)) : []);
    setSkipFirstHeader(!!activeDesign?.headerSkipFirst);
    setSkipFirstFooter(!!activeDesign?.footerSkipFirst);
    setSelId(null);
    setSelCol(null);
    setSelCell(null);
    setMenu(null);
    setTextRtState(RICH_TEXT_STATE_IDLE);
    setTextChipKey(null);
    let storedDay: number | null = null;
    if (activeDesign?.id) {
      try {
        const raw = localStorage.getItem(`lemon_schedule_report_preview_day_${activeDesign.id}`);
        const n = raw == null ? NaN : parseInt(raw, 10);
        if (Number.isFinite(n)) storedDay = n;
      } catch { /* ignore */ }
    }
    setPreviewDay(storedDay);
  }, [activeDesign?.id]);

  useEffect(() => {
    if (zoneMode || !activeDesign) return;
    // An un-flushed text edit owns the local blocks; a store change must not
    // clobber it (ours re-syncs right after the flush).
    if (pendingTextRef.current) return;
    const fresh = activeDesign.blocks || [];
    const freshHeader = activeDesign.header || [];
    const freshFooter = activeDesign.footer || [];
    setBlocks(JSON.parse(JSON.stringify(fresh)));
    setHeaderBlocks(JSON.parse(JSON.stringify(freshHeader)));
    setFooterBlocks(JSON.parse(JSON.stringify(freshFooter)));
    setSkipFirstHeader(!!activeDesign.headerSkipFirst);
    setSkipFirstFooter(!!activeDesign.footerSkipFirst);
    const all = [...freshHeader, ...fresh, ...freshFooter];
    setSelId(prev => (prev && findBlock(all, prev) ? prev : null));
    setSelCol(prev => (prev && prev.colsId && findBlock(all, prev.colsId) ? prev : null));
  }, [project.reportDesigns]);

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const headerRef = useRef(headerBlocks);
  headerRef.current = headerBlocks;
  const footerRef = useRef(footerBlocks);
  footerRef.current = footerBlocks;
  const skipFirstHeaderRef = useRef(skipFirstHeader);
  skipFirstHeaderRef.current = skipFirstHeader;
  const skipFirstFooterRef = useRef(skipFirstFooter);
  skipFirstFooterRef.current = skipFirstFooter;
  const selIdRef = useRef(selId);
  selIdRef.current = selId;
  const selColRef = useRef(selCol);
  selColRef.current = selCol;

  // ---- Commit-on-blur for text (roadmap 251) --------------------------------
  // Typing patches the LOCAL design per keystroke — Tab/cell navigation, the
  // `=`/`@` reference menus and the formatting chrome all read those fresh
  // props — but the store dispatch is deferred while a text editor (contentEditable)
  // or a text input inside the designer has focus. The edit commits when it
  // finishes: focus leaves the editor, Escape ends editing, any structural edit
  // (or the toolbar) commits everything with it, or the designer unmounts.
  // Everything else (checkbox/dropdown/colour picks, drags, inserts) dispatches
  // immediately — those never originate from a text-editing element.
  const currentDocument = useCurrentDocument();
  const pendingTextRef = useRef(false);
  const commitAllRef = useRef<(force?: boolean) => void>(() => {});
  const flushPendingText = useCallback(() => {
    if (!pendingTextRef.current) return;
    // FORCE past the focus gate: the flush is the commit point (blur, Escape,
    // pagehide, unmount) and the editor may still hold focus (Escape ends the
    // session before anything blurs).
    commitAllRef.current(true);
  }, []);
  flushPendingTextRef.current = flushPendingText;
  const isTextEditingRef = useRef(isTextEditingElement);
  isTextEditingRef.current = isTextEditingElement;
  // Un-flushed text counts as "in flight" for the S3.5 peer-save gate: a peer's
  // save must raise "Changes available" instead of LOADing over it. Zone mode
  // edits the day's `daybreakMeta.callSheets` through the same gate (roadmap
  // 212 — the per-day zone commits on blur too).
  useEffect(() => registerInFlightEdits(() => pendingTextRef.current), []);

  // Zone mode (roadmap 212): the day's zone blocks live in the STORE
  // (`daybreakMeta.callSheets[designId]`) and the host owns them. Re-sync the
  // local copy when the store changes under us — undo/redo, a peer's save,
  // "Reset day to template", or a design switch — so the canvas can never
  // drift. An un-flushed text edit owns the local copy until its commit
  // (roadmap 251), exactly like the full designer's store sync above.
  const zoneBlocksRef = useRef(zone?.blocks);
  useEffect(() => {
    if (!zoneMode) return;
    const incoming = zone!.blocks;
    if (incoming === zoneBlocksRef.current) return;
    zoneBlocksRef.current = incoming;
    if (pendingTextRef.current) return;
    const fresh = JSON.parse(JSON.stringify(incoming));
    blocksRef.current = fresh;
    setBlocks(fresh);
    setSelId(prev => (prev && findBlock(fresh, prev) ? prev : null));
    setSelCol(prev => (prev && prev.colsId && findBlock(fresh, prev.colsId) ? prev : null));
    setSelCell(prev => (prev && findBlock(fresh, prev.blockId) ? prev : null));
  }, [zone?.blocks, zoneMode]);
  // Last-resort flush: the tab is going away (the click paths all blur first).
  useEffect(() => {
    const win = currentDocument.defaultView;
    const onPageHide = () => flushPendingText();
    win?.addEventListener('pagehide', onPageHide);
    return () => {
      win?.removeEventListener('pagehide', onPageHide);
      flushPendingText();
    };
  }, [currentDocument, flushPendingText]);

  const selectBlock = (id: string | null) => {
    setSelId(id);
    if (id) setSelCol(null);
    setSelCell(prev => (prev && prev.blockId === id ? prev : null));
  };
  const selectCol = (sel: ColSel | null) => { setSelCol(sel); if (sel) { setSelId(null); setSelCell(null); } };

  /** The zone (list) containing `id`. */
  const zoneOf = (id: string | null): 'header' | 'body' | 'footer' => {
    if (!id) return 'body';
    if (findBlock(headerRef.current, id)) return 'header';
    if (findBlock(footerRef.current, id)) return 'footer';
    return 'body';
  };
  const listOfZone = (zone: 'header' | 'body' | 'footer') =>
    zone === 'header' ? headerRef.current : zone === 'footer' ? footerRef.current : blocksRef.current;

  const commitAll = (force = false) => {
    if (!zoneMode && !activeDesign) return;
    // Roadmap 251: defer while a text editor / text input has focus inside the
    // designer — the local state is already current; the store follows on the
    // flush (blur / Escape / structural edit / unmount). Zone mode (roadmap
    // 212) uses the SAME gate: typing in the day's zone must not dispatch per
    // keystroke — it commits to `daybreakMeta` on blur.
    if (!force && isTextEditingRef.current(currentDocument.activeElement)) {
      pendingTextRef.current = true;
      return;
    }
    pendingTextRef.current = false;
    // Zone mode: the HOST owns the storage (the day's `daybreakMeta.callSheets`).
    if (zoneMode) { zone!.onChange(blocksRef.current); return; }
    dispatch({
      type: 'UPDATE_REPORT_DESIGN',
      payload: {
        id: activeDesign.id,
        blocks: blocksRef.current,
        header: headerRef.current,
        footer: footerRef.current,
        headerSkipFirst: skipFirstHeaderRef.current,
        footerSkipFirst: skipFirstFooterRef.current,
      },
    });
  };
  commitAllRef.current = commitAll;

  const commit = (next: ReportBlock[], zone: 'header' | 'body' | 'footer' = 'body') => {
    // Invariant: a day-grid block (Call Times · Crew Table · Precalls) lives
    // only inside a Days context. The safety net behind the per-path guards —
    // only NEWLY introduced offenders abort, so a legacy/imported misplaced
    // block stays editable and deletable.
    const before = dayGridOffenders(listOfZone(zone));
    const introduced = [...dayGridOffenders(next)].find(([id]) => !before.has(id));
    if (introduced) {
      dialog.alert({ title: 'Can’t drop that here', message: blockPlacementHint(introduced[1]) });
      return;
    }
    // Invariant (roadmap 212): ONE per-day edit zone per design. The day page
    // swaps exactly that block for the live canvas; a second zone would
    // duplicate the day's content. Same safety net — only NEWLY introduced
    // zones abort, so a legacy design stays editable.
    const beforeZones = countCallSheetZones(zoneMode ? blocksRef.current : [...headerRef.current, ...blocksRef.current, ...footerRef.current]);
    const nextAllZones = zoneMode
      ? next
      : zone === 'header' ? [...next, ...blocksRef.current, ...footerRef.current]
        : zone === 'footer' ? [...headerRef.current, ...blocksRef.current, ...next]
          : [...headerRef.current, ...next, ...footerRef.current];
    if (countCallSheetZones(nextAllZones) > 1 && countCallSheetZones(nextAllZones) > beforeZones) {
      dialog.alert({ title: 'One call-sheet zone per report', message: blockPlacementHint('callSheetEdit') });
      return;
    }
    if (zone === 'header') { setHeaderBlocks(next); headerRef.current = next; }
    else if (zone === 'footer') { setFooterBlocks(next); footerRef.current = next; }
    else { setBlocks(next); blocksRef.current = next; }
    commitAll();
  };

  const commitZone = (id: string | null, next: (list: ReportBlock[]) => ReportBlock[]) => {
    const zone = zoneOf(id);
    commit(next(listOfZone(zone)), zone);
  };

  /** Multiple dispatches that must land as ONE undo entry (cross-zone moves). */
  const batch = (fn: () => void) => {
    dispatch({ type: 'BATCH_START' });
    fn();
    dispatch({ type: 'BATCH_COMMIT' });
  };

  const patch = (id: string, p: Partial<ReportBlock>) => {
    // Switching a table to Free table drops you straight into editing (the
    // canvas focuses the first cell).
    if (p.custom === true && !findBlock(allBlocks, id)?.block.custom) setAutoEditId(id);
    commitZone(id, list => updateBlock(list, id, p));
  };

  const allBlocks = useMemo(() => [...headerBlocks, ...blocks, ...footerBlocks], [headerBlocks, blocks, footerBlocks]);

  // Item 114 — "Times" is a VIEW aid: force call times/durations on every ribbon
  // block in the canvas, never saved and never printed (Preview uses the stored
  // flags). `collectRibbonBlocks` also finds ribbons nested in repeats/columns.
  // In zone mode the host owns the toggle (the page and the zone canvas both
  // render its overrides).
  const hasRibbons = useMemo(() => collectRibbonBlocks(allBlocks).length > 0, [allBlocks]);
  const effectiveShowRibbonTimes = zoneMode ? !!zone!.showRibbonTimes : showRibbonTimes;
  const ribbonOverrides = useMemo(
    () => (effectiveShowRibbonTimes && hasRibbons ? ribbonTimeOverrides(allBlocks) : undefined),
    [effectiveShowRibbonTimes, hasRibbons, allBlocks],
  );

  // Day picker resolution (roadmap 198): visible only for day-scoped designs.
  // `null` = All days (the default): canvas samples the first production day
  // (roadmap 197) and Preview/Print render the whole report. A specific day
  // scopes the canvas sample AND Preview/Print to it (stale stored days fall
  // back to All days).
  const dayScoped = useMemo(() => designIsDayScoped(allBlocks), [allBlocks]);
  const dayOptions = useMemo(
    () => dayViews.map(d => ({ sectionIndex: d.sectionIndex, chronoDay: d.chronoDay, date: d.date, conflicts: d.violations.length })),
    [dayViews],
  );
  const scopedDay = useMemo(
    () => (previewDay != null && dayOptions.some(o => o.sectionIndex === previewDay) ? previewDay : null),
    [previewDay, dayOptions],
  );
  const scopedDayLabel = scopedDay != null ? dayOptions.find(o => o.sectionIndex === scopedDay)?.chronoDay ?? null : null;
  const effectiveDay = scopedDay ?? dayOptions[0]?.sectionIndex ?? null;
  const selectPreviewDay = (sectionIndex: number) => {
    const next = sectionIndex === -1 ? null : sectionIndex;
    setPreviewDay(next);
    if (!designId) return;
    try {
      const key = `lemon_schedule_report_preview_day_${designId}`;
      if (next == null) localStorage.removeItem(key);
      else localStorage.setItem(key, String(next));
    } catch { /* ignore */ }
  };
  const previewScopeFilter = useMemo(
    () => (dayScoped && scopedDay != null ? dayScopeFilter(scopedDay) : undefined),
    [dayScoped, scopedDay],
  );

  const selBlock = selId ? findBlock(allBlocks, selId)?.block ?? null : null;
  const selParentCollection = selId ? parentCollectionOf(allBlocks, selId) : undefined;
  const selParentCategory = selId ? parentCategoryOf(allBlocks, selId) : undefined;
  // Palette/context-menu fields + context: a selected repeat/table stands for
  // its EFFECTIVE item collection (contextual defaults resolved via
  // tableItemCollection), so the offered attributes always match the items the
  // block actually iterates.
  const insertScope = useMemo(
    () => (selBlock && (selBlock.type === 'repeat' || selBlock.type === 'table')
      ? tableItemCollection(selBlock, selParentCollection)
      : selParentCollection || (zoneMode ? zone!.scope || null : null)),
    [selBlock, selParentCollection, zoneMode, zone?.scope],
  );
  const insertCategory = useMemo(
    () => (selBlock && (selBlock.type === 'repeat' || selBlock.type === 'table')
      ? ((selBlock.collection === 'elements' || selBlock.collection === 'cast') ? selBlock.category : undefined)
      : selParentCategory),
    [selBlock, selParentCategory],
  );

  // Free-table cell ops (roadmap 189): the docked inspector renders the same
  // controls as the floating cell chrome, sharing the selection + editor ref.
  const customSelBlock = selBlock && selBlock.type === 'table' && selBlock.custom ? selBlock : undefined;
  const cellSelForBlock = selCell && customSelBlock && selCell.blockId === customSelBlock.id ? selCell : null;
  const cellOps = useCustomTableCells({
    block: customSelBlock,
    patch: p => { if (selId) patch(selId, p); },
    selection: cellSelForBlock,
    onSelectionChange: sel => setSelCell(sel && customSelBlock ? { blockId: customSelBlock.id, ...sel } : null),
  });
  const cellControls = customSelBlock && cellSelForBlock ? (
    <CustomCellControls
      label={cellOps.label}
      canMerge={cellOps.canMerge}
      canUnmerge={cellOps.canUnmerge}
      project={project}
      styleValue={cellOps.focusStyle}
      objectMixed={cellOps.rangeMixed}
      editorRef={cellEditorRef}
      active={cellRtState}
      readOnly={locked}
      panel
      onMerge={cellOps.merge}
      onUnmerge={cellOps.unmerge}
      onStyle={cellOps.patchStyle}
      onReset={cellOps.resetCells}
      onSaveTextStyles={styles => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles })}
      structure={cellStructureOps(cellOps)}
    />
  ) : null;

  // Palette blocks are always enabled; a disallowed placement explains where
  // the block CAN go instead of silently disabling the palette item.
  const guardAllowed = (payload: PaletteDropPayload, scope: ReportCollection | null | undefined, insideColumns: boolean): boolean => {
    const type: ReportBlock['type'] = payload.field ? 'text' : ((payload.type || 'text') as ReportBlock['type']);
    // Full designer: a design may hold one `callSheetEdit` zone (roadmap 212).
    if (!zoneMode && type === 'callSheetEdit' && activeDesign && findDesignCallSheetZone(activeDesign)) {
      dialog.alert({ title: 'One call-sheet zone per report', message: blockPlacementHint('callSheetEdit') });
      return false;
    }
    if (blockAllowedIn(type, scope, insideColumns, { callSheetZone: zoneMode })) return true;
    dialog.alert({ title: 'Can’t drop that here', message: blockPlacementHint(type, { callSheetZone: zoneMode }) });
    return false;
  };
  const guardInsert = (payload: PaletteDropPayload, scope: ReportCollection | null | undefined, insideColumns: boolean, apply: () => void) => {
    if (guardAllowed(payload, scope, insideColumns)) apply();
  };
  /** Day-grid blocks (items 111/112/159) may only live inside a Days context.
   *  Checked BEFORE a cross-zone batch (the batch removes from the source
   *  first — an aborted target commit must not strand the removal). */
  const canPlaceDayGrid = (type: ReportBlock['type'], scope: ReportCollection | null | undefined): boolean => {
    if (!isDayGridBlock(type)) return true;
    if (fieldScopeFor(scope) === 'days') return true;
    dialog.alert({ title: 'Can’t drop that here', message: blockPlacementHint(type) });
    return false;
  };

  // Freshly added text / free-table blocks enter editing with the caret inside
  // — the canvas focuses once the block has rendered.
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const markAutoEdit = (b: ReportBlock, attribute = false) => {
    if (attribute) return;
    if (b.type === 'text' || (b.type === 'table' && b.custom)) setAutoEditId(b.id);
  };

  // Explicit duplicate (toolbar / block chrome / context menu / Cmd+C): the
  // COPY becomes the selection so it can be edited/moved immediately — but it
  // never auto-enters editing (roadmap 204; only palette inserts do that).
  // Drag duplicates (Alt+drag) keep the SOURCE selected: the drop is the
  // placement gesture and re-dragging should keep placing copies of the
  // original.
  const duplicateBlockSelect = (id: string) => {
    const zone = zoneOf(id);
    const { blocks: next, newId } = duplicateBlockWithId(listOfZone(zone), id);
    if (!newId) return;
    commit(next, zone);
    setSelId(newId);
  };

  const insertPayload = (payload: PaletteDropPayload, id: string | null = selId) => {
    // A palette insert lands as a SIBLING of the selected block — its context
    // is the AMBIENT parent collection, never the selected repeat's own items
    // (`insertScopeFor` would report a repeat target's inner collection and
    // let a day-grid block slip outside the Days repeat).
    guardInsert(payload, id ? parentCollectionOf(listOfZone(zoneOf(id)), id) : null, id ? insideColumnsBlock(allBlocks, id) : false, () => {
      const zone = zoneOf(id);
      const list = listOfZone(zone);
      const b = payloadToBlock(payload, insertScopeFor(list, id));
      const next = id ? insertAfter(list, id, b) : [...list, b];
      commit(next, zone);
      setSelId(b.id);
      markAutoEdit(b, !!payload.field);
    });
  };

  const insertIntoSelected = () => {
    if (!selId) return;
    const b = makeReportBlock('text');
    commitZone(selId, list => insertInto(list, selId, b));
    setSelId(b.id);
    markAutoEdit(b);
  };

  // New-column ops (gutter drops AND edge drops inside a column): a brand-new
  // column of the existing columns block receives the dropped block.
  const insertNewColumn = (columnsId: string, colIndex: number, payload: PaletteDropPayload) => {
    const zone = zoneOf(columnsId);
    const list = listOfZone(zone);
    guardInsert(payload, insertScopeFor(list, columnsId), true, () => {
      const b = payloadToBlock(payload, insertScopeFor(list, columnsId));
      commit(insertColumnAt(list, columnsId, colIndex, b), zone);
      setSelId(b.id);
      markAutoEdit(b, !!payload.field);
    });
  };
  const moveToNewColumn = (moveId: string, columnsId: string, colIndex: number) => {
    const zone = zoneOf(columnsId);
    const srcZone = zoneOf(moveId);
    if (srcZone !== zone) {
      const fm = findBlock(listOfZone(srcZone), moveId);
      if (!fm) return;
      if (!canPlaceDayGrid(fm.block.type, parentCollectionOf(listOfZone(zone), columnsId))) return;
      batch(() => {
        commit(removeBlock(listOfZone(srcZone), moveId), srcZone);
        commit(insertColumnAt(listOfZone(zone), columnsId, colIndex, fm.block), zone);
      });
    } else {
      commit(moveIntoNewColumn(listOfZone(zone), moveId, columnsId, colIndex), zone);
    }
    setSelId(moveId);
  };
  const duplicateToNewColumn = (moveId: string, columnsId: string, colIndex: number) => {
    const zone = zoneOf(columnsId);
    commit(duplicateIntoNewColumn(listOfZone(zone), moveId, columnsId, colIndex), zone);
    setSelId(moveId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape inside an open dialog (styles modal, print dialog…) belongs to
      // the dialog — never hijack it to deselect the block (the chrome and
      // everything mounted inside it, like the modal, would unmount).
      if (e.key === 'Escape') {
        if (currentWin.document.querySelector('[role="dialog"]')) return;
        setMenu(null); setPreview(false); setSelId(null); setSelCol(null); setSelCell(null); return;
      }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const col = selColRef.current;
      if (col) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          const zone = zoneOf(col.colsId);
          const owner = findBlock(listOfZone(zone), col.colsId)?.block;
          if (owner?.type === 'table') commit(removeTableColumnAt(listOfZone(zone), col.colsId, col.colIndex), zone);
          else commit(removeColumnAt(listOfZone(zone), col.colsId, col.colIndex), zone);
          setSelCol(null);
        }
        return;
      }
      const id = selIdRef.current;
      if (!id) return;
      const zone = zoneOf(id);
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit(removeBlock(listOfZone(zone), id), zone); setSelId(null); }
      if (e.key === 'ArrowUp') { e.preventDefault(); commit(moveBlock(listOfZone(zone), id, -1), zone); }
      if (e.key === 'ArrowDown') { e.preventDefault(); commit(moveBlock(listOfZone(zone), id, 1), zone); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); duplicateBlockSelect(id); }
    };
    currentWin.addEventListener('keydown', onKey);
    return () => currentWin.removeEventListener('keydown', onKey);
  }, [currentWin, activeDesign?.id]);

  const importFileRef = useRef<HTMLInputElement>(null);
  const exportDesign = () => {
    if (!activeDesign) return;
    const blob = new Blob([JSON.stringify({
      name: activeDesign.name,
      page: activeDesign.page,
      blocks: activeDesign.blocks,
      header: activeDesign.header || [],
      footer: activeDesign.footer || [],
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeDesign.name || 'report').replace(/[^a-z0-9-_ ]/gi, '')}.report`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importDesign = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.blocks)) throw new Error('bad format');
        const newId = generateUUID();
        dispatch({
          type: 'ADD_REPORT_DESIGN',
          payload: {
            id: newId,
            name: parsed.name || 'Imported Report',
            blocks: parsed.blocks,
            header: parsed.header || [],
            footer: parsed.footer || [],
            page: parsed.page === 'landscape' ? 'landscape' : 'portrait',
          },
        });
        flushPendingText();
        setEditingDesignId(newId);
      } catch {
        // ignore invalid files
      }
    };
    reader.readAsText(file);
  };

  const headerContent = (
    <>
      <DesignsMenu
        designs={project.reportDesigns || []}
        activeId={activeDesign?.id || ''}
        readOnly={locked}
        onSelect={id => { flushPendingText(); follow.noteUserChange(); setEditingDesignId(id); }}
        onRename={(id, name) => dispatch({ type: 'RENAME_REPORT_DESIGN', payload: { id, name } })}
        onDuplicate={id => {
          flushPendingText();
          const d = project.reportDesigns?.find(x => x.id === id);
          const newId = generateUUID();
          dispatch({ type: 'ADD_REPORT_DESIGN', payload: { id: newId, name: `${d?.name || 'Report'} Copy`, cloneFromId: id } });
          setEditingDesignId(newId);
        }}
        onDelete={id => {
          flushPendingText();
          dispatch({ type: 'DELETE_REPORT_DESIGN', payload: id });
          // Dropping the design you were editing: clear the pick — it resolves
          // to the surviving design the reducer promoted.
          if (id === editingDesignId) setEditingDesignId('');
        }}
        onCreate={() => {
          flushPendingText();
          const newId = generateUUID();
          dispatch({ type: 'ADD_REPORT_DESIGN', payload: { id: newId, name: `Report ${(project.reportDesigns?.length || 0) + 1}` } });
          setEditingDesignId(newId);
        }}
        onImport={() => importFileRef.current?.click()}
        onExport={exportDesign}
        onReset={() => {
          const fresh = getDefaultReportDesigns()[0];
          if (activeDesign) commit(JSON.parse(JSON.stringify(fresh.blocks)));
        }}
      />
      <div className="flex-1" />
      <ReportModeSeg
        value={reportMode}
        onChange={mode => { follow.noteUserChange(); setReportModePersisted(mode); }}
      />
      <DropdownMenu
        open={viewMenuOpen}
        onOpenChange={setViewMenuOpen}
        width="w-36"
        trigger={
          <button data-presence-anchor="toolbar:designer:view" className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-item-hover-bg)] transition-colors">
            <span className="font-semibold text-[color:var(--ui-text-faint)]">View:</span>
            <span className="text-[color:var(--ui-input-text)]">{viewMode === 'portrait' ? 'A4 Portrait' : viewMode === 'landscape' ? 'A4 Landscape' : 'Full Width'}</span>
            {scopedDayLabel != null && <span className="text-[color:var(--ui-text-muted)]" title="This report day is pinned — canvas sample and Preview/Print resolve it">· Day {scopedDayLabel}</span>}
            <ChevronDown className="w-3 h-3 text-[color:var(--ui-text-faint)]" />
          </button>
        }
      >
        {(['portrait', 'landscape', 'full'] as const).map(m => (
          <DropdownItem
            key={m}
            onClick={() => {
              setViewMode(m);
              setViewMenuOpen(false);
              if (m !== 'full' && activeDesign && activeDesign.page !== m && !locked) {
                dispatch({ type: 'UPDATE_REPORT_PAGE', payload: { id: activeDesign.id, page: m } });
              }
            }}
            icon={viewMode === m ? <Check className="w-3.5 h-3.5" /> : undefined}
          >
            {m === 'portrait' ? 'A4 Portrait' : m === 'landscape' ? 'A4 Landscape' : 'Full Width'}
          </DropdownItem>
        ))}
        {dayScoped && dayOptions.length > 0 && (
          <>
            <DropdownDivider />
            <DropdownSubmenu id="report-day" label="Report day" icon={<CalendarDays className="w-3.5 h-3.5" />} width="w-64">
              <DayPickerList
                options={dayOptions}
                selectedIndex={previewDay ?? -1}
                allLabel="All days"
                dark
                onSelect={idx => { selectPreviewDay(idx); setViewMenuOpen(false); }}
              />
            </DropdownSubmenu>
          </>
        )}
      </DropdownMenu>
      {hasRibbons && !preview && (
        <Button
          theme="dark"
          variant="subtle"
          active={showRibbonTimes}
          onClick={() => setShowRibbonTimes(v => !v)}
          title="Preview times & durations"
          aria-pressed={showRibbonTimes}
          data-presence-anchor="toolbar:designer:times"
        >
          <Clock className="w-3.5 h-3.5" /> Times
        </Button>
      )}
      <button
        onClick={() => { follow.noteUserChange(); setPreview(v => !v); }}
        data-presence-anchor="toolbar:designer:preview"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-item-hover-bg)]"
      >
        {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        {preview ? 'Edit' : 'Preview'}
      </button>
      <button
        onClick={() => activeDesign && onPrint?.(activeDesign, dayScoped && scopedDay != null ? scopedDay : undefined)}
        disabled={!onPrint}
        data-presence-anchor="toolbar:designer:print"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-[var(--ui-text-strong)] text-[color:var(--ui-panel-bg)] font-medium hover:bg-[var(--ui-text)] disabled:opacity-30"
      >
        <Printer className="w-3.5 h-3.5" /> Print
      </button>
      <input
        ref={importFileRef}
        type="file"
        accept=".report,.json"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) importDesign(f); e.target.value = ''; }}
      />
    </>
  );

  if (!activeDesign || !ctx) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--ui-modal-header-base)] text-[color:var(--ui-text-faint)] text-sm">
        No report designs yet — create one from the header menu.
      </div>
    );
  }

  const docked = editorMode === 'toolbar';
  const selColBlock = selCol ? findBlock(allBlocks, selCol.colsId)?.block ?? null : null;
  // The production day the zone resolves against (roadmap 212) — passed to the
  // bare canvas so `{{dayNumber}}`-style tokens and nested repeats use it.
  const zoneItem = zoneMode && ctx && zone!.previewSectionIndex != null
    ? ctx.dayInfos.find(d => d.section.index === zone!.previewSectionIndex)
    : undefined;

  // Column ops shared by the canvas column chromes and the docked inspector.
  const insertTableColumn = (tableId: string, at: number) => {
    const zone = zoneOf(tableId);
    commit(insertTableColumnAt(listOfZone(zone), tableId, at), zone);
  };
  const removeTableColumn = (tableId: string, colIndex: number) => {
    const zone = zoneOf(tableId);
    commit(removeTableColumnAt(listOfZone(zone), tableId, colIndex), zone);
    setSelCol(null);
  };
  const moveTableColumnBy = (tableId: string, from: number, to: number) => {
    const zone = zoneOf(tableId);
    commit(moveTableColumn(listOfZone(zone), tableId, from, to), zone);
    setSelCol(prev => (prev && prev.colsId === tableId ? { ...prev, colIndex: to } : prev));
  };
  const removeColumnsColumn = (columnsId: string, colIndex: number) => {
    const zone = zoneOf(columnsId);
    commit(removeColumnAt(listOfZone(zone), columnsId, colIndex), zone);
    setSelCol(null);
  };
  const moveColumnsColumnBy = (columnsId: string, from: number, to: number) => {
    const zone = zoneOf(columnsId);
    commit(moveColumnAt(listOfZone(zone), columnsId, from, to), zone);
    setSelCol(prev => (prev && prev.colsId === columnsId ? { ...prev, colIndex: to } : prev));
  };

  const columnProps = selCol && selColBlock ? {
    colSel: selCol,
    colBlock: selColBlock,
    onColPatch: (p: Partial<ReportBlock>) => patch(selColBlock.id, p),
    onColInsertAt: (at: number) => selColBlock.type === 'table'
      ? insertTableColumn(selColBlock.id, at)
      : insertNewColumn(selColBlock.id, at, { kind: 'block', type: 'text' }),
    onColMove: (d: -1 | 1) => selColBlock.type === 'table'
      ? moveTableColumnBy(selColBlock.id, selCol.colIndex, selCol.colIndex + d)
      : moveColumnsColumnBy(selColBlock.id, selCol.colIndex, selCol.colIndex + d),
    onColDelete: () => selColBlock.type === 'table'
      ? removeTableColumn(selColBlock.id, selCol.colIndex)
      : removeColumnsColumn(selColBlock.id, selCol.colIndex),
  } : {};

  const toolbarProps = {
    block: selBlock,
    parentCollection: selParentCollection,
    parentCategory: selParentCategory,
    project,
    readOnly: locked,
    onPatch: (p: Partial<ReportBlock>) => selId && patch(selId, p),
    onSaveTextStyles: (styles: ReportTextStyle[]) => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles }),
    onDuplicate: () => selId && duplicateBlockSelect(selId),
    onRemove: () => { if (selId) { commitZone(selId, list => removeBlock(list, selId)); setSelId(null); } },
    onMove: (d: -1 | 1) => selId && commitZone(selId, list => moveBlock(list, selId, d)),
    ...columnProps,
    cellControls,
    editorRef: textEditorRef,
    active: textRtState,
    chipKey: textChipKey,
  };

  // Rail actions, rendered IN the chrome header's trailing slot (block) or as
  // its headerTrailing (column) — no separate rail header bar (roadmap 205).
  const railActions = (
    <>
      <ToolButton onClick={toggleEditorMode} title="Floating editor" className={TB_BTN_ICON}><ArrowRightLeft className="w-3 h-3" /></ToolButton>
      <ToolButton onClick={() => setRail(p => ({ ...p, open: false }))} title="Collapse panel" className={TB_BTN_ICON}><PanelLeftClose className="w-3 h-3" /></ToolButton>
    </>
  );

  return (
    <div
      className="flex-1 flex flex-col bg-[var(--ui-modal-header-base)] text-[color:var(--ui-text)] select-none min-h-0 min-w-0"
      // Commit-on-blur (roadmap 251): a text editor losing focus — or Escape
      // ending an edit session (capture: the editor stops propagation) — is the
      // commit point for the deferred store write.
      onBlur={e => { if (isTextEditingElement(e.target as Element)) flushPendingText(); }}
      onKeyDownCapture={e => { if (e.key === 'Escape') flushPendingText(); }}
    >
      <DelegatedTooltip />
      {!zoneMode && (headerTarget ? createPortal(headerContent, headerTarget) : <header data-chrome-bar="report-designer-header" className={`flex items-center ${CHROME_ITEM_GAP} ${CHROME_BAR_INSET} py-2 border-b border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)]`}>{headerContent}</header>)}

      {preview && !zoneMode ? (
        <ReportPreview design={activeDesign} ctx={ctx} fieldMap={fieldMap} scopeFilter={previewScopeFilter} onExit={() => setPreview(false)} />
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
          {/* One left rail for the whole editor: the palette normally, the
              inspector for the selected block/column. Collapsible + drag-
              resizable like the manager side panels. */}
          {docked ? (
            rail.open ? (
              <div className="relative flex shrink-0" style={{ width: rail.width, maxWidth: '70%' }}>
                <aside className="min-w-0 flex-1 bg-[var(--ui-panel-bg)] border-r border-[color:var(--ui-border)] flex flex-col min-h-0">
                  {selBlock || selColBlock ? (
                    <ReportToolbar {...toolbarProps} headerActions={railActions} />
                  ) : (
                    <>
                      <div className="shrink-0 flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-[color:var(--ui-border)] px-3 py-2">
                        <div className="ml-auto flex items-center gap-1">{railActions}</div>
                      </div>
                      <div className="shrink-0 border-b border-[color:var(--ui-border)] px-3 py-2">
                        <span className="text-[10px] text-[color:var(--ui-text-faint)]">Select a block to edit it. Click an item in the palette to add it.</span>
                      </div>
                      <ReportPalette project={project} insertScope={insertScope} insertCategory={insertCategory} onInsert={insertPayload} readOnly={locked} fill />
                    </>
                  )}
                </aside>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize panel"
                  onPointerDown={onRailResize}
                  className="absolute inset-y-0 right-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize touch-none hover:bg-blue-400/40"
                />
              </div>
            ) : (
              <div className="w-8 shrink-0 bg-[var(--ui-panel-bg)] border-r border-[color:var(--ui-border)] flex flex-col items-center pt-3">
                <button
                  onClick={() => setRail(p => ({ ...p, open: true }))}
                  className="text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text-strong)] transition-colors"
                  title="Expand panel"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </div>
            )
          ) : (
            <ReportPalette project={project} insertScope={insertScope} insertCategory={insertCategory} onInsert={insertPayload} readOnly={locked} />
          )}
          <div className="flex-1 flex flex-col min-w-0 min-h-0" data-presence-surface={zoneMode ? undefined : 'report-designer'}>
            {(() => {
              // Zone mode (roadmap 212): the call-sheet host builds its WYSIWYG
              // white page AROUND this canvas, so hand it the live canvas node
              // instead of rendering the designer's own page here.
              const canvasNode = (
            <ReportDesignerCanvas
              blocks={blocks}
              headerBlocks={headerBlocks}
              footerBlocks={footerBlocks}
              skipFirstHeader={skipFirstHeader}
              skipFirstFooter={skipFirstFooter}
              onToggleHeaderSkipFirst={() => { const next = !skipFirstHeaderRef.current; skipFirstHeaderRef.current = next; setSkipFirstHeader(next); commitAll(); }}
              onToggleFooterSkipFirst={() => { const next = !skipFirstFooterRef.current; skipFirstFooterRef.current = next; setSkipFirstFooter(next); commitAll(); }}
              selId={selId}
              selCol={selCol}
              ctx={ctx}
              fieldMap={fieldMap}
              readOnly={locked}
              mode={reportMode}
              previewSectionIndex={zoneMode ? zone!.previewSectionIndex : (dayScoped && effectiveDay != null ? effectiveDay : undefined)}
              autoEditId={autoEditId}
              onAutoEditHandled={() => setAutoEditId(null)}
              project={project}
              parentCollection={zoneMode ? zone!.scope : selParentCollection}
              parentCategory={selParentCategory}
              rootItem={zoneMode ? zoneItem : undefined}
              bare={zoneMode}
              ribbonOverrides={ribbonOverrides}
      onSaveTextStyles={styles => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles })}
      onToggleEditorMode={toggleEditorMode}
      viewWidth={zoneMode ? null : viewWidth}
              pageSize={activeDesign?.page}
              presenceAnchorPrefix={designId && !zoneMode ? `report:${designId}:block:` : undefined}
              onSelect={selectBlock}
              onSelectCol={selectCol}
              onPatch={patch}
              onInsertTableColumnAt={insertTableColumn}
              onRemoveTableColumn={removeTableColumn}
              onInsertIntoZone={(zone, payload) => {
                // dragging an existing block moves it (Alt = duplicate)
                if (payload.moveId) {
                  const srcZone = zoneOf(payload.moveId);
                  const srcList = listOfZone(srcZone);
                  const fm = findBlock(srcList, payload.moveId);
                  if (!fm) return;
                  // Target = the ZONE ROOT (not a repeat's inside) — ambient scope.
                  if (!canPlaceDayGrid(fm.block.type, null)) return;
                  const tgtList = listOfZone(zone);
                  const moving = srcZone !== zone;
                  const next = payload.duplicate
                    ? [...tgtList, cloneBlock(fm.block)]
                    : moving ? [...tgtList, fm.block] : tgtList;
                  if (moving || payload.duplicate) {
                    batch(() => {
                      if (moving) commit(removeBlock(srcList, payload.moveId), srcZone);
                      commit(next, zone);
                    });
                  } else {
                    commit(next, zone);
                  }
                  setSelId(payload.moveId);
                  return;
                }
                guardInsert(payload, null, false, () => {
                  const b = payloadToBlock(payload, null);
                  commit([...listOfZone(zone), b], zone);
                  setSelId(b.id);
                  markAutoEdit(b, !!payload.field);
                });
              }}
              editorMode={editorMode}
              onMoveTableColumn={moveTableColumnBy}
              onInsertAfter={(id, payload) => { const zone = zoneOf(id); const list = listOfZone(zone); guardInsert(payload, id ? parentCollectionOf(list, id) : null, id ? insideColumnsBlock(allBlocks, id) : false, () => { const b = payloadToBlock(payload, insertScopeFor(list, id)); commit(id ? insertAfter(list, id, b) : [...list, b], zone); setSelId(b.id); markAutoEdit(b, !!payload.field); }); }}
              onInsertBefore={(id, payload) => { const zone = zoneOf(id); const list = listOfZone(zone); guardInsert(payload, id ? parentCollectionOf(list, id) : null, id ? insideColumnsBlock(allBlocks, id) : false, () => { const b = payloadToBlock(payload, insertScopeFor(list, id)); commit(id ? insertBefore(list, id, b) : [b, ...list], zone); setSelId(b.id); markAutoEdit(b, !!payload.field); }); }}
              onInsertInto={(id, payload) => { const zone = zoneOf(id); const list = listOfZone(zone); guardInsert(payload, insertScopeFor(list, id), id ? insideColumnsBlock(allBlocks, id) : false, () => { const b = payloadToBlock(payload, insertScopeFor(list, id)); commit(insertInto(list, id, b), zone); setSelId(b.id); markAutoEdit(b, !!payload.field); }); }}
              onMoveInto={(containerId, moveId) => {
                const zone = zoneOf(containerId);
                const srcZone = zoneOf(moveId);
                if (srcZone !== zone) {
                  const fm = findBlock(listOfZone(srcZone), moveId);
                  if (!fm) return;
                  // Moving INTO a container (a repeat's inside) — that context.
                  if (!canPlaceDayGrid(fm.block.type, insertScopeFor(listOfZone(zone), containerId))) return;
                  batch(() => {
                    commit(removeBlock(listOfZone(srcZone), moveId), srcZone);
                    commit(insertInto(listOfZone(zone), containerId, fm.block), zone);
                  });
                } else {
                  commit(moveIntoChildren(listOfZone(zone), moveId, containerId), zone);
                }
                setSelId(moveId);
              }}
              onDuplicateInto={(containerId, moveId) => {
                const zone = zoneOf(containerId);
                const src = findBlock(listOfZone(zoneOf(moveId)), moveId);
                if (!src) return;
                commit(insertInto(listOfZone(zone), containerId, cloneBlock(src.block)), zone);
              }}
              onMoveTo={(moveId, targetId, pos) => {
                const srcZone = zoneOf(moveId);
                const tgtZone = zoneOf(targetId);
                if (srcZone === tgtZone) {
                  commit(moveBlockTo(listOfZone(srcZone), moveId, targetId, pos), srcZone);
                } else {
                  const fm = findBlock(listOfZone(srcZone), moveId);
                  if (!fm) return;
                  // Before/after a target = SIBLING of it — the ambient context.
                  if (!canPlaceDayGrid(fm.block.type, parentCollectionOf(listOfZone(tgtZone), targetId))) return;
                  batch(() => {
                    commit(removeBlock(listOfZone(srcZone), moveId), srcZone);
                    commit(pos === 'before' ? insertBefore(listOfZone(tgtZone), targetId, fm.block) : insertAfter(listOfZone(tgtZone), targetId, fm.block), tgtZone);
                  });
                }
                setSelId(moveId);
              }}
              onDuplicateTo={(moveId, targetId, pos) => {
                const zone = zoneOf(targetId);
                const copy = duplicateBlockTo(listOfZone(zone), moveId, targetId, pos);
                commit(copy, zone);
                setSelId(moveId);
              }}
              onWrap={(targetId, payload, side) => {
                const zone = zoneOf(targetId);
                const list = listOfZone(zone);
                const owner = listOwnerOf(list, targetId);
                if (owner?.colIndex !== undefined) {
                  // Target lives inside a column → add a NEW column to that
                  // columns block (left edge = before its column, right edge =
                  // after), reusing the gutter's new-column ops — no nested
                  // columns block.
                  const colIndex = side === 'left' ? owner.colIndex : owner.colIndex + 1;
                  if (payload.moveId) {
                    if (payload.duplicate) duplicateToNewColumn(payload.moveId, owner.blockId, colIndex);
                    else moveToNewColumn(payload.moveId, owner.blockId, colIndex);
                  } else {
                    insertNewColumn(owner.blockId, colIndex, payload);
                  }
                  return;
                }
                // Wrapping makes the dropped block a SIBLING of the target —
                // validate against the target's AMBIENT context, not the
                // target's own collection (a Days repeat would otherwise let a
                // day-grid block land beside it, outside the day context).
                if (!payload.moveId && !guardAllowed(payload, parentCollectionOf(list, targetId), true)) return;
                const dropped = payload.moveId
                  ? findBlock(listOfZone(zoneOf(payload.moveId)), payload.moveId)?.block ?? null
                  : payloadToBlock(payload, insertScopeFor(list, targetId));
                if (!dropped) return;
                if (payload.moveId && payload.duplicate) {
                  commit(wrapWithColumns(list, targetId, cloneBlock(dropped), side), zone);
                } else {
                  commit(wrapWithColumns(list, targetId, dropped, side, payload.moveId), zone);
                }
              }}
              onInsertIntoColumn={(columnsId, colIndex, payload) => {
                const zone = zoneOf(columnsId);
                const list = listOfZone(zone);
                guardInsert(payload, insertScopeFor(list, columnsId), true, () => {
                  const b = payloadToBlock(payload, insertScopeFor(list, columnsId));
                  commit(appendToColumn(list, columnsId, colIndex, b), zone);
                  setSelId(b.id);
                  markAutoEdit(b, !!payload.field);
                });
              }}
              onMoveIntoColumn={(moveId, columnsId, colIndex) => {
                const zone = zoneOf(columnsId);
                const srcZone = zoneOf(moveId);
                if (srcZone !== zone) {
                  batch(() => {
                    const fm = findBlock(listOfZone(srcZone), moveId);
                    if (!fm) return;
                    commit(removeBlock(listOfZone(srcZone), moveId), srcZone);
                    commit(appendToColumn(listOfZone(zone), columnsId, colIndex, fm.block), zone);
                  });
                } else {
                  commit(moveIntoColumn(listOfZone(zone), moveId, columnsId, colIndex), zone);
                }
                setSelId(moveId);
              }}
              onDuplicateIntoColumn={(moveId, columnsId, colIndex) => {
                const zone = zoneOf(columnsId);
                const fm = findBlock(listOfZone(zoneOf(moveId)), moveId);
                if (!fm) return;
                commit(appendToColumn(listOfZone(zone), columnsId, colIndex, cloneBlock(fm.block)), zone);
              }}
              onInsertNewColumn={insertNewColumn}
              onMoveToNewColumn={moveToNewColumn}
              onDuplicateToNewColumn={duplicateToNewColumn}
              onRemoveColumn={removeColumnsColumn}
              onMoveColumn={moveColumnsColumnBy}
              onDuplicate={id => duplicateBlockSelect(id)}
              onRemove={id => { commitZone(id, list => removeBlock(list, id)); if (selId === id) setSelId(null); if (selCol?.colsId === id) setSelCol(null); }}
              onMove={(id, d) => commitZone(id, list => moveBlock(list, id, d))}
              onMenu={(e, id, colIndex) => {
                setSelId(id);
                setSelCol(colIndex !== undefined ? { colsId: id, colIndex } : null);
                setSelCell(null);
                setMenu({ x: e.clientX, y: e.clientY, id, colIndex });
              }}
              cellSel={selCell}
              onCellSel={(blockId, sel) => setSelCell(sel ? { blockId, ...sel } : null)}
              cellEditorRef={cellEditorRef}
              onCellRtStateChange={setCellRtState}
              textEditorRef={textEditorRef}
              textRtState={textRtState}
              onTextRtStateChange={setTextRtState}
              textChipKey={textChipKey}
              onTextSelectionChange={sel => setTextChipKey(sel?.key ?? null)}
            />
              );
              return zoneMode
                ? zone!.renderPage({ canvas: canvasNode, ctx, fieldMap })
                : canvasNode;
            })()}

            {/* Peer selection (roadmap 234 stage 2): the selected block (or
                table column) publishes as an item id; peers' selections paint
                as their-coloured rings on the same cards. */}
            <PeerItemOutlines scope="report-designer" items={reportSelection} resolve={resolveReportItem} />
          </div>
        </div>
      )}

      {menu && selBlock && (
        <ReportContextMenu
          menu={menu}
          block={selBlock}
          project={project}
          insertScope={insertScope}
          insertCategory={insertCategory}
          parentCollection={selParentCollection}
          parentCategory={selParentCategory}
          onClose={() => setMenu(null)}
          onChangeField={f => {
            if (menu.colIndex !== undefined && selBlock?.type === 'table') {
              const cols = selBlock.columns || [];
              patch(menu.id, { columns: cols.map((c, i) => i === menu.colIndex ? { ...c, field: f } : c) });
              return;
            }
            patch(menu.id, { field: f });
          }}
          onInsertAbove={() => { const b = makeReportBlock('text'); commitZone(menu.id, list => insertBefore(list, menu.id, b)); setSelId(b.id); markAutoEdit(b); }}
          onInsertBelow={() => { const b = makeReportBlock('text'); commitZone(menu.id, list => insertAfter(list, menu.id, b)); setSelId(b.id); markAutoEdit(b); }}
          onAddChild={insertIntoSelected}
          onDuplicate={() => duplicateBlockSelect(menu.id)}
          onRemove={() => { commitZone(menu.id, list => removeBlock(list, menu.id)); setSelId(null); setMenu(null); }}
          onColumnInsertAt={i => {
            if (menu.colIndex === undefined) return;
            const zone = zoneOf(menu.id);
            if (selBlock?.type === 'table') {
              commit(insertTableColumnAt(listOfZone(zone), menu.id, i), zone);
              setMenu(null);
              return;
            }
            const b = makeReportBlock('text');
            commit(insertColumnAt(listOfZone(zone), menu.id, i, b), zone);
            setSelId(b.id);
            markAutoEdit(b);
            setMenu(null);
          }}
          onColumnMove={dir => {
            if (menu.colIndex === undefined) return;
            const zone = zoneOf(menu.id);
            // Tables move a column; a Columns block moves one of its columns.
            if (selBlock?.type === 'table') commit(moveTableColumn(listOfZone(zone), menu.id, menu.colIndex, menu.colIndex + dir), zone);
            else commit(moveColumnAt(listOfZone(zone), menu.id, menu.colIndex, menu.colIndex + dir), zone);
            setSelCol({ colsId: menu.id, colIndex: menu.colIndex + dir });
            setMenu(null);
          }}
          onColumnAddText={() => {
            if (menu.colIndex === undefined) return;
            const zone = zoneOf(menu.id);
            const b = makeReportBlock('text');
            commit(appendToColumn(listOfZone(zone), menu.id, menu.colIndex, b), zone);
            setSelId(b.id);
            markAutoEdit(b);
            setMenu(null);
          }}
          onPatch={p => patch(menu.id, p)}
          onColumnRemove={() => {
            if (menu.colIndex === undefined) return;
            const zone = zoneOf(menu.id);
            if (selBlock?.type === 'table') commit(removeTableColumnAt(listOfZone(zone), menu.id, menu.colIndex), zone);
            else commit(removeColumnAt(listOfZone(zone), menu.id, menu.colIndex), zone);
            setSelCol(null);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

const DesignsMenu: React.FC<{
  designs: ReportDesign[];
  activeId: string;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onExport: () => void;
  onReset: () => void;
}> = ({ designs, activeId, readOnly, onSelect, onRename, onDuplicate, onDelete, onCreate, onImport, onExport, onReset }) => {
  const [open, setOpen] = useState(false);
  return (
    <ItemManagerDropdown
      open={open}
      onClose={setOpen}
      items={designs.map(d => ({ id: d.id, name: d.name }))}
      activeId={activeId}
      label="Editing"
      header="REPORT DESIGNS"
      readOnly={readOnly}
      trigger={
        <Button theme="dark" data-presence-anchor="toolbar:designer:designs" className={readOnly ? 'opacity-40 cursor-not-allowed' : ''}>
          <span className="text-xs font-semibold text-[color:var(--ui-text-faint)]">Editing: <span className="text-[color:var(--ui-input-text)]">{designs.find(d => d.id === activeId)?.name || '—'}</span></span>
          <ChevronDown className="w-3 h-3 text-[color:var(--ui-text-faint)]" />
        </Button>
      }
      onSelect={id => { onSelect(id); setOpen(false); }}
      onRename={(id, name) => { onRename(id, name); }}
      onDuplicate={id => { onDuplicate(id); setOpen(false); }}
      onDelete={id => { onDelete(id); setOpen(false); }}
      onCreate={() => { onCreate(); setOpen(false); }}
      onImport={() => { onImport(); setOpen(false); }}
      onExport={() => { onExport(); setOpen(false); }}
      onReset={() => { onReset(); setOpen(false); }}
    />
  );
};
