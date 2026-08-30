# -*- coding: utf-8 -*-
"""Add a presidential series to the German hub.

Additive on purpose: de-elections.json keeps its existing `eras` and `elections`
keys untouched and gains `presEras` and `presidential` beside them, so nothing
that already reads the file has to change.
"""
import sys, json
sys.path.insert(0, '/tmp/hubs')
from parse_dump import articles, infobox, title_bits
from german_pres import convention, ballots

F = '/root/.claude/uploads/8cb8b4ec-8ac8-5953-bce8-129a2a7800db/a026d0b2-germanpres.txt'
ORD = {1: "first", 2: "second", 3: "third"}
ERAS = [
 ("bonn", "The Bonn republic", "1954–1989", 1900, 1989,
  "West Germany gave its head of state no executive power and elected him by a Federal Convention that meets once and dissolves: every member of the Bundestag, plus an equal number of delegates chosen by the state parliaments. Theodor Heuss set the tone. Gustav Heinemann's win on the third ballot in 1969 signalled the coming SPD-FDP coalition a year before the voters did. Richard von Weizsäcker's 1985 speech on the fortieth anniversary of the surrender did more to define the office than anything in the Basic Law."),
 ("berlin", "The Berlin republic", "1994–", 1990, 2100,
  "Reunification enlarged the Convention, and the office kept its habit of surprising people. Roman Herzog needed three ballots in 1994, Horst Köhler resigned in 2010 over a remark about the Bundeswehr, Christian Wulff resigned in 2012 over a home loan, and Gauck and Steinmeier restored a presidency that had started to look precarious."),
]


def era_for(y):
    for k, l, s, lo, hi, b in ERAS:
        if lo <= y <= hi:
            return k
    return ERAS[-1][0]


def build():
    out = []
    for t, lines in articles(F):
        if 'presidential election' not in (t or ''):
            continue
        year, _ = title_bits(t)
        if year is None:
            continue
        ib = infobox(lines)
        conv, tot = convention(lines)
        bal = ballots(lines) or []
        cands, nrounds = [], 0
        for r in bal:
            rounds = r["rounds"]
            nrounds = max(nrounds, len(rounds))
            cands.append({
                "name": r["name"], "party": r.get("party"),
                "r1Votes": rounds[0]["votes"], "r1Share": rounds[0]["share"],
                "r2Votes": rounds[-1]["votes"] if len(rounds) > 1 else None,
                "r2Share": rounds[-1]["share"] if len(rounds) > 1 else None,
            })
        win = max(cands, key=lambda c: (c["r2Share"] or c["r1Share"] or 0)) if cands else None
        bits = []
        if win:
            bits.append("%s was elected on the %s ballot with %s electoral votes%s." % (
                win["name"], ORD.get(nrounds, "%dth" % nrounds),
                format(win["r2Votes"] or win["r1Votes"] or 0, ","),
                " of %s" % format(int(tot), ",") if tot else ""))
        if conv:
            top = [(k, v) for k, v in sorted(conv.items(), key=lambda kv: -(kv[1]["total"] or 0))
                   if v["total"]][:2]
            if top:
                bits.append("The Convention's largest delegations were %s." %
                            " and ".join("%s with %d" % (k, v["total"]) for k, v in top))
        if nrounds > 1:
            bits.append("An absolute majority is needed on the first two ballots; a plurality is enough on the third.")
        out.append({
            "id": "pres-%d" % year, "label": str(year), "year": year, "kind": "presidential",
            "date": ib["date"] or str(year), "era": era_for(year),
            "turnout": None, "turnout2": None,
            "electors": int(tot) if tot else None,
            "ballots": nrounds or None,
            "convention": ([{"party": k, "bundestag": v["bundestag"], "land": v["land"],
                             "total": v["total"]}
                            for k, v in sorted(conv.items(), key=lambda kv: -(kv[1]["total"] or 0))]
                           if conv else None),
            "candidates": cands,
            "presBefore": ib["before"], "presAfter": ib["after"],
            "knownAs": None,
            "summary": " ".join(bits) or "The Federal Convention met; the ballot record for this election is not on file.",
            "caveat": None if cands else "No ballot record on file for this election.",
        })
    out.sort(key=lambda e: e["year"])
    return out


if __name__ == "__main__":
    pres = build()
    src = '/mnt/user-data/uploads/Desktop--Projects--Metro Area Project/public/data/de-elections.json'
    d = json.load(open(src, encoding='utf-8'))
    d["presEras"] = [{"key": k, "label": l, "span": s, "blurb": b} for k, l, s, lo, hi, b in ERAS]
    d["presidential"] = pres
    d["meta"]["sources"] = sorted(set(d["meta"]["sources"] + [
        "Wikipedia: German and West German presidential election articles 1954–2022 (Federal Convention composition and ballot results)"]))
    d["meta"]["built"] = "2026-08-30"
    json.dump(d, open('/tmp/hubs/de-elections.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print("presidential", len(pres), "| with ballots", sum(1 for e in pres if e["candidates"]),
          "| with convention", sum(1 for e in pres if e["convention"]),
          "| multi-ballot", sum(1 for e in pres if (e["ballots"] or 1) > 1))
    for e in pres[-4:]:
        print("  ", e["id"], e["summary"][:110])
