#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Resolve every club in the domestic basketball hub to a metro area.

Three tiers, most authoritative first. Nothing is guessed: a club that does not
clear a tier is reported as unresolved and is written to Supabase with a NULL
metro.

  1. The EuroLeague hub's own curated metro_slug
     (public/data/basketball/euroleague.json).
  2. The club's home city matching a metro name outright in metros.json,
     guarded by country.
  3. The club's home city appearing as a MEMBER ROW of a metro in
     MetroAreas.xlsx. This is the repo's ground truth for what belongs to a
     metro: it is the same list the boundary builder unions into a polygon, so
     "Badalona is in the Barcelona metro" is proven, not assumed.

Run:  python resolve_metros.py [--json out.json]
"""

import argparse
import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORKBOOK = Path(r"C:\Users\ashwi\OneDrive\Excel Files\MetroAreas.xlsx")

sys.path.insert(0, str(HERE))
from club_cities import CLUB_CITY, UNKNOWN_CITY, NOT_A_CLUB  # noqa: E402

_CHARMAP = {"\u0131": "i", "\u0130": "i", "\u0111": "d", "\u0110": "d",
            "\u0142": "l", "\u0141": "l", "\u00f8": "o", "\u00d8": "o",
            "\u00df": "ss"}


def fold(s):
    s = "".join(_CHARMAP.get(c, c) for c in (s or ""))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return s


def load_json(*parts):
    return json.load(io.open(ROOT.joinpath(*parts), encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write the resolution table here")
    args = ap.parse_args()

    el = load_json("public", "data", "basketball", "euroleague.json")
    el_metro = {c["name"]: (c.get("metro"), c.get("metro_slug"))
                for c in el["clubs"] if c.get("metro_slug")}

    metros_raw = load_json("public", "data", "metros.json")
    metros = metros_raw if isinstance(metros_raw, list) else metros_raw.get("metros")
    metros = list(metros.values() if isinstance(metros, dict) else metros)
    by_name = defaultdict(list)
    slug_name = {}
    for m in metros:
        slug_name[m["slug"]] = (m.get("name"), m.get("country"))
        by_name[(fold(m.get("name")), fold(m.get("country")))].append(m["slug"])

    # ---- tier 3 index: member row primary name -> metro slug ---------------
    member = {}
    if WORKBOOK.exists():
        try:
            from python_calamine import CalamineWorkbook
            wb = CalamineWorkbook.from_path(str(WORKBOOK))
            # Real layout, confirmed against the workbook 2026-08-08:
            #   Counties     -> Country | <district name> | ... | Metro Area
            #   Municipality -> .. | Country | Municipality | ... | Metro Area
            # 'Primary Name' is the Overture NATIVE-SCRIPT name (Arabic, CJK),
            # so the member's Latin name is the district/municipality column.
            LAYOUT = {
                "Counties":     ("Country", "Distri rrondissement/County", "Metro Area"),
                "Municipality": ("Country", "Municipality", "Metro Area"),
            }
            for sheet, (c_country, c_name, c_metro) in LAYOUT.items():
                if sheet not in wb.sheet_names:
                    continue
                rows = wb.get_sheet_by_name(sheet).to_python()
                if not rows:
                    continue
                hdr = [str(h).strip() for h in rows[0]]
                try:
                    i_country, i_name, i_metro = (hdr.index(c_country),
                                                  hdr.index(c_name),
                                                  hdr.index(c_metro))
                except ValueError:
                    print(f"  [tier3] {sheet}: header changed, skipped")
                    continue
                i_primary = hdr.index("Primary Name") if "Primary Name" in hdr else None
                n = 0
                for r in rows[1:]:
                    if len(r) <= max(i_country, i_name, i_metro):
                        continue
                    ctry = str(r[i_country] or "").strip()
                    mname = str(r[i_metro] or "").strip()
                    if not mname or not ctry:
                        continue
                    names = [str(r[i_name] or "").strip()]
                    if i_primary is not None and len(r) > i_primary:
                        names.append(str(r[i_primary] or "").strip())
                    for nm in names:
                        if nm:
                            member.setdefault((fold(nm), fold(ctry)), set()).add(fold(mname))
                            n += 1
                print(f"  [tier3] {sheet}: indexed {n:,} member names")
        except Exception as e:
            print(f"  [tier3] workbook unavailable ({e}); tiers 1-2 only")
    else:
        print("  [tier3] workbook not found; tiers 1-2 only")

    metro_by_foldname = {}
    for m in metros:
        metro_by_foldname.setdefault(fold(m.get("name")), m["slug"])

    hon = load_json("public", "data", "honours", "basketball-domestic.json")
    clubs = set()
    for rows in hon["rolls"].values():
        for r in rows:
            for who in filter(None, [r["winner"], r["ru"]]):
                for part in who.split(" & "):
                    clubs.add(part.strip())

    out, counts = {}, defaultdict(int)
    for club in sorted(clubs):
        city, country = CLUB_CITY.get(club, (None, None))
        rec = {"club": club, "city": city, "country": country,
               "metro": None, "metro_slug": None, "tier": None,
               "is_club": club not in NOT_A_CLUB}

        if club in el_metro:
            rec["metro"], rec["metro_slug"] = el_metro[club]
            rec["tier"] = "euroleague"
        elif city:
            hit = by_name.get((fold(city), fold(country)))
            if hit:
                rec["metro_slug"] = hit[0]
                rec["metro"] = slug_name[hit[0]][0]
                rec["tier"] = "metro-name"
            else:
                mnames = member.get((fold(city), fold(country))) or set()
                slugs = {metro_by_foldname[m] for m in mnames
                         if m in metro_by_foldname}
                if len(slugs) == 1:
                    s = slugs.pop()
                    rec["metro_slug"] = s
                    rec["metro"] = slug_name[s][0]
                    rec["tier"] = "workbook-member"
                elif len(slugs) > 1:
                    rec["tier"] = "ambiguous"
        counts[rec["tier"] or ("no-city" if club in UNKNOWN_CITY or not city
                               else "unresolved")] += 1
        out[club] = rec

    print(f"\nclubs: {len(clubs)}")
    for k in sorted(counts, key=lambda x: -counts[x]):
        print(f"  {k:18s} {counts[k]}")

    print("\n=== UNRESOLVED (written with a NULL metro) ===")
    for club, r in sorted(out.items()):
        if r["metro_slug"]:
            continue
        why = "no city on file" if not r["city"] else \
              ("ambiguous member match" if r["tier"] == "ambiguous"
               else f"city '{r['city']}' not a metro and not a member row")
        flag = "" if r["is_club"] else "  [not a club: selection side]"
        print(f"  {club:34s} {why}{flag}")

    if args.json:
        io.open(args.json, "w", encoding="utf-8").write(
            json.dumps(out, ensure_ascii=False, indent=1))
        print(f"\nwrote {args.json}")


if __name__ == "__main__":
    main()
