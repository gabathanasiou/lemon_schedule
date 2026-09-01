#!/usr/bin/env python3
"""EPSF (.msd) reference parser for the Lemon Schedule import (roadmap item 40).

Reference implementation of the exact mapping rules `src/lib/import/msd.ts`
will implement. The TS parser is verified against this script's golden output
(`e2e/fixtures/wonderful-life.expected.json`) via a Playwright spec.

Format (verified on "Wonderful Life Demo V5.msd", MMS 5.00.326):

    /********* EPSF FILE ********/            <- 716B header: "00.01.001",
        "EPS Schedule File", "05.00.000", "Movie Magic Scheduling 5", 05.00.326, timestamp
    /********* EPSF SECTION *********/        <- repeated delimiter (+ space)
      [34-byte section header]               <- fixed skip
      <payload>                              <- raw deflate of a UTF-8 XML manager
                                                doc, or a raw image (JFIF/PNG/BMP)

Layers:
  1. container split + deflate verification
  2. XML -> typed model (ProductionInfo, categories, elements, breakdown
     sheets, stripboards, calendars)
  3. Lemon-mapping simulation: category keys via the FDX map + custom
     categories (setDressing/sequence/unit), eighths page counts, estimate
     minutes, cast normalization, boards -> versions (daybreak/scene/note
     rows), calendar materialization (window-bounded nonShootDates)
  4. integrity checks / anomaly report
  5. golden JSON emit (project-shaped, UUID-free so the Playwright spec can
     compare against app state)

Usage:
    python3 tools/msd_probe.py [--msd PATH] [--out PATH] [--noemit]

Stdlib only. `xml` entity refs are resolved natively.
"""

import json
import re
import sys
import zlib
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

# ---------------------------------------------------------------- container

SECTION_MARKER = b"/********* EPSF SECTION *********/"
FILE_MARKER = b"/********* EPSF FILE ********/"
SECTION_HEADER_LEN = 34  # verified: deflate stream starts at byte 34

IMAGE_SIGS = [
    ("JPEG", b"\xff\xd8\xff"),
    ("PNG", b"\x89PNG\r\n\x1a\n"),
    ("BMP", b"BM"),
    ("GIF", b"GIF8"),
]


class Section:
    def __init__(self, index, raw, kind, payload):
        self.index = index
        self.raw = raw
        self.kind = kind  # 'header' | 'image' | 'xml'
        self.payload = payload  # bytes for image, str for xml, None for header


def split_container(data: bytes):
    parts = data.split(SECTION_MARKER)
    head_raw = parts[0]
    assert FILE_MARKER in head_raw, "not an EPSF file (missing EPSF FILE marker)"
    # header version records: the fixed-256-byte blocks at the top of the head
    head_text = head_raw.decode("latin1")
    voices = re.findall(r"((?:[0-9][0-9]\.[0-9][0-9]\.[0-9][0-9][0-9])|(?:Movie Magic Scheduling [0-9]+)|(?:EPS Schedule File)|(?:[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9:]+:[0-9]+ GMT))", head_text)
    sections = []
    for i, p in enumerate(parts[1:], start=1):
        kind, payload = None, None
        # XML wins: image signatures inside offset > 300 are compressed-data
        # coincidences (section 11 embeds a pseudo-'BM' mid-stream). Only a
        # signature near the payload area marks a true image section.
        infl = inflate_at_34(p)
        if infl is not None:
            kind, payload = "xml", infl
        else:
            for name, sig in IMAGE_SIGS:
                off = p.find(sig)
                if 0 <= off < 300:
                    kind, payload = "image", f"{name}@{off}"
                    break
        if kind is None:
            kind, payload = "unknown", p[:64].hex()
        sections.append(Section(i, p, kind, payload))
    return head_text, voices, sections


def inflate_at_34(blob: bytes, probe=(-6, 8)):
    """Try raw-deflate starting at byte 34; probe a small offset window as a
    robustness fallback for other MMS versions. Returns the XML string or None."""
    for off in range(34 + probe[0], 34 + probe[1] + 1):
        if off < 0 or off >= len(blob):
            continue
        try:
            d = zlib.decompress(blob[off:], -15)
        except Exception:
            continue
        if d and _printable_ratio(d) > 0.9 and b"<" in d[:64]:
            return d.decode("utf-8", "replace")
    return None


