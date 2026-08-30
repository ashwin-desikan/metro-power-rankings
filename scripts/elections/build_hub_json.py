# -*- coding: utf-8 -*-
"""Turn the extracted series into hub JSON: eras, labels, summaries, honesty flags."""
import json, sys, re
sys.path.insert(0, '/tmp/hubs')
import editorial as E

DRAFTS = json.load(open('/tmp/hubs/wave1-drafts.json', encoding='utf-8'))["series"]

# Honesty labels. era-level defaults, then per-election overrides. "unfree" is a
# ritual whose result was never in doubt; "partial" is a real contest on a
# restricted or tilted field. Everything else is unmarked.
ERA_FREEDOM = {
 ("pt", "leg", "estadonovo"): "unfree",
 ("pt", "leg", "first"): "partial",
 ("pt", "pres", "first"): "unfree",
 ("eg", "leg", "nasser"): "unfree",
 ("eg", "leg", "ndp"): "partial",
 ("eg", "leg", "monarchy"): "partial",
 ("eg", "leg", "after"): "partial",
 ("eg", "pres", "plebiscite"): "unfree",
 ("eg", "pres", "multi"): "partial",
 ("eg", "pres", "sisi"): "unfree",
 ("gr", "leg", "kingdom"): "partial",
 ("gr", "leg", "schism"): "partial",
 ("at", "leg", "first"): None,
}
FREEDOM_OVERRIDE = {
 ("ph", "1943"): ("unfree", "Held under Japanese occupation by an appointed assembly; no popular vote took place."),
 ("ph", "1981"): ("unfree", "Boycotted by the main opposition under martial law; Marcos was credited with 88%."),
 ("ph", "1986"): ("partial", "The official count was abandoned on live television when tabulators walked out; the result was overturned by the People Power uprising three weeks later."),
 ("gr", "1946"): ("partial", "Boycotted by the left, four months before the civil war began."),
 ("gr", "1935"): ("partial", "Held under a state of emergency after a failed Venizelist coup, and boycotted by the Liberals."),
 ("gr", "1936"): ("partial", "The last election before the Metaxas dictatorship; the Communists held the balance of power for four months."),
 ("eg", "2014"): ("unfree", "Held after the removal of an elected president, with the main opposition banned."),
 ("eg", "2012"): (None, None),
 ("pt", "1975"): (None, None),
}

def era_for(cc, kind, year):
    for key, label, span, lo, hi, blurb in E.ERAS[cc][kind]:
        if lo <= year <= hi:
            return key
    return E.ERAS[cc][kind][-1][0]

def eras_out(cc, kind):
    return [{"key": k, "label": l, "span": s, "blurb": b}
            for k, l, s, lo, hi, b in E.ERAS[cc][kind]]

def pct(v):
    return None if v is None else round(float(v), 2)

def leg_summary(e, chamber, adj):
    parties = [p for p in e["parties"] if p.get("seats") is not None]
    bits = []
    if parties:
        top = max(parties, key=lambda p: p["seats"])
        if e.get("totalSeats"):
            bits.append("%s finished first with %d of %d seats" % (top["name"], top["seats"], e["totalSeats"]))
        else:
            bits.append("%s finished first with %d seats" % (top["name"], top["seats"]))
        if top.get("share") is not None:
            bits[-1] += " on %.1f%% of the vote" % top["share"]
        bits[-1] += "."
    elif e["parties"]:
        top = max(e["parties"], key=lambda p: p.get("share") or 0)
        if top.get("share"):
            bits.append("%s led the poll with %.1f%%." % (top["name"], top["share"]))
    if e.get("turnout") is not None:
        bits.append("Turnout %.1f%%." % e["turnout"])
    after, before = e.get("pmAfter"), e.get("pmBefore")
    if after and before and after.get("name") and before.get("name"):
        if after["name"] != before["name"]:
            bits.append("%s replaced %s." % (after["name"], before["name"]))
        else:
            bits.append("%s stayed in office." % after["name"])
    elif after and after.get("name"):
        bits.append("%s took office." % after["name"])
    return " ".join(bits) or ("A %s election; the results table for this contest is not on file." % adj.lower())

def pres_summary(e, adj):
    cands = e["parties"]
    bits = []
    if cands:
        top = cands[0] if (cands[0].get("share") or 0) >= max((c.get("share") or 0) for c in cands) else max(cands, key=lambda c: c.get("share") or 0)
        if top.get("share") is not None:
            bits.append("%s won with %.2f%%" % (top["name"], top["share"]))
            if len(cands) > 1:
                rest = [c for c in cands if c is not top]
                second = max(rest, key=lambda c: c.get("share") or 0)
                if second.get("share") is not None:
                    bits[-1] += " against %s on %.2f%%" % (second["name"], second["share"])
            bits[-1] += "."
        elif top.get("votes"):
            bits.append("%s won with %s votes." % (top["name"], format(top["votes"], ",")))
    if e.get("turnout") is not None:
        bits.append("Turnout %.1f%%." % e["turnout"])
    return " ".join(bits) or "Only one candidate was nominated, so no vote was held."

