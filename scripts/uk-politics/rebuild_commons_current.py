# Rebuild the CURRENT (2024) parliament composition timeline from the
# authoritative UK Parliament "State of the Parties" API. Only touches the
# 2024-general-election-to-present parliament; every earlier parliament is
# left byte-identical. Verifies the final state equals the live snapshot.
import urllib.request, json, time, datetime, shutil, os

ROOT = r"C:\Users\ashwi\Desktop\Projects\Metro Area Project"
PATH = os.path.join(ROOT, "public", "data", "uk-commons-history.json")
API = "https://members-api.parliament.uk/api/Parties/StateOfTheParties/Commons/{}"

NAME_MAP = {
  "Labour": "Labour", "Labour (Co-op)": "Labour",
  "Conservative": "Conservative", "Liberal Democrat": "Liberal Democrat",
  "Independent": "Independent", "Scottish National Party": "SNP",
  "Reform UK": "Reform UK", "Sinn Féin": "Sinn Féin",
  "Democratic Unionist Party": "DUP", "Green Party": "Green",
  "Plaid Cymru": "Plaid Cymru", "Social Democratic & Labour Party": "SDLP",
  "Your Party": "Your Party", "Alliance": "Alliance",
  "Restore Britain": "Restore Britain", "Speaker": "Speaker",
  "Traditional Unionist Voice": "Traditional Unionist Voice",
  "Ulster Unionist Party": "Ulster Unionist", "Vacant": "Vacant",
}
_cache = {}
def api_comp(d):
    if d in _cache: return _cache[d]
    last = None
    for _ in range(5):
        try:
            data = json.load(urllib.request.urlopen(API.format(d), timeout=30))
            out = {}
            for it in data["items"]:
                v = it["value"]; sh = NAME_MAP.get(v["party"]["name"], v["party"]["name"])
                out[sh] = out.get(sh, 0) + v["total"]
            out = {k: v for k, v in out.items() if v > 0}
            _cache[d] = out; time.sleep(0.15); return out
        except Exception as e:
            last = e; time.sleep(2)
    raise RuntimeError("API failed %s: %s" % (d, last))

def bsearch(lo, hi):
    clo = api_comp(lo.isoformat())
    while (hi - lo).days > 1:
        mid = lo + datetime.timedelta(days=(hi - lo).days // 2)
        if api_comp(mid.isoformat()) == clo: lo = mid
        else: hi = mid
    return hi

def deltanote(prev, cur):
    downs, ups = [], []
    for k in sorted(set(prev) | set(cur)):
        diff = cur.get(k, 0) - prev.get(k, 0)
        if diff < 0: downs.append((k, -diff))
        elif diff > 0: ups.append((k, diff))
    fmt = lambda lst: ", ".join(k if n == 1 else "%s x%d" % (k, n) for k, n in lst)
    l, r = fmt(downs), fmt(ups)
    return ("%s -> %s" % (l, r)) if (l and r) else (l or r)

START = datetime.date(2024, 7, 9)
END = datetime.date(2026, 7, 21)

raw = open(PATH, encoding="utf-8").read()
data = json.loads(raw)
rt = json.dumps(data, ensure_ascii=False, indent=2)
assert raw.startswith(rt) and set(raw[len(rt):]) <= set("\n"), "FORMAT MISMATCH - abort"
trail = raw[len(rt):]
pl = data["parliaments"]
idx = next(i for i, p in enumerate(pl) if p.get("name") == "2024 general election")
ge = pl[idx]
ge_comp = {x["party"]: x["seats"] for x in ge["parties"]}
election_result_2024 = pl[-1].get("electionResult2024")

samples = []
d = START
while d < END:
    samples.append(d); d += datetime.timedelta(days=7)
samples.append(END)

states = []              # (iso_date, comp) for each detected change
cur = ge_comp
first = api_comp(START.isoformat())
if first != cur:
    states.append((START.isoformat(), first)); cur = first
prev = START
for s in samples[1:]:
    if api_comp(s.isoformat()) != api_comp(prev.isoformat()):
        lo = prev
        while api_comp(lo.isoformat()) != api_comp(s.isoformat()):
            e = bsearch(lo, s)
            states.append((e.isoformat(), api_comp(e.isoformat())))
            lo = e
    prev = s
print("sweep done; changes:", len(states), "api calls:", len(_cache))

records = []
ge2 = dict(ge); ge2["end"] = states[0][0] if states else "2100-01-01"
records.append(ge2)
prev_comp = ge_comp
for i, (dt, comp) in enumerate(states):
    last = i == len(states) - 1
    parties = sorted(comp.items(), key=lambda kv: (-kv[1], kv[0]))
    rec = {"name": "2024 Parliament (current composition)" if last else "2024 — after %s" % dt,
           "start": dt, "total": sum(comp.values()),
           "parties": [{"party": p, "seats": s} for p, s in parties],
           "note": deltanote(prev_comp, comp), "end": "2100-01-01" if last else states[i + 1][0]}
    if last and election_result_2024 is not None:
        rec["electionResult2024"] = election_result_2024
    records.append(rec); prev_comp = comp

snap = {"Labour":403,"Conservative":117,"Liberal Democrat":71,"Independent":13,
        "SNP":8,"Reform UK":7,"Sinn Féin":7,"DUP":5,"Green":5,"Plaid Cymru":4,
        "SDLP":2,"Your Party":2,"Alliance":1,"Restore Britain":1,"Speaker":1,
        "Ulster Unionist":1,"Traditional Unionist Voice":1,"Vacant":1}
final = {x["party"]: x["seats"] for x in records[-1]["parties"]}
assert final == snap, "FINAL != live snapshot: %s" % final
for r in records:
    assert sum(x["seats"] for x in r["parties"]) == 650, "sum!=650 " + r["name"]
labs = [dict((x["party"], x["seats"]) for x in r["parties"]).get("Labour", 0) for r in records]
maxjump = max(abs(labs[i] - labs[i-1]) for i in range(1, len(labs)))
assert maxjump <= 7, "unexpected Labour jump %d" % maxjump

data["parliaments"] = pl[:idx] + records
out = json.dumps(data, ensure_ascii=False, indent=2) + trail
bak = PATH + ".bak-ukcommons-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
shutil.copy(PATH, bak)
open(PATH, "w", encoding="utf-8", newline="").write(out)
print("OK. 2024 records:", len(records), "| max Labour day-jump:", maxjump)
print("Labour first3:", labs[:3], "last5:", labs[-5:])
print("first change:", states[0][0], "| last change:", states[-1][0])
print("final == snapshot:", final == snap)
print("backup:", os.path.basename(bak))