def _printable_ratio(b):
    if not b:
        return 0.0
    return sum(1 for c in b if 32 <= c < 127 or c in (9, 10, 13)) / len(b)


# ---------------------------------------------- ports of src/lib/import/shared.ts

# Verbatim from shared.ts (`null` = not a Lemon element category).
FDX_CATEGORY_MAP = {
    "Props": "props", "Wardrobe": "wardrobe", "Makeup/Hair": "makeup",
    "Makeup / Hair": "makeup", "Makeup": "makeup", "Stunts": "stunts",
    "Vehicles": "vehicles", "Camera": None, "Music": "music", "Sound": "sound",
    "Set Dressing": None, "VFX": "vfx", "Visual Effects": "vfx",
    "SFX": "sfx", "Special Effects": "sfx", "Mechanical Effects": "sfx",
    "Animals": "animalsAndWranglers", "Animal Wrangler": "animalsAndWranglers",
    "Greenery": "greenery", "Art Department": "artDept", "Security": None,
    "Additional Labor": None, "Background Actors": "backgroundActors",
    "Extras": "backgroundActors", "Weapons": "weapons", "Armoury": "weapons",
    "Special Equipment": None, "Miscellaneous": None, "Comments": None,
    "Script Day": "scriptDay", "Sequence": None, "Unit": None,
    "Synopsis": "description", "Location": "location", "Cast Members": None,
    "Notes": "notes",
}
# MSD-only additions vs FDX: MMS models Set as an element category; Lemon's
# `set` element category is the sets registry (commitImport registers sets there).
MSD_CATEGORY_MAP = {**FDX_CATEGORY_MAP, "Set": "set"}

# Scene-field categories: refs go to scene fields, never element categories.
SCENE_FIELD_KEYS = {"notes", "scriptDay", "set", "description", "location"}

# MMS ProductionInfo props -> Lemon crew role keys (DEFAULT_CREW_ROLES builtins).
CREW_MAP = {
    "Director": "director",
    "Producer": "producer",
    "Upm": "upm",
    "AsstDirector": "firstAD",
    "ArtDirector": "artDirector",
    "SetDresser": "setDecorator",
}

# MMS system categories the user chose to keep as Lemon custom categories.
CUSTOM_CATEGORY_LABELS = ("Set Dressing", "Sequence", "Unit")


def category_name_to_key(name: str) -> str:
    s = re.sub(r"\s+", "", name)
    if not s:
        return name
    s = s[0].lower() + s[1:]
    return re.sub(r"/[a-z]", lambda m: m.group(0).upper(), s)


def normalize_character_name(name: str) -> str:
    s = name.strip().upper()
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s).strip()
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s).strip()
    return s


def parse_eighths(value: str):
    """MMS script-page eighths: last char = eighths ("12" = 1 2/8 -> 1, 0.25).
    Edge: eighths can reach 8 ("18" = 1 + 8/8 -> 2, 0). Returns (pages, dec) or None."""
    if not value or not value.isdigit():
        return None
    eighths = int(value[-1])
    pages = int(value[:-1] or "0")
    if eighths >= 8:
        pages += 1
        eighths -= 8
    return pages, eighths / 8.0


def format_page_count(decimal: float):
    """Mirror of src/lib/utils.ts formatPageCount — "1 2/8" eighths string."""
    if not decimal:
        return "0"
    whole = int(decimal)
    remainder = round((decimal - whole) * 8)
    if remainder == 8:
        whole += 1
        remainder = 0
    if whole == 0 and remainder == 0:
        return "0"
    if remainder == 0:
        return str(whole)
    if whole == 0:
        return f"{remainder}/8"
    return f"{whole} {remainder}/8"


def parse_estimate_minutes(b: str, a: str):
    """EstimateTimeB = hours, EstimateTimeA = minutes ("3:00" = 3h). None if unparseable."""
    if not (b or a):
        return None
    if (b and not b.isdigit()) or (a and not a.isdigit()):
        return None
    return int(b or "0") * 60 + int(a or "0")


def parse_mmddyyyy(value: str):
    """MMS dates are MM/DD/YYYY (US format). Returns a datetime.date or None."""
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", value or "")
    if not m:
        return None
    mm, dd, yyyy = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return date(yyyy, mm, dd)
    except ValueError:
        return None


