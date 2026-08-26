#!/usr/bin/env python3
"""SEX (.sex) reference parser for the Lemon Schedule import/export (roadmap item 41).

Reference implementation of the exact mapping rules `src/lib/import/sex.ts`
will implement. The TS parser is verified against this script's golden output
(`e2e/fixtures/lair-v10.expected.json`) via a Playwright spec.

Format (verified on "Lair (LOCKED) V10 10 10 2019 .sex", an MMS 6 export):

    "SSI*"                   4B magic
    0x04..0x0D               version bytes (0x00 0x23 0x00 0x00 0x00 0xE0
                             0x00 0x00 0x00 0x00 observed for MMS 6; Final
                             Draft zero-fills these = the neutral form all
                             versions accept)
    category list            null-terminated labels, terminated by double null
    records                  ("#", 0x00, 0x00, 0x00), u16 LE length (counts
                             from the *type* field: type + payload),
                             u16 LE type, then type-specific payload:
        1 = scene header:    u8 ordinal, script start page (ASCII),
                             "\\t", scene number, "\\t", slugline, "\\t", 0x00
        2 = element:         u16 LE scene idx, u8 category flag (index into
                             the category list), text, 0x00
        3 = page metadata:   u16 LE scene idx, u16 LE 0, u16 LE page length
                             in eighths

Breaks down as a script: 144 headers + 144 page records + 289 element records
(all category flag 0 = Cast Members) for a locked V10 episode breakdown. SEX
carries NO schedule data (no day breaks/strip order) — import lands scenes in
the Boneyard, export writes the same breakdown shape from a Project.

Usage:
    python3 tools/sex_probe.py [--sex PATH] [--out PATH] [--noemit]

Stdlib only.
"""

import argparse
import json
import struct
import sys
from pathlib import Path

MAGIC = b"SSI*"
RECORD_MARKER = b"#\x00\x00\x00"

# Category label -> Lemon category key. Unknown/absent -> custom category via
# `category_name_to_key`. Ports of the rule set in sex.ts.
SEX_CATEGORY_MAP = {
    "Cast Members": "cast",
    "Extras": "backgroundActors",
    "Stunts": "stunts",
    "Vehicles": "vehicles",
    "Props": "props",
    "Special Effects": "sfx",
    "Costumes": "wardrobe",
    "Makeup": "makeup",
    "Livestock": "animalsAndWranglers",
    "Animal Handler": "animalsAndWranglers",
    "Music": "music",
    "Sound": "sound",
    "Set Dressing": "setDressing",
    "Greenery": "greenery",
    "Optical FX": "sfx",
    "Mechanical FX": "sfx",
    "Notes": "notes",
}
# Scene-FIELD categories (refs go to scene fields, never element categories).
SCENE_FIELD_KEYS = {"notes", "setDressing"}


def category_name_to_key(name: str) -> str:
    import re

    s = re.sub(r"\s+", "", name)
    if not s:
        return name
    s = s[0].lower() + s[1:]
    return re.sub(r"/[a-z]", lambda m: m.group(0).upper(), s)


def normalize_character_name(name: str) -> str:
    import re

    s = name.strip().upper()
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s).strip()
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s).strip()
    return s


def parse_heading(slugline: str):
    """Port of shared.ts parseSceneHeading — (intExt, set, dayNight)."""
    import re

    clean = slugline.replace("\n", " ").strip()
    dot = clean.find(".")
    if dot == -1:
        return "INT", "", "DAY"
    prefix = clean[:dot].strip()
    rest = clean[dot + 1 :].strip()
    up = prefix.upper()
    ie = "INT"
    if up == "EXT" or up.startswith("EXT") or up == "ΕΞΩΤ":
        ie = "EXT"
    elif up == "INT/EXT" or up == "INT-EXT" or up == "I/E" or "/" in up or "-" in up:
        ie = "INT/EXT"
    m = re.search(r"\s*[\u2013\u2014\-]+\s*(?:LATE\s+|EARLY\s+|NEXT\s+)?(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|CONTINUOUS|LATER|SAME\s+TIME)\s*[-\u2013\u2014]*\s*$", rest, re.I)
    day_night = "DAY"
    if m:
        tok = m.group(1).upper()
        day_night = "NIGHT" if tok == "NIGHT" else "DAY" if tok == "DAY" else tok.title() if tok in ("MORNING", "EVENING", "DAWN", "DUSK") else "DAY"
        rest = rest[: m.start()].rstrip()
    return ie, rest.upper(), day_night


