# -*- coding: utf-8 -*-
"""Prepend the Cisleithanian Imperial Council elections to the Austrian hub."""
import io, json, sys
sys.path.insert(0, '/tmp/hubs')
from cisleithania import build

F = '/root/.claude/uploads/8cb8b4ec-8ac8-5953-bce8-129a2a7800db/2f2d3413-austriaelections.txt'
SRC = '/mnt/user-data/uploads/Desktop--Projects--Metro Area Project/public/data/at-elections.json'

ERA = {
 "key": "reichsrat",
 "label": "The Imperial Council",
 "span": "1897–1911",
 "blurb": (
  "Before there was an Austria there was Cisleithania, the Austrian half of "
  "Austria-Hungary, and its House of Deputies is the direct ancestor of the "
  "Nationalrat. Its elections were fought in eleven languages. Deputies sat not "
  "by party but by club, and the clubs were national before they were "
  "ideological: a Poland Club, a Bohemian Club, a Ruthenian Association, an "
  "Italian Union. Until 1907 the franchise ran through curiae that weighted a "
  "landowner's vote many times a labourer's; the fifth curia added in 1896 gave "
  "every man a vote, and only a fraction of the weight. Universal and equal male "
  "suffrage arrived in 1907, whereupon the Christian Socials took 96 seats and "
  "the Social Democrats 50, and the chamber became so fragmented that it was "
  "adjourned more often than it sat. The last of these parliaments was still "
  "formally in being when the empire dissolved in 1918."),
}

CURIAL = ("Elected through the curial system, which weighted votes by class and tax: "
          "the fifth curia added in 1896 gave every man a vote worth a fraction of a "
          "landowner's.")

SUMMARY = {
 "1897": ("The first election with the fifth curia, in which every man could vote and "
          "almost none of them counted for much. Badeni's language ordinances brought "
          "the chamber to a standstill within months and cost him his office."),
 "1900-01": ("A parliament of clubs with no majority and no prospect of one, elected over "
             "five weeks either side of the new year. Koerber governed largely by "
             "emergency decree under Article 14."),
 "1907": ("The first election under universal and equal male suffrage. The curiae were "
          "abolished, the Christian Socials took 96 seats and the Social Democrats 50, "
          "and mass politics arrived in the empire all at once."),
 "1911": ("The last parliament of Austria-Hungary. The German National Association took "
          "100 of 516 seats and nothing resembling a governing majority existed; the "
          "chamber was adjourned in 1914 and did not meet again until 1917."),
}


def main():
    doc = json.load(open(SRC, encoding='utf-8'))
    rows = []
    for e in build(F):
        parties = [{"name": c["name"], "leader": None, "seats": c["seats"],
                    "seatChange": None, "votes": None, "share": None, "swing": None}
                   for c in e["clubs"]]
        rows.append({
            "id": e["id"], "label": e["label"], "year": e["year"], "kind": "legislative",
            "date": e["date"], "era": ERA["key"],
            "totalSeats": e["totalSeats"], "majoritySeats": e["majoritySeats"],
            "turnout": e["turnout"], "parties": parties,
            "pmBefore": None, "pmAfter": None, "knownAs": None,
            "summary": SUMMARY[e["id"]],
            "seatLeader": parties[0]["name"] if parties else None,
            "caveat": CURIAL if e["year"] < 1907 else None,
            "unfree": None,
        })

    have = {r["id"] for r in doc["legislative"]}
    rows = [r for r in rows if r["id"] not in have]
    doc["legislative"] = rows + doc["legislative"]
    if doc["legEras"][0]["key"] != ERA["key"]:
        doc["legEras"] = [ERA] + doc["legEras"]
    doc["meta"]["sources"] = sorted(set(doc["meta"]["sources"] + [
        "Wikipedia: Cisleithanian Imperial Council election articles 1897–1911 (club totals per Nohlen & Stöver and ANNO)"]))
    json.dump(doc, open('/tmp/hubs/at-elections.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print("added", len(rows), "Reichsrat elections; legislative now",
          len(doc["legislative"]), "rows,", len(doc["legEras"]), "eras")
    for r in rows:
        print("  %-8s %-38s %-4s seats | largest %s %d"
              % (r["id"], r["date"], r["totalSeats"], r["seatLeader"], r["parties"][0]["seats"]))


if __name__ == "__main__":
    main()
