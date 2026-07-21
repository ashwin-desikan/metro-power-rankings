import urllib.request, json, time, datetime, shutil, os
from concurrent.futures import ThreadPoolExecutor

ROOT = r"C:\Users\ashwi\Desktop\Projects\Metro Area Project"
PATH = os.path.join(ROOT, "public", "data", "uk-commons-history.json")
LOG = os.path.join(ROOT, "scripts", "uk-politics", "rebuild.log")
API = "https://members-api.parliament.uk/api/Parties/StateOfTheParties/Commons/{}"
NAME_MAP = {
  "Labour": "Labour", "Labour (Co-op)": "Labour", "Conservative": "Conservative",
  "Liberal Democrat": "Liberal Democrat", "Independent": "Independent",
  "Scottish National Party": "SNP", "Reform UK": "Reform UK", "Sinn Féin": "Sinn Féin",
  "Democratic Unionist Party": "DUP", "Green Party": "Green", "Plaid Cymru": "Plaid Cymru",
  "Social Democratic & Labour Party": "SDLP", "Your Party": "Your Party", "Alliance": "Alliance",
  "Restore Britain": "Restore Britain", "Speaker": "Speaker",
  "Traditional Unionist Voice": "Traditional Unionist Voice",
  "Ulster Unionist Party": "Ulster Unionist", "Vacant": "Vacant",
}
def log(*a):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(" ".join(str(x) for x in a) + "\n")
def fetch(diso):
    last = None
    for _ in range(6):
        try:
            data = json.load(urllib.request.urlopen(API.format(diso), timeout=30))
            out = {}
            for it in data["items"]:
                v = it["value"]; sh = NAME_MAP.get(v["party"]["name"], v["party"]["name"])
                out[sh] = out.get(sh, 0) + v["total"]
            out = {k: v for k, v in out.items() if v > 0}
            out.pop("Vacant", None)
            vac = 650 - sum(out.values())
            if vac > 0: out["Vacant"] = vac
            return diso, out
        except Exception as e:
            last = e; time.sleep(1.5)
    return diso, {"__error__": str(last)}

def deltanote(prev, cur):
    downs, ups = [], []
    for k in sorted(set(prev) | set(cur)):
        diff = cur.get(k, 0) - prev.get(k, 0)
        if diff < 0: downs.append((k, -diff))
        elif diff > 0: ups.append((k, diff))
    fmt = lambda L: ", ".join(k if n == 1 else "%s x%d" % (k, n) for k, n in L)
    l, r = fmt(downs), fmt(ups)
    return ("%s → %s" % (l, r)) if (l and r) else (l or r)

open(LOG, "w").close()
START, END = datetime.date(2024, 7, 9), datetime.date(2026, 7, 21)
days = []; d = START
while d <= END: days.append(d.isoformat()); d += datetime.timedelta(days=1)
CACHE = os.path.join(ROOT, "scripts", "uk-politics", "commons_daily_cache.json")
comps = {}
if os.path.exists(CACHE):
    comps = json.load(open(CACHE, encoding="utf-8"))
missing = [d for d in days if d not in comps or "__error__" in comps.get(d, {})]
log("total", len(days), "cached", len(days) - len(missing), "fetching", len(missing))
if missing:
    with ThreadPoolExecutor(max_workers=10) as ex:
        for i, (diso, c) in enumerate(ex.map(fetch, missing)):
            comps[diso] = c
            if i % 120 == 0: log("...", i, "/", len(missing))
    json.dump(comps, open(CACHE, "w", encoding="utf-8"))
errs = [k for k, v in comps.items() if "__error__" in v]
log("fetched; errors:", len(errs), errs[:5])
assert not errs, "API errors on %d days" % len(errs)

raw = open(PATH, encoding="utf-8").read()
data = json.loads(raw)
rt = json.dumps(data, ensure_ascii=False, indent=2)
assert raw.startswith(rt) and set(raw[len(rt):]) <= set("\n"), "FORMAT MISMATCH"
trail = raw[len(rt):]
pl = data["parliaments"]
idx = next(i for i, p in enumerate(pl) if p.get("name") == "2024 general election")
ge = pl[idx]; ge_comp = {x["party"]: x["seats"] for x in ge["parties"]}
election_result_2024 = pl[-1].get("electionResult2024")

states = []; prev = ge_comp
for diso in days:
    c = comps[diso]
    if c != prev:
        states.append((diso, c)); prev = c
log("change points:", len(states))

records = []; ge2 = dict(ge)
ge2["end"] = states[0][0] if states else "2100-01-01"; records.append(ge2)
prev = ge_comp
for i, (dt, comp) in enumerate(states):
    last = i == len(states) - 1
    parties = sorted(comp.items(), key=lambda kv: (-kv[1], kv[0]))
    rec = {"name": "2024 Parliament (current composition)" if last else "2024 — after %s" % dt,
           "start": dt, "total": sum(comp.values()),
           "parties": [{"party": p, "seats": s} for p, s in parties],
           "note": deltanote(prev, comp), "end": "2100-01-01" if last else states[i + 1][0]}
    if last and election_result_2024 is not None: rec["electionResult2024"] = election_result_2024
    records.append(rec); prev = comp

snap = {"Labour":403,"Conservative":117,"Liberal Democrat":71,"Independent":13,"SNP":8,
        "Reform UK":7,"Sinn Féin":7,"DUP":5,"Green":5,"Plaid Cymru":4,"SDLP":2,"Your Party":2,
        "Alliance":1,"Restore Britain":1,"Speaker":1,"Ulster Unionist":1,"Traditional Unionist Voice":1,"Vacant":1}
final = {x["party"]: x["seats"] for x in records[-1]["parties"]}
assert final == snap, "FINAL != snap %s" % final
for r in records: assert sum(x["seats"] for x in r["parties"]) == 650, "sum!=650 " + r["name"]
labs = [dict((x["party"], x["seats"]) for x in r["parties"]).get("Labour", 0) for r in records]
maxjump = max(abs(labs[i] - labs[i-1]) for i in range(1, len(labs)))

data["parliaments"] = pl[:idx] + records
out = json.dumps(data, ensure_ascii=False, indent=2) + trail
bak = PATH + ".bak-ukcommons-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
shutil.copy(PATH, bak)
open(PATH, "w", encoding="utf-8", newline="").write(out)
log("DONE records:", len(records), "maxjump:", maxjump)
log("labs first3:", labs[:3], "last6:", labs[-6:])
log("final==snap:", final == snap, "backup:", os.path.basename(bak))