# ------------------------------------------------------------- model + mapping

class Model:
    def __init__(self):
        self.title = None
        self.production = {}
        self.categories = []            # (label, sort attrs dict)
        self.elements = []              # (name, category_label)
        self.sheets = []                # sheet dicts (BDSID-keyed)
        self.boards = []                # board dicts
        self.calendars = {}             # name -> calendar dict
        self.anomalies = []

    def anomaly(self, msg):
        self.anomalies.append(msg)


def parse_all(parts):
    m = Model()
    layers = {s.kind for s in parts}
    for s in parts:
        if s.kind != "xml":
            continue
        root = ET.fromstring(s.payload)
        tag = root.tag
        if tag == "ProductionInfo":
            _parse_production(m, root)
        elif tag == "CategoryMgr":
            _parse_categories(m, root)
        elif tag == "ElementMgr":
            _parse_elements(m, root)
        elif tag == "BreakdownSheetMgr":
            _parse_sheets(m, root)
        elif tag == "StripBoardMgr":
            _parse_boards(m, root)
        elif tag == "CalendarMgr":
            _parse_calendars(m, root)
        elif tag == "ColorSettings":
            _parse_colors(m, root)
        # DOODLayoutMgr / PrintViewOptions / ColorSettings /
        # StripBoardLayoutMgr / ReportLayoutMgr / RedFlagMgr -> skipped (chrome)
    return m, layers


def _parse_production(m, root):
    for prop in root.iter("Property"):
        name = prop.get("Name")
        if name == "PictureTitle":
            m.title = prop.get("Value") or None
        elif name:
            m.production[name] = prop.get("Value") or ""


def _parse_categories(m, root):
    for cat in root.iter("Category"):
        name = cat.get("Name")
        if name:
            m.categories.append((name, dict(cat.attrib)))


def _parse_elements(m, root):
    for el in root.iter("Element"):
        name = el.get("Name")
        cat = el.get("CategoryName")
        if name and cat:
            m.elements.append((name, cat))


def _parse_sheets(m, root):
    seen = set()
    for sheet in root.iter("BreakdownSheet"):
        attrs = dict(sheet.attrib)
        bdsid = attrs.get("BDSID")
        if not bdsid:
            m.anomaly("sheet without BDSID skipped")
            continue
        if bdsid in seen:
            m.anomaly(f"duplicate BDSID {bdsid}")
        seen.add(bdsid)
        refs = [(r.get("CategoryName"), r.get("ElementName"))
                for r in sheet.iter("ElementRef")]
        refs = [(c, e) for c, e in refs if c and e]
        attrs["_refs"] = refs
        m.sheets.append(attrs)


def _parse_boards(m, root):
    active = None
    for prefs in root.iter("StripBoardMgrPreferences"):
        for prop in prefs.iter("Property"):
            if prop.get("Name") == "ActiveStripBoard":
                active = prop.get("Value")
    m.active_board = active
    for board in root.iter("StripBoard"):
        name = board.get("Name")
        if not name:
            continue
        days = []
        remaining_scheduled = []
        unscheduled = []
        for child in list(board):
            if child.tag == "ScheduledStrips":
                for d in child:
                    if d.tag == "ScheduleDay":
                        items = []
                        for it in d:
                            if it.tag == "BDSStrip":
                                items.append(("strip", it.get("BDSID")))
                            elif it.tag == "BannerStrip":
                                items.append(("banner", it.get("Text") or ""))
                            else:
                                m.anomaly(f"board {name!r}: unknown day item {it.tag}")
                        days.append(items)
                    elif d.tag == "RemainingScheduledStrips":
                        # on this board but not on any day (MMS lower region)
                        remaining_scheduled = [it.get("BDSID") for it in d if it.tag == "BDSStrip"]
                    elif d.tag not in ("Description", "SortBy"):
                        m.anomaly(f"board {name!r}: unknown ScheduledStrips child {d.tag}")
            elif child.tag == "UnscheduledStrips":
                # strips after the last day break (undated tail of the board)
                for sub in child:
                    if sub.tag == "RemainingUnscheduledStrips":
                        unscheduled = [it.get("BDSID") for it in sub if it.tag == "BDSStrip"]
                    elif sub.tag == "ScheduledStrips":
                        pass
                    elif sub.tag != "Description":
                        m.anomaly(f"board {name!r}: unknown UnscheduledStrips child {sub.tag}")
            elif child.tag == "Description":
                pass
            else:
                m.anomaly(f"board {name!r}: unknown child {child.tag}")
        m.boards.append({
            "name": name,
            "calendar": board.get("CalendarName") or "",
            "allowMultipleDayBreaks": board.get("AllowMultipleDayBreaks") or "0",
            "days": days,
            "remaining": remaining_scheduled,
            "unscheduled": unscheduled,
        })
    m.active_board = active


