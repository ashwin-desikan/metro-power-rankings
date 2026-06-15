# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, "scripts/build-nhl-data.py")
c = io.open(P, "r", encoding="utf-8").read()

old = '''def read_cup_presentation_games(wb):
    """Detailed Playoffs rows where Cup Awarded (col AT / 45) == 'Y'. One row
    per Cup presentation (the champion's perspective). Date uses Sort Date
    (col AU / 46, YYYYMMDD) so 1800s challenge games sort/display correctly."""
    ws = wb["Detailed Playoffs"]
    out = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        if safe_str(row[45] if len(row) > 45 else "").strip().upper() != "Y":
            continue
        au = safe_int(row[46]) if len(row) > 46 else 0
        _ha = safe_str(row[17] if len(row) > 17 else "").strip()
        _lw = _ha.lower() == "league winner"
        out.append({
            "year": safe_int(row[2]),
            "au": au,
            "date": _format_au(au),
            "round": safe_str(row[4]),
            "game_num": safe_int(row[5]) if len(row) > 5 else None,  # col F
            "winner_canonical": safe_str(row[34]),
            "winner_city": safe_str(row[8]),
            "winner_team": safe_str(row[9]),
            "loser_canonical": safe_str(row[35]),
            "loser_city": safe_str(row[12]),
            "loser_team": safe_str(row[13]),
            "winner_score": _cup_num(row[14] if len(row) > 14 else None),
            "loser_score": _cup_num(row[15] if len(row) > 15 else None),
            "ot": bool(safe_str(row[16]).strip()),
            "arena": "" if _lw else _clean_arena(_ha),
            "league_winner": _lw,
            "arena_city": "" if _lw else safe_str(row[18] if len(row) > 18 else ""),
            "arena_state": "" if _lw else safe_str(row[19] if len(row) > 19 else ""),
        })
    return out'''

new = '''def read_cup_presentation_games(wb):
    """Detailed Playoffs rows where 'Cup Awarded' == 'Y' (one row per Cup
    presentation, the champion's perspective). Columns are resolved BY HEADER
    NAME, not fixed index: the workbook periodically gains/loses columns, and a
    fixed-index version silently emitted zero rows after a column was dropped.
    Date uses 'Sort Date (YYYYMMDD)' so 1800s challenge games sort correctly."""
    ws = wb["Detailed Playoffs"]
    all_rows = list(ws.iter_rows(values_only=True))
    if not all_rows:
        return []
    hdr = {str(c).strip(): i for i, c in enumerate(all_rows[0]) if c is not None}
    def gi(*names):
        for n in names:
            if n in hdr:
                return hdr[n]
        return None
    c_cup = gi("Cup Awarded")
    c_sort = gi("Sort Date (YYYYMMDD)", "Sort Date")
    c_year = gi("Season", "Year")
    c_round = gi("Round")
    c_gm = gi("Gm", "Game", "Game #")
    c_wcity = gi("City")
    c_wteam = gi("Team")
    c_lcity = gi("Other City")
    c_lteam = gi("Other Team")
    c_gf = gi("GF")
    c_ga = gi("GA")
    c_ot = gi("OT")
    c_ha = gi("Home Arena")
    c_acity = gi("Arena Area")
    c_astate = gi("Arena St/Prov.", "Arena St/Prov")
    c_wcanon = gi("Name")
    c_lcanon = gi("Opponent")
    if c_cup is None or c_sort is None or c_wcanon is None:
        raise SystemExit("read_cup_presentation_games: missing required headers in Detailed Playoffs (Cup Awarded / Sort Date / Name)")
    def cell(row, idx):
        return row[idx] if (idx is not None and idx < len(row)) else None
    out = []
    for row in all_rows[1:]:
        if safe_str(cell(row, c_cup)).strip().upper() != "Y":
            continue
        au = safe_int(cell(row, c_sort)) or 0
        _ha = safe_str(cell(row, c_ha)).strip()
        _lw = _ha.lower() == "league winner"
        out.append({
            "year": safe_int(cell(row, c_year)),
            "au": au,
            "date": _format_au(au),
            "round": safe_str(cell(row, c_round)),
            "game_num": safe_int(cell(row, c_gm)) if c_gm is not None else None,
            "winner_canonical": safe_str(cell(row, c_wcanon)),
            "winner_city": safe_str(cell(row, c_wcity)),
            "winner_team": safe_str(cell(row, c_wteam)),
            "loser_canonical": safe_str(cell(row, c_lcanon)),
            "loser_city": safe_str(cell(row, c_lcity)),
            "loser_team": safe_str(cell(row, c_lteam)),
            "winner_score": _cup_num(cell(row, c_gf)),
            "loser_score": _cup_num(cell(row, c_ga)),
            "ot": bool(safe_str(cell(row, c_ot)).strip()),
            "arena": "" if _lw else _clean_arena(_ha),
            "league_winner": _lw,
            "arena_city": "" if _lw else safe_str(cell(row, c_acity)),
            "arena_state": "" if _lw else safe_str(cell(row, c_astate)),
        })
    return out'''

if c.count(old) != 1:
    sys.exit("ANCHOR FAIL: %d" % c.count(old))
c = c.replace(old, new)
io.open(P, "w", encoding="utf-8").write(c)
print("OK read_cup_presentation_games is now header-mapped")