def to_leg(cc, e, cfg):
    era = era_for(cc, "leg", e["year"])
    unfree = ERA_FREEDOM.get((cc, "leg", era))
    caveat = None
    ov = FREEDOM_OVERRIDE.get((cc, e["id"]))
    if ov:
        unfree, caveat = ov
    if unfree == "partial":
        unfree, caveat = None, caveat or "A real contest on a restricted or tilted field."
    parties = [{"name": p["name"], "leader": p.get("leader"), "seats": p.get("seats"),
                "seatChange": p.get("seatChange"), "votes": p.get("votes"),
                "share": pct(p.get("share")), "swing": None} for p in e["parties"]]
    # Sanity: an article whose seat column parsed badly should show nothing
    # rather than a wrong number. Two Egyptian rows fail this and are the reason
    # it exists.
    seated = [p for p in parties if p["seats"] is not None]
    total = e.get("totalSeats")
    maj = e.get("majoritySeats")
    listed = sum(p["seats"] for p in seated)
    if any(p["seats"] < 0 for p in seated):
        parties = [dict(p, seats=None) for p in parties]
        seated, listed = [], 0
    if total is not None and (total <= 0 or listed > total + 2):
        total = None
    if total is not None and maj is not None and not (total - 3 <= 2 * maj <= total + 4):
        total = None
    if maj is not None and total is None:
        maj = None
    e = dict(e, totalSeats=total, majoritySeats=maj)
    return {
        "id": e["id"], "label": e["label"], "year": e["year"], "kind": "legislative",
        "date": e["date"], "era": era,
        "totalSeats": e.get("totalSeats"), "majoritySeats": e.get("majoritySeats"),
        "turnout": pct(e.get("turnout")), "parties": parties,
        "pmBefore": e.get("pmBefore"), "pmAfter": e.get("pmAfter"),
        "knownAs": None, "summary": leg_summary(e, cfg.get("chamber"), cfg["adj"]),
        "seatLeader": max(seated, key=lambda p: p["seats"])["name"] if seated else None,
        "caveat": caveat, "unfree": unfree,
    }

def to_pres(cc, e, cfg):
    era = era_for(cc, "pres", e["year"])
    unfree = ERA_FREEDOM.get((cc, "pres", era))
    caveat = None
    ov = FREEDOM_OVERRIDE.get((cc, e["id"]))
    if ov:
        unfree, caveat = ov
    if unfree == "partial":
        unfree, caveat = None, caveat or "A real contest on a restricted or tilted field."
    cands = [{"name": c["name"], "party": c.get("party"),
              "r1Votes": c.get("votes"), "r1Share": pct(c.get("share")),
              "r2Votes": c.get("votes2"), "r2Share": pct(c.get("share2"))}
             for c in e["parties"]]
    return {
        "id": "pres-" + e["id"], "label": e["label"], "year": e["year"], "kind": "presidential",
        "date": e["date"], "era": era,
        "turnout": pct(e.get("turnout")), "turnout2": None,
        "candidates": cands,
        "presBefore": e.get("pmBefore"), "presAfter": e.get("pmAfter"),
        "knownAs": None, "summary": pres_summary(e, cfg["adj"]),
        "caveat": caveat, "unfree": unfree,
    }

def build(cc):
    cfg = E.HUBS[cc]
    out = {"meta": {"title": cfg["title"], "sources": cfg["sources"], "built": "2026-08-30"}}
    if cfg["shape"] == "leg":
        out["eras"] = eras_out(cc, "leg")
        out["elections"] = [to_leg(cc, e, cfg) for e in DRAFTS["%s-legislative" % cc]]
    elif cfg["shape"] == "pres":
        out["eras"] = eras_out(cc, "pres")
        out["elections"] = [to_pres(cc, e, cfg) for e in DRAFTS["%s-presidential" % cc]]
        for e in out["elections"]:
            e["id"] = e["id"].replace("pres-", "")
    else:
        out["presEras"] = eras_out(cc, "pres")
        out["legEras"] = eras_out(cc, "leg")
        out["presidential"] = [to_pres(cc, e, cfg) for e in DRAFTS["%s-presidential" % cc]]
        out["legislative"] = [to_leg(cc, e, cfg) for e in DRAFTS["%s-legislative" % cc]]
    return out

if __name__ == "__main__":
    import os
    os.makedirs('/tmp/hubs/json', exist_ok=True)
    for cc in E.HUBS:
        doc = build(cc)
        json.dump(doc, open('/tmp/hubs/json/%s-elections.json' % cc, 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        n = len(doc.get("elections") or []) + len(doc.get("legislative") or []) + len(doc.get("presidential") or [])
        print("%-3s %-9s %3d contests" % (cc, E.HUBS[cc]["shape"], n))