def _parse_colors(m, root):
    """Strip color matrix (ColorGrid) + StripColorPreferences -> hex colors."""
    col_labels, row_labels = {}, {}
    for c in root.iter("ColumnLabel"):
        n = c.get("ColumnNumber")
        if n is not None and c.get("Name"):
            col_labels[int(n)] = c.get("Name").upper()
    for r in root.iter("RowLabel"):
        n = r.get("RowNumber")
        if n is not None and r.get("Name"):
            row_labels[int(n)] = r.get("Name").upper()

    def rgb(v):
        if not v:
            return None
        p = [int(x.strip()) for x in v.split(",")]
        if len(p) != 3:
            return None
        return "#" + "".join(f"{max(0, min(255, x)):02x}" for x in p)

    cells = []
    for cell in root.iter("ColorGridCell"):
        r = cell.get("RowNumber")
        c = cell.get("ColumnNumber")
        if r is None or c is None:
            continue
        ie = col_labels.get(int(c))
        dn = row_labels.get(int(r))
        if not ie or not dn or ie == "OTHER" or dn == "OTHER":
            continue
        bg, fg = rgb(cell.get("Bg")), rgb(cell.get("Fg"))
        if bg and fg:
            cells.append({"ie": ie, "dn": dn, "bg": bg, "fg": fg})
    prefs = {}
    for pref in root.iter("StripColorPreference"):
        name = pref.get("Name")
        bg, fg = rgb(pref.get("Bg")), rgb(pref.get("Fg"))
        if name and bg and fg:
            prefs[name] = {"bg": bg, "fg": fg}
    m.colors = {"sceneColors": cells, "prefs": prefs}


