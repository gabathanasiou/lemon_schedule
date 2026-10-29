/* fork: DOM cells ------------------------------------------------------------
   Glide paints cells on a canvas, so there is no place for a real control.
   This wrapper mounts a click-through layer above the canvas and keeps one
   real control glued to each requested cell.

   POSITIONING — content space, not viewport space. A box is placed ONCE from
   the grid's own content geometry (`getContentBounds`, scroll independent);
   scrolling then moves whole BANDS with a compositor `translate3d` — the same
   scroll offsets the canvas paints with, written in the scroll pass. There is
   no per-frame `getBounds` (which answers with the LAST PAINTED offsets and is
   stale for a frame at speed) and no scroll heuristic: at any speed —
   vertical, horizontal, or both — a control cannot straddle two cells.

   BANDS — frozen columns and headers do not scroll on one axis, so the layer
   is split into four clipped bands, each with its own mover:

     [ frozen headers ] [ headers            ]  (pin Y, scroll X)
     [ frozen cells   ] [ body cells         ]  (pin X, scroll Y)
                        ^ sticky add-row inset

   The frozen pane is the row-marker gutter plus the frozen data columns. The
   sticky trailing add row is handled structurally too: the body bands end at
   `domCellBottomInset`, so boxes never float on the add row.

   API: pass `getDomCell(col, row) -> ReactNode | null` and
   `getDomHeaderCell(col) -> ReactNode | null` (data-column indices; the
   row-marker gutter is excluded). Nodes are rendered during React render
   (never cached), so host state updates flow through.
 --------------------------------------------------------------------------- */
import * as React from "react";
import { DataEditorAll } from "../data-editor-all.js";

/* Rows/columns rendered beyond the visible band, so a fast flick never reveals
   a cell whose control has not mounted yet. */
const ROW_OVERSCAN = 4;
const COL_OVERSCAN = 2;
/* A cell is "relevant" once it is within this many px of the visible band:
   the window rebuilds a little before a control would actually enter. */
const WINDOW_SLACK = 1;

