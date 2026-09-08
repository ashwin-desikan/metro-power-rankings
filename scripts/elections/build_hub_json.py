# -*- coding: utf-8 -*-
"""Turn the extracted series into hub JSON: eras, labels, summaries, honesty flags."""
import json, sys, re
sys.path.insert(0, '/tmp/hubs')
import editorial as E

# Each wave writes its own drafts file from build_wikidump_hub; every one
# present is merged, so a hub can be rebuilt without the other waves' dumps.
import glob
DRAFTS = {}
for _f in sorted(glob.glob('/tmp/hubs/wave*-drafts.json')):
    DRAFTS.update(json.load(open(_f, encoding='utf-8'))["series"])

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
 # Wave 2.
 ("hu", "leg", "reform"): "partial",
 ("hu", "leg", "dualism"): "partial",
 ("hu", "leg", "horthy"): "partial",
 ("hu", "leg", "communist"): "unfree",
 ("no", "leg", "embete"): "partial",
 ("se", "leg", "andrakammaren"): "partial",
 ("co", "leg", "early"): "partial",
 ("co", "leg", "dictatorship"): "partial",
 ("co", "leg", "frente"): "partial",
 ("co", "pres", "colegios"): "partial",
 ("co", "pres", "estados"): "partial",
 ("co", "pres", "hegemonia"): "partial",
 ("co", "pres", "frente"): "partial",
 ("cd", "pres", "mobutu"): "unfree",
 ("cd", "leg", "zaire"): "unfree",
 # Wave 3.
 ("cl", "pres", "temprana"): "partial",
 ("cl", "pres", "liberal"): "partial",
 ("cl", "pres", "parlamentaria"): "partial",
 ("cl", "pres", "dictadura"): "partial",
 ("cl", "leg", "parlamentaria"): "partial",
 ("pk", "leg", "basic"): "partial",
 ("ir", "leg", "constitutional"): "partial",
 ("ir", "leg", "pahlavi"): "partial",
 ("ir", "leg", "rastakhiz"): "unfree",
 ("ir", "leg", "republic"): "partial",
 ("ir", "pres", "early"): "partial",
 ("ir", "pres", "reconstruction"): "partial",
 ("ir", "pres", "ahmadinejad"): "partial",
 ("ir", "pres", "current"): "partial",
}