def _parse_calendars(m, root):
    for cal in root.iter("Calendar"):
        name = cal.get("Name")
        if not name:
            continue
        dates = {}
        special = []
        days_off = None
        for child in list(cal):
            if child.tag == "ScheduleDates":
                for sd in child:
                    if sd.tag == "ScheduleDate":
                        dates[sd.get("Name")] = parse_mmddyyyy(sd.get("Date"))
            elif child.tag == "SpecialDays":
                for sd in child:
                    if sd.tag != "SpecialDay":
                        continue
                    special.append({
                        "date": parse_mmddyyyy(sd.get("Date")),
                        "off": sd.get("Off") == "1",
                        "travel": sd.get("CompanyTravel") == "1",
                        "holiday": sd.get("Holiday") == "1",
                        "exceptionWorkday": sd.get("ExceptionWorkday") == "1",
                    })
            elif child.tag == "DaysOff":
                days_off = {d: child.get(d) == "1" for d in
                            ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")}
        m.calendars[name] = {
            "dates": dates,
            "special": [s for s in special if s["date"]],
            "daysOff": days_off,
        }


# ------------------------------------------------------------------- helpers

def sheet_by_bdsid(m):
    return {s["BDSID"]: s for s in m.sheets}


def element_names_by_category(m):
    out = {}
    for name, cat in m.elements:
        out.setdefault(cat, []).append(name)
    return out


def mapped_category(m):
    """category label -> ('scene-field'|'cast'|'set'|'custom'|key)."""
    labels = set(c for c, _ in m.categories)
    out = {}
    for label in labels:
        key = MSD_CATEGORY_MAP.get(label)
        if label in CUSTOM_CATEGORY_LABELS:
            out[label] = ("custom", category_name_to_key(label))
        elif key in SCENE_FIELD_KEYS:
            out[label] = ("field", key)
        elif label == "Cast Members":
            out[label] = ("cast", "cast")
        elif key is None:
            out[label] = ("custom", category_name_to_key(label))
        else:
            out[label] = ("builtin", key)
    return out


# ---------------------------------------------------------- lemon simulation

def build_scenes(m, by_bdsid):
    """Sheets -> scene dicts (Lemon-shaped, UUID-free)."""
    cat_map = mapped_category(m)
    scenes = []
    for sheet in m.sheets:
        refs = sheet["_refs"]
        cast_refs, field_refs, elem_refs = [], {}, {}
        for cat_label, elem_name in refs:
            kind, key = cat_map.get(cat_label, (None, None))
            if kind == "cast":
                cast_refs.append(normalize_character_name(elem_name))
            elif kind == "field":
                field_refs.setdefault(key, []).append(elem_name)
            elif kind in ("builtin", "custom"):
                elem_refs.setdefault(key, []).append(elem_name)
            else:
                m.anomaly(f"sheet {sheet.get('Scenes')!r}: unmapped category {cat_label!r}")
        pg = parse_eighths(sheet.get("NumScriptPages") or "")
        if pg is None and (sheet.get("NumScriptPages") or "") != "":
            m.anomaly(f"sheet {sheet.get('Scenes')!r}: odd NumScriptPages {sheet.get('NumScriptPages')!r}")
        total_pages = (pg[0] + pg[1]) if pg else 0.0
        est = parse_estimate_minutes(sheet.get("EstimateTimeB") or "", sheet.get("EstimateTimeA") or "")
        if est is None and (sheet.get("EstimateTimeB") or sheet.get("EstimateTimeA")):
            m.anomaly(f"sheet {sheet.get('Scenes')!r}: odd EstimateTime {sheet.get('EstimateTimeB')}/{sheet.get('EstimateTimeA')}")
        # de-dup preserving order (Lemon stores comma-joined lists)
        def uniq(xs):
            seen, out = set(), []
            for x in xs:
                if x in seen:
                    continue
                seen.add(x)
                out.append(x)
            return out
        notes = uniq(([sheet.get("Comments") or ""] if sheet.get("Comments") else []) +
                     field_refs.get("notes", []))
        notes = [n for n in notes if n.strip()]
        set_name = (sheet.get("Set") or " ".join(field_refs.get("set", [])) or "").upper().strip()
        scenes.append({
            "n": sheet.get("Scenes") or "",
            "sheetNumber": sheet.get("SheetNumber") or "",
            "bdsid": sheet.get("BDSID"),
            "spn": sheet.get("ScriptPageNumbers") or "",
            "pgStr": format_page_count(total_pages),
            "pgDec": total_pages,
            "est": est,
            "ie": (sheet.get("IE") or "INT").upper().replace(" ", ""),
            "dn": (sheet.get("DN") or "DAY"),
            "set": set_name,
            "sd": sheet.get("ScriptDay") or "",
            "desc": sheet.get("Synopsis") or "",
            "notes": " ".join(notes),
            "loc": sheet.get("Location") or "",
            "seq": sheet.get("Sequence") or "",
            "unit": sheet.get("Unit") or "",
            "cast": uniq(cast_refs),
            "elems": {k: uniq(v) for k, v in sorted(elem_refs.items())},
        })
    return scenes


def build_cast_and_elements(m, scenes):
    """Cast registry (normalized, ordered by the MMS ElementMgr roster — the
    Board IDs MMS assigns — then first appearance in sheets as a fallback) and
    per-category element list (from ElementMgr + refs)."""
    cast_order, cast_seen = [], set()
    for name, cat in m.elements:
        if cat != "Cast Members":
            continue
        norm = normalize_character_name(name)
        if norm and norm not in cast_seen:
            cast_seen.add(norm)
            cast_order.append(norm)
    cast_scenes = {}
    for i, sc in enumerate(scenes):
        for name in sc["cast"]:
            if name not in cast_seen:
                cast_seen.add(name)
                cast_order.append(name)
            cast_scenes.setdefault(name, []).append(sc["n"])
    elems_by_cat = {}
    # register ElementMgr elements under their mapped keys ('set' elements feed
    # lemon's set registry even though scene.set is a field)
    cat_map = mapped_category(m)
    for name, label in m.elements:
        kind, key = cat_map.get(label, (None, None))
        if kind == "field":
            if key == "set":
                elems_by_cat.setdefault("set", [])
                if name not in elems_by_cat["set"]:
                    elems_by_cat["set"].append(name)
        elif kind in ("builtin", "custom"):
            elems_by_cat.setdefault(key, [])
            if name not in elems_by_cat[key]:
                elems_by_cat[key].append(name)
    return cast_order, cast_scenes, elems_by_cat, cat_map


def build_versions(m, scenes, by_bdsid):
    """Boards -> version rows: daybreak/day, strips/scenes (banners as NOTE rows).

    Daybreak rows mark the boundaries BETWEEN ScheduleDay groups (the first day
    is anchored by Lemon's pinned daybreak, added at LOAD):
    [day 1] [d] [day 2] [d] ... — N days = N-1 daybreak markers.
    """
    active = m.active_board
    versions = []
    for board in m.boards:
        rows = []
        day_idx = 0
        for day in board["days"]:
            day_idx += 1
            if day_idx > 1:
                rows.append({"k": "d", "day": day_idx})
            for kind, val in day:
                if kind == "strip":
                    sheet = by_bdsid.get(val)
                    if sheet is None:
                        m.anomaly(f"board {board['name']!r}: strip BDSID {val} has no sheet")
                        rows.append({"k": "s", "n": f"?{val}", "b": None})
                    else:
                        rows.append({"k": "s", "n": sheet.get("Scenes") or "", "b": val})
                elif kind == "banner":
                    rows.append({"k": "n", "t": val})
        versions.append({
            "name": board["name"],
            "calendar": board["calendar"],
            "active": board["name"] == active,
            "rows": rows,
            "dayCount": day_idx,
            "remaining": board["remaining"],
            "unscheduled": board["unscheduled"],
        })
    return versions


def board_ids_of(v, rows):
    """Every sheet BDSID this board references: day strips + remaining + off-board."""
    out = {r["b"] for r in rows if r["k"] == "s" and r["b"]}
    out |= set(v["remaining"])
    out |= set(v["unscheduled"])
    return out


def build_calendar_model(m, versions):
    """Materialize calendars (window-bounded nonShootDates) for EVERY distinct
    MMS calendar definition (roadmap 74 — one CalendarVersion per calendar,
    including ones no board references; no board linking).

    Rules: productionStart = ProductionStartDate; prepStart =
    ProductionPrepStartDate; postEnd = ProductionEndDate/WrapDate; weekly
    DaysOff pattern (MMS Sun=0..Sat=6 -> Lemon Mon=0..Sun=6) + SpecialDays
    (Off->hold, Holiday->holiday, CompanyTravel->travel) expanded into
    explicit dates bounded to [prepStart, wrap] + a 30d skirt; special days
    outside the window (template junk) are dropped.
    """
    out = {}
    for cal_name, cal in m.calendars.items():
        prod_start = cal["dates"].get("ProductionStartDate")
        prep_start = cal["dates"].get("ProductionPrepStartDate")
        prod_end = cal["dates"].get("ProductionEndDate") or cal["dates"].get("ProductionWrapDate")
        if not prod_start:
            m.anomaly(f"calendar {cal_name!r}: no ProductionStartDate")
            continue
        if not prod_end:
            m.anomaly(f"calendar {cal_name!r}: no ProductionEndDate")
            continue
        non_shoot = {}
        # explicit SpecialDays first (their status wins over the pattern),
        # then the weekly pattern fills only dates not already covered.
        # Statuses: Lemon's "Day Off" type is the `holiday` key — MMS Off
        # weekends and MMS Holidays both collapse into it (user decision);
        # CompanyTravel stays `travel`.
        for sp in cal["special"]:
            d = sp["date"]
            if d < prod_start - timedelta(days=30) or d > prod_end + timedelta(days=30):
                continue
            if sp["holiday"] or sp["off"]:
                non_shoot[d.isoformat()] = "holiday"
            elif sp["travel"]:
                non_shoot[d.isoformat()] = "travel"
        # MMS DaysOff Sun=0..Sat=6 -> Lemon weeklyDaysOff Mon=0..Sun=6.
        weekly_off = []
        if cal["daysOff"]:
            mms_to_lemon = {0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}
            for i, day in enumerate(("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")):
                if cal["daysOff"][day]:
                    weekly_off.append(mms_to_lemon[i])
            weekly_off.sort()
            d = prod_start
            while d <= prod_end:
                if cal["daysOff"].get(d.strftime("%a")[:3].capitalize()):
                    non_shoot.setdefault(d.isoformat(), "holiday")
                d += timedelta(days=1)
        non_shoot_list = [{"date": k, "status": v} for k, v in sorted(non_shoot.items())]
        out[cal_name] = {
            "productionStart": prod_start.isoformat(),
            "prepStart": prep_start.isoformat() if prep_start else None,
            "postEnd": prod_end.isoformat(),
            "weeklyDaysOff": weekly_off,
            "nonShootDates": non_shoot_list,
        }
    return out


# ------------------------------------------------------------------ integrity

def run_integrity(m, scenes, versions, by_bdsid, calendars):
    rep = []
    all_ids = {s["BDSID"] for s in m.sheets}
    rep.append(f"sheets: {len(m.sheets)}")
    for v in versions:
        scheduled = [r for r in v["rows"] if r["k"] == "s"]
        day_ids = {r["b"] for r in scheduled if r["b"]}
        banner_n = sum(1 for r in v["rows"] if r["k"] == "n")
        rep.append(f"board {v['name']!r}{' (ACTIVE)' if v['active'] else ''}: "
                   f"{v['dayCount']} days, {len(day_ids)} scheduled strips, "
                   f"{banner_n} banners, {len(v['remaining'])} remainingScheduled, "
                   f"{len(v['unscheduled'])} unscheduled (undated tail)")
        on_board = day_ids | set(v["remaining"]) | set(v["unscheduled"])
        missing = all_ids - on_board
        extra = on_board - all_ids
        zones_overlap = (day_ids & set(v["remaining"])) or (day_ids & set(v["unscheduled"])) \
                        or (set(v["remaining"]) & set(v["unscheduled"]))
        if missing or extra or zones_overlap:
            rep.append(f"  !! {v['name']}: coverage {len(on_board)}/146 "
                       f"(missing={len(missing)} extra={len(extra)} zoneOverlap={bool(zones_overlap)})")
    # boneyard on the ACTIVE board = its undated strips (remaining+unscheduled)
    active = next(v for v in versions if v["active"])
    boneyard = {s["BDSID"]: s.get("Scenes") or "" for s in m.sheets
                if s["BDSID"] in set(active["remaining"]) | set(active["unscheduled"])}
    rep.append(f"active-board boneyard: {len(boneyard)} sheets: "
               f"{list(boneyard.values())[:12]}{'…' if len(boneyard) > 12 else ''}")
    # every sheet referenced on every board (all boards cover all sheets —
    # the MMS invariant the import relies on)
    for v in versions:
        ids = board_ids_of(v)
        if ids != all_ids:
            rep.append(f"  !! {v['name']}: board doesn't span all sheets ({len(ids)}/{len(all_ids)})")
    # multi-scene sheets
    multi = [s for s in scenes if "," in s["n"]]
    rep.append(f"multi-scene sheets: {len(multi)} -> {[s['n'] for s in multi][:8]}")
    # duplicate strip labels within a board (multi-scene sheets make label
    # repeats legal — flag exact repeated labels only)
    for v in versions:
        seen, dups = set(), []
        for r in v["rows"]:
            if r["k"] == "s":
                if r["n"] in seen:
                    dups.append(r["n"])
                seen.add(r["n"])
        if dups:
            rep.append(f"  !! {v['name']}: duplicate strip labels {dups}")
    rep.append(f"custom category fields: sequence={sum(1 for s in scenes if s['seq'])} scenes, "
               f"unit={sum(1 for s in scenes if s['unit'])} scenes")
    for name, cal in calendars.items():
        raw = m.calendars[name]
        ps = raw["dates"].get("ProductionStartDate")
        pe = raw["dates"].get("ProductionEndDate") or raw["dates"].get("ProductionWrapDate")
        window_specials = 0
        if ps and pe:
            for s in raw["special"]:
                if s["date"] and ps - timedelta(days=30) <= s["date"] <= pe + timedelta(days=30):
                    window_specials += 1
        rep.append(f"calendar {name!r}: start {cal['productionStart']} end {cal['postEnd']} "
                   f"-> {len(cal['nonShootDates'])} nonShoot dates "
                   f"(special-in-window: {window_specials})")
    return rep


def board_ids_of(v):
    """Every sheet BDSID this board references: day strips + both undated zones."""
    out = {r["b"] for r in v["rows"] if r["k"] == "s" and r["b"]}
    out |= set(v["remaining"])
    out |= set(v["unscheduled"])
    return out


# --------------------------------------------------------------------- emit

def emit_golden(m, scenes, cast_order, cast_scenes, elems_by_cat, versions, calendars):
    cat_map = mapped_category(m)
    custom = []
    for label, (kind, key) in sorted(cat_map.items()):
        if kind != "custom":
            continue
        # registration noise: empty categories from CategoryMgr (Camera,
        # Security, …) are skipped — only categories with elements are created
        if key not in elems_by_cat or not elems_by_cat[key]:
            continue
        custom.append({"label": label, "key": key})
    elements = {}
    for key, names in elems_by_cat.items():
        elements[key] = sorted(set(names))
    crew = {}
    for prop_name, role_key in CREW_MAP.items():
        name = (m.production.get(prop_name) or "").strip()
        if name:
            crew[role_key] = [name]
    active = next((v["name"] for v in versions if v["active"]), versions[0]["name"] if versions else None)
    colors = getattr(m, "colors", None)
    return {
        "source": "Wonderful Life Demo V5.msd",
        "title": m.title,
        "production": {k: v for k, v in m.production.items() if v},
        "customCategories": custom,
        "elements": elements,
        "crew": crew,
        "colors": colors,
        "cast": [{"name": n, "scenes": cast_scenes.get(n, [])} for n in cast_order],
        "scenes": [{k: v for k, v in sc.items() if k != "bdsid"} for sc in scenes],
        "versions": versions,
        "activeVersion": active,
        "calendars": calendars,
    }


# -------------------------------------------------------------------- main

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--msd", default=str(Path.home() / "Downloads/Wonderful Life Demo V5.msd"))
    ap.add_argument("--out", default="e2e/fixtures/wonderful-life.expected.json")
    ap.add_argument("--fixture", default="e2e/fixtures/wonderful-life.msd")
    ap.add_argument("--noemit", action="store_true")
    args = ap.parse_args()

    data = Path(args.msd).read_bytes()
    head_text, voices, sections = split_container(data)
    m, layers = parse_all(sections)

    print(f"EPSF header voices: {voices}")
    print(f"sections: {len(sections)} -> { {k: sum(1 for s in sections if s.kind == k) for k in ('image', 'xml', 'unknown')} }")
    xml_names = []
    for s in sections:
        if s.kind == "xml":
            root_tag = s.payload[:s.payload.find(">")] if s.payload else "?"
        xml_names.append(s.kind)
    print("section kinds:", " ".join(f"{s.index}:{s.kind}" for s in sections))

    by_bdsid = sheet_by_bdsid(m)
    scenes = build_scenes(m, by_bdsid)
    # MMS numbers sheets by script order (scene 18 is sheet 19) — sort the
    # imported breakdown to mirror MMS (positions = sheet numbers).
    scenes.sort(key=lambda s: int(s["sheetNumber"]) if s["sheetNumber"].isdigit() else 2**31)
    cast_order, cast_scenes, elems_by_cat, cat_map = build_cast_and_elements(m, scenes)
    versions = build_versions(m, scenes, by_bdsid)
    calendars = build_calendar_model(m, versions)

    print()
    print("=== ANOMALY REPORT ===")
    if m.anomalies:
        for a in m.anomalies:
            print("  !!", a)
    else:
        print("  (none)")
    print()
    print("=== INTEGRITY ===")
    for line in run_integrity(m, scenes, versions, by_bdsid, calendars):
        print("  ", line)

    if not args.noemit:
        golden = emit_golden(m, scenes, cast_order, cast_scenes, elems_by_cat, versions, calendars)
        Path(args.out).write_text(json.dumps(golden, indent=1))
        Path(args.fixture).write_bytes(data)
        print(f"\ngolden -> {args.out} ({Path(args.out).stat().st_size} bytes)")
        print(f"fixture -> {args.fixture} ({Path(args.fixture).stat().st_size} bytes)")


if __name__ == "__main__":
    main()