export const DataEditorWithDomCells = React.forwardRef(function DataEditorWithDomCells(props, ref) {
    const { getDomCell, getDomHeaderCell, onVisibleRegionChanged, onCellActivated, domCellClassName, gridSelection, freezeColumns = 0, domCellBottomInset = 0, ...rest } = props;
    const focusedCell = gridSelection?.current?.cell;
    const columns = props.columns;
    const columnCount = columns != null ? columns.length : 0;

    /* Live props the scroll/measure passes read without re-creating them. */
    const rowsRef = React.useRef(props.rows);
    rowsRef.current = props.rows;
    const columnCountRef = React.useRef(columnCount);
    columnCountRef.current = columnCount;
    const freezeRef = React.useRef(freezeColumns);
    freezeRef.current = freezeColumns;
    const rowHeightRef = React.useRef(props.rowHeight);
    rowHeightRef.current = props.rowHeight;
    const smoothXRef = React.useRef(props.smoothScrollX === true);
    smoothXRef.current = props.smoothScrollX === true;
    const smoothYRef = React.useRef(props.smoothScrollY === true);
    smoothYRef.current = props.smoothScrollY === true;
    const bottomInsetRef = React.useRef(domCellBottomInset);
    bottomInsetRef.current = domCellBottomInset;

    const innerRef = React.useRef(null);
    React.useImperativeHandle(ref, () => innerRef.current, []);
    const wrapRef = React.useRef(null);
    const layerRef = React.useRef(null);
    /* One mover per scrolling band — a scroll frame writes THREE transforms,
       never one position per control. */
    const bodyRef = React.useRef(null);
    const bodyMoverRef = React.useRef(null);
    const frozenBodyRef = React.useRef(null);
    const frozenBodyMoverRef = React.useRef(null);
    const headerRef = React.useRef(null);
    const headerMoverRef = React.useRef(null);
    const frozenHeaderRef = React.useRef(null);

    const scrollerRef = React.useRef(null);
    /* The element the scroll listener is bound to, and that listener. Safari
       does not deliver element scrolls through an ancestor's capture phase, so
       the listener goes on the scroller itself and is re-bound whenever the
       grid replaces it (width 0 → sized). */
    const scrollBindingRef = React.useRef(null);
    const visibleRef = React.useRef(null);
    /* The rendered window of body cells: { y0, y1, x0, x1 }. */
    const windowRef = React.useRef(null);
    /* Data shape the window was built for; a change forces a rebuild. */
    const layoutKeyRef = React.useRef(null);
    /* Scrollable x edge per scrolled column, for non-smooth (snapped) scrolling. */
    const columnEdgesRef = React.useRef(null);
    const [boxes, setBoxes] = React.useState([]);

    /* A header is "focused" when the selection covers its column — the same
       rule the canvas header tint uses (every column of a range, not just the
       current cell's). */
    const headerFocused = col => {
        const cur = gridSelection?.current;
        if (cur == null) return false;
        const inRange = r => r != null && col >= r.x && col < r.x + r.width;
        return cur.cell?.[0] === col || inRange(cur.range) || (cur.rangeStack ?? []).some(inRange);
    };

    /* Move every band to the current scroll offsets. Glide paints from the
       SAME offsets in its own layout effect, so the canvas and the controls
       land in the same frame. */
    const applyScroll = React.useCallback(() => {
        const scroller = scrollerRef.current;
        const scrollX = scroller != null ? scroller.scrollLeft : 0;
        const scrollY = scroller != null ? scroller.scrollTop : 0;
        let x = scrollX;
        let y = scrollY;
        if (!smoothYRef.current) {
            /* Non-smooth scrolling snaps to whole rows (Glide's own rule). */
            const rowHeight = rowHeightRef.current;
            const rowCount = rowsRef.current;
            if (typeof rowHeight === "number" && rowHeight > 0 && rowCount > 0) {
                y = Math.min(rowCount - 1, Math.max(0, Math.ceil(scrollY / rowHeight))) * rowHeight;
            }
        }
        if (!smoothXRef.current) {
            /* Non-smooth scrolling snaps to whole columns. */
            const edges = columnEdgesRef.current;
            if (edges != null && edges.length > 0) {
                for (let i = 0; i < edges.length; i++) {
                    const right = i + 1 < edges.length ? edges[i + 1] : Infinity;
                    if (scrollX < right) {
                        x = Math.max(0, edges[i]);
                        break;
                    }
                }
            }
        }
        if (bodyMoverRef.current != null) bodyMoverRef.current.style.transform = "translate3d(" + -x + "px," + -y + "px,0)";
        if (frozenBodyMoverRef.current != null) frozenBodyMoverRef.current.style.transform = "translate3d(0," + -y + "px,0)";
        if (headerMoverRef.current != null) headerMoverRef.current.style.transform = "translate3d(" + -x + "px,0,0)";
    }, []);

    /* Lay the bands out for the current sizes and pin each mounted box to its
       content position. Runs before paint on every render, on resize, and on
       scroll (cheap: boxes don't move on scroll — only the movers do). */
    const measure = React.useCallback(() => {
        const wrap = wrapRef.current;
        const grid = innerRef.current;
        if (wrap == null || grid == null) return;
        const canvas = wrap.querySelector('canvas[data-testid="data-grid-canvas"]');
        const scroller = wrap.querySelector(".dvn-scroller");
        scrollerRef.current = scroller;
        const binding = scrollBindingRef.current;
        if (binding == null || binding.el !== scroller) {
            if (binding != null) binding.el.removeEventListener("scroll", binding.fn);
            scrollBindingRef.current = null;
            if (scroller != null) {
                const fn = () => applyScroll();
                scroller.addEventListener("scroll", fn, { passive: true });
                scrollBindingRef.current = { el: scroller, fn };
            }
        }
        const wrapRect = wrap.getBoundingClientRect();
        const canvasRect = canvas != null ? canvas.getBoundingClientRect() : wrapRect;
        const canvasLeft = canvasRect.left - wrapRect.left;
        const canvasTop = canvasRect.top - wrapRect.top;
        const cols = columnCountRef.current;
        const freeze = Math.max(0, Math.min(freezeRef.current, cols));
        const headerBounds = grid.getContentBounds(0, -1);
        const headerHeight = headerBounds != null ? Math.round(headerBounds.y + headerBounds.height) : 0;
        /* The frozen pane: the row-marker gutter plus the frozen data columns
           (the scroller's own x = 0 is that pane's right edge). */
        let frozenWidth = 0;
        if (cols > 0) {
            if (freeze >= cols) {
                frozenWidth = Math.max(0, Math.round(wrapRect.width - canvasLeft));
            }
            else {
                const firstScrolled = grid.getContentBounds(freeze, -1);
                frozenWidth = firstScrolled != null ? Math.round(firstScrolled.x) : 0;
            }
        }
        const bottomInset = Math.max(0, bottomInsetRef.current);
        const band = (el, style) => {
            if (el == null) return;
            for (const [key, value] of Object.entries(style)) el.style[key] = value;
        };
        band(frozenBodyRef.current, {
            left: canvasLeft + "px",
            top: canvasTop + headerHeight + "px",
            width: frozenWidth + "px",
            bottom: bottomInset + "px",
        });
        band(bodyRef.current, {
            left: canvasLeft + frozenWidth + "px",
            top: canvasTop + headerHeight + "px",
            right: "0px",
            bottom: bottomInset + "px",
        });
        band(frozenHeaderRef.current, {
            left: canvasLeft + "px",
            top: canvasTop + "px",
            width: frozenWidth + "px",
            height: headerHeight + "px",
        });
        band(headerRef.current, {
            left: canvasLeft + frozenWidth + "px",
            top: canvasTop + "px",
            right: "0px",
            height: headerHeight + "px",
        });
        const edges = [];
        for (let col = freeze; col < cols; col++) {
            const bounds = grid.getContentBounds(col, -1);
            if (bounds == null) break;
            edges.push(Math.round(bounds.x - frozenWidth));
        }
        columnEdgesRef.current = edges;
        const layer = layerRef.current;
        if (layer != null) {
            for (const el of layer.querySelectorAll("[data-glide-dom-cell],[data-glide-dom-header]")) {
                const cellKey = el.getAttribute("data-glide-dom-cell");
                const headerCol = el.getAttribute("data-glide-dom-header");
                let col = -1;
                let row = -1;
                if (cellKey != null) {
                    const parts = cellKey.split(":");
                    col = Number(parts[0]);
                    row = Number(parts[1]);
                }
                else if (headerCol != null) {
                    col = Number(headerCol);
                }
                else {
                    continue;
                }
                const bounds = grid.getContentBounds(col, row);
                if (bounds == null) continue;
                const frozen = col < freeze;
                el.style.left = Math.round(bounds.x - (frozen ? 0 : frozenWidth)) + "px";
                el.style.top = Math.round(bounds.y - (headerCol != null ? 0 : headerHeight)) + "px";
                el.style.width = Math.round(bounds.width) + "px";
                el.style.height = Math.round(bounds.height) + "px";
            }
        }
        applyScroll();
    }, [applyScroll]);

    /* Which body cells exist as React nodes. Kept to a window around the
       visible band: a canvas grid must never mount a control per cell. The
       window is a superset with overscan, so scrolling never waits for React
       to mount a control that just entered the view. */
    const updateWindow = React.useCallback(range => {
        const rowCount = rowsRef.current;
        const colCount = columnCountRef.current;
        if (rowCount == null || colCount == null) return;
        const freeze = Math.max(0, Math.min(freezeRef.current, colCount));
        const visibleY0 = Math.max(0, Math.floor(range.y) - WINDOW_SLACK);
        const visibleY1 = Math.min(rowCount - 1, Math.ceil(range.y + range.height) + WINDOW_SLACK);
        const visibleX0 = Math.max(freeze, Math.floor(range.x) - WINDOW_SLACK);
        const visibleX1 = Math.min(colCount - 1, Math.ceil(range.x + range.width) + WINDOW_SLACK);
        const current = windowRef.current;
        if (current != null &&
            visibleY0 >= current.y0 && visibleY1 <= current.y1 &&
            visibleX0 >= current.x0 && visibleX1 <= current.x1) {
            return;
        }
        const y0 = Math.max(0, visibleY0 - ROW_OVERSCAN);
        const y1 = Math.min(rowCount - 1, visibleY1 + ROW_OVERSCAN);
        const x0 = Math.max(freeze, visibleX0 - COL_OVERSCAN);
        const x1 = Math.min(colCount - 1, visibleX1 + COL_OVERSCAN);
        windowRef.current = { y0, y1, x0, x1 };
        const next = [];
        for (let row = y0; row <= y1; row++) {
            for (let col = 0; col < freeze; col++) next.push({ col, row });
            for (let col = x0; col <= x1; col++) next.push({ col, row });
        }
        setBoxes(prev => {
            if (prev.length !== next.length) return next;
            for (let i = 0; i < next.length; i++) {
                const a = prev[i];
                const b = next[i];
                if (a.col !== b.col || a.row !== b.row) return next;
            }
            return prev;
        });
    }, []);

    // Any layout change can move cells: re-pin before paint.
    React.useLayoutEffect(() => {
        // A data change (add/remove row or column, a different freeze count) can
        // leave the mounted window stale: rows that just appeared would have no
        // control, rows that just went away would keep a dead one. Rebuild it.
        if (layoutKeyRef.current !== layoutKey) {
            layoutKeyRef.current = layoutKey;
            windowRef.current = null;
        }
        if (visibleRef.current != null && windowRef.current == null) updateWindow(visibleRef.current);
        measure();
    });

    // The scroller is replaced when the grid re-measures (width 0 → sized), so
    // discover it here rather than trusting a ref captured at mount.
    React.useEffect(() => {
        const wrap = wrapRef.current;
        if (wrap == null) return undefined;
        const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
        if (resizeObserver != null) resizeObserver.observe(wrap);
        return () => {
            if (resizeObserver != null) resizeObserver.disconnect();
            const binding = scrollBindingRef.current;
            if (binding != null) binding.el.removeEventListener("scroll", binding.fn);
            scrollBindingRef.current = null;
        };
    }, [applyScroll, measure]);

    // Enter (or Space) on a selected cell activates its DOM content when the
    // cell holds exactly ONE control — the keyboard way to "press the button".
    const handleActivated = React.useCallback((cell, event) => {
        onCellActivated?.(cell, event);
        const [col, row] = cell;
        const box = layerRef.current?.querySelector('[data-glide-dom-cell="' + col + ":" + row + '"]');
        if (box == null) return;
        const focusables = box.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length !== 1) return;
        const el = focusables[0];
        // A BUTTON is an action, not a field: fire it and KEEP the grid's focus
        // (the selection rectangle stays on the cell; no focus ring inside the
        // DOM). Fields (inputs/pickers) still take focus so you can type.
        const isButton = el.tagName === "BUTTON" || el.getAttribute("role") === "button";
        if (typeof el.click === "function") el.click();
        if (isButton) {
            innerRef.current?.focus();
        }
        else if (typeof el.focus === "function") {
            el.focus();
        }
    }, [onCellActivated]);

    const handleVisible = React.useCallback((range, tx, ty, extras) => {
        visibleRef.current = range;
        updateWindow(range);
        applyScroll();
        onVisibleRegionChanged?.(range, tx, ty, extras);
    }, [updateWindow, applyScroll, onVisibleRegionChanged]);

    /* ── nodes ─────────────────────────────────────────────────────────────── */
    const groupClass = "group" + (domCellClassName ? " " + domCellClassName : "");
    const freeze = Math.max(0, Math.min(freezeColumns, columnCount));
    /* The window is a superset; guard against a data change that shrank the
       grid before the next rebuild (a removed row must not keep a live box). */
    const layoutKey = props.rows + ":" + columnCount + ":" + freezeColumns;
    const rowCount = props.rows;

    const headerBoxes = [];
    if (getDomHeaderCell != null) {
        for (let col = 0; col < columnCount; col++) {
            const headerNode = getDomHeaderCell(col);
            if (headerNode == null || headerNode === false) continue;
            headerBoxes.push(React.createElement(
                "div",
                {
                    key: "h:" + col,
                    className: groupClass,
                    "data-glide-dom-header": String(col),
                    "data-glide-dom-band": col < freeze ? "frozen" : "body",
                    "data-glide-header-focused": headerFocused(col) ? "true" : undefined,
                    "data-glide-header-selected": gridSelection?.columns?.hasIndex?.(col) === true ? "true" : undefined,
                    style: {
                        position: "absolute",
                        boxSizing: "border-box",
                        /* Click-through: the canvas header keeps its own
                           click/selection/resize; only the node's own
                           pointer-events:auto children (a sort affordance)
                           capture. */
                        pointerEvents: "none",
                    },
                },
                headerNode
            ));
        }
    }
    const frozenHeaderBoxes = headerBoxes.filter(box => box.props["data-glide-dom-band"] === "frozen");
    const scrolledHeaderBoxes = headerBoxes.filter(box => box.props["data-glide-dom-band"] !== "frozen");

    const frozenBody = [];
    const scrolledBody = [];
    for (const box of boxes) {
        if (getDomCell == null) break;
        if (box.row >= rowCount || box.col >= columnCount) continue;
        const entry = getDomCell(box.col, box.row);
        if (entry == null || entry === false) continue;
        // A spec may opt into a click-through box: only its own interactive
        // children (e.g. a chevron button) capture.
        const spec = (typeof entry === "object" && !React.isValidElement(entry) && "node" in entry) ? entry : null;
        const node = spec != null ? spec.node : entry;
        if (node == null || node === false) continue;
        const frozen = box.col < freeze;
        (frozen ? frozenBody : scrolledBody).push(React.createElement(
            "div",
            {
                key: box.col + ":" + box.row,
                /* `group` lets a host control react to the focused cell with
                   Tailwind's group-data-[glide-dom-focused=true]:… */
                className: groupClass,
                ref: el => {
                    if (el == null) return;
                    // A "button-only" cell (exactly one focusable and it is a
                    // BUTTON) gets the hover tint when focused; any other DOM
                    // cell only keeps the selection rectangle.
                    const focusables = el.querySelectorAll(
                        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                    );
                    // Passthrough boxes are affordances over a native cell
                    // (e.g. a picker chevron) — never "button-only".
                    const isPassthrough = el.getAttribute("data-glide-dom-passthrough") === "true";
                    const isButton = !isPassthrough && focusables.length === 1 && focusables[0].tagName === "BUTTON";
                    if (isButton) el.setAttribute("data-glide-dom-button", "true");
                    else el.removeAttribute("data-glide-dom-button");
                },
                "data-glide-dom-cell": box.col + ":" + box.row,
                "data-glide-dom-band": frozen ? "frozen" : "body",
                /* The grid's selection rectangle is on this cell: paint the
                   same hover wash the canvas rows use, so the DOM cell reads
                   as hovered. */
                "data-glide-dom-focused": focusedCell != null && focusedCell[0] === box.col && focusedCell[1] === box.row ? "true" : undefined,
                "data-glide-dom-passthrough": spec != null && spec.passthrough === true ? "true" : undefined,
                style: {
                    position: "absolute",
                    boxSizing: "border-box",
                    /* Glide's cell padding (4px vertical, 8px horizontal is the
                       theme default; the drawn kit faces use 4px all round) so
                       host controls line up with painted cells. `bleed` = the
                       control IS the cell (edge-to-edge hit target); otherwise
                       the cell's 4px inset + vertical centring apply. */
                    padding: spec != null && spec.bleed === true ? 0 : 4,
                    pointerEvents: spec != null && spec.passthrough === true ? "none" : "auto",
                    display: spec != null && spec.bleed === true ? "block" : "flex",
                    alignItems: "center",
                    /* The cell is a CONTAINER: the host arranges its own
                       buttons/fields inside. */
                    overflow: "visible",
                },
            },
            node
        ));
    }

    const bandStyle = {
        position: "absolute",
        overflow: "hidden",
        pointerEvents: "none",
    };
    const moverStyle = {
        position: "absolute",
        inset: 0,
        willChange: "transform",
    };
    const renderBand = (ref, children, moverRef) => React.createElement(
        "div",
        { ref, style: bandStyle },
        React.createElement("div", { ref: moverRef, style: moverStyle }, children)
    );

    return React.createElement(
        "div",
        { ref: wrapRef, style: { position: "relative", width: "100%" }, "data-glide-dom-wrap": "" },
        React.createElement(DataEditorAll, Object.assign({}, rest, {
            ref: innerRef,
            gridSelection: gridSelection,
            freezeColumns: freezeColumns,
            onVisibleRegionChanged: handleVisible,
            onCellActivated: handleActivated,
        })),
        React.createElement(
            "div",
            { ref: layerRef, style: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }, "data-glide-dom-layer": "" },
            renderBand(frozenBodyRef, frozenBody, frozenBodyMoverRef),
            renderBand(bodyRef, scrolledBody, bodyMoverRef),
            // Frozen headers are pinned on BOTH axes: no mover.
            React.createElement("div", { ref: frozenHeaderRef, style: bandStyle }, frozenHeaderBoxes),
            renderBand(headerRef, scrolledHeaderBoxes, headerMoverRef)
        )
    );
});