def parse_sex(data: bytes):
    if not data.startswith(MAGIC):
        raise ValueError("Not a valid SEX file: missing SSI* magic")
    pos = 4
    while pos < len(data) and pos < 200:
        b = data[pos]
        if 0x41 <= b <= 0x5A:  # first category starts with an uppercase letter
            break
        pos += 1
    categories = []
    while pos < len(data):
        if data[pos] == 0:
            pos += 1
            if pos < len(data) and data[pos] == 0:
                pos += 1
            break
        end = data.find(b"\x00", pos)
        if end == -1:
            break
        cat = data[pos:end].decode("latin1")
        if cat and cat != "#":
            categories.append(cat)
        pos = end + 1

    # ---- records ----------------------------------------------------------
    scenes = []  # dicts built in file order
    pending = {}  # scene idx (1-based) -> scene dict
    elements_by_scene = {}
    ordinal = 0
    while pos < len(data) - 6:
        if data[pos : pos + 4] != RECORD_MARKER:
            break
        rec_len = struct.unpack_from("<H", data, pos + 4)[0]
        rec_type = struct.unpack_from("<H", data, pos + 6)[0]
        payload = data[pos + 8 : pos + 6 + rec_len]
        if rec_type == 1:
            # payload: [counter byte][script start page ascii]["\t"][scene
            # number]["\t"][slugline]["\t"][0x00]
            cnt = payload[0]
            rest = payload[1:]
            page_ch, _, rest = rest.partition(b"\t")
            num, _, slug = rest.partition(b"\t")
            slug = slug.rstrip(b"\t\x00").decode("latin1", "replace").strip()
            scene_num = num.decode("latin1", "replace")
            script_page = page_ch.decode("latin1", "replace") or None
            idx = len(scenes) + 1
            sc = {
                "idx": idx,
                "n": scene_num,
                "spn": script_page or "",
                "slug": slug,
                "ie": "INT",
                "dn": "DAY",
                "set": "",
                "pg": 0,
                "cast": [],
                "elems": {},
            }
            scenes.append(sc)
        elif rec_type == 2:
            sidx, flag = struct.unpack_from("<HB", payload, 0)
            text = payload[3:].split(b"\x00")[0].decode("latin1", "replace")
            elements_by_scene.setdefault(sidx, []).append((flag, text))
        elif rec_type == 3:
            sidx, zero, eighths = struct.unpack_from("<HHH", payload, 0)
            sc = scenes[sidx - 1] if 0 < sidx <= len(scenes) else None
            if sc is not None:
                sc["pg"] = eighths
        pos += 6 + rec_len

    # ---- map to Lemon shape ------------------------------------------------
    for sidx, els in elements_by_scene.items():
        sc = scenes[sidx - 1] if sidx and 0 < sidx <= len(scenes) else None
        if sc is None:
            continue
        for flag, text in els:
            label = categories[flag] if flag < len(categories) else None
            if label is None or label == "Cast Members":
                name = normalize_character_name(text)
                if name and name not in sc["cast"]:
                    sc["cast"].append(name)
                continue
            key = SEX_CATEGORY_MAP.get(label)
            if key is None:
                key = category_name_to_key(label)
            if key == "notes":
                # notes field: append to a synthetic notes entry
                sc.setdefault("notes", [])
                sc["notes"].append(text)
                continue
            sc["elems"].setdefault(key, [])
            t = text.strip()
            if t and t not in sc["elems"][key]:
                sc["elems"][key].append(t)
    for sc in scenes:
        sc["ie"], sc["set"], sc["dn"] = parse_heading(sc["slug"])
        del sc["slug"]
        if sc["pg"] is None:
            sc["pg"] = 0
        sc["elems"] = {k: sorted(v) for k, v in sc["elems"].items()}
    return {"categories": categories, "scenes": scenes}


def cast_order_of(parsed):
    order, seen = [], set()
    for sc in parsed["scenes"]:
        for name in sc["cast"]:
            if name not in seen:
                seen.add(name)
                order.append(name)
    return order


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--sex",
        default="/Users/gabrielathanasiou/Downloads/Lair (LOCKED) V10  10 10 2019 .sex",
    )
    ap.add_argument("--out", default="e2e/fixtures/lair-v10.expected.json")
    ap.add_argument("--fixture", default="e2e/fixtures/lair-v10.sex")
    ap.add_argument("--noemit", action="store_true")
    args = ap.parse_args()

    data = Path(args.sex).read_bytes()
    parsed = parse_sex(data)
    scenes = parsed["scenes"]
    cast = cast_order_of(parsed)

    print(f"size: {len(data)} bytes, magic ok")
    print(f"categories: {len(parsed['categories'])}")
    print(f"scenes: {len(scenes)} (pages: {sum(s['pg'] for s in scenes)} eighths)")
    print(f"cast: {len(cast)}")
    elem_total = sum(len(sc["cast"]) + sum(len(v) for v in sc["elems"].values()) for sc in scenes)
    print(f"scene breakdown entries: {elem_total}")
    for sc in scenes[:4]:
        print(f"  {sc['n']!r} {sc['ie']} {sc['set'][:30]!r} {sc['dn']} pg={sc['pg']} "
              f"spn={sc['spn']!r} cast={sc['cast'][:3]}")

    if not args.noemit:
        golden = {
            "source": "Lair (LOCKED) V10 10 10 2019 .sex",
            "categories": parsed["categories"],
            "cast": cast,
            "scenes": [
                {k: v for k, v in sc.items() if k in ("n", "spn", "ie", "dn", "set", "pg", "cast", "elems", "notes")}
                for sc in scenes
            ],
        }
        Path(args.out).write_text(json.dumps(golden, indent=1))
        Path(args.fixture).write_bytes(data)
        print(f"\ngolden -> {args.out} ({Path(args.out).stat().st_size} bytes)")
        print(f"fixture -> {args.fixture} ({Path(args.fixture).stat().st_size} bytes)")


if __name__ == "__main__":
    sys.exit(main())