# The one-sentence reason a whole era carries a label. Without this every
# "partial" era fell back to the same generic line, which tells a reader
# nothing about which restriction applied where.
ERA_CAVEAT = {
 ("hu", "leg", "reform"): "The Diet was elected by the counties, which in practice meant by the nobility; there was no popular franchise.",
 ("hu", "leg", "dualism"): "A property and tax franchise held the electorate to about six per cent of the population, and voting outside the towns was open rather than secret.",
 ("hu", "leg", "horthy"): "The secret ballot applied only in the larger cities; elsewhere voters declared their choice in front of officials, and the government party won every time.",
 ("no", "leg", "embete"): "Voting was indirect and the franchise reached only landowning farmers, townsmen of property and public officials, a few per cent of the population.",
 ("se", "leg", "andrakammaren"): "The franchise was tied to income and property, so roughly one adult man in five could vote and far fewer did.",
 ("co", "leg", "early"): "Congress was chosen by provincial electoral colleges rather than by a popular ballot.",
 ("co", "leg", "dictatorship"): "The Liberal Party boycotted, so the seats reserved for the minority party were left vacant and the Conservatives took the rest.",
 ("co", "leg", "frente"): "Seats were divided equally between Liberals and Conservatives by constitutional pact, so voters chose between factions of one party rather than between parties.",
 ("co", "pres", "colegios"): "The president was chosen by provincial electoral colleges and, failing a majority there, by congress; the figures are electors' votes.",
 ("co", "pres", "estados"): "The nine sovereign states each cast a single vote for president, so no popular ballot was held.",
 ("co", "pres", "hegemonia"): "The Conservative Party held the presidency for forty-four years under a constitution written to keep it there.",
 ("hu", "leg", "communist"): "One list, presented by the People's Front, was put to voters for approval; it was approved every time with between 96 and 99%.",
 ("cd", "pres", "mobutu"): "Mobutu was the only name on the ballot, and voters collected a green card for yes or a red card for no in front of officials.",
 ("cd", "leg", "zaire"): "The Popular Movement of the Revolution was the only legal party, membership was automatic at birth, and it took every seat.",
 ("cl", "pres", "temprana"): "The president was chosen by a college of electors picked parish by parish, on a franchise limited to propertied literate men.",
 ("cl", "pres", "liberal"): "Still an indirect election through a college of electors, and two of these contests had a single candidate.",
 ("cl", "pres", "parlamentaria"): "Chile did not elect a president directly until 1925; every contest here was settled by a college of electors.",
 ("cl", "pres", "dictadura"): "A plebiscite held under the constitution the military government had written, offering one name and a yes or no answer. The No won with 56% and the regime accepted the result.",
 ("cl", "leg", "parlamentaria"): "Congress made and unmade ministries, and the parties that held the machinery organised the elections that filled it.",
 ("ir", "leg", "constitutional"): "The first Majlis was won under a constitution wrung from the Qajar shah, then bombarded and dissolved, and the assemblies that followed sat between Russian and British occupation zones.",
 ("ir", "leg", "pahlavi"): "The court managed these elections: the source files most of them under electoral fraud in Iran, and describes them as systematically controlled by the royal court.",
 ("ir", "leg", "rastakhiz"): "The Rastakhiz Party was the only legal party in the country and took all 268 seats.",
 ("ir", "leg", "republic"): "The Guardian Council vets every candidate before the vote, so the field is settled before the campaign begins.",
 ("ir", "pres", "early"): "The Guardian Council vets every candidate before the vote, so the field is settled before the campaign begins.",
 ("ir", "pres", "reconstruction"): "The Guardian Council vets every candidate before the vote, so the field is settled before the campaign begins.",
 ("ir", "pres", "ahmadinejad"): "The Guardian Council vets every candidate before the vote, so the field is settled before the campaign begins.",
 ("pk", "leg", "basic"): "The National Assembly was chosen not by voters but by an electoral college of eighty thousand Basic Democrats elected in the union councils.",
 ("ir", "pres", "current"): "The Guardian Council vets every candidate before the vote, so the field is settled before the campaign begins.",
 ("co", "pres", "frente"): "The two parties had agreed to alternate the presidency between them, so only one candidate from the designated party could win.",
}
FREEDOM_OVERRIDE = {
 # Wave 2. A combined hub keys its presidential rows on the "pres-" id, because
 # Colombia held a congressional and a presidential election in 1949 and they
 # do not carry the same caveat.
 ("hu", "1944"): ("partial", "The Provisional National Assembly was chosen at public meetings in Soviet-held territory rather than by ballot."),
 ("hu", "1947"): ("partial", "The Communists issued blue ballot papers that let their supporters vote in constituencies where they did not live, and they controlled the ministry that ran the count."),
 ("co", "1951"): ("partial", "The Liberal Party boycotted, though some Liberals of the Populares faction stood; the seats reserved for the minority party were left vacant."),
 ("co", "1953"): ("partial", "The Liberal and Communist parties both boycotted, and the seats reserved for the minority party were left vacant."),
 ("co", "pres-1949"): ("unfree", "The Liberal Party withdrew and called a boycott, and Laureano Gomez received all but 23 of the 1.1 million votes cast."),
 ("co", "pres-1970"): ("partial", "Rojas Pinilla lost by 1.6 points on a count his supporters said had been altered; a minister of the day later published a book admitting fraud."),
 ("cd", "pres-2011"): ("partial", "The runoff had been written out of the constitution months earlier, so 49% sufficed, and both the opposition and international observers rejected the count."),
 ("cd", "pres-2018"): ("partial", "The Catholic Church's observer mission, which deployed forty thousand monitors, said its own count did not match the published result."),
 ("cd", "pres-2023"): ("partial", "Voting ran into a second day amid fraud claims, and the electoral commission later cancelled results in two constituencies and disqualified 82 candidates."),
 ("cd", "2023"): ("partial", "The electoral commission cancelled the results in two constituencies and disqualified 82 candidates for fraud."),
 # Wave 4.
 ("pk", "1962"): ("partial", "Political parties were banned and the election was held on a non-partisan basis, with the Assembly chosen indirectly by the Basic Democracies electoral college."),
 ("pk", "1965"): ("partial", "The Assembly was elected indirectly by the Basic Democracies electoral college, whose own members had been chosen in October and November 1964."),
 ("pk", "1977"): ("partial", "The Pakistan National Alliance accused the Pakistan Peoples Party of rigging the result and refused to accept it, and the source files this election under electoral fraud in Pakistan."),
 ("pk", "1985"): ("partial", "Held under Zia-ul-Haq's military government on a nonpartisan basis, with amendments to the Political Parties Act written to disqualify opposition candidates; the Movement for the Restoration of Democracy boycotted, and most of those returned supported the regime."),
 ("pk", "2018"): ("partial", "The European Union observer mission reported systematic attempts to undermine the ruling party, a lack of equality of opportunity, pressure on the media and judicial conduct that had all negatively influenced the campaign."),
 ("pk", "2024"): ("partial", "A Supreme Court ruling stripped Pakistan Tehreek-e-Insaf of its electoral symbol before the vote, so its candidates stood as independents, and the party's website and voter helpline were blocked in the country."),
 # Wave 3.
 ("cl", "1929"): ("unfree", "The article records that the elections were neither free nor fair: the parties agreed a single candidate for each district with the Ibanez government to keep socialists out."),
 ("ir", "1954"): ("partial", "Political parties were banned from contesting the election and all 136 elected members were returned as independents."),
 ("ir", "1960"): ("partial", "The result was extensively and clumsily rigged, the fraud was exposed in the press, and the Shah annulled the election the following year."),
 ("ir", "1923"): ("partial", "Reza Khan used the army to manipulate the vote in many tribal constituencies; only Tehran was left alone."),
 ("ir", "1937"): ("partial", "Like other elections under Reza Shah, this one was systematically controlled by the royal court."),
 ("ir", "2024"): ("partial", "Most moderate and reformist figures were disqualified, reformist organisations called for a boycott, and turnout of about 41% was the lowest the republic has recorded."),
 ("ir", "pres-2009"): ("partial", "Ahmadinejad was declared the winner within hours of polls closing, and the result was disputed by his opponents and followed by the largest street protests since the revolution."),
 ("ir", "pres-2021"): ("partial", "The Guardian Council disqualified more than six hundred applicants, including every woman who registered, approved seven, and three of those withdrew days before the vote; turnout was the lowest in four decades."),
 ("ir", "pres-2024"): ("partial", "A snap election called after President Raisi was killed in a helicopter crash on 19 May 2024, held on a vetted field and drawing under 40% in its first round."),
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

# Per-hub modules (scripts/elections/hubs/<cc>.py) carry their own labels;
# merged here so the three tables above stay the record for the older waves.
ERA_FREEDOM.update(E.HUB_FREEDOM)
ERA_CAVEAT.update(E.HUB_CAVEAT)
FREEDOM_OVERRIDE.update(E.HUB_OVERRIDE)

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
    # A demonym keeps its capital in English, and takes "An" before a vowel
    # (an Ethiopian election, a Pakistani one).
    return " ".join(bits) or ("%s %s election; the results table for this contest is not on file."
                              % ("An" if adj[:1].lower() in "aeiou" else "A", adj))

def pres_summary(e, adj, runoff=False):
    cands = e["parties"]
    bits = []
    # A hub whose presidency is decided in a runoff reports the round that
    # decided it. Gated per hub so the single-round hubs keep reading as before.
    key = (lambda c: c.get("share2") if runoff and c.get("share2") is not None
           else c.get("share"))
    if cands:
        top = max(cands, key=lambda c: key(c) or 0)
        share = key(top)
        round_note = " in the runoff" if runoff and top.get("share2") is not None else ""
        if share is not None:
            bits.append("%s won%s with %.2f%%" % (top["name"], round_note, share))
            if len(cands) > 1:
                rest = [c for c in cands if c is not top]
                second = max(rest, key=lambda c: key(c) or 0)
                if key(second) is not None:
                    bits[-1] += " against %s on %.2f%%" % (second["name"], key(second))
            bits[-1] += "."
        elif top.get("votes"):
            bits.append("%s won with %s votes." % (top["name"], format(top["votes"], ",")))
    if e.get("turnout") is not None:
        bits.append("Turnout %.1f%%." % e["turnout"])
    if bits:
        return " ".join(bits)
    # An infobox that names nobody as elected is a vote that elected nobody
    # (Slovakia's National Council failed nine ballots in 1998); one that names
    # a winner with no table is an unopposed return (five Irish presidencies).
    after = (e.get("pmAfter") or {}).get("name")
    if after and after.strip().lower() in ("none", "vacant"):
        return "No candidate reached the majority required, so the office stayed vacant."
    if after:
        return "Only one candidate was nominated, so no vote was held."
    return "The source records no vote count for this contest."

def to_leg(cc, e, cfg):
    era = era_for(cc, "leg", e["year"])
    unfree = ERA_FREEDOM.get((cc, "leg", era))
    caveat = ERA_CAVEAT.get((cc, "leg", era))
    seat_total_override = None
    ov = FREEDOM_OVERRIDE.get((cc, e["id"]))
    if ov:
        unfree, caveat = ov
    if unfree == "partial":
        unfree, caveat = None, caveat or "A real contest on a restricted or tilted field."
    parties = [{"name": p["name"], "leader": p.get("leader"), "seats": p.get("seats"),
                "seatChange": p.get("seatChange"), "votes": p.get("votes"),
                "share": pct(p.get("share")), "swing": None} for p in e["parties"]]
    if cfg.get("seatShareGuard"):
        # Iran's Majlis infoboxes print a Percentage row that is the share of
        # SEATS, not of votes: 196 of 290 seats and "67.58%" in 2004, 122 of 136
        # and "90.0%" in 1928. Published as a vote share it is a false statement
        # on the page, and fed to the proportionality index it returned a near
        # perfect zero and made Iran the most proportional system in the atlas.
        # Detected rather than assumed: the column goes only where it matches
        # the seat share for every party in the row.
        pairs = [p for p in parties if p["share"] is not None and p["seats"] is not None]
        big = max(pairs, key=lambda p: p["seats"]) if pairs else None
        house = (100.0 * big["seats"] / big["share"]) if (big and big["share"]) else None
        if (len(pairs) >= 2 and house and 50 <= house <= 1000 and all(
                abs(p["share"] - 100.0 * p["seats"] / house) <= 1.0 for p in pairs)):
            parties = [dict(p, share=None) for p in parties]
            # The infobox pins its own denominator: seats and their percentages
            # together give the size of the house exactly, which is better than
            # the sum of the parties the box happened to list (196 of 243 for a
            # 290-seat Majlis in 2004).
            seat_total_override = int(round(house))
    if cfg.get("singleBlock"):
        # Colombia's Senate table runs straight on into the two seats elected in
        # a separate indigenous constituency, whose percentages are of their own
        # much smaller electorate. Left in, the shares totalled 168% and the
        # proportionality index refused to score the hub at all. Cut where the
        # running total says a second contest has started.
        cut, run = len(parties), 0.0
        for k, p in enumerate(parties):
            run += p["share"] or 0.0
            if k >= 3 and run > 100.5:
                cut = k
                break
        parties = parties[:cut]
    # Sanity: an article whose seat column parsed badly should show nothing
    # rather than a wrong number. Two Egyptian rows fail this and are the reason
    # it exists.
    seated = [p for p in parties if p["seats"] is not None]
    total = seat_total_override if seat_total_override is not None else e.get("totalSeats")
    if (cfg.get("seatShareGuard") and seat_total_override is None
            and e.get("seatTotalSource") == "sum"):
        # Iran's Majlis infoboxes list four blocs out of a 290-seat house, so
        # the parties on the page do not sum to it. "177 of 216 seats" is a
        # sentence about the infobox, not about the Majlis. Where the results
        # table states its own total, that stands.
        total = e.get("tableSeats")
    maj = e.get("majoritySeats")
    if cfg.get("noTotals"):
        # Colombia's congressional infoboxes give the size of the Chamber while
        # the results table on the same page is the Senate. Take the house size
        # from the table's own Total row, or show none at all: an infobox figure
        # that belongs to the other chamber is worse than nothing.
        total, maj = e.get("tableSeats"), None
    listed = sum(p["seats"] for p in seated)
    if any(p["seats"] < 0 for p in seated):
        parties = [dict(p, seats=None) for p in parties]
        seated, listed = [], 0
    if total is not None and (total <= 0 or listed > total + 2):
        total = None
    if total is not None and maj is not None and not (total - 3 <= 2 * maj <= total + 4):
        # A house can be partly elected, and a majority can be quoted on a
        # different base than the whole house: the DRC returned 489 of its 500
        # seats in 2023, and Pakistan's 156-seat Assembly of 1962 had 150
        # general seats and a majority quoted on those. Neither figure is
        # wrong. An "All N seats in..." line from the infobox is a direct
        # statement about the house and outranks the majority; only a total
        # this builder inferred by summing the listed parties gives way.
        if (e.get("seatTotalSource") == "infobox"
                or (listed and abs(listed - total) <= 2)):
            maj = None
        else:
            total = None
    if maj is not None and total is None:
        maj = None
    e = dict(e, totalSeats=total, majoritySeats=maj, parties=parties)
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
    caveat = ERA_CAVEAT.get((cc, "pres", era))
    ov = (FREEDOM_OVERRIDE.get((cc, "pres-" + e["id"]))
          or FREEDOM_OVERRIDE.get((cc, e["id"])))
    if ov:
        unfree, caveat = ov
    if unfree == "partial":
        unfree, caveat = None, caveat or "A real contest on a restricted or tilted field."
    cands = [{"name": c["name"], "party": c.get("party"),
              "r1Votes": c.get("votes"), "r1Share": pct(c.get("share")),
              "r2Votes": c.get("votes2"), "r2Share": pct(c.get("share2"))}
             for c in e["parties"]]
    after = e.get("pmAfter")
    if after and (after.get("name") or "").strip().lower() in ("none", "vacant"):
        after = None
    return {
        "id": "pres-" + e["id"], "label": e["label"], "year": e["year"], "kind": "presidential",
        "date": e["date"], "era": era,
        "turnout": pct(e.get("turnout")), "turnout2": None,
        "candidates": cands,
        "presBefore": e.get("pmBefore"), "presAfter": after,
        "knownAs": None, "summary": pres_summary(e, cfg["adj"], cfg.get("runoffSummary", False)),
        "caveat": caveat, "unfree": unfree,
    }

# The as-of stamp every hub prints. One value per run, not per hub.
BUILT = "2026-09-08"

def build(cc):
    cfg = E.HUBS[cc]
    out = {"meta": {"title": cfg["title"], "sources": cfg["sources"], "built": BUILT}}
    if cc in E.HUB_STATUS:
        out["meta"].update(E.HUB_STATUS[cc])
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
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    for cc in E.HUBS:
        if only and cc not in only:
            continue
        # A wave can be rebuilt on its own: hubs whose drafts are not present
        # are skipped rather than crashing the run.
        need = [k for k in ("%s-legislative" % cc, "%s-presidential" % cc)
                if k in DRAFTS]
        if not need:
            print("%-3s skipped, no drafts on disk" % cc)
            continue
        doc = build(cc)
        json.dump(doc, open('/tmp/hubs/json/%s-elections.json' % cc, 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        n = len(doc.get("elections") or []) + len(doc.get("legislative") or []) + len(doc.get("presidential") or [])
        print("%-3s %-9s %3d contests" % (cc, E.HUBS[cc]["shape"], n